package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
)

// AddPeerRequest is the request body for adding a new WireGuard peer.
type AddPeerRequest struct {
	PublicKey  string `json:"publicKey"`
	AllowedIPs string `json:"allowedIPs"`
	HostID    string `json:"hostId,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
}

// APIResponse is the standard response envelope for all API responses.
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// NewAPIRouter creates and configures the HTTP API router with all routes
// and middleware.
func NewAPIRouter(cfg *Config, wg *WGManager, health *HealthMonitor, tunnel *TunnelProxy) http.Handler {
	r := mux.NewRouter()

	// Apply global middleware.
	r.Use(loggingMiddleware)
	r.Use(contentTypeMiddleware)

	// Health check endpoint (no auth required).
	r.HandleFunc("/api/health", handleHealth(health)).Methods(http.MethodGet)

	// Zero-trust tunnel proxy routes (uses per-session JWT auth, not gateway token).
	if tunnel != nil {
		tunnel.RegisterRoutes(r)
	}

	// Authenticated API routes (gateway token auth).
	api := r.PathPrefix("/api").Subrouter()
	api.Use(authMiddleware(cfg.GatewayToken))

	api.HandleFunc("/peers", handleAddPeer(wg)).Methods(http.MethodPost)
	api.HandleFunc("/peers", handleListPeers(wg)).Methods(http.MethodGet)
	api.HandleFunc("/peers/{publicKey}", handleRemovePeer(wg)).Methods(http.MethodDelete)
	api.HandleFunc("/peers/{publicKey}/status", handlePeerStatus(wg)).Methods(http.MethodGet)

	// Tunnel admin status (requires gateway auth).
	if tunnel != nil {
		api.HandleFunc("/tunnel/status", handleTunnelStatus(tunnel)).Methods(http.MethodGet)
	}

	return r
}

// handleTunnelStatus returns the current tunnel proxy status.
func handleTunnelStatus(tp *TunnelProxy) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data: map[string]interface{}{
				"enabled":           true,
				"activeConnections": tp.ActiveConnections(),
			},
		})
	}
}

// authMiddleware verifies that incoming requests carry a valid Bearer token
// matching the configured GatewayToken.
func authMiddleware(token string) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				writeError(w, http.StatusUnauthorized, "missing Authorization header")
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				writeError(w, http.StatusUnauthorized, "invalid Authorization header format")
				return
			}

			if parts[1] != token {
				writeError(w, http.StatusForbidden, "invalid gateway token")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// loggingMiddleware logs each incoming HTTP request.
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		slog.Info("HTTP request",
			"method", r.Method,
			"path", r.URL.Path,
			"remote_addr", r.RemoteAddr,
		)
		next.ServeHTTP(w, r)
	})
}

// contentTypeMiddleware sets the Content-Type header to JSON for all responses.
func contentTypeMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

// handleAddPeer handles POST /api/peers to add a new WireGuard peer.
func handleAddPeer(wg *WGManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req AddPeerRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}

		if req.PublicKey == "" {
			writeError(w, http.StatusBadRequest, "publicKey is required")
			return
		}
		if !isValidBase64Key(req.PublicKey) {
			writeError(w, http.StatusBadRequest, "publicKey must be a valid base64-encoded 32-byte key")
			return
		}
		if req.AllowedIPs == "" {
			writeError(w, http.StatusBadRequest, "allowedIPs is required")
			return
		}

		if err := wg.AddPeer(req.PublicKey, req.AllowedIPs); err != nil {
			slog.Error("failed to add peer",
				"public_key", req.PublicKey,
				"error", err,
			)
			writeError(w, http.StatusInternalServerError, "failed to add peer: "+err.Error())
			return
		}

		slog.Info("peer added via API",
			"public_key", req.PublicKey,
			"allowed_ips", req.AllowedIPs,
			"host_id", req.HostID,
			"session_id", req.SessionID,
		)

		writeJSON(w, http.StatusCreated, APIResponse{
			Success: true,
			Data: map[string]string{
				"publicKey":  req.PublicKey,
				"allowedIPs": req.AllowedIPs,
			},
		})
	}
}

// handleRemovePeer handles DELETE /api/peers/{publicKey} to remove a peer.
func handleRemovePeer(wg *WGManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		publicKey := vars["publicKey"]

		if publicKey == "" {
			writeError(w, http.StatusBadRequest, "publicKey is required")
			return
		}

		if err := wg.RemovePeer(publicKey); err != nil {
			slog.Error("failed to remove peer",
				"public_key", publicKey,
				"error", err,
			)
			writeError(w, http.StatusInternalServerError, "failed to remove peer: "+err.Error())
			return
		}

		slog.Info("peer removed via API", "public_key", publicKey)

		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data: map[string]string{
				"publicKey": publicKey,
				"status":    "removed",
			},
		})
	}
}

// handleListPeers handles GET /api/peers to list all WireGuard peers.
func handleListPeers(wg *WGManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		peers, err := wg.ListPeers()
		if err != nil {
			slog.Error("failed to list peers", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to list peers: "+err.Error())
			return
		}

		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data:    peers,
		})
	}
}

// handlePeerStatus handles GET /api/peers/{publicKey}/status to get
// detailed status for a single peer.
func handlePeerStatus(wg *WGManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		publicKey := vars["publicKey"]

		if publicKey == "" {
			writeError(w, http.StatusBadRequest, "publicKey is required")
			return
		}

		status, err := wg.GetPeerStatus(publicKey)
		if err != nil {
			if strings.Contains(err.Error(), "peer not found") {
				writeError(w, http.StatusNotFound, err.Error())
				return
			}
			slog.Error("failed to get peer status",
				"public_key", publicKey,
				"error", err,
			)
			writeError(w, http.StatusInternalServerError, "failed to get peer status: "+err.Error())
			return
		}

		writeJSON(w, http.StatusOK, APIResponse{
			Success: true,
			Data:    status,
		})
	}
}

// handleHealth handles GET /api/health for load balancer health checks.
func handleHealth(health *HealthMonitor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := health.GetStatus()

		httpStatus := http.StatusOK
		if !status.Healthy {
			httpStatus = http.StatusServiceUnavailable
		}

		writeJSON(w, httpStatus, status)
	}
}

// writeJSON marshals v as JSON and writes it to the response with the given
// status code.
func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("failed to encode JSON response", "error", err)
	}
}

// writeError writes a standard error response.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, APIResponse{
		Success: false,
		Error:   message,
	})
}
