// Package platform provides hardware and platform detection for NVRemote host agents.
// On ARM64 Linux, it detects NVIDIA Jetson, Orin, and DGX Spark platforms
// by reading device tree and JetPack/L4T release information.
package platform

import (
	"fmt"
	"log/slog"
	"os"
	"runtime"
	"strings"
)

// PlatformType identifies the hardware platform category.
type PlatformType string

const (
	PlatformDesktop PlatformType = "desktop"  // Standard Windows/Linux PC with NVIDIA GPU
	PlatformJetson  PlatformType = "jetson"   // NVIDIA Jetson embedded platform
	PlatformDGX     PlatformType = "dgx"      // NVIDIA DGX Spark / DGX Station
	PlatformUnknown PlatformType = "unknown"
)

// PlatformInfo describes the detected hardware platform.
type PlatformInfo struct {
	Type           PlatformType `json:"type"`
	Model          string       `json:"model"`                     // e.g. "NVIDIA Jetson AGX Orin"
	SoC            string       `json:"soc,omitempty"`             // e.g. "Orin", "Grace Blackwell"
	OS             string       `json:"os"`                        // runtime.GOOS
	Arch           string       `json:"arch"`                      // runtime.GOARCH
	L4TVersion     string       `json:"l4t_version,omitempty"`     // Linux for Tegra version
	JetPackVersion string       `json:"jetpack_version,omitempty"` // JetPack SDK version
	PowerMode      string       `json:"power_mode,omitempty"`      // Current Jetson power mode
	GPUModel       string       `json:"gpu_model"`                 // GPU name from nvidia-smi or device tree
	HasNVMM        bool         `json:"has_nvmm"`                  // NVIDIA Multimedia Memory available
	HasNvFBC       bool         `json:"has_nvfbc"`                 // NvFBC capture available
}

// Detect probes the current system and returns a PlatformInfo.
func Detect() PlatformInfo {
	info := PlatformInfo{
		OS:   runtime.GOOS,
		Arch: runtime.GOARCH,
	}

	if runtime.GOARCH == "arm64" && runtime.GOOS == "linux" {
		detectJetson(&info)
	} else {
		info.Type = PlatformDesktop
		info.Model = fmt.Sprintf("%s/%s Desktop", runtime.GOOS, runtime.GOARCH)
	}

	return info
}

// detectJetson reads Jetson-specific system files to identify the platform.
func detectJetson(info *PlatformInfo) {
	// Read device tree model
	model, err := readTrimmedFile("/proc/device-tree/model")
	if err != nil {
		slog.Debug("could not read device tree model", "error", err)
		info.Type = PlatformUnknown
		info.Model = "Unknown ARM64 Linux"
		return
	}

	info.Model = model

	// Classify platform
	switch {
	case strings.Contains(model, "DGX") || strings.Contains(model, "Grace"):
		info.Type = PlatformDGX
		info.SoC = "Grace Blackwell"
		info.HasNVMM = true
		info.HasNvFBC = true // DGX Spark has full desktop GPU
	case strings.Contains(model, "AGX Orin"):
		info.Type = PlatformJetson
		info.SoC = "Orin"
		info.HasNVMM = true
	case strings.Contains(model, "Orin NX"):
		info.Type = PlatformJetson
		info.SoC = "Orin"
		info.HasNVMM = true
	case strings.Contains(model, "Orin Nano"):
		info.Type = PlatformJetson
		info.SoC = "Orin"
		info.HasNVMM = true
	case strings.Contains(model, "Xavier"):
		info.Type = PlatformJetson
		info.SoC = "Xavier"
		info.HasNVMM = true
	case strings.Contains(model, "Nano") || strings.Contains(model, "Tegra"):
		info.Type = PlatformJetson
		info.SoC = "Tegra X1"
		info.HasNVMM = true
	default:
		info.Type = PlatformUnknown
		info.SoC = "Unknown"
	}

	// Read L4T version from /etc/nv_tegra_release
	detectL4TVersion(info)

	// Read power mode
	detectPowerMode(info)

	// Set GPU model from SoC if nvidia-smi isn't available
	if info.GPUModel == "" {
		info.GPUModel = info.Model
	}

	slog.Info("detected Jetson platform",
		"model", info.Model,
		"soc", info.SoC,
		"l4t", info.L4TVersion,
		"jetpack", info.JetPackVersion,
		"power_mode", info.PowerMode,
	)
}

// detectL4TVersion parses the L4T and JetPack version.
func detectL4TVersion(info *PlatformInfo) {
	content, err := readTrimmedFile("/etc/nv_tegra_release")
	if err != nil {
		return
	}

	// Format: "# R35 (release), REVISION: 4.1, ..."
	parts := strings.Fields(content)
	for i, p := range parts {
		if strings.HasPrefix(p, "R") && len(p) > 1 {
			major := strings.TrimPrefix(p, "R")
			// Look for REVISION:
			for j := i + 1; j < len(parts); j++ {
				if parts[j] == "REVISION:" && j+1 < len(parts) {
					minor := strings.TrimSuffix(parts[j+1], ",")
					info.L4TVersion = major + "." + minor
					break
				}
			}
			break
		}
	}

	// Derive JetPack version from L4T
	if info.L4TVersion != "" {
		l4tMajor := 0
		fmt.Sscanf(info.L4TVersion, "%d", &l4tMajor)
		switch {
		case l4tMajor >= 36:
			info.JetPackVersion = "6.x"
		case l4tMajor >= 35:
			info.JetPackVersion = "5.x"
		case l4tMajor >= 32:
			info.JetPackVersion = "4.x"
		}
	}
}

// detectPowerMode reads the current Jetson power mode.
func detectPowerMode(info *PlatformInfo) {
	// nvpmodel stores status in /var/lib/nvpmodel/status
	mode, err := readTrimmedFile("/var/lib/nvpmodel/status")
	if err == nil && mode != "" {
		info.PowerMode = mode
		return
	}

	// Fallback: try nvpmodel command
	info.PowerMode = "UNKNOWN"
}

// readTrimmedFile reads a file and trims whitespace/null bytes.
func readTrimmedFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	s := string(data)
	s = strings.TrimRight(s, "\x00\n\r\t ")
	return s, nil
}
