// Package config handles loading and validation of the host agent configuration.
package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/viper"
)

const (
	// DefaultConfigPath is the default location for the agent configuration file.
	DefaultConfigPath = `C:\ProgramData\NVRemoteStream\agent.yaml`

	// DefaultDataDir is the default directory for agent state files.
	DefaultDataDir = `C:\ProgramData\NVRemoteStream`
)

// Config holds all configuration for the host agent.
type Config struct {
	// ControlPlaneURL is the base URL of the NVRemoteStream control plane API.
	ControlPlaneURL string `mapstructure:"control_plane_url"`

	// BootstrapToken is a one-time token used to register this host with the control plane.
	BootstrapToken string `mapstructure:"bootstrap_token"`

	// HostName is the human-readable name for this host machine.
	HostName string `mapstructure:"host_name"`

	// NvstreamerPath is the file path to the nvstreamer.exe binary.
	NvstreamerPath string `mapstructure:"nvstreamer_path"`

	// NvstreamerPorts holds the port configuration for nvstreamer streams.
	NvstreamerPorts PortConfig `mapstructure:"nvstreamer_ports"`

	// GatewayEndpoint is the WireGuard gateway address (host:port).
	GatewayEndpoint string `mapstructure:"gateway_endpoint"`

	// DataDir is the directory where the agent stores state files (keys, registration, etc.).
	DataDir string `mapstructure:"data_dir"`

	// LogLevel controls the logging verbosity (debug, info, warn, error).
	LogLevel string `mapstructure:"log_level"`
}

// PortConfig holds the port numbers used by nvstreamer for different stream types.
type PortConfig struct {
	Video int `mapstructure:"video"`
	Audio int `mapstructure:"audio"`
	Input int `mapstructure:"input"`
}

// Load reads configuration from the given file path, falling back to the default
// path if configPath is empty. Environment variables override file values.
func Load(configPath string) (*Config, error) {
	v := viper.New()

	// Set defaults.
	v.SetDefault("data_dir", DefaultDataDir)
	v.SetDefault("log_level", "info")
	v.SetDefault("nvstreamer_path", `C:\Program Files\NVIDIA\nvstreamer\nvstreamer.exe`)
	v.SetDefault("nvstreamer_ports.video", 8443)
	v.SetDefault("nvstreamer_ports.audio", 8444)
	v.SetDefault("nvstreamer_ports.input", 8445)

	// Configure file source.
	if configPath != "" {
		v.SetConfigFile(configPath)
	} else {
		v.SetConfigFile(DefaultConfigPath)
	}

	// Configure environment variable overrides.
	v.SetEnvPrefix("NVRS")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// Bind specific environment variables to config keys.
	envBindings := map[string]string{
		"control_plane_url":    "NVRS_CONTROL_PLANE_URL",
		"bootstrap_token":      "NVRS_BOOTSTRAP_TOKEN",
		"host_name":            "NVRS_HOST_NAME",
		"nvstreamer_path":      "NVRS_NVSTREAMER_PATH",
		"nvstreamer_ports.video": "NVRS_NVSTREAMER_PORTS_VIDEO",
		"nvstreamer_ports.audio": "NVRS_NVSTREAMER_PORTS_AUDIO",
		"nvstreamer_ports.input": "NVRS_NVSTREAMER_PORTS_INPUT",
		"gateway_endpoint":     "NVRS_GATEWAY_ENDPOINT",
		"data_dir":             "NVRS_DATA_DIR",
		"log_level":            "NVRS_LOG_LEVEL",
	}
	for key, env := range envBindings {
		_ = v.BindEnv(key, env)
	}

	// Read config file.
	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(*os.PathError); ok {
			// Config file not found; rely on env vars and defaults.
		} else {
			return nil, fmt.Errorf("reading config file: %w", err)
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshalling config: %w", err)
	}

	// Resolve hostname if not set.
	if cfg.HostName == "" {
		hostname, err := os.Hostname()
		if err != nil {
			return nil, fmt.Errorf("getting hostname: %w", err)
		}
		cfg.HostName = hostname
	}

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("config validation: %w", err)
	}

	return &cfg, nil
}

// Validate checks that all required configuration fields are present and well-formed.
func (c *Config) Validate() error {
	if c.ControlPlaneURL == "" {
		return fmt.Errorf("control_plane_url is required")
	}

	if c.BootstrapToken == "" {
		return fmt.Errorf("bootstrap_token is required")
	}

	if c.DataDir == "" {
		return fmt.Errorf("data_dir is required")
	}

	// Ensure data directory exists.
	if err := os.MkdirAll(c.DataDir, 0o700); err != nil {
		return fmt.Errorf("creating data directory %s: %w", c.DataDir, err)
	}

	return nil
}
