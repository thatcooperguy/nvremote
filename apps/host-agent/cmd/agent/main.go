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

	"github.com/nvidia/nvstreamer/host-agent/internal/config"
	"github.com/nvidia/nvstreamer/host-agent/internal/heartbeat"
	"github.com/nvidia/nvstreamer/host-agent/internal/nvstreamer"
	"github.com/nvidia/nvstreamer/host-agent/internal/registration"
	"github.com/nvidia/nvstreamer/host-agent/internal/tunnel"
)

const (
	serviceName        = "NVRemoteStreamAgent"
	serviceDisplayName = "NVIDIA Remote Stream Agent"
	serviceDescription = "Host agent for NVIDIA Remote Stream - manages WireGuard tunnels and nvstreamer lifecycle"
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
		configPath = flag.String("config", "", "path to config file (default: C:\\ProgramData\\NVRemoteStream\\agent.yaml)")
		doInstall  = flag.Bool("install", false, "install as Windows service")
		doUninstall = flag.Bool("uninstall", false, "uninstall Windows service")
		doRun      = flag.Bool("run", false, "run in foreground (non-service mode)")
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

// runAgent performs the core agent lifecycle: register, set up tunnel, monitor, heartbeat.
func runAgent(ctx context.Context, cfg *config.Config) error {
	slog.Info("starting NVIDIA Remote Stream agent",
		"controlPlane", cfg.ControlPlaneURL,
		"hostname", cfg.HostName,
	)

	// Step 1: Detect nvstreamer.
	info, err := nvstreamer.Detect(cfg.NvstreamerPath)
	if err != nil {
		slog.Warn("nvstreamer not detected, will retry after registration", "error", err)
	} else {
		slog.Info("nvstreamer detected",
			"path", info.Path,
			"version", info.Version,
			"running", info.Running,
		)
	}

	// Step 2: Register with control plane (or load existing registration).
	reg, err := registration.LoadRegistration(cfg.DataDir)
	if err != nil {
		slog.Info("no existing registration found, registering with control plane")
		reg, err = registration.Register(cfg)
		if err != nil {
			return fmt.Errorf("registration failed: %w", err)
		}
		slog.Info("registration successful",
			"hostId", reg.HostID,
			"tunnelIp", reg.TunnelIP,
		)
	} else {
		slog.Info("loaded existing registration",
			"hostId", reg.HostID,
			"tunnelIp", reg.TunnelIP,
		)
	}

	// Step 3: Set up WireGuard tunnel.
	privKey, pubKey, err := tunnel.LoadOrGenerateKeyPair(cfg.DataDir)
	if err != nil {
		return fmt.Errorf("failed to load/generate WireGuard keypair: %w", err)
	}
	slog.Info("WireGuard keypair ready", "publicKey", pubKey)

	if err := tunnel.SetupTunnel(reg, privKey); err != nil {
		return fmt.Errorf("failed to set up WireGuard tunnel: %w", err)
	}
	defer func() {
		if err := tunnel.TeardownTunnel(); err != nil {
			slog.Error("failed to tear down tunnel", "error", err)
		}
	}()
	slog.Info("WireGuard tunnel established")

	// Step 4: Ensure nvstreamer is running.
	if info == nil || !info.Running {
		if err := nvstreamer.EnsureRunning(cfg.NvstreamerPath); err != nil {
			slog.Error("failed to start nvstreamer", "error", err)
			// Non-fatal: we continue and report status via heartbeat.
		}
	}

	// Step 5: Start heartbeat and WebSocket signaling.
	slog.Info("starting heartbeat loop")
	heartbeat.StartHeartbeat(ctx, cfg, reg.HostID)

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
