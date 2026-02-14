package streamer

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/nvidia/gridstreamer/host-agent/internal/config"
)

// StreamerInfo holds information about the gridstreamer-host installation.
type StreamerInfo struct {
	// Path is the absolute path to the gridstreamer-host.exe binary.
	Path string

	// Version is the detected version string.
	Version string

	// Codecs lists the supported video codecs (e.g., "h264", "h265", "av1").
	Codecs []string

	// GPUName is the detected GPU model name.
	GPUName string
}

// StreamerCapabilities describes the encoding capabilities of the streamer.
type StreamerCapabilities struct {
	// Codecs lists supported video codecs.
	Codecs []string `json:"codecs"`

	// MaxResolution is the maximum supported resolution (e.g., "3840x2160").
	MaxResolution string `json:"max_resolution"`

	// MaxFPS is the maximum supported frame rate.
	MaxFPS int `json:"max_fps"`

	// GPUName is the name of the GPU being used for encoding.
	GPUName string `json:"gpu_name"`

	// NVENCVersion is the NVENC encoder version string.
	NVENCVersion string `json:"nvenc_version"`
}

// SessionConfig holds the parameters for preparing a streaming session.
type SessionConfig struct {
	SessionID   string   `json:"session_id"`
	Codec       string   `json:"codec"`
	BitrateKbps int      `json:"bitrate_kbps"`
	FPS         int      `json:"fps"`
	Width       int      `json:"width"`
	Height      int      `json:"height"`
	GamingMode  string   `json:"gaming_mode"`
	StunServers []string `json:"stun_servers"`
}

// PeerInfo describes the remote peer for a streaming session.
type PeerInfo struct {
	IP              string `json:"ip"`
	Port            int    `json:"port"`
	DTLSFingerprint string `json:"dtls_fingerprint"`
}

// SessionStats holds real-time statistics for an active streaming session.
type SessionStats struct {
	BitrateKbps int     `json:"bitrate_kbps"`
	FPS         int     `json:"fps"`
	PacketLoss  float64 `json:"packet_loss"`
	Jitter      float64 `json:"jitter_ms"`
	RTT         float64 `json:"rtt_ms"`
	FramesSent  int64   `json:"frames_sent"`
	BytesSent   int64   `json:"bytes_sent"`
}

const (
	// processStartTimeout is how long to wait for gridstreamer-host to start and create its pipe.
	processStartTimeout = 15 * time.Second

	// processStopTimeout is how long to wait for a graceful shutdown before killing.
	processStopTimeout = 10 * time.Second

	// defaultProcessName is the expected process image name.
	defaultProcessName = "gridstreamer-host.exe"
)

// Manager manages the lifecycle of the gridstreamer-host.exe process and communicates
// with it via a named pipe IPC channel.
type Manager struct {
	config    *config.Config
	process   *os.Process
	cmd       *exec.Cmd
	pipeName  string
	ipcClient *IpcClient
	mu        sync.Mutex
}

// NewManager creates a new streamer Manager with the given configuration.
func NewManager(cfg *config.Config) *Manager {
	pipeName := defaultPipeName
	return &Manager{
		config:    cfg,
		pipeName:  pipeName,
		ipcClient: NewIpcClient(pipeName),
	}
}

// Detect checks if the gridstreamer-host binary exists at the configured path and
// gathers information about it (version, GPU, codec support).
func (m *Manager) Detect() (*StreamerInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	path := m.config.StreamerPath
	if path == "" {
		path = findStreamerPath()
	}

	if path == "" {
		return nil, fmt.Errorf("gridstreamer-host.exe not found")
	}

	if _, err := os.Stat(path); err != nil {
		return nil, fmt.Errorf("gridstreamer-host binary not accessible at %s: %w", path, err)
	}

	info := &StreamerInfo{Path: path}

	// Get the version by running --version.
	version, err := getStreamerVersion(path)
	if err != nil {
		slog.Debug("could not determine gridstreamer-host version", "error", err)
		info.Version = "unknown"
	} else {
		info.Version = version
	}

	// Detect GPU model.
	gpuName, err := detectGPU()
	if err != nil {
		slog.Debug("could not detect GPU model", "error", err)
	} else {
		info.GPUName = gpuName
	}

	// Query supported codecs by running --list-codecs (if supported).
	codecs, err := queryCodecs(path)
	if err != nil {
		slog.Debug("could not query codecs from binary, using defaults", "error", err)
		info.Codecs = []string{"h264", "h265"}
	} else {
		info.Codecs = codecs
	}

	return info, nil
}

