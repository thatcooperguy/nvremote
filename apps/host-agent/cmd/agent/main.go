package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"

	"github.com/kardianos/service"

	"github.com/nvidia/nvremote/host-agent/internal/config"
	"github.com/nvidia/nvremote/host-agent/internal/heartbeat"
	"github.com/nvidia/nvremote/host-agent/internal/p2p"
	"github.com/nvidia/nvremote/host-agent/internal/registration"
	"github.com/nvidia/nvremote/host-agent/internal/streamer"
)

const (
	serviceName        = "NVRemoteAgent"
	serviceDisplayName = "NVRemote Host Agent"
	serviceDescription = "Host agent for NVRemote - manages nvremote-host process and P2P session signaling"
)

// agent implements kardianos/service.Interface for Windows service lifecycle.
type agent struct {
	cfg    *config.Config
	cancel context.CancelFunc
}

func (a *agent) Start(s service.Service) error {
	go a.run()
	return nil
}

func (a *agent) Stop(s service.Service) error {
	slog.Info("service stop requested")
	if a.cancel != nil {
		a.cancel()
	}
	return nil
}

func (a *agent) run() {
	ctx, cancel := context.WithCancel(context.Background())
	a.cancel = cancel
	defer cancel()

	if err := runAgent(ctx, a.cfg); err != nil {
		slog.Error("agent exited with error", "error", err)
		os.Exit(1)
	}
}

func main() {
	var (
		configPath  = flag.String("config", "", "path to config file (default: C:\\ProgramData\\NVRemote\\agent.yaml)")
		doInstall   = flag.Bool("install", false, "install as Windows service")
		doUninstall = flag.Bool("uninstall", false, "uninstall Windows service")
		doRun       = flag.Bool("run", false, "run in foreground (non-service mode)")
	)
	flag.Parse()

	// Set up structured logging.
	initLogger("info")

	// Load configuration.
	cfg, err := config.Load(*configPath)
	if err != nil && !*doInstall && !*doUninstall {
		// Config doesn't exist or is invalid — run interactive first-run setup
		// if we're in an interactive terminal (double-clicked or run from cmd).
		if service.Interactive() {
			fmt.Println()
			fmt.Println("  ======================================")
			fmt.Println("     NVRemote Host Agent - First Run")
			fmt.Println("  ======================================")
			fmt.Println()

			cfg, err = runFirstTimeSetup(*configPath)
			if err != nil {
				fmt.Printf("\n  Setup failed: %v\n", err)
				fmt.Println("\n  Press Enter to exit...")
				bufio.NewReader(os.Stdin).ReadBytes('\n')
				os.Exit(1)
			}
		} else {
			slog.Error("failed to load config", "error", err)
			os.Exit(1)
		}
	}

	if cfg != nil {
		initLogger(cfg.LogLevel)
	}

	// Configure the service definition.
	svcConfig := &service.Config{
		Name:        serviceName,
		DisplayName: serviceDisplayName,
		Description: serviceDescription,
		Arguments:   []string{},
	}

	ag := &agent{cfg: cfg}
	svc, err := service.New(ag, svcConfig)
	if err != nil {
		slog.Error("failed to create service", "error", err)
		os.Exit(1)
	}

	switch {
	case *doInstall:
		if err := svc.Install(); err != nil {
			slog.Error("failed to install service", "error", err)
			os.Exit(1)
		}
		fmt.Println("Service installed successfully:", serviceName)
		return

	case *doUninstall:
		if err := svc.Stop(); err != nil {
			slog.Warn("failed to stop service (may not be running)", "error", err)
		}
		if err := svc.Uninstall(); err != nil {
			slog.Error("failed to uninstall service", "error", err)
			os.Exit(1)
		}
		fmt.Println("Service uninstalled successfully:", serviceName)
		return

	case *doRun:
		// Run in foreground.
		ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
		defer cancel()

		slog.Info("starting agent in foreground mode")
		if err := runAgent(ctx, cfg); err != nil {
			slog.Error("agent exited with error", "error", err)
			os.Exit(1)
		}
		return

	default:
		if service.Interactive() {
			// Running interactively (double-clicked or from terminal).
			ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
			defer cancel()

			fmt.Println()
			fmt.Println("  NVRemote Host Agent is running.")
			fmt.Println("  Press Ctrl+C to stop.")
			fmt.Println()

			if err := runAgent(ctx, cfg); err != nil {
				fmt.Printf("\n  Agent error: %v\n", err)
				fmt.Println("\n  Press Enter to exit...")
				bufio.NewReader(os.Stdin).ReadBytes('\n')
				os.Exit(1)
			}
		} else {
			// Running as a Windows service.
			if err := svc.Run(); err != nil {
				slog.Error("service run failed", "error", err)
				os.Exit(1)
			}
		}
	}
}

