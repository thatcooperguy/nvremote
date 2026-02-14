// Package gridstreamer provides monitoring and lifecycle management for the gridstreamer.exe process.
package gridstreamer

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
)

// NvstreamerInfo holds information about the gridstreamer installation and process state.
type NvstreamerInfo struct {
	// Path is the absolute path to the gridstreamer.exe binary.
	Path string

	// Version is the detected version string of gridstreamer.
	Version string

	// Ports holds the port numbers gridstreamer is listening on.
	Ports []int

	// Running indicates whether the gridstreamer process is currently active.
	Running bool
}

// Detect locates the gridstreamer.exe process or binary at the configured path and returns
// information about it. If configuredPath is empty, it searches default locations.
func Detect(configuredPath string) (*NvstreamerInfo, error) {
	info := &NvstreamerInfo{}

	// Determine the binary path.
	path := configuredPath
	if path == "" {
		path = findNvstreamerPath()
	}

	if path == "" {
		return nil, fmt.Errorf("gridstreamer.exe not found")
	}

	if _, err := os.Stat(path); err != nil {
		return nil, fmt.Errorf("gridstreamer binary not accessible at %s: %w", path, err)
	}
	info.Path = path

	// Check if gridstreamer is currently running.
	info.Running = isProcessRunning("gridstreamer.exe")

	// Attempt to get the version.
	version, err := getVersion(path)
	if err != nil {
		slog.Debug("could not determine gridstreamer version", "error", err)
		info.Version = "unknown"
	} else {
		info.Version = version
	}

	return info, nil
}

// GetStatus returns the current status of gridstreamer: whether it is running,
// which ports it is using, and its version.
func GetStatus(gridstreamerPath string) (running bool, ports []int, version string) {
	running = isProcessRunning("gridstreamer.exe")

	ver, err := getVersion(gridstreamerPath)
	if err != nil {
		version = "unknown"
	} else {
		version = ver
	}

	// Default ports; in a full implementation these would be read from gridstreamer config.
	if running {
		ports = []int{8443, 8444, 8445}
	}

	return running, ports, version
}

// EnsureRunning verifies that gridstreamer.exe is running. If it is not, it attempts
// to start the process at the given path.
func EnsureRunning(path string) error {
	if path == "" {
		return fmt.Errorf("gridstreamer path not configured")
	}

	if isProcessRunning("gridstreamer.exe") {
		slog.Debug("gridstreamer is already running")
		return nil
	}

	slog.Info("starting gridstreamer", "path", path)

	// Start gridstreamer as a detached process so it survives agent restarts.
	cmd := exec.Command(path)
	cmd.Stdout = nil
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting gridstreamer: %w", err)
	}

	// Detach - do not wait for the process.
	if cmd.Process != nil {
		if err := cmd.Process.Release(); err != nil {
			slog.Warn("could not release gridstreamer process handle", "error", err)
		}
	}

	slog.Info("gridstreamer started", "pid", cmd.Process.Pid)
	return nil
}

// GetGPUInfo returns the GPU model name by invoking nvidia-smi.
func GetGPUInfo() (string, error) {
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

// isProcessRunning checks whether a process with the given name exists.
// It uses tasklist on Windows to find the process.
func isProcessRunning(processName string) bool {
	cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("IMAGENAME eq %s", processName), "/NH")
	out, err := cmd.Output()
	if err != nil {
		slog.Debug("tasklist command failed", "error", err)
		return false
	}

	output := strings.ToLower(string(out))
	return strings.Contains(output, strings.ToLower(processName))
}

// getVersion runs gridstreamer.exe --version and returns the output.
func getVersion(path string) (string, error) {
	cmd := exec.Command(path, "--version")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("running --version: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// findNvstreamerPath searches common installation directories for gridstreamer.exe.
func findNvstreamerPath() string {
	candidates := []string{
		`C:\Program Files\NVIDIA\gridstreamer\gridstreamer.exe`,
		`C:\Program Files (x86)\NVIDIA\gridstreamer\gridstreamer.exe`,
		`C:\NVIDIA\gridstreamer\gridstreamer.exe`,
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	// Try PATH as a last resort.
	path, err := exec.LookPath("gridstreamer.exe")
	if err == nil {
		return path
	}

	return ""
}