// Start launches gridstreamer-host.exe with the --ipc-pipe flag and waits for the
// IPC connection to become available.
func (m *Manager) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.process != nil && m.isProcessAlive() {
		slog.Debug("gridstreamer-host is already running")
		return nil
	}

	path := m.config.StreamerPath
	if path == "" {
		path = findStreamerPath()
	}
	if path == "" {
		return fmt.Errorf("gridstreamer-host.exe not found")
	}

	slog.Info("starting gridstreamer-host", "path", path, "pipe", m.pipeName)

	cmd := exec.Command(path, "--ipc-pipe", m.pipeName, "--standby")
	cmd.Stdout = nil
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting gridstreamer-host: %w", err)
	}

	m.cmd = cmd
	m.process = cmd.Process

	slog.Info("gridstreamer-host process started", "pid", m.process.Pid)

	// Wait in a goroutine to collect the exit status and avoid zombie processes.
	go func() {
		err := cmd.Wait()
		m.mu.Lock()
		defer m.mu.Unlock()
		if err != nil {
			slog.Warn("gridstreamer-host process exited", "error", err)
		} else {
			slog.Info("gridstreamer-host process exited cleanly")
		}
		m.process = nil
		m.cmd = nil
	}()

	// Wait for the IPC pipe to become available, then connect.
	if err := m.waitForPipe(); err != nil {
		return fmt.Errorf("waiting for gridstreamer-host IPC pipe: %w", err)
	}

	if err := m.ipcClient.Connect(); err != nil {
		return fmt.Errorf("connecting to gridstreamer-host IPC: %w", err)
	}

	slog.Info("connected to gridstreamer-host IPC pipe")
	return nil
}

// Stop gracefully stops the gridstreamer-host process. It sends a shutdown command
// via IPC first, then waits for the process to exit. If it does not exit within
// the timeout, the process is forcibly killed.
func (m *Manager) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.process == nil {
		return nil
	}

	slog.Info("stopping gridstreamer-host", "pid", m.process.Pid)

	// Try graceful shutdown via IPC.
	if m.ipcClient.IsConnected() {
		_, err := m.ipcClient.SendCommand("shutdown", nil)
		if err != nil {
			slog.Warn("IPC shutdown command failed, will kill process", "error", err)
		} else {
			// Wait for the process to exit.
			done := make(chan struct{})
			go func() {
				if m.cmd != nil {
					_ = m.cmd.Wait()
				}
				close(done)
			}()

			select {
			case <-done:
				slog.Info("gridstreamer-host stopped gracefully")
				m.process = nil
				m.cmd = nil
				_ = m.ipcClient.Close()
				return nil
			case <-time.After(processStopTimeout):
				slog.Warn("gridstreamer-host did not stop within timeout, killing")
			}
		}
	}

	// Force kill.
	if err := m.process.Kill(); err != nil {
		slog.Warn("failed to kill gridstreamer-host process", "error", err)
	}

	m.process = nil
	m.cmd = nil
	_ = m.ipcClient.Close()

	slog.Info("gridstreamer-host process killed")
	return nil
}

// IsRunning checks if the gridstreamer-host process is alive.
func (m *Manager) IsRunning() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.process != nil && m.isProcessAlive()
}

// GetCapabilities queries the streamer for its encoding capabilities via IPC.
func (m *Manager) GetCapabilities() (*StreamerCapabilities, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.ipcClient.IsConnected() {
		return nil, fmt.Errorf("IPC not connected")
	}

	data, err := m.ipcClient.SendCommand("get_capabilities", nil)
	if err != nil {
		return nil, fmt.Errorf("querying capabilities: %w", err)
	}

	// Marshal and unmarshal through JSON to convert the generic map to our struct.
	raw, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("marshalling capabilities data: %w", err)
	}

	var caps StreamerCapabilities
	if err := json.Unmarshal(raw, &caps); err != nil {
		return nil, fmt.Errorf("unmarshalling capabilities: %w", err)
	}

	return &caps, nil
}

// PrepareSession sends a prepare_session command to the streamer via IPC.
// This configures the encoder and allocates resources without starting the stream.
func (m *Manager) PrepareSession(sc SessionConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.ipcClient.IsConnected() {
		return fmt.Errorf("IPC not connected")
	}

	params := map[string]interface{}{
		"session_id":   sc.SessionID,
		"codec":        sc.Codec,
		"bitrate_kbps": sc.BitrateKbps,
		"fps":          sc.FPS,
		"width":        sc.Width,
		"height":       sc.Height,
		"gaming_mode":  sc.GamingMode,
		"stun_servers": sc.StunServers,
	}

	_, err := m.ipcClient.SendCommand("prepare_session", params)
	if err != nil {
		return fmt.Errorf("prepare_session failed: %w", err)
	}

	slog.Info("session prepared in streamer", "sessionId", sc.SessionID)
	return nil
}

// StartSession sends a start_session command to begin streaming to the given peer.
func (m *Manager) StartSession(peer PeerInfo) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.ipcClient.IsConnected() {
		return fmt.Errorf("IPC not connected")
	}

	params := map[string]interface{}{
		"ip":               peer.IP,
		"port":             peer.Port,
		"dtls_fingerprint": peer.DTLSFingerprint,
	}

	_, err := m.ipcClient.SendCommand("start_session", params)
	if err != nil {
		return fmt.Errorf("start_session failed: %w", err)
	}

	slog.Info("streaming session started", "peerIP", peer.IP, "peerPort", peer.Port)
	return nil
}

