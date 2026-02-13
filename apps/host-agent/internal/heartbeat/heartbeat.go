// Package heartbeat implements the periodic health reporting and real-time signaling
// connection between the host agent and the NVRemoteStream control plane.
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

	"github.com/nvidia/nvstreamer/host-agent/internal/config"
	"github.com/nvidia/nvstreamer/host-agent/internal/nvstreamer"
	"github.com/nvidia/nvstreamer/host-agent/internal/tunnel"
)

const (
	// heartbeatInterval is the time between periodic heartbeat reports.
	heartbeatInterval = 30 * time.Second

	// httpTimeout is the maximum duration for heartbeat HTTP requests.
	httpTimeout = 10 * time.Second
)

// HeartbeatPayload is the JSON body sent to the control plane on each heartbeat.
type HeartbeatPayload struct {
	HostID           string `json:"host_id"`
	Status           string `json:"status"`
	NvstreamerRunning bool   `json:"nvstreamer_running"`
	NvstreamerVersion string `json:"nvstreamer_version"`
	TunnelUp         bool   `json:"tunnel_up"`
	GPUModel         string `json:"gpu_model,omitempty"`
	Timestamp        string `json:"timestamp"`
}

// StartHeartbeat runs two concurrent loops until ctx is cancelled:
//  1. A periodic HTTP heartbeat POST every 30 seconds.
//  2. A persistent WebSocket connection for real-time signaling.
//
// This function blocks until ctx is done.
func StartHeartbeat(ctx context.Context, cfg *config.Config, hostID string) {
	// Start the WebSocket signaling connection in the background.
	go func() {
		wsURL := buildWebSocketURL(cfg.ControlPlaneURL, hostID)
		token := cfg.BootstrapToken
		if err := ConnectSignaling(ctx, wsURL, hostID, token); err != nil {
			slog.Error("WebSocket signaling connection ended", "error", err)
		}
	}()

	// Run the periodic heartbeat loop in the foreground.
	runHeartbeatLoop(ctx, cfg, hostID)
}

// runHeartbeatLoop sends heartbeat POSTs at a fixed interval until the context is cancelled.
func runHeartbeatLoop(ctx context.Context, cfg *config.Config, hostID string) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	client := &http.Client{Timeout: httpTimeout}

	// Send an initial heartbeat immediately.
	sendHeartbeat(ctx, client, cfg, hostID)

	for {
		select {
		case <-ctx.Done():
			slog.Info("heartbeat loop stopped", "reason", ctx.Err())
			return
		case <-ticker.C:
			sendHeartbeat(ctx, client, cfg, hostID)
		}
	}
}

// sendHeartbeat collects the current host status and sends it to the control plane.
func sendHeartbeat(ctx context.Context, client *http.Client, cfg *config.Config, hostID string) {
	// Collect nvstreamer status.
	running, _, version := nvstreamer.GetStatus(cfg.NvstreamerPath)

	// Check tunnel status.
	tunnelUp, err := tunnel.GetTunnelStatus()
	if err != nil {
		slog.Warn("could not check tunnel status", "error", err)
	}

	// Detect GPU model (cached after first call in a real implementation).
	gpuModel, _ := nvstreamer.GetGPUInfo()

	payload := HeartbeatPayload{
		HostID:            hostID,
		Status:            determineStatus(running, tunnelUp),
		NvstreamerRunning: running,
		NvstreamerVersion: version,
		TunnelUp:          tunnelUp,
		GPUModel:          gpuModel,
		Timestamp:         time.Now().UTC().Format(time.RFC3339),
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
	req.Header.Set("Authorization", "Bearer "+cfg.BootstrapToken)

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
		"nvstreamer", running,
		"tunnel", tunnelUp,
	)
}

// determineStatus returns a human-readable status string based on component health.
func determineStatus(nvstreamerRunning, tunnelUp bool) string {
	switch {
	case nvstreamerRunning && tunnelUp:
		return "ready"
	case !nvstreamerRunning && tunnelUp:
		return "degraded-no-streamer"
	case nvstreamerRunning && !tunnelUp:
		return "degraded-no-tunnel"
	default:
		return "offline"
	}
}

// buildWebSocketURL converts an HTTP(S) control plane URL to the corresponding
// WebSocket URL for signaling.
func buildWebSocketURL(controlPlaneURL, hostID string) string {
	wsURL := controlPlaneURL
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	wsURL = strings.Replace(wsURL, "http://", "ws://", 1)
	return fmt.Sprintf("%s/api/hosts/%s/ws", wsURL, hostID)
}
