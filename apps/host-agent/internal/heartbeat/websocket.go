package heartbeat

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"github.com/nvidia/nvremote/host-agent/internal/p2p"
)

const (
	// maxReconnectDelay caps the exponential backoff for WebSocket reconnection.
	maxReconnectDelay = 2 * time.Minute

	// baseReconnectDelay is the initial delay before attempting reconnection.
	baseReconnectDelay = 1 * time.Second

	// writeTimeout is the maximum duration to wait when writing a WebSocket message.
	writeTimeout = 10 * time.Second

	// pongWait is how long to wait for a pong response before considering the connection dead.
	pongWait = 60 * time.Second

	// pingInterval is how often to send ping frames. Must be less than pongWait.
	pingInterval = 30 * time.Second
)

// MessageType identifies the type of WebSocket message exchanged with the control plane.
type MessageType string

const (
	// Inbound message types (from control plane to host).
	MsgSessionRequest MessageType = "session:request"
	MsgSessionOffer   MessageType = "session:offer"
	MsgSessionEnd     MessageType = "session:end"
	MsgConfigUpdate   MessageType = "config:update"
	MsgIceCandidate   MessageType = "ice:candidate"
	MsgIceComplete    MessageType = "ice:complete"

	// Outbound message types (from host to control plane).
	MsgHostHeartbeat  MessageType = "host:heartbeat"
	MsgHostStatus     MessageType = "host:status"
	MsgSessionAccept  MessageType = "session:accept"
	MsgSessionAnswer  MessageType = "session:answer"
	MsgSessionReject  MessageType = "session:reject"
)