// StopSession sends a stop_session command to end the active streaming session.
func (m *Manager) StopSession(sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.ipcClient.IsConnected() {
		return fmt.Errorf("IPC not connected")
	}

	params := map[string]interface{}{
		"session_id": sessionID,
	}

	_, err := m.ipcClient.SendCommand("stop_session", params)
	if err != nil {
		return fmt.Errorf("stop_session failed: %w", err)
	}

	slog.Info("streaming session stopped", "sessionId", sessionID)
	return nil
}

// GetStats queries the streamer for current session statistics.
func (m *Manager) GetStats() (*SessionStats, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.ipcClient.IsConnected() {
		return nil, fmt.Errorf("IPC not connected")
	}

	data, err := m.ipcClient.SendCommand("get_stats", nil)
	if err != nil {
		return nil, fmt.Errorf("querying stats: %w", err)
	}

	raw, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("marshalling stats data: %w", err)
	}

	var stats SessionStats
	if err := json.Unmarshal(raw, &stats); err != nil {
		return nil, fmt.Errorf("unmarshalling stats: %w", err)
	}

	return &stats, nil
}

// ForceIDR sends a force_idr command to the streamer, requesting an immediate
// keyframe. This is useful when a new peer connects or packet loss is detected.
func (m *Manager) ForceIDR() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.ipcClient.IsConnected() {
		return fmt.Errorf("IPC not connected")
	}

	_, err := m.ipcClient.SendCommand("force_idr", nil)
	if err != nil {
		return fmt.Errorf("force_idr failed: %w", err)
	}

	return nil
}

// SetGamingMode sends a set_gaming_mode command to change the encoding profile
// (e.g., "balanced", "performance", "quality").
func (m *Manager) SetGamingMode(mode string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.ipcClient.IsConnected() {
		return fmt.Errorf("IPC not connected")
	}

	params := map[string]interface{}{
		"mode": mode,
	}

	_, err := m.ipcClient.SendCommand("set_gaming_mode", params)
	if err != nil {
		return fmt.Errorf("set_gaming_mode failed: %w", err)
	}

	slog.Info("gaming mode updated", "mode", mode)
	return nil
}

// waitForPipe polls for the named pipe to exist, indicating gridstreamer-host is ready.
func (m *Manager) waitForPipe() error {
	deadline := time.Now().Add(processStartTimeout)
	pipePath := m.pipeName

	for time.Now().Before(deadline) {
		// On Windows, we can check if the pipe exists by trying to stat it.
		// Named pipes appear as files under \\.\pipe\
		_, err := os.Stat(pipePath)
		if err == nil {
			return nil
		}
		time.Sleep(250 * time.Millisecond)
	}

	return fmt.Errorf("gridstreamer-host did not create IPC pipe %s within %v", pipePath, processStartTimeout)
}

// isProcessAlive checks whether the stored process handle is still running.
// Must be called with m.mu held.
func (m *Manager) isProcessAlive() bool {
	if m.process == nil {
		return false
	}
	// On Windows, FindProcess always succeeds, so we check via tasklist.
	return isStreamerProcessRunning()
}

// isStreamerProcessRunning checks if gridstreamer-host.exe is in the process list.
func isStreamerProcessRunning() bool {
	cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("IMAGENAME eq %s", defaultProcessName), "/NH")
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(string(out)), strings.ToLower(defaultProcessName))
}

// getStreamerVersion runs gridstreamer-host.exe --version and returns the trimmed output.
func getStreamerVersion(path string) (string, error) {
	cmd := exec.Command(path, "--version")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("running --version: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// queryCodecs runs gridstreamer-host.exe --list-codecs and parses the output.
// Expected output is one codec per line (e.g., "h264\nh265\nav1").
func queryCodecs(path string) ([]string, error) {
	cmd := exec.Command(path, "--list-codecs")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("running --list-codecs: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var codecs []string
	for _, line := range lines {
		codec := strings.TrimSpace(line)
		if codec != "" {
			codecs = append(codecs, codec)
		}
	}

	if len(codecs) == 0 {
		return nil, fmt.Errorf("no codecs reported by gridstreamer-host")
	}

	return codecs, nil
}

// detectGPU queries the GPU model name via nvidia-smi.
func detectGPU() (string, error) {
	cmd := exec.Command("nvidia-smi", "--query-gpu=name", "--format=csv,noheader,nounits")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("nvidia-smi query failed: %w", err)
	}

	model := strings.TrimSpace(string(out))
	if model == "" {
		return "", fmt.Errorf("nvidia-smi returned empty GPU name")
	}

	// If there are multiple GPUs, take the first one.
	lines := strings.Split(model, "\n")
	return strings.TrimSpace(lines[0]), nil
}

// findStreamerPath searches common installation directories for gridstreamer-host.exe.
func findStreamerPath() string {
	candidates := []string{
		`C:\Program Files\GridStreamer\gridstreamer-host.exe`,
		`C:\Program Files (x86)\GridStreamer\gridstreamer-host.exe`,
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	// Try PATH.
	path, err := exec.LookPath("gridstreamer-host.exe")
	if err == nil {
		return path
	}

	return ""
}
