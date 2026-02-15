package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
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
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
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
		// Run as service (or foreground if not in service context).
		if err := svc.Run(); err != nil {
			slog.Error("service run failed", "error", err)
			os.Exit(1)
		}
	}
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
