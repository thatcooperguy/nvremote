package main

import (
	"encoding/base64"
	"fmt"
	"log/slog"
	"net"
	"os/exec"
	"strings"
	"sync"
	"time"

	"golang.zx2c4.com/wireguard/wgctrl"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"
)

// PeerInfo represents summary information about a WireGuard peer.
type PeerInfo struct {
	PublicKey       string    `json:"publicKey"`
	AllowedIPs     []string  `json:"allowedIPs"`
	Endpoint       string    `json:"endpoint,omitempty"`
	LastHandshake  time.Time `json:"lastHandshake"`
	TransmitBytes  int64     `json:"transmitBytes"`
	ReceiveBytes   int64     `json:"receiveBytes"`
	ConnectedSince time.Time `json:"connectedSince,omitempty"`
}

// PeerStatus holds detailed status information for a single peer.
type PeerStatus struct {
	PublicKey            string    `json:"publicKey"`
	Endpoint             string    `json:"endpoint,omitempty"`
	LastHandshakeTime    time.Time `json:"lastHandshakeTime"`
	TransmitBytes        int64     `json:"transmitBytes"`
	ReceiveBytes         int64     `json:"receiveBytes"`
	AllowedIPs           []string  `json:"allowedIPs"`
	ProtocolVersion      int       `json:"protocolVersion"`
	Connected            bool      `json:"connected"`
	HandshakeAgeSeconds  float64   `json:"handshakeAgeSeconds"`
}

// WGManager manages WireGuard peers on the gateway.
type WGManager struct {
	cfg       *Config
	client    *wgctrl.Client
	useFallback bool
	mu        sync.RWMutex
}

// NewWireGuardManager creates a new WireGuard manager. It attempts to use
// the wgctrl library for native kernel communication. If that fails, it
// falls back to shelling out to the `wg` command-line tool.
func NewWireGuardManager(cfg *Config) (*WGManager, error) {
	m := &WGManager{
		cfg: cfg,
	}

	client, err := wgctrl.New()
	if err != nil {
		slog.Warn("wgctrl client unavailable, falling back to wg command",
			"error", err,
		)
		// Verify the wg command is available.
		if _, err := exec.LookPath("wg"); err != nil {
			return nil, fmt.Errorf("neither wgctrl nor wg command available: %w", err)
		}
		m.useFallback = true
	} else {
		m.client = client
		// Verify the interface exists.
		if _, err := client.Device(cfg.WireGuardInterface); err != nil {
			slog.Warn("WireGuard interface not accessible via wgctrl, using fallback",
				"interface", cfg.WireGuardInterface,
				"error", err,
			)
			client.Close()
			m.client = nil
			m.useFallback = true
		}
	}

	mode := "wgctrl"
	if m.useFallback {
		mode = "wg-command"
	}
	slog.Info("WireGuard manager ready", "mode", mode, "interface", cfg.WireGuardInterface)

	return m, nil
}

// AddPeer adds a WireGuard peer with the given public key and allowed IPs.
func (m *WGManager) AddPeer(publicKey string, allowedIPs string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	slog.Info("adding WireGuard peer",
		"public_key", publicKey,
		"allowed_ips", allowedIPs,
	)

	if m.useFallback {
		return m.addPeerFallback(publicKey, allowedIPs)
	}

	return m.addPeerNative(publicKey, allowedIPs)
}

// addPeerNative adds a peer using the wgctrl library.
func (m *WGManager) addPeerNative(publicKey string, allowedIPs string) error {
	key, err := wgtypes.ParseKey(publicKey)
	if err != nil {
		return fmt.Errorf("invalid public key: %w", err)
	}

	parsedAllowedIPs, err := parseAllowedIPs(allowedIPs)
	if err != nil {
		return fmt.Errorf("invalid allowed IPs: %w", err)
	}

	peerConfig := wgtypes.PeerConfig{
		PublicKey:         key,
		ReplaceAllowedIPs: true,
		AllowedIPs:        parsedAllowedIPs,
	}

	err = m.client.ConfigureDevice(m.cfg.WireGuardInterface, wgtypes.Config{
		Peers: []wgtypes.PeerConfig{peerConfig},
	})
	if err != nil {
		return fmt.Errorf("configuring WireGuard device: %w", err)
	}

	slog.Info("peer added successfully via wgctrl", "public_key", publicKey)
	return nil
}

// addPeerFallback adds a peer by shelling out to the wg command.
func (m *WGManager) addPeerFallback(publicKey string, allowedIPs string) error {
	cmd := exec.Command("wg", "set", m.cfg.WireGuardInterface,
		"peer", publicKey,
		"allowed-ips", allowedIPs,
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("wg set peer failed: %w, output: %s", err, string(output))
	}

	slog.Info("peer added successfully via wg command", "public_key", publicKey)
	return nil
}

