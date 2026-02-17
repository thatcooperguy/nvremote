package main

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"

	"gopkg.in/yaml.v3"
)

const defaultConfigPath = "/etc/nvremote-gateway/config.yaml"

// Config holds all configuration for the gateway service.
type Config struct {
	// ListenAddr is the address the HTTP API server binds to.
	ListenAddr string `yaml:"listen_addr"`

	// WireGuardInterface is the name of the WireGuard network interface.
	WireGuardInterface string `yaml:"wireguard_interface"`

	// WireGuardPort is the UDP port WireGuard listens on.
	WireGuardPort int `yaml:"wireguard_port"`

	// ControlPlaneURL is the base URL of the NVREMOTE control plane API.
	ControlPlaneURL string `yaml:"control_plane_url"`

	// GatewayToken is the bearer token used to authenticate API requests.
	GatewayToken string `yaml:"gateway_token"`

	// TunnelSubnet is the CIDR block used for the WireGuard overlay network.
	TunnelSubnet string `yaml:"tunnel_subnet"`

	// PublicIP is the public IP address of this gateway VM.
	PublicIP string `yaml:"public_ip"`

	// GatewayID is the unique identifier for this gateway in the control plane.
	GatewayID string `yaml:"gateway_id"`

	// HeartbeatInterval is the number of seconds between control plane heartbeats.
	HeartbeatInterval int `yaml:"heartbeat_interval"`

	// TunnelEnabled enables the zero-trust tunnel proxy.
	TunnelEnabled bool `yaml:"tunnel_enabled"`

	// TunnelSecret is the HMAC secret used to verify tunnel JWT tokens.
	// Must match the TUNNEL_SECRET configured on the NVRemote API server.
	TunnelSecret string `yaml:"tunnel_secret"`
}

// DefaultConfig returns a Config populated with default values.
func DefaultConfig() *Config {
	return &Config{
		ListenAddr:         ":8080",
		WireGuardInterface: "wg0",
		WireGuardPort:      51820,
		TunnelSubnet:       "10.100.0.0/16",
		HeartbeatInterval:  30,
	}
}

// LoadConfig loads configuration from a YAML file and overrides with
// environment variables. Environment variables take precedence.
func LoadConfig() (*Config, error) {
	cfg := DefaultConfig()

	// Attempt to load from config file.
	configPath := defaultConfigPath
	if envPath := os.Getenv("NVREMOTE_CONFIG_PATH"); envPath != "" {
		configPath = envPath
	}

	if err := loadConfigFile(cfg, configPath); err != nil {
		slog.Warn("could not load config file, using defaults and env vars",
			"path", configPath,
			"error", err,
		)
	} else {
		slog.Info("loaded config file", "path", configPath)
	}

	// Override with environment variables.
	applyEnvOverrides(cfg)

	// Validate required fields.
	if err := validateConfig(cfg); err != nil {
		return nil, fmt.Errorf("config validation failed: %w", err)
	}

	return cfg, nil
}

// loadConfigFile reads and unmarshals a YAML configuration file into cfg.
func loadConfigFile(cfg *Config, path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("reading config file: %w", err)
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return fmt.Errorf("parsing config file: %w", err)
	}

	return nil
}

// applyEnvOverrides applies environment variable overrides to the config.
// Environment variables take precedence over config file values.
func applyEnvOverrides(cfg *Config) {
	if v := os.Getenv("NVREMOTE_LISTEN_ADDR"); v != "" {
		cfg.ListenAddr = v
	}
	if v := os.Getenv("NVREMOTE_WG_INTERFACE"); v != "" {
		cfg.WireGuardInterface = v
	}
	if v := os.Getenv("NVREMOTE_WG_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			cfg.WireGuardPort = port
		}
	}
	if v := os.Getenv("NVREMOTE_CONTROL_PLANE_URL"); v != "" {
		cfg.ControlPlaneURL = v
	}
	if v := os.Getenv("NVREMOTE_GATEWAY_TOKEN"); v != "" {
		cfg.GatewayToken = v
	}
	if v := os.Getenv("NVREMOTE_TUNNEL_SUBNET"); v != "" {
		cfg.TunnelSubnet = v
	}
	if v := os.Getenv("NVREMOTE_PUBLIC_IP"); v != "" {
		cfg.PublicIP = v
	}
	if v := os.Getenv("NVREMOTE_GATEWAY_ID"); v != "" {
		cfg.GatewayID = v
	}
	if v := os.Getenv("NVREMOTE_HEARTBEAT_INTERVAL"); v != "" {
		if interval, err := strconv.Atoi(v); err == nil {
			cfg.HeartbeatInterval = interval
		}
	}
	if v := os.Getenv("NVREMOTE_TUNNEL_ENABLED"); v == "true" {
		cfg.TunnelEnabled = true
	}
	if v := os.Getenv("NVREMOTE_TUNNEL_SECRET"); v != "" {
		cfg.TunnelSecret = v
	}
}

// validateConfig ensures all required configuration values are set.
func validateConfig(cfg *Config) error {
	if cfg.GatewayToken == "" {
		return fmt.Errorf("gateway token is required (set NVREMOTE_GATEWAY_TOKEN or gateway_token in config)")
	}
	if cfg.PublicIP == "" {
		return fmt.Errorf("public IP is required (set NVREMOTE_PUBLIC_IP or public_ip in config)")
	}
	if cfg.WireGuardPort < 1 || cfg.WireGuardPort > 65535 {
		return fmt.Errorf("WireGuard port must be between 1 and 65535, got %d", cfg.WireGuardPort)
	}
	if cfg.TunnelEnabled && cfg.TunnelSecret == "" {
		return fmt.Errorf("tunnel secret is required when tunnel is enabled (set NVREMOTE_TUNNEL_SECRET)")
	}
	return nil
}