// WSMessage is the envelope for all WebSocket messages.
type WSMessage struct {
	Type    MessageType     `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// SessionRequest is the payload for session:request messages (legacy).
type SessionRequest struct {
	SessionID string `json:"session_id"`
	UserID    string `json:"user_id"`
	UserName  string `json:"user_name"`
}

// SessionAcceptPayload is sent when the host accepts a session request (legacy).
type SessionAcceptPayload struct {
	SessionID     string `json:"session_id"`
	StreamPorts   []int  `json:"stream_ports"`
	TunnelAddress string `json:"tunnel_address"`
}

// IceCandidateMessage is the payload for ice:candidate messages.
type IceCandidateMessage struct {
	SessionID string        `json:"session_id"`
	Candidate p2p.IceCandidate `json:"candidate"`
}

// IceCompleteMessage is the payload for ice:complete messages.
type IceCompleteMessage struct {
	SessionID string `json:"session_id"`
}

// ConnectSignaling establishes and maintains a persistent WebSocket connection to the
// control plane for real-time signaling. It automatically reconnects on failures
// using exponential backoff.
//
// The sigHandler is used to process P2P session signaling messages (session:offer,
// ice:candidate, ice:complete).
//
// This function blocks until ctx is cancelled.
func ConnectSignaling(ctx context.Context, url string, hostID string, token string, sigHandler *p2p.SignalingHandler) error {
	attempt := 0

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		slog.Info("connecting to signaling WebSocket", "url", url, "attempt", attempt)

		err := runSignalingSession(ctx, url, hostID, token, sigHandler)
		if err != nil {
			slog.Warn("WebSocket session ended", "error", err)
		}

		// Check if context was cancelled during the session.
		if ctx.Err() != nil {
			return ctx.Err()
		}

		// Calculate exponential backoff delay.
		delay := calculateBackoff(attempt)
		attempt++

		slog.Info("reconnecting to signaling WebSocket", "delay", delay, "attempt", attempt)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
			// Continue to reconnect.
		}
	}
}

// runSignalingSession handles a single WebSocket connection lifetime.
// It returns when the connection is lost or an unrecoverable error occurs.
func runSignalingSession(ctx context.Context, url string, hostID string, token string, sigHandler *p2p.SignalingHandler) error {
	// Set up the WebSocket dialer with authorization header.
	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)
	header.Set("X-Host-ID", hostID)

	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
	}

	conn, _, err := dialer.DialContext(ctx, url, header)
	if err != nil {
		return fmt.Errorf("WebSocket dial failed: %w", err)
	}
	defer conn.Close()

	slog.Info("WebSocket connection established")

	// Set up pong handler for keepalive.
	conn.SetPongHandler(func(appData string) error {
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	// Start the ping sender in a goroutine.
	pingDone := make(chan struct{})
	go func() {
		defer close(pingDone)
		sendPings(ctx, conn)
	}()

	// Read messages until an error occurs or context is cancelled.
	for {
		select {
		case <-ctx.Done():
			// Send a close message before exiting.
			_ = conn.WriteMessage(
				websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, "agent shutting down"),
			)
			return ctx.Err()
		default:
		}

		// Set read deadline to detect stale connections.
		if err := conn.SetReadDeadline(time.Now().Add(pongWait)); err != nil {
			return fmt.Errorf("setting read deadline: %w", err)
		}

		_, message, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("reading WebSocket message: %w", err)
		}

		if err := handleMessage(ctx, conn, message, sigHandler); err != nil {
			slog.Error("error handling WebSocket message", "error", err)
			// Non-fatal; continue reading.
		}
	}
}

// handleMessage processes an incoming WebSocket message and dispatches it
// to the appropriate handler based on type.
func handleMessage(ctx context.Context, conn *websocket.Conn, raw []byte, sigHandler *p2p.SignalingHandler) error {
	var msg WSMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		return fmt.Errorf("unmarshalling WebSocket message: %w", err)
	}

	slog.Debug("received WebSocket message", "type", msg.Type)

	switch msg.Type {
	case MsgSessionOffer:
		return handleSessionOffer(ctx, conn, msg.Payload, sigHandler)

	case MsgSessionRequest:
		// Legacy handler for backward compatibility with older control plane versions.
		return handleSessionRequest(ctx, conn, msg.Payload)

	case MsgIceCandidate:
		return handleIceCandidateMessage(msg.Payload, sigHandler)

	case MsgIceComplete:
		return handleIceCompleteMessage(msg.Payload, sigHandler)

	case MsgSessionEnd:
		return handleSessionEnd(msg.Payload, sigHandler)

	case MsgConfigUpdate:
		return handleConfigUpdate(msg.Payload)

	default:
		slog.Warn("unknown WebSocket message type", "type", msg.Type)
		return nil
	}
}

// handleSessionOffer processes a session:offer message by delegating to the
// P2P SignalingHandler. This is the primary entry point for new streaming sessions.
func handleSessionOffer(ctx context.Context, conn *websocket.Conn, payload json.RawMessage, sigHandler *p2p.SignalingHandler) error {
	var offer p2p.SessionOffer
	if err := json.Unmarshal(payload, &offer); err != nil {
		return fmt.Errorf("unmarshalling session offer: %w", err)
	}

	slog.Info("received session offer",
		"sessionId", offer.SessionID,
		"userId", offer.UserID,
		"codecs", offer.Codecs,
	)

	if err := sigHandler.HandleSessionOffer(conn, offer); err != nil {
		slog.Error("failed to handle session offer", "error", err)
		return err
	}

	return nil
}

// handleIceCandidateMessage processes an ice:candidate message from the remote client.
func handleIceCandidateMessage(payload json.RawMessage, sigHandler *p2p.SignalingHandler) error {
	var msg IceCandidateMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		return fmt.Errorf("unmarshalling ice:candidate message: %w", err)
	}

	slog.Debug("received remote ICE candidate",
		"sessionId", msg.SessionID,
		"type", msg.Candidate.Type,
		"ip", msg.Candidate.IP,
		"port", msg.Candidate.Port,
	)

	return sigHandler.HandleIceCandidate(msg.SessionID, msg.Candidate)
}

// handleIceCompleteMessage processes an ice:complete message indicating the remote
// side has finished gathering ICE candidates.
func handleIceCompleteMessage(payload json.RawMessage, sigHandler *p2p.SignalingHandler) error {
	var msg IceCompleteMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		return fmt.Errorf("unmarshalling ice:complete message: %w", err)
	}

	slog.Info("received ICE complete signal", "sessionId", msg.SessionID)

	return sigHandler.HandleIceComplete(msg.SessionID)
}

// handleSessionRequest processes an incoming session request from a client (legacy).
// This is kept for backward compatibility with control planes that haven't migrated
// to the session:offer flow.
func handleSessionRequest(ctx context.Context, conn *websocket.Conn, payload json.RawMessage) error {
	var req SessionRequest
	if err := json.Unmarshal(payload, &req); err != nil {
		return fmt.Errorf("unmarshalling session request: %w", err)
	}

	slog.Info("received legacy session request",
		"sessionId", req.SessionID,
		"userId", req.UserID,
		"userName", req.UserName,
	)

	// Legacy policy: accept the session with default ports.
	acceptPayload := SessionAcceptPayload{
		SessionID:   req.SessionID,
		StreamPorts: []int{8443, 8444, 8445},
	}

	return sendMessage(conn, MsgSessionAccept, acceptPayload)
}

// handleSessionEnd processes a session termination notification.
func handleSessionEnd(payload json.RawMessage, sigHandler *p2p.SignalingHandler) error {
	var data struct {
		SessionID string `json:"session_id"`
		Reason    string `json:"reason"`
	}
	if err := json.Unmarshal(payload, &data); err != nil {
		return fmt.Errorf("unmarshalling session end: %w", err)
	}

	slog.Info("session ended",
		"sessionId", data.SessionID,
		"reason", data.Reason,
	)

	// Notify the signaling handler to clean up the session.
	if sigHandler != nil {
		if err := sigHandler.HandleSessionEnd(data.SessionID); err != nil {
			slog.Warn("error handling session end in signaling handler", "error", err)
		}
	}

	return nil
}

// handleConfigUpdate processes a configuration update pushed by the control plane.
func handleConfigUpdate(payload json.RawMessage) error {
	slog.Info("received config update from control plane")

	// Log the raw payload for now; in production this would apply changes
	// to the running configuration.
	slog.Debug("config update payload", "payload", string(payload))

	return nil
}

// sendMessage marshals a payload and sends it as a WebSocket message.
func sendMessage(conn *websocket.Conn, msgType MessageType, payload interface{}) error {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshalling payload: %w", err)
	}

	msg := WSMessage{
		Type:    msgType,
		Payload: payloadBytes,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshalling message: %w", err)
	}

	if err := conn.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
		return fmt.Errorf("setting write deadline: %w", err)
	}

	if err := conn.WriteMessage(websocket.TextMessage, msgBytes); err != nil {
		return fmt.Errorf("writing WebSocket message: %w", err)
	}

	slog.Debug("sent WebSocket message", "type", msgType)
	return nil
}

// sendPings periodically sends WebSocket ping frames to keep the connection alive.
func sendPings(ctx context.Context, conn *websocket.Conn) {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := conn.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
				slog.Warn("failed to set write deadline for ping", "error", err)
				return
			}
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				slog.Warn("failed to send ping", "error", err)
				return
			}
		}
	}
}

// calculateBackoff returns an exponential backoff duration capped at maxReconnectDelay.
func calculateBackoff(attempt int) time.Duration {
	if attempt == 0 {
		return baseReconnectDelay
	}

	delay := time.Duration(math.Pow(2, float64(attempt))) * baseReconnectDelay
	if delay > maxReconnectDelay {
		delay = maxReconnectDelay
	}

	return delay
}