// RemovePeer removes a WireGuard peer by its public key.
func (m *WGManager) RemovePeer(publicKey string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	slog.Info("removing WireGuard peer", "public_key", publicKey)

	if m.useFallback {
		return m.removePeerFallback(publicKey)
	}

	return m.removePeerNative(publicKey)
}

// removePeerNative removes a peer using the wgctrl library.
func (m *WGManager) removePeerNative(publicKey string) error {
	key, err := wgtypes.ParseKey(publicKey)
	if err != nil {
		return fmt.Errorf("invalid public key: %w", err)
	}

	err = m.client.ConfigureDevice(m.cfg.WireGuardInterface, wgtypes.Config{
		Peers: []wgtypes.PeerConfig{
			{
				PublicKey: key,
				Remove:   true,
			},
		},
	})
	if err != nil {
		return fmt.Errorf("removing WireGuard peer: %w", err)
	}

	slog.Info("peer removed successfully via wgctrl", "public_key", publicKey)
	return nil
}

// removePeerFallback removes a peer by shelling out to the wg command.
func (m *WGManager) removePeerFallback(publicKey string) error {
	cmd := exec.Command("wg", "set", m.cfg.WireGuardInterface,
		"peer", publicKey, "remove",
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("wg remove peer failed: %w, output: %s", err, string(output))
	}

	slog.Info("peer removed successfully via wg command", "public_key", publicKey)
	return nil
}

// ListPeers returns information about all WireGuard peers.
func (m *WGManager) ListPeers() ([]PeerInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.useFallback {
		return m.listPeersFallback()
	}

	return m.listPeersNative()
}

// listPeersNative lists peers using the wgctrl library.
func (m *WGManager) listPeersNative() ([]PeerInfo, error) {
	device, err := m.client.Device(m.cfg.WireGuardInterface)
	if err != nil {
		return nil, fmt.Errorf("getting WireGuard device: %w", err)
	}

	peers := make([]PeerInfo, 0, len(device.Peers))
	for _, p := range device.Peers {
		allowedIPs := make([]string, 0, len(p.AllowedIPs))
		for _, ipNet := range p.AllowedIPs {
			allowedIPs = append(allowedIPs, ipNet.String())
		}

		endpoint := ""
		if p.Endpoint != nil {
			endpoint = p.Endpoint.String()
		}

		peers = append(peers, PeerInfo{
			PublicKey:      p.PublicKey.String(),
			AllowedIPs:    allowedIPs,
			Endpoint:      endpoint,
			LastHandshake: p.LastHandshakeTime,
			TransmitBytes: p.TransmitBytes,
			ReceiveBytes:  p.ReceiveBytes,
		})
	}

	return peers, nil
}

// listPeersFallback lists peers by parsing the output of `wg show`.
func (m *WGManager) listPeersFallback() ([]PeerInfo, error) {
	cmd := exec.Command("wg", "show", m.cfg.WireGuardInterface, "dump")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("wg show failed: %w", err)
	}

	return parseWGDump(string(output))
}

// GetPeerStatus returns detailed status for a specific peer.
func (m *WGManager) GetPeerStatus(publicKey string) (*PeerStatus, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.useFallback {
		return m.getPeerStatusFallback(publicKey)
	}

	return m.getPeerStatusNative(publicKey)
}

// getPeerStatusNative gets peer status using the wgctrl library.
func (m *WGManager) getPeerStatusNative(publicKey string) (*PeerStatus, error) {
	key, err := wgtypes.ParseKey(publicKey)
	if err != nil {
		return nil, fmt.Errorf("invalid public key: %w", err)
	}

	device, err := m.client.Device(m.cfg.WireGuardInterface)
	if err != nil {
		return nil, fmt.Errorf("getting WireGuard device: %w", err)
	}

	for _, p := range device.Peers {
		if p.PublicKey == key {
			allowedIPs := make([]string, 0, len(p.AllowedIPs))
			for _, ipNet := range p.AllowedIPs {
				allowedIPs = append(allowedIPs, ipNet.String())
			}

			endpoint := ""
			if p.Endpoint != nil {
				endpoint = p.Endpoint.String()
			}

			handshakeAge := time.Since(p.LastHandshakeTime).Seconds()
			// Consider a peer connected if handshake was within the last 3 minutes.
			connected := !p.LastHandshakeTime.IsZero() && handshakeAge < 180

			return &PeerStatus{
				PublicKey:           p.PublicKey.String(),
				Endpoint:            endpoint,
				LastHandshakeTime:   p.LastHandshakeTime,
				TransmitBytes:       p.TransmitBytes,
				ReceiveBytes:        p.ReceiveBytes,
				AllowedIPs:          allowedIPs,
				ProtocolVersion:     p.ProtocolVersion,
				Connected:           connected,
				HandshakeAgeSeconds: handshakeAge,
			}, nil
		}
	}

	return nil, fmt.Errorf("peer not found: %s", publicKey)
}

