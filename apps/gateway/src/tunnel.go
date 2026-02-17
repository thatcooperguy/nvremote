package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// ---------------------------------------------------------------------------
// JWT token verification (HS256 only — matches NestJS JwtService with secret)
// ---------------------------------------------------------------------------

// TunnelClaims represents the JWT claims embedded in a tunnel token.
type TunnelClaims struct {
	Sub       string `json:"sub"`       // userId
	TunnelID  string `json:"tunnelId"`  // tun_<hex>
	SessionID string `json:"sessionId"` // session UUID
	HostID    string `json:"hostId"`    // host UUID
	Scope     string `json:"scope"`     // must be "tunnel"
	Protocol  string `json:"protocol"`  // "wss" or "https"
	Exp       int64  `json:"exp"`       // unix timestamp
	Iat       int64  `json:"iat"`       // issued-at
}

// verifyHS256 verifies a compact HS256 JWT token against the given secret and
// returns the decoded claims. Returns an error if the token is invalid,
// expired, or has wrong scope.
func verifyHS256(tokenStr, secret string) (*TunnelClaims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, errors.New("malformed JWT: expected 3 parts")
	}

	// Verify signature: HMAC-SHA256(header.payload, secret)
	sigInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(sigInput))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expectedSig), []byte(parts[2])) {
		return nil, errors.New("invalid JWT signature")
	}

	// Decode payload
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("decoding JWT payload: %w", err)
	}

	var claims TunnelClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("unmarshalling JWT claims: %w", err)
	}

	// Validate expiry
	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return nil, errors.New("tunnel token expired")
	}

	// Validate scope
	if claims.Scope != "tunnel" {
		return nil, fmt.Errorf("invalid token scope: %q (expected \"tunnel\")", claims.Scope)
	}

	return &claims, nil
}

// ---------------------------------------------------------------------------
// Tunnel proxy — WebSocket and TCP forwarding
// ---------------------------------------------------------------------------

// TunnelProxy handles incoming tunnel connections, validates tokens, and
// proxies traffic to the target host inside the VPN mesh.
type TunnelProxy struct {
	cfg      *Config
	upgrader websocket.Upgrader

	// Active connections for monitoring
	mu          sync.RWMutex
	activeConns int
}

// NewTunnelProxy creates a new tunnel proxy instance.
func NewTunnelProxy(cfg *Config) *TunnelProxy {
	return &TunnelProxy{
		cfg: cfg,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  16384,
			WriteBufferSize: 16384,
			// Allow all origins — the tunnel token is the auth mechanism
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

// RegisterRoutes adds tunnel proxy routes to the given router.
// These routes do NOT use the gateway token auth — they use per-session
// tunnel tokens instead.
func (tp *TunnelProxy) RegisterRoutes(r *mux.Router) {
	// WebSocket tunnel endpoint
	r.HandleFunc("/tunnel/{tunnelId}", tp.handleTunnel).Methods(http.MethodGet)

	// HTTPS CONNECT-style tunnel endpoint
	r.HandleFunc("/tunnel/{tunnelId}/connect", tp.handleHTTPSTunnel).Methods(http.MethodPost)

	// Tunnel status endpoint (requires gateway auth — added via the authenticated subrouter)
	slog.Info("tunnel proxy routes registered")
}

// extractToken extracts the tunnel JWT from the request. Checks:
// 1. Authorization: Bearer <token>
// 2. ?token=<token> query parameter (for WebSocket where headers are hard)
func extractToken(r *http.Request) string {
	// Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			return parts[1]
		}
	}

	// Query parameter fallback (WebSocket clients)
	if t := r.URL.Query().Get("token"); t != "" {
		return t
	}

	// Sec-WebSocket-Protocol header (another WebSocket auth pattern)
	if proto := r.Header.Get("Sec-WebSocket-Protocol"); proto != "" {
		// Convention: "tunnel-token, <jwt>" — the token is in the subprotocol list
		for _, p := range strings.Split(proto, ",") {
			p = strings.TrimSpace(p)
			if strings.HasPrefix(p, "eyJ") { // JWT always starts with base64 of {"
				return p
			}
		}
	}

	return ""
}

