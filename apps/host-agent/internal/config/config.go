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
	DefaultConfigPath = `C:\ProgramData\NVRemote\agent.yaml`

	// DefaultDataDir is the default directory for agent state files.
	DefaultDataDir = `C:\ProgramData\NVRemote`
)

// Config holds all configuration for the host agent.
type Config struct {
	// ControlPlaneURL is the base URL of the NVRemote control plane API.
	ControlPlaneURL string `mapstructure:"control_plane_url" yaml:"control_plane_url"`

	// BootstrapToken is a one-time token used to register this host with the control plane.
	BootstrapToken string `mapstructure:"bootstrap_token" yaml:"bootstrap_token"`

	// HostName is the human-readable name for this host machine.
	HostName string `mapstructure:"host_name" yaml:"host_name"`

	// StreamerPath is the file path to the nvremote-host.exe binary.
	StreamerPath string `mapstructure:"streamer_path" yaml:"streamer_path"`

	// StunServers is a list of STUN servers used for ICE candidate gathering.
	// Each entry should be in "host:port" format.
	StunServers []string `mapstructure:"stun_servers" yaml:"stun_servers"`

	// TurnServer is the TURN relay server address (host:port) for fallback connectivity.
	TurnServer string `mapstructure:"turn_server" yaml:"turn_server"`

	// TurnUsername is the username for TURN server authentication.
	TurnUsername string `mapstructure:"turn_username" yaml:"turn_username"`

	// TurnCredential is the credential (password) for TURN server authentication.
	TurnCredential string `mapstructure:"turn_credential" yaml:"turn_credential"`

	// DataDir is the directory where the agent stores state files (keys, registration, etc.).
	DataDir string `mapstructure:"data_dir" yaml:"data_dir"`

	// LogLevel controls the logging verbosity (debug, info, warn, error).
	LogLevel string `mapstructure:"log_level" yaml:"log_level"`

	// --- Deprecated fields (kept for backward compatibility during migration) ---

	// NvstreamerPath is the file path to the nvstreamer.exe binary.
	// Deprecated: Use StreamerPath instead.
	NvstreamerPath string `mapstructure:"nvstreamer_path" yaml:"nvstreamer_path"`

	// NvstreamerPorts holds the port configuration for nvstreamer streams.
	// Deprecated: Ports are now negotiated per-session via P2P ICE.
	NvstreamerPorts PortConfig `mapstructure:"nvstreamer_ports" yaml:"nvstreamer_ports"`

	// GatewayEndpoint is the WireGuard gateway address (host:port).
	// Deprecated: Connectivity is now handled via P2P ICE, not WireGuard tunnels.
	GatewayEndpoint string `mapstructure:"gateway_endpoint" yaml:"gateway_endpoint"`
}

// PortConfig holds the port numbers used by nvstreamer for different stream types.
// Deprecated: Ports are now negotiated per-session via P2P ICE.
type PortConfig struct {
	Video int `mapstructure:"video" yaml:"video"`
	Audio int `mapstructure:"audio" yaml:"audio"`
	Input int `mapstructure:"input" yaml:"input"`
}

// Load reads configuration from the given file path, falling back to the default
// path if configPath is empty. Environment variables override file values.
func Load(configPath string) (*Config, error) {
	v := viper.New()

	// Set defaults.
	v.SetDefault("data_dir", DefaultDataDir)
	v.SetDefault("log_level", "info")
	v.SetDefault("streamer_path", `C:\Program Files\NVRemote\nvremote-host.exe`)
	v.SetDefault("stun_servers", []string{"stun.l.google.com:19302"})

	// Deprecated defaults (kept for backward compatibility).
	v.SetDefault("nvstreamer_path", `C:\Program Files\NVRemote\nvremote-host.exe`)
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
	v.SetEnvPrefix("NVREMOTE")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// Bind specific environment variables to config keys.
	envBindings := map[string]string{
		"control_plane_url": "NVREMOTE_CONTROL_PLANE_URL",
		"bootstrap_token":   "NVREMOTE_BOOTSTRAP_TOKEN",
		"host_name":         "NVREMOTE_HOST_NAME",
		"streamer_path":     "NVREMOTE_STREAMER_PATH",
		"stun_servers":      "NVREMOTE_STUN_SERVERS",
		"turn_server":       "NVREMOTE_TURN_SERVER",
		"turn_username":     "NVREMOTE_TURN_USERNAME",
		"turn_credential":   "NVREMOTE_TURN_CREDENTIAL",
		"data_dir":          "NVREMOTE_DATA_DIR",
		"log_level":         "NVREMOTE_LOG_LEVEL",

		// Deprecated bindings (kept for backward compatibility).
		"nvstreamer_path":        "NVREMOTE_NVSTREAMER_PATH",
		"nvstreamer_ports.video": "NVREMOTE_NVSTREAMER_PORTS_VIDEO",
		"nvstreamer_ports.audio": "NVREMOTE_NVSTREAMER_PORTS_AUDIO",
		"nvstreamer_ports.input": "NVREMOTE_NVSTREAMER_PORTS_INPUT",
		"gateway_endpoint":       "NVREMOTE_GATEWAY_ENDPOINT",
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

	// Migration: if StreamerPath is not explicitly set but NvstreamerPath is,
	// the user hasn't migrated yet. StreamerPath takes priority if set.
	if cfg.StreamerPath == "" && cfg.NvstreamerPath != "" {
		// Don't auto-migrate; the user should explicitly set streamer_path.
		// StreamerPath will use its default from viper.
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