// runFirstTimeSetup runs an interactive console wizard when no config file exists.
// It collects the bootstrap token, auto-detects settings, writes the config, and
// returns a loaded Config ready to use.
func runFirstTimeSetup(configPath string) (*config.Config, error) {
	reader := bufio.NewReader(os.Stdin)

	// Determine the directory where this executable lives — the streamer binary
	// should be right next to it in the extracted zip/tarball.
	exePath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("could not determine executable path: %w", err)
	}
	exeDir := filepath.Dir(exePath)

	fmt.Println("  This is your first time running NVRemote Host Agent.")
	fmt.Println("  Let's get your GPU machine set up for remote streaming.")
	fmt.Println()

	// Step 1: Bootstrap token
	fmt.Println("  You need a bootstrap token from your NVRemote dashboard.")
	fmt.Println("  Get one at: https://nvremote.com/dashboard/devices")
	fmt.Println()
	fmt.Print("  Bootstrap Token: ")
	token, _ := reader.ReadString('\n')
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, fmt.Errorf("bootstrap token is required")
	}

	// Step 2: Control plane URL (default to production)
	controlPlaneURL := "https://api.nvremote.com"
	fmt.Printf("  Control Plane URL [%s]: ", controlPlaneURL)
	urlInput, _ := reader.ReadString('\n')
	urlInput = strings.TrimSpace(urlInput)
	if urlInput != "" {
		controlPlaneURL = urlInput
	}

	// Step 3: Auto-detect hostname
	hostname, _ := os.Hostname()
	fmt.Printf("  Host Name [%s]: ", hostname)
	nameInput, _ := reader.ReadString('\n')
	nameInput = strings.TrimSpace(nameInput)
	if nameInput != "" {
		hostname = nameInput
	}

	// Step 4: Auto-detect streamer binary (look next to this exe first)
	streamerPath := filepath.Join(exeDir, "nvremote-host.exe")
	if runtime.GOOS != "windows" {
		streamerPath = filepath.Join(exeDir, "nvremote-host")
	}
	if _, serr := os.Stat(streamerPath); serr != nil {
		// Fall back to system-wide path
		if runtime.GOOS == "windows" {
			streamerPath = `C:\Program Files\NVRemote\nvremote-host.exe`
		} else {
			streamerPath = "/usr/local/bin/nvremote-host"
		}
	}

	// Step 5: Determine config and data paths
	dataDir := config.DefaultDataDir
	cfgPath := configPath
	if cfgPath == "" {
		cfgPath = config.DefaultConfigPath
	}

	// On Linux, use the exe directory for portability
	if runtime.GOOS != "windows" {
		dataDir = filepath.Join(exeDir, "data")
		if cfgPath == config.DefaultConfigPath {
			cfgPath = filepath.Join(exeDir, "agent.yaml")
		}
	}

	// Write the config file
	fmt.Println()
	fmt.Printf("  Writing config to: %s\n", cfgPath)

	configContent := fmt.Sprintf(`# NVRemote Host Agent Configuration
# Generated by first-run setup

control_plane_url: "%s"
bootstrap_token: "%s"
host_name: "%s"
streamer_path: "%s"
stun_servers:
  - "stun.l.google.com:19302"
data_dir: "%s"
log_level: "info"
`, controlPlaneURL, token, hostname, streamerPath, dataDir)

	// Ensure parent directory exists
	if err := os.MkdirAll(filepath.Dir(cfgPath), 0o700); err != nil {
		return nil, fmt.Errorf("creating config directory: %w", err)
	}

	if err := os.WriteFile(cfgPath, []byte(configContent), 0o600); err != nil {
		return nil, fmt.Errorf("writing config file: %w", err)
	}

	fmt.Println("  Config saved!")
	fmt.Println()
	fmt.Println("  Starting agent...")

	// Load the config we just wrote
	loadedCfg, err := config.Load(cfgPath)
	if err != nil {
		return nil, fmt.Errorf("loading generated config: %w", err)
	}

	return loadedCfg, nil
}

