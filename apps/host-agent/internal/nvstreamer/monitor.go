// Package nvstreamer provides monitoring and lifecycle management for the nvstreamer.exe process.
package nvstreamer

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
)

// NvstreamerInfo holds information about the nvstreamer installation and process state.
type NvstreamerInfo struct {
	// Path is the absolute path to the nvstreamer.exe binary.
	Path string

	// Version is the detected version string of nvstreamer.
	Version string

	// Ports holds the port numbers nvstreamer is listening on.
	Ports []int

	// Running indicates whether the nvstreamer process is currently active.
	Running bool
}

// Detect locates the nvstreamer.exe process or binary at the configured path and returns
// information about it. If configuredPath is empty, it searches default locations.
func Detect(configuredPath string) (*NvstreamerInfo, error) {
	info := &NvstreamerInfo{}

	// Determine the binary path.
	path := configuredPath
	if path == "" {
		path = findNvstreamerPath()
	}

	if path == "" {
		return nil, fmt.Errorf("nvstreamer.exe not found")
	}

	if _, err := os.Stat(path); err != nil {
		return nil, fmt.Errorf("nvstreamer binary not accessible at %s: %w", path, err)
	}
	info.Path = path

	// Check if nvstreamer is currently running.
	info.Running = isProcessRunning("nvstreamer.exe")

	// Attempt to get the version.
	version, err := getVersion(path)
	if err != nil {
		slog.Debug("could not determine nvstreamer version", "error", err)
		info.Version = "unknown"
	} else {
		info.Version = version
	}

	return info, nil
}

// GetStatus returns the current status of nvstreamer: whether it is running,
// which ports it is using, and its version.
func GetStatus(nvstreamerPath string) (running bool, ports []int, version string) {
	running = isProcessRunning("nvstreamer.exe")

	ver, err := getVersion(nvstreamerPath)
	if err != nil {
		version = "unknown"
	} else {
		version = ver
	}

	// Default ports; in a full implementation these would be read from nvstreamer config.
	if running {
		ports = []int{8443, 8444, 8445}
	}

	return running, ports, version
}

// EnsureRunning verifies that nvstreamer.exe is running. If it is not, it attempts
// to start the process at the given path.
func EnsureRunning(path string) error {
	if path == "" {
		return fmt.Errorf("nvstreamer path not configured")
	}

	if isProcessRunning("nvstreamer.exe") {
		slog.Debug("nvstreamer is already running")
		return nil
	}

	slog.Info("starting nvstreamer", "path", path)

	// Start nvstreamer as a detached process so it survives agent restarts.
	cmd := exec.Command(path)
	cmd.Stdout = nil
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting nvstreamer: %w", err)
	}

	// Detach - do not wait for the process.
	if cmd.Process != nil {
		if err := cmd.Process.Release(); err != nil {
			slog.Warn("could not release nvstreamer process handle", "error", err)
		}
	}

	slog.Info("nvstreamer started", "pid", cmd.Process.Pid)
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

// getVersion runs nvstreamer.exe --version and returns the output.
func getVersion(path string) (string, error) {
	cmd := exec.Command(path, "--version")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("running --version: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// findNvstreamerPath searches common installation directories for nvstreamer.exe.
func findNvstreamerPath() string {
	candidates := []string{
		`C:\Program Files\NVIDIA\nvstreamer\nvstreamer.exe`,
		`C:\Program Files (x86)\NVIDIA\nvstreamer\nvstreamer.exe`,
		`C:\NVIDIA\nvstreamer\nvstreamer.exe`,
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	// Try PATH as a last resort.
	path, err := exec.LookPath("nvstreamer.exe")
	if err == nil {
		return path
	}

	return ""
}
