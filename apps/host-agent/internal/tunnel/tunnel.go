// Package tunnel manages the WireGuard tunnel between the host and the GridStreamer gateway.
package tunnel

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"text/template"

	"github.com/nvidia/gridstreamer/host-agent/internal/registration"
	"golang.org/x/crypto/curve25519"
)

const (
	// wgConfigFile is the name of the generated WireGuard configuration file.
	wgConfigFile = "nvrs-tunnel.conf"

	// wgPrivateKeyFile is the file name for the stored WireGuard private key.
	wgPrivateKeyFile = "wg_private.key"

	// wgPublicKeyFile is the file name for the stored WireGuard public key.
	wgPublicKeyFile = "wg_public.key"

	// tunnelServiceName is the Windows service name for the WireGuard tunnel.
	tunnelServiceName = "WireGuardTunnel$nvrs-tunnel"

	// wgConfigTemplate is the WireGuard configuration template.
	wgConfigTemplate = `[Interface]
Address = {{.TunnelIP}}/32
PrivateKey = {{.PrivateKey}}

[Peer]
PublicKey = {{.GatewayPublicKey}}
Endpoint = {{.GatewayEndpoint}}:51820
AllowedIPs = 10.100.0.0/16
PersistentKeepalive = 25
`
)

// tunnelConfig holds the values rendered into the WireGuard configuration template.
type tunnelConfig struct {
	TunnelIP         string
	PrivateKey       string
	GatewayPublicKey string
	GatewayEndpoint  string
}

// dataDir is set during SetupTunnel so that TeardownTunnel can find the config file.
var activeDataDir string

// SetupTunnel writes the WireGuard configuration and installs/starts the tunnel as
// a Windows service using the wireguard.exe CLI.
func SetupTunnel(reg *registration.RegistrationResponse, privateKey string) error {
	activeDataDir = findDataDir(reg)

	tc := tunnelConfig{
		TunnelIP:         reg.TunnelIP,
		PrivateKey:       privateKey,
		GatewayPublicKey: reg.GatewayPublicKey,
		GatewayEndpoint:  reg.GatewayEndpoint,
	}

	// Write the WireGuard config file.
	configPath := filepath.Join(activeDataDir, wgConfigFile)
	if err := writeConfig(configPath, tc); err != nil {
		return fmt.Errorf("writing WireGuard config: %w", err)
	}
	slog.Info("WireGuard config written", "path", configPath)

	// Install and start the tunnel via wireguard.exe.
	// wireguard.exe /installtunnelservice <path-to-conf>
	wgExe, err := findWireGuardExe()
	if err != nil {
		return fmt.Errorf("locating wireguard.exe: %w", err)
	}

	slog.Info("installing WireGuard tunnel service", "exe", wgExe, "config", configPath)
	cmd := exec.Command(wgExe, "/installtunnelservice", configPath)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("installing WireGuard tunnel service: %w (output: %s)", err, string(output))
	}

	slog.Info("WireGuard tunnel service installed and started", "service", tunnelServiceName)
	return nil
}

// TeardownTunnel stops and removes the WireGuard tunnel service.
func TeardownTunnel() error {
	wgExe, err := findWireGuardExe()
	if err != nil {
		return fmt.Errorf("locating wireguard.exe: %w", err)
	}

	slog.Info("uninstalling WireGuard tunnel service", "service", tunnelServiceName)
	cmd := exec.Command(wgExe, "/uninstalltunnelservice", "nvrs-tunnel")
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("uninstalling WireGuard tunnel service: %w (output: %s)", err, string(output))
	}

	// Clean up the config file.
	if activeDataDir != "" {
		configPath := filepath.Join(activeDataDir, wgConfigFile)
		if err := os.Remove(configPath); err != nil && !os.IsNotExist(err) {
			slog.Warn("failed to remove WireGuard config file", "path", configPath, "error", err)
		}
	}

	slog.Info("WireGuard tunnel service removed")
	return nil
}

// GetTunnelStatus checks whether the WireGuard tunnel interface is active.
func GetTunnelStatus() (bool, error) {
	// Use `sc query` to check the service state.
	cmd := exec.Command("sc", "query", tunnelServiceName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Service not found or query failed means tunnel is down.
		return false, nil
	}

	outputStr := string(output)
	if strings.Contains(outputStr, "RUNNING") {
		return true, nil
	}

	return false, nil
}

