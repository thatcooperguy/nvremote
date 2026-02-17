// Package heartbeat implements the periodic health reporting and real-time signaling
// connection between the host agent and the NVRemote control plane.
package heartbeat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/nvidia/nvremote/host-agent/internal/config"
	"github.com/nvidia/nvremote/host-agent/internal/p2p"
	"github.com/nvidia/nvremote/host-agent/internal/streamer"
)

const (
	// heartbeatInterval is the time between periodic heartbeat reports.
	heartbeatInterval = 30 * time.Second

	// httpTimeout is the maximum duration for heartbeat HTTP requests.
	httpTimeout = 10 * time.Second
)

// HeartbeatPayload is the JSON body sent to the control plane on each heartbeat.
type HeartbeatPayload struct {
	HostID          string   `json:"host_id"`
	Status          string   `json:"status"`
	StreamerRunning bool     `json:"streamer_running"`
	StreamerVersion string   `json:"streamer_version"`
	Codecs          []string `json:"codecs,omitempty"`
	GPUModel        string   `json:"gpu_model,omitempty"`
	MaxResolution   string   `json:"max_resolution,omitempty"`
	MaxFPS          int      `json:"max_fps,omitempty"`
	NVENCVersion    string   `json:"nvenc_version,omitempty"`
	Timestamp       string   `json:"timestamp"`
}

// StartHeartbeat runs two concurrent loops until ctx is cancelled:
//  1. A periodic HTTP heartbeat POST every 30 seconds.
//  2. A persistent WebSocket connection for real-time signaling.
//
// The streamerMgr is used to report streamer status and capabilities.
// The sigHandler is used to handle P2P session signaling messages.
// This function blocks until ctx is done.
func StartHeartbeat(ctx context.Context, cfg *config.Config, hostID string, streamerMgr *streamer.Manager, sigHandler *p2p.SignalingHandler) {
	// Start the WebSocket signaling connection in the background.
	// Use the API token from registration (falls back to bootstrap if unavailable).
	go func() {
		wsURL := buildWebSocketURL(cfg.ControlPlaneURL, hostID)
		token := cfg.AuthToken()
		if err := ConnectSignaling(ctx, wsURL, hostID, token, sigHandler); err != nil {
			slog.Error("WebSocket signaling connection ended", "error", err)
		}
	}()

	// Run the periodic heartbeat loop in the foreground.
	runHeartbeatLoop(ctx, cfg, hostID, streamerMgr)
}

// runHeartbeatLoop sends heartbeat POSTs at a fixed interval until the context is cancelled.
func runHeartbeatLoop(ctx context.Context, cfg *config.Config, hostID string, streamerMgr *streamer.Manager) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	client := &http.Client{Timeout: httpTimeout}

	// Send an initial heartbeat immediately.
	sendHeartbeat(ctx, client, cfg, hostID, streamerMgr)

	for {
		select {
		case <-ctx.Done():
			slog.Info("heartbeat loop stopped", "reason", ctx.Err())
			return
		case <-ticker.C:
			sendHeartbeat(ctx, client, cfg, hostID, streamerMgr)
		}
	}
}

// sendHeartbeat collects the current host status and sends it to the control plane.
func sendHeartbeat(ctx context.Context, client *http.Client, cfg *config.Config, hostID string, streamerMgr *streamer.Manager) {
	running := streamerMgr.IsRunning()

	var version string
	var codecs []string
	var gpuModel string
	var maxResolution string
	var maxFPS int
	var nvencVersion string

	// Query capabilities from the streamer if it is running.
	if running {
		caps, err := streamerMgr.GetCapabilities()
		if err != nil {
			slog.Debug("could not get streamer capabilities for heartbeat", "error", err)
		} else {
			codecs = caps.Codecs
			gpuModel = caps.GPUName
			maxResolution = caps.MaxResolution
			maxFPS = caps.MaxFPS
			nvencVersion = caps.NVENCVersion
		}

		// Get version from a detect call if not available from capabilities.
		info, err := streamerMgr.Detect()
		if err == nil {
			version = info.Version
			if gpuModel == "" {
				gpuModel = info.GPUName
			}
			if len(codecs) == 0 {
				codecs = info.Codecs
			}
		}
	}

	payload := HeartbeatPayload{
		HostID:          hostID,
		Status:          determineStatus(running),
		StreamerRunning: running,
		StreamerVersion: version,
		Codecs:          codecs,
		GPUModel:        gpuModel,
		MaxResolution:   maxResolution,
		MaxFPS:          maxFPS,
		NVENCVersion:    nvencVersion,
		Timestamp:       time.Now().UTC().Format(time.RFC3339),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		slog.Error("failed to marshal heartbeat payload", "error", err)
		return
	}

	url := fmt.Sprintf("%s/api/hosts/%s/heartbeat", cfg.ControlPlaneURL, hostID)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		slog.Error("failed to create heartbeat request", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.AuthToken())

	resp, err := client.Do(req)
	if err != nil {
		slog.Warn("heartbeat request failed", "error", err)
		return
	}
	defer resp.Body.Close()

	// Drain body to allow connection reuse.
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		slog.Warn("heartbeat returned unexpected status", "status", resp.StatusCode)
		return
	}

	slog.Debug("heartbeat sent successfully",
		"status", payload.Status,
		"streamer", running,
	)
}

// determineStatus returns a human-readable status string based on component health.
// With the P2P model, the tunnel is no longer a separate component. Status is based
// on whether the streamer is running and registered.
func determineStatus(streamerRunning bool) string {
	if streamerRunning {
		return "ready"
	}
	return "degraded-no-streamer"
}

// buildWebSocketURL converts an HTTP(S) control plane URL to the Socket.IO
// WebSocket transport URL for the /signaling namespace.
//
// Socket.IO uses Engine.IO's WebSocket transport which requires the
// ?EIO=4&transport=websocket query parameters.
func buildWebSocketURL(controlPlaneURL, hostID string) string {
	wsURL := controlPlaneURL
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	wsURL = strings.Replace(wsURL, "http://", "ws://", 1)
	// Remove trailing slash if present
	wsURL = strings.TrimRight(wsURL, "/")
	return wsURL + "/signaling/?EIO=4&transport=websocket"
}