// runAgent performs the core agent lifecycle:
//  1. Detect nvremote-host binary
//  2. Register with control plane (or load existing registration)
//  3. Start nvremote-host process in standby mode
//  4. Start heartbeat + WebSocket signaling with P2P session handling
//  5. On shutdown: stop streamer, clean up
func runAgent(ctx context.Context, cfg *config.Config) error {
	slog.Info("starting NVRemote host agent",
		"controlPlane", cfg.ControlPlaneURL,
		"hostname", cfg.HostName,
	)

	// Step 1: Create streamer manager and detect the nvremote-host binary.
	streamerMgr := streamer.NewManager(cfg)

	info, err := streamerMgr.Detect()
	if err != nil {
		return fmt.Errorf("nvremote-host not found: %w (ensure nvremote-host.exe is installed at %s)", err, cfg.StreamerPath)
	}

	slog.Info("nvremote-host detected",
		"path", info.Path,
		"version", info.Version,
		"codecs", info.Codecs,
		"gpu", info.GPUName,
	)

	// Step 2: Register with control plane (or load existing registration).
	reg, err := registration.LoadRegistration(cfg.DataDir)
	if err != nil {
		slog.Info("no existing registration found, registering with control plane")
		reg, err = registration.Register(cfg)
		if err != nil {
			return fmt.Errorf("registration failed: %w", err)
		}
		slog.Info("registration successful", "hostId", reg.HostID)
	} else {
		slog.Info("loaded existing registration", "hostId", reg.HostID)
	}

	// Promote the API token from registration to the config so all subsequent
	// API calls (heartbeat, WebSocket signaling) use the long-lived api_token
	// instead of the one-time bootstrap_token.
	if reg.APIToken != "" {
		cfg.APIToken = reg.APIToken
		slog.Debug("using api_token from registration for subsequent API calls")
	} else {
		slog.Warn("registration did not include api_token, falling back to bootstrap_token")
	}

	// Step 3: Start nvremote-host in standby mode.
	// Unlike the old flow, there is no WireGuard tunnel to set up.
	// P2P connectivity is established per-session via ICE signaling.
	if err := streamerMgr.Start(); err != nil {
		slog.Error("failed to start nvremote-host", "error", err)
		// Non-fatal: continue and report status via heartbeat.
		// The control plane will see "degraded-no-streamer" status.
	} else {
		slog.Info("nvremote-host started in standby mode")
	}

	// Ensure streamer is stopped on shutdown.
	defer func() {
		slog.Info("shutting down nvremote-host")
		if err := streamerMgr.Stop(); err != nil {
			slog.Error("failed to stop nvremote-host", "error", err)
		}
	}()

	// Step 4: Create the P2P signaling handler.
	sigHandler := p2p.NewSignalingHandler(streamerMgr, cfg.StunServers)

	// Step 5: Start heartbeat and WebSocket signaling.
	// The heartbeat loop reports streamer status and capabilities.
	// The WebSocket connection handles session:offer, ice:candidate, and ice:complete messages.
	slog.Info("starting heartbeat and signaling loops")
	heartbeat.StartHeartbeat(ctx, cfg, reg.HostID, streamerMgr, sigHandler)

	slog.Info("agent shut down cleanly")
	return nil
}

// initLogger configures the global slog logger at the given level.
func initLogger(level string) {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}

	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: lvl,
	})
	slog.SetDefault(slog.New(handler))
}