// handleTunnel handles WebSocket tunnel connections. The client connects via
// WSS and the proxy forwards frames as raw TCP to the target host.
func (tp *TunnelProxy) handleTunnel(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	tunnelID := vars["tunnelId"]

	token := extractToken(r)
	if token == "" {
		writeError(w, http.StatusUnauthorized, "missing tunnel token")
		return
	}

	claims, err := verifyHS256(token, tp.cfg.TunnelSecret)
	if err != nil {
		slog.Warn("tunnel auth failed",
			"tunnel_id", tunnelID,
			"error", err,
			"remote_addr", r.RemoteAddr,
		)
		writeError(w, http.StatusForbidden, "invalid tunnel token: "+err.Error())
		return
	}

	// Verify the tunnel ID matches the token
	if claims.TunnelID != tunnelID {
		writeError(w, http.StatusForbidden, "tunnel ID mismatch")
		return
	}

	slog.Info("tunnel connection authenticated",
		"tunnel_id", tunnelID,
		"session_id", claims.SessionID,
		"host_id", claims.HostID,
		"user_id", claims.Sub,
		"protocol", claims.Protocol,
		"remote_addr", r.RemoteAddr,
	)

	// Resolve target host address from the VPN mesh.
	// The host's VPN IP is looked up from the WireGuard peer list by host ID,
	// or we use the host's allowed IP from the WG config.
	targetAddr := tp.resolveHostAddr(claims.HostID)
	if targetAddr == "" {
		slog.Error("could not resolve host VPN address",
			"tunnel_id", tunnelID,
			"host_id", claims.HostID,
		)
		writeError(w, http.StatusBadGateway, "host not reachable via VPN mesh")
		return
	}

	// Upgrade to WebSocket
	conn, err := tp.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("websocket upgrade failed",
			"tunnel_id", tunnelID,
			"error", err,
		)
		return
	}
	defer conn.Close()

	// Connect to target host
	// The streaming port is typically 9443 (WebSocket signaling) or derived
	// from session metadata. Default to 9443 for WebSocket tunnels.
	targetPort := "9443"
	target := net.JoinHostPort(targetAddr, targetPort)

	slog.Info("opening tunnel to host",
		"tunnel_id", tunnelID,
		"target", target,
	)

	backendConn, err := net.DialTimeout("tcp", target, 10*time.Second)
	if err != nil {
		slog.Error("failed to connect to host",
			"tunnel_id", tunnelID,
			"target", target,
			"error", err,
		)
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "host unreachable"))
		return
	}
	defer backendConn.Close()

	tp.mu.Lock()
	tp.activeConns++
	tp.mu.Unlock()

	defer func() {
		tp.mu.Lock()
		tp.activeConns--
		tp.mu.Unlock()

		slog.Info("tunnel closed",
			"tunnel_id", tunnelID,
			"session_id", claims.SessionID,
		)
	}()

	slog.Info("tunnel established",
		"tunnel_id", tunnelID,
		"session_id", claims.SessionID,
		"target", target,
	)

	// Bidirectional proxy: WebSocket <-> TCP
	done := make(chan struct{}, 2)

	// WS -> TCP (client to host)
	go func() {
		defer func() { done <- struct{}{} }()
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					slog.Debug("ws read error", "tunnel_id", tunnelID, "error", err)
				}
				return
			}
			if _, err := backendConn.Write(message); err != nil {
				slog.Debug("tcp write error", "tunnel_id", tunnelID, "error", err)
				return
			}
		}
	}()

	// TCP -> WS (host to client)
	go func() {
		defer func() { done <- struct{}{} }()
		buf := make([]byte, 16384)
		for {
			n, err := backendConn.Read(buf)
			if err != nil {
				if err != io.EOF {
					slog.Debug("tcp read error", "tunnel_id", tunnelID, "error", err)
				}
				return
			}
			if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
				slog.Debug("ws write error", "tunnel_id", tunnelID, "error", err)
				return
			}
		}
	}()

	// Wait for either direction to finish
	<-done
}