// getPeerStatusFallback gets peer status by parsing wg show output.
func (m *WGManager) getPeerStatusFallback(publicKey string) (*PeerStatus, error) {
	peers, err := m.listPeersFallback()
	if err != nil {
		return nil, err
	}

	for _, p := range peers {
		if p.PublicKey == publicKey {
			handshakeAge := time.Since(p.LastHandshake).Seconds()
			connected := !p.LastHandshake.IsZero() && handshakeAge < 180

			return &PeerStatus{
				PublicKey:           p.PublicKey,
				Endpoint:            p.Endpoint,
				LastHandshakeTime:   p.LastHandshake,
				TransmitBytes:       p.TransmitBytes,
				ReceiveBytes:        p.ReceiveBytes,
				AllowedIPs:          p.AllowedIPs,
				Connected:           connected,
				HandshakeAgeSeconds: handshakeAge,
			}, nil
		}
	}

	return nil, fmt.Errorf("peer not found: %s", publicKey)
}

// IsInterfaceUp checks whether the WireGuard interface is active.
func (m *WGManager) IsInterfaceUp() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.useFallback {
		cmd := exec.Command("wg", "show", m.cfg.WireGuardInterface)
		return cmd.Run() == nil
	}

	_, err := m.client.Device(m.cfg.WireGuardInterface)
	return err == nil
}

// Close releases resources held by the WireGuard manager.
func (m *WGManager) Close() error {
	if m.client != nil {
		return m.client.Close()
	}
	return nil
}

// parseAllowedIPs parses a comma-separated string of CIDR ranges.
func parseAllowedIPs(allowedIPs string) ([]net.IPNet, error) {
	parts := strings.Split(allowedIPs, ",")
	result := make([]net.IPNet, 0, len(parts))

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		_, ipNet, err := net.ParseCIDR(part)
		if err != nil {
			return nil, fmt.Errorf("invalid CIDR %q: %w", part, err)
		}
		result = append(result, *ipNet)
	}

	if len(result) == 0 {
		return nil, fmt.Errorf("no valid allowed IPs provided")
	}

	return result, nil
}

// parseWGDump parses the tab-separated output from `wg show <interface> dump`.
// The first line is the interface info; subsequent lines are peers.
// Peer line format: public_key\tpreshared_key\tendpoint\tallowed_ips\tlatest_handshake\ttransfer_rx\ttransfer_tx\tpersistent_keepalive
func parseWGDump(output string) ([]PeerInfo, error) {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) < 1 {
		return nil, fmt.Errorf("empty wg dump output")
	}

	var peers []PeerInfo

	// Skip the first line (interface info).
	for _, line := range lines[1:] {
		fields := strings.Split(line, "\t")
		if len(fields) < 8 {
			continue
		}

		peer := PeerInfo{
			PublicKey: fields[0],
		}

		// Endpoint.
		if fields[2] != "(none)" && fields[2] != "" {
			peer.Endpoint = fields[2]
		}

		// Allowed IPs.
		if fields[3] != "(none)" && fields[3] != "" {
			peer.AllowedIPs = strings.Split(fields[3], ",")
			for i := range peer.AllowedIPs {
				peer.AllowedIPs[i] = strings.TrimSpace(peer.AllowedIPs[i])
			}
		}

		// Latest handshake (Unix timestamp).
		if fields[4] != "0" && fields[4] != "" {
			var ts int64
			if _, err := fmt.Sscanf(fields[4], "%d", &ts); err == nil {
				peer.LastHandshake = time.Unix(ts, 0)
			}
		}

		// Transfer RX bytes.
		if _, err := fmt.Sscanf(fields[5], "%d", &peer.ReceiveBytes); err != nil {
			peer.ReceiveBytes = 0
		}

		// Transfer TX bytes.
		if _, err := fmt.Sscanf(fields[6], "%d", &peer.TransmitBytes); err != nil {
			peer.TransmitBytes = 0
		}

		peers = append(peers, peer)
	}

	return peers, nil
}

// isValidBase64Key checks if a string is a valid base64-encoded 32-byte key.
func isValidBase64Key(key string) bool {
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return false
	}
	return len(decoded) == 32
}
