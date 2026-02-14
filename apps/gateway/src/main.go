package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	// Initialize structured logger.
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("starting GridStreamer Gateway")

	// Load configuration from env vars and config file.
	cfg, err := LoadConfig()
	if err != nil {
		slog.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	slog.Info("configuration loaded",
		"listen_addr", cfg.ListenAddr,
		"wireguard_interface", cfg.WireGuardInterface,
		"wireguard_port", cfg.WireGuardPort,
		"tunnel_subnet", cfg.TunnelSubnet,
		"public_ip", cfg.PublicIP,
	)

	// Initialize WireGuard manager.
	wgManager, err := NewWireGuardManager(cfg)
	if err != nil {
		slog.Error("failed to initialize WireGuard manager", "error", err)
		os.Exit(1)
	}
	slog.Info("WireGuard manager initialized", "interface", cfg.WireGuardInterface)

	// Initialize the health monitor.
	healthMonitor := NewHealthMonitor(cfg, wgManager)

	// Build HTTP API server.
	router := NewAPIRouter(cfg, wgManager, healthMonitor)

	server := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start the health monitor in the background.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	healthMonitor.Start(ctx)
	slog.Info("health monitor started")

	// Start HTTP server in a goroutine.
	errCh := make(chan error, 1)
	go func() {
		slog.Info("HTTP API server listening", "addr", cfg.ListenAddr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- fmt.Errorf("HTTP server error: %w", err)
		}
	}()

	// Wait for shutdown signal or server error.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		slog.Info("received shutdown signal", "signal", sig.String())
	case err := <-errCh:
		slog.Error("server error, shutting down", "error", err)
	}

	// Graceful shutdown with a 30-second deadline.
	slog.Info("initiating graceful shutdown")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("HTTP server shutdown error", "error", err)
		os.Exit(1)
	}

	slog.Info("gateway shut down cleanly")
}