// handleHTTPSTunnel handles HTTPS CONNECT-style tunnels for non-WebSocket
// clients. The client sends a POST with the tunnel token, and we establish
// a bidirectional TCP tunnel.
func (tp *TunnelProxy) handleHTTPSTunnel(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	tunnelID := vars["tunnelId"]

	token := extractToken(r)
	if token == "" {
		writeError(w, http.StatusUnauthorized, "missing tunnel token")
		return
	}

	claims, err := verifyHS256(token, tp.cfg.TunnelSecret)
	if err != nil {
		writeError(w, http.StatusForbidden, "invalid tunnel token: "+err.Error())
		return
	}

	if claims.TunnelID != tunnelID {
		writeError(w, http.StatusForbidden, "tunnel ID mismatch")
		return
	}

	targetAddr := tp.resolveHostAddr(claims.HostID)
	if targetAddr == "" {
		writeError(w, http.StatusBadGateway, "host not reachable via VPN mesh")
		return
	}

	targetPort := "9443"
	target := net.JoinHostPort(targetAddr, targetPort)

	backendConn, err := net.DialTimeout("tcp", target, 10*time.Second)
	if err != nil {
		slog.Error("HTTPS tunnel: failed to connect to host",
			"tunnel_id", tunnelID,
			"target", target,
			"error", err,
		)
		writeError(w, http.StatusBadGateway, "host unreachable")
		return
	}

	// Hijack the HTTP connection for raw TCP proxying
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		backendConn.Close()
		writeError(w, http.StatusInternalServerError, "HTTP connection hijacking not supported")
		return
	}

	clientConn, buf, err := hijacker.Hijack()
	if err != nil {
		backendConn.Close()
		slog.Error("HTTPS tunnel: hijack failed", "tunnel_id", tunnelID, "error", err)
		return
	}

	// Send 200 OK to signal tunnel established
	_, _ = buf.WriteString("HTTP/1.1 200 Connection Established\r\nContent-Type: application/octet-stream\r\n\r\n")
	_ = buf.Flush()

	tp.mu.Lock()
	tp.activeConns++
	tp.mu.Unlock()

	slog.Info("HTTPS tunnel established",
		"tunnel_id", tunnelID,
		"session_id", claims.SessionID,
		"target", target,
	)

	// Bidirectional copy
	done := make(chan struct{}, 2)

	go func() {
		defer func() { done <- struct{}{} }()
		io.Copy(backendConn, clientConn)
	}()

	go func() {
		defer func() { done <- struct{}{} }()
		io.Copy(clientConn, backendConn)
	}()

	<-done
	clientConn.Close()
	backendConn.Close()

	tp.mu.Lock()
	tp.activeConns--
	tp.mu.Unlock()

	slog.Info("HTTPS tunnel closed",
		"tunnel_id", tunnelID,
		"session_id", claims.SessionID,
	)
}

// resolveHostAddr resolves a host's VPN IP address from the WireGuard peer
// configuration. This is a simple lookup based on the AllowedIPs of known
// peers — the NVRemote API assigns each host a unique /32 VPN IP.
//
// In practice, the host's VPN IP is passed through the tunnel token claims
// or looked up from the control plane. Here we iterate the WG peers.
func (tp *TunnelProxy) resolveHostAddr(hostID string) string {
	// For now, we use a convention: the control plane should include
	// the host VPN IP in the tunnel metadata. Since our JWT claims
	// don't carry it directly, we'll look up via the WG peer list.
	//
	// Each peer's AllowedIPs contains their assigned VPN IP (e.g., 10.100.0.5/32).
	// The NVRemote control plane ensures each host registers with a unique key.
	//
	// TODO: Add hostVpnIp to TunnelClaims for direct resolution
	// without WireGuard state dependency.

	// Fallback: try the control plane API to look up host VPN IP
	// For alpha, return empty to signal that the host isn't reachable.
	// The gateway will be enhanced to cache host->VPN IP mappings.

	slog.Warn("host VPN IP resolution not yet implemented — requires control plane lookup or WG peer scanning",
		"host_id", hostID,
	)
	return ""
}

// ActiveConnections returns the number of active tunnel connections.
func (tp *TunnelProxy) ActiveConnections() int {
	tp.mu.RLock()
	defer tp.mu.RUnlock()
	return tp.activeConns
}
