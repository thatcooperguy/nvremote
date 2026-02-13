package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// HealthStatus represents the current health of the gateway.
type HealthStatus struct {
	Healthy            bool      `json:"healthy"`
	WireGuardUp        bool      `json:"wireguardUp"`
	PeerCount          int       `json:"peerCount"`
	Uptime             string    `json:"uptime"`
	UptimeSeconds      float64   `json:"uptimeSeconds"`
	LastCheck          time.Time `json:"lastCheck"`
	LastHeartbeatSent  time.Time `json:"lastHeartbeatSent,omitempty"`
	LastHeartbeatError string    `json:"lastHeartbeatError,omitempty"`
}

// HeartbeatPayload is the body sent to the control plane heartbeat endpoint.
type HeartbeatPayload struct {
	GatewayID   string  `json:"gatewayId"`
	PublicIP    string  `json:"publicIp"`
	WireGuardUp bool    `json:"wireguardUp"`
	PeerCount   int     `json:"peerCount"`
	Uptime      float64 `json:"uptimeSeconds"`
	Timestamp   string  `json:"timestamp"`
}

// HealthMonitor periodically checks the health of the gateway and reports
// to the control plane.
type HealthMonitor struct {
	cfg       *Config
	wg        *WGManager
	startTime time.Time

	mu     sync.RWMutex
	status HealthStatus

	httpClient *http.Client
}

// NewHealthMonitor creates a new health monitor instance.
func NewHealthMonitor(cfg *Config, wg *WGManager) *HealthMonitor {
	return &HealthMonitor{
		cfg:       cfg,
		wg:        wg,
		startTime: time.Now(),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		status: HealthStatus{
			Healthy: true,
		},
	}
}

// Start begins the periodic health check and heartbeat loop. It blocks until
// the provided context is cancelled.
func (h *HealthMonitor) Start(ctx context.Context) {
	interval := time.Duration(h.cfg.HeartbeatInterval) * time.Second
	if interval < 10*time.Second {
		interval = 30 * time.Second
	}

	// Run an initial check immediately.
	h.check()

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				slog.Info("health monitor stopped")
				return
			case <-ticker.C:
				h.check()
				h.sendHeartbeat(ctx)
			}
		}
	}()
}

// GetStatus returns the current health status in a thread-safe manner.
func (h *HealthMonitor) GetStatus() HealthStatus {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.status
}

// check performs a health check of the WireGuard interface and updates
// the internal status.
func (h *HealthMonitor) check() {
	h.mu.Lock()
	defer h.mu.Unlock()

	wgUp := h.wg.IsInterfaceUp()

	peerCount := 0
	if peers, err := h.wg.ListPeers(); err == nil {
		peerCount = len(peers)
	} else {
		slog.Warn("health check: failed to list peers", "error", err)
	}

	uptime := time.Since(h.startTime)

	h.status = HealthStatus{
		Healthy:            wgUp,
		WireGuardUp:        wgUp,
		PeerCount:          peerCount,
		Uptime:             formatDuration(uptime),
		UptimeSeconds:      uptime.Seconds(),
		LastCheck:          time.Now(),
		LastHeartbeatSent:  h.status.LastHeartbeatSent,
		LastHeartbeatError: h.status.LastHeartbeatError,
	}

	if !wgUp {
		slog.Warn("health check: WireGuard interface is down",
			"interface", h.cfg.WireGuardInterface,
		)
	}
}

// sendHeartbeat sends a heartbeat to the control plane to report gateway status.
func (h *HealthMonitor) sendHeartbeat(ctx context.Context) {
	if h.cfg.ControlPlaneURL == "" || h.cfg.GatewayID == "" {
		return
	}

	h.mu.RLock()
	status := h.status
	h.mu.RUnlock()

	payload := HeartbeatPayload{
		GatewayID:   h.cfg.GatewayID,
		PublicIP:    h.cfg.PublicIP,
		WireGuardUp: status.WireGuardUp,
		PeerCount:   status.PeerCount,
		Uptime:      status.UptimeSeconds,
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		slog.Error("failed to marshal heartbeat payload", "error", err)
		return
	}

	url := fmt.Sprintf("%s/api/gateways/%s/heartbeat", h.cfg.ControlPlaneURL, h.cfg.GatewayID)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		slog.Error("failed to create heartbeat request", "error", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+h.cfg.GatewayToken)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		h.mu.Lock()
		h.status.LastHeartbeatError = err.Error()
		h.mu.Unlock()

		slog.Warn("heartbeat failed",
			"url", url,
			"error", err,
		)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		h.mu.Lock()
		h.status.LastHeartbeatSent = time.Now()
		h.status.LastHeartbeatError = ""
		h.mu.Unlock()

		slog.Debug("heartbeat sent successfully",
			"status", resp.StatusCode,
			"peer_count", payload.PeerCount,
		)
	} else {
		h.mu.Lock()
		h.status.LastHeartbeatError = fmt.Sprintf("control plane returned HTTP %d", resp.StatusCode)
		h.mu.Unlock()

		slog.Warn("heartbeat rejected by control plane",
			"status", resp.StatusCode,
			"url", url,
		)
	}
}

// formatDuration formats a duration into a human-readable string like "2d 3h 15m 42s".
func formatDuration(d time.Duration) string {
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	minutes := int(d.Minutes()) % 60
	seconds := int(d.Seconds()) % 60

	if days > 0 {
		return fmt.Sprintf("%dd %dh %dm %ds", days, hours, minutes, seconds)
	}
	if hours > 0 {
		return fmt.Sprintf("%dh %dm %ds", hours, minutes, seconds)
	}
	if minutes > 0 {
		return fmt.Sprintf("%dm %ds", minutes, seconds)
	}
	return fmt.Sprintf("%ds", seconds)
}
