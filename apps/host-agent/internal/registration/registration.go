// Package registration handles host registration with the GridStreamer control plane.
package registration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/nvidia/gridstreamer/host-agent/internal/config"
)

const registrationFile = "registration.json"

// RegistrationRequest is the payload sent to the control plane during host registration.
type RegistrationRequest struct {
	BootstrapToken    string `json:"bootstrap_token"`
	HostName          string `json:"host_name"`
	GPUModel          string `json:"gpu_model"`
	StreamerVersion string `json:"streamer_version"`
	PublicIP          string `json:"public_ip,omitempty"`
	OS                string `json:"os"`
	Arch              string `json:"arch"`
}

// RegistrationResponse is the payload returned by the control plane after successful registration.
type RegistrationResponse struct {
	HostID           string `json:"host_id"`
	TunnelIP         string `json:"tunnel_ip"`
	GatewayEndpoint  string `json:"gateway_endpoint"`
	GatewayPublicKey string `json:"gateway_public_key"`
	APIToken         string `json:"api_token"`
	RegisteredAt     string `json:"registered_at"`
}

// Register sends a registration request to the control plane and persists the response.
func Register(cfg *config.Config) (*RegistrationResponse, error) {
	gpuModel, err := detectGPU()
	if err != nil {
		slog.Warn("could not detect GPU model", "error", err)
		gpuModel = "unknown"
	}

	streamerVersion, err := detectStreamerVersion(cfg.StreamerPath)
	if err != nil {
		slog.Warn("could not detect streamer version", "error", err)
		streamerVersion = "unknown"
	}

	reqBody := RegistrationRequest{
		BootstrapToken:  cfg.BootstrapToken,
		HostName:        cfg.HostName,
		GPUModel:        gpuModel,
		StreamerVersion: streamerVersion,
		OS:                runtime.GOOS,
		Arch:              runtime.GOARCH,
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshalling registration request: %w", err)
	}

	url := fmt.Sprintf("%s/api/hosts/register", cfg.ControlPlaneURL)
	slog.Debug("sending registration request", "url", url)

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("creating HTTP request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.BootstrapToken)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sending registration request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("registration failed with status %d: %s", resp.StatusCode, string(body))
	}

	var regResp RegistrationResponse
	if err := json.Unmarshal(body, &regResp); err != nil {
		return nil, fmt.Errorf("unmarshalling registration response: %w", err)
	}

	// Persist registration to disk.
	if err := saveRegistration(cfg.DataDir, &regResp); err != nil {
		return nil, fmt.Errorf("saving registration: %w", err)
	}

	return &regResp, nil
}

// LoadRegistration reads a previously saved registration from disk.
func LoadRegistration(dataDir string) (*RegistrationResponse, error) {
	path := filepath.Join(dataDir, registrationFile)

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading registration file: %w", err)
	}

	var reg RegistrationResponse
	if err := json.Unmarshal(data, &reg); err != nil {
		return nil, fmt.Errorf("unmarshalling registration file: %w", err)
	}

	if reg.HostID == "" {
		return nil, fmt.Errorf("registration file is missing host_id")
	}

	return &reg, nil
}

// saveRegistration writes the registration response to a JSON file in the data directory.
func saveRegistration(dataDir string, reg *RegistrationResponse) error {
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return fmt.Errorf("creating data directory: %w", err)
	}

	path := filepath.Join(dataDir, registrationFile)

	data, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshalling registration: %w", err)
	}

	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("writing registration file: %w", err)
	}

	slog.Info("registration saved", "path", path)
	return nil
}

// detectGPU attempts to determine the GPU model via nvidia-smi.
func detectGPU() (string, error) {
	cmd := exec.Command("nvidia-smi", "--query-gpu=name", "--format=csv,noheader,nounits")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("running nvidia-smi: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// detectStreamerVersion attempts to get the version from gridstreamer-host.
func detectStreamerVersion(path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("streamer path not configured")
	}

	if _, err := os.Stat(path); err != nil {
		return "", fmt.Errorf("streamer binary not found at %s: %w", path, err)
	}

	cmd := exec.Command(path, "--version")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("getting streamer version: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}