// GenerateKeyPair generates a new WireGuard (Curve25519) private/public key pair.
// Keys are returned as base64-encoded strings.
func GenerateKeyPair() (privateKey, publicKey string, err error) {
	// Generate 32 bytes of random data for the private key.
	var privKeyBytes [32]byte
	if _, err := rand.Read(privKeyBytes[:]); err != nil {
		return "", "", fmt.Errorf("generating random bytes: %w", err)
	}

	// Clamp the private key per Curve25519 requirements.
	privKeyBytes[0] &= 248
	privKeyBytes[31] &= 127
	privKeyBytes[31] |= 64

	// Derive the public key using the Curve25519 base point.
	pubKeyBytes, err := curve25519.X25519(privKeyBytes[:], curve25519.Basepoint)
	if err != nil {
		return "", "", fmt.Errorf("deriving public key: %w", err)
	}

	privateKey = base64.StdEncoding.EncodeToString(privKeyBytes[:])
	publicKey = base64.StdEncoding.EncodeToString(pubKeyBytes)

	return privateKey, publicKey, nil
}

// LoadOrGenerateKeyPair loads an existing key pair from the data directory,
// or generates and persists a new one if none exists.
func LoadOrGenerateKeyPair(dataDir string) (privateKey, publicKey string, err error) {
	privPath := filepath.Join(dataDir, wgPrivateKeyFile)
	pubPath := filepath.Join(dataDir, wgPublicKeyFile)

	// Try to load existing keys.
	privData, privErr := os.ReadFile(privPath)
	pubData, pubErr := os.ReadFile(pubPath)

	if privErr == nil && pubErr == nil {
		privateKey = strings.TrimSpace(string(privData))
		publicKey = strings.TrimSpace(string(pubData))
		if privateKey != "" && publicKey != "" {
			slog.Debug("loaded existing WireGuard keypair")
			return privateKey, publicKey, nil
		}
	}

	// Generate new keypair.
	slog.Info("generating new WireGuard keypair")
	privateKey, publicKey, err = GenerateKeyPair()
	if err != nil {
		return "", "", fmt.Errorf("generating keypair: %w", err)
	}

	// Ensure data directory exists.
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return "", "", fmt.Errorf("creating data directory: %w", err)
	}

	// Persist keys.
	if err := os.WriteFile(privPath, []byte(privateKey), 0o600); err != nil {
		return "", "", fmt.Errorf("writing private key: %w", err)
	}
	if err := os.WriteFile(pubPath, []byte(publicKey), 0o644); err != nil {
		return "", "", fmt.Errorf("writing public key: %w", err)
	}

	slog.Info("WireGuard keypair generated and saved", "publicKey", publicKey)
	return privateKey, publicKey, nil
}

// writeConfig renders the WireGuard config template and writes it to disk.
func writeConfig(path string, tc tunnelConfig) error {
	tmpl, err := template.New("wgconf").Parse(wgConfigTemplate)
	if err != nil {
		return fmt.Errorf("parsing config template: %w", err)
	}

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return fmt.Errorf("opening config file: %w", err)
	}
	defer f.Close()

	if err := tmpl.Execute(f, tc); err != nil {
		return fmt.Errorf("rendering config template: %w", err)
	}

	return nil
}

// findWireGuardExe locates the wireguard.exe binary on the system.
func findWireGuardExe() (string, error) {
	// Check common installation paths.
	candidates := []string{
		`C:\Program Files\WireGuard\wireguard.exe`,
		`C:\Program Files (x86)\WireGuard\wireguard.exe`,
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path, nil
		}
	}

	// Try PATH.
	path, err := exec.LookPath("wireguard.exe")
	if err == nil {
		return path, nil
	}

	return "", fmt.Errorf("wireguard.exe not found; install WireGuard from https://www.wireguard.com/install/")
}

// findDataDir returns the data directory, preferring the one stored in the registration response.
func findDataDir(reg *registration.RegistrationResponse) string {
	// Fall back to the default data directory.
	return `C:\ProgramData\GridStreamer`
}
