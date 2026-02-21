package heartbeat

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strings"
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
	MsgSessionEnded   MessageType = "session:ended"
	MsgConfigUpdate   MessageType = "config:update"
	MsgIceCandidate   MessageType = "ice:candidate"
	MsgIceComplete    MessageType = "ice:complete"

	// Outbound message types (from host to control plane).
	MsgHostHeartbeat    MessageType = "host:heartbeat"
	MsgHostStatus       MessageType = "host:status"
	MsgSessionAccept    MessageType = "session:accept"
	MsgSessionAnswer    MessageType = "session:answer"
	MsgSessionReject    MessageType = "session:reject"
	MsgQosStats         MessageType = "qos:stats"

	// Inbound QoS messages
	MsgQosProfileChange MessageType = "qos:profile-change"

	// Capability negotiation messages
	MsgCapabilityClient MessageType = "capability:client"
	MsgCapabilityHost   MessageType = "capability:host"
	MsgCapabilityAck    MessageType = "capability:ack"
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
	SessionID string           `json:"sessionId"`
	Candidate p2p.IceCandidate `json:"candidate"`
}

// IceCompleteMessage is the payload for ice:complete messages.
type IceCompleteMessage struct {
	SessionID string `json:"sessionId"`
}

// QosStatsPayload is sent periodically by the host to report real-time QoS metrics.
type QosStatsPayload struct {
	SessionID          string  `json:"sessionId"`
	BitrateKbps        int     `json:"bitrateKbps"`
	FPS                int     `json:"fps"`
	Width              int     `json:"width"`
	Height             int     `json:"height"`
	Codec              string  `json:"codec"`
	Profile            string  `json:"profile"`
	PacketLossPercent  float64 `json:"packetLossPercent"`
	RttMs              float64 `json:"rttMs"`
	JitterMs           float64 `json:"jitterMs"`
	FecRatio           float64 `json:"fecRatio"`
	EstimatedBwKbps    int     `json:"estimatedBwKbps"`
	DecodeTimeUs       int     `json:"decodeTimeUs,omitempty"`
	QosState           string  `json:"qosState"`
}

// QosProfileChangeMessage is received when a client requests a profile change.
type QosProfileChangeMessage struct {
	SessionID string `json:"sessionId"`
	Profile   string `json:"profile"`
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

// runSignalingSession handles a single Socket.IO v4 connection lifetime.
// It speaks the Engine.IO/Socket.IO wire protocol so that the NestJS gateway
// (which is a Socket.IO server) can route messages into rooms correctly.
//
// Socket.IO v4 protocol over WebSocket:
//   Engine.IO packet types: 0=OPEN 1=CLOSE 2=PING 3=PONG 4=MESSAGE
//   Socket.IO packet types: 0=CONNECT 1=DISCONNECT 2=EVENT 3=ACK
//
//   Examples:
//     Server → Client:  0{"sid":"abc","pingInterval":25000,"pingTimeout":20000}
//     Client → Server:  40{"token":"..."}                    (CONNECT with auth)
//     Server → Client:  40{"sid":"xyz"}                      (CONNECT OK)
//     Server → Client:  42["session:offer",{...}]            (EVENT)
//     Client → Server:  42["ice:candidate",{...}]            (EVENT)
//     Server → Client:  2                                    (Engine.IO PING)
//     Client → Server:  3                                    (Engine.IO PONG)
func runSignalingSession(ctx context.Context, url string, hostID string, token string, sigHandler *p2p.SignalingHandler) error {
	// Set up the WebSocket dialer.
	header := http.Header{}

	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
	}

	conn, _, err := dialer.DialContext(ctx, url, header)
	if err != nil {
		return fmt.Errorf("WebSocket dial failed: %w", err)
	}
	defer func() {
		// Clear the connection reference so QoS goroutines don't write to a closed conn.
		if sigHandler != nil {
			sigHandler.SetConn(nil)
		}
		conn.Close()
	}()

	slog.Info("Socket.IO WebSocket transport connected")

	// Step 1: Read Engine.IO OPEN packet (type 0)
	if err := conn.SetReadDeadline(time.Now().Add(15 * time.Second)); err != nil {
		return fmt.Errorf("setting read deadline for OPEN: %w", err)
	}
	_, openMsg, err := conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("reading Engine.IO OPEN: %w", err)
	}
	if len(openMsg) == 0 || openMsg[0] != '0' {
		return fmt.Errorf("expected Engine.IO OPEN (0), got: %s", string(openMsg))
	}
	slog.Debug("received Engine.IO OPEN", "payload", string(openMsg[1:]))

	// Step 2: Send Socket.IO CONNECT (40) to /signaling namespace with auth token
	connectPayload := fmt.Sprintf(`40/signaling,{"token":"%s"}`, token)
	if err := conn.WriteMessage(websocket.TextMessage, []byte(connectPayload)); err != nil {
		return fmt.Errorf("sending Socket.IO CONNECT: %w", err)
	}
	slog.Debug("sent Socket.IO CONNECT to /signaling namespace")

	// Step 3: Read Socket.IO CONNECT ACK (40)
	if err := conn.SetReadDeadline(time.Now().Add(15 * time.Second)); err != nil {
		return fmt.Errorf("setting read deadline for CONNECT ACK: %w", err)
	}
	_, ackMsg, err := conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("reading Socket.IO CONNECT ACK: %w", err)
	}
	ackStr := string(ackMsg)
	// Accept both "40/signaling,{...}" and "40{...}" as valid acks
	if !strings.HasPrefix(ackStr, "40") {
		// Check for Socket.IO error (44)
		if strings.HasPrefix(ackStr, "44") {
			return fmt.Errorf("Socket.IO connection rejected: %s", ackStr)
		}
		return fmt.Errorf("expected Socket.IO CONNECT ACK (40), got: %s", ackStr)
	}
	slog.Info("Socket.IO connected to /signaling namespace")

	// Store the connection reference on the signaling handler so it can send
	// outbound messages (e.g., QoS stats) from goroutines.
	if sigHandler != nil {
		sigHandler.SetConn(conn)
	}

	// Step 4: Register as a host agent by emitting host:register
	registerPayload := struct {
		HostID string `json:"hostId"`
	}{HostID: hostID}
	if err := sendSocketIOEvent(conn, "host:register", registerPayload); err != nil {
		return fmt.Errorf("sending host:register: %w", err)
	}
	slog.Info("sent host:register", "hostId", hostID)

	// Initialize rate limiter for inbound signaling messages
	limiter := NewEventRateLimiter(DefaultEventLimits())

	// Read messages until an error occurs or context is cancelled.
	for {
		select {
		case <-ctx.Done():
			// Send Socket.IO DISCONNECT and WebSocket close
			_ = conn.WriteMessage(websocket.TextMessage, []byte("41/signaling,"))
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

		msgStr := string(message)

		// Handle Engine.IO PING (type 2) — respond with PONG (type 3)
		if msgStr == "2" {
			if writeErr := conn.WriteMessage(websocket.TextMessage, []byte("3")); writeErr != nil {
				slog.Warn("failed to send Engine.IO PONG", "error", writeErr)
			}
			continue
		}

		// Handle Socket.IO EVENT (type 42 or 42/signaling,)
		if strings.HasPrefix(msgStr, "42") {
			eventData := msgStr[2:]
			// Strip namespace prefix if present: "/signaling,["event",...]"
			if strings.HasPrefix(eventData, "/signaling,") {
				eventData = eventData[len("/signaling,"):]
			}

			if err := handleSocketIOEvent(ctx, conn, []byte(eventData), sigHandler, limiter); err != nil {
				slog.Error("error handling Socket.IO event", "error", err)
				// Non-fatal; continue reading.
			}
			continue
		}

		// Handle Socket.IO ACK (type 43) — log and discard
		if strings.HasPrefix(msgStr, "43") {
			slog.Debug("received Socket.IO ACK", "data", msgStr)
			continue
		}

		// Handle Engine.IO PONG (type 3) — server responding to our ping
		if msgStr == "3" {
			continue
		}

		slog.Debug("unhandled Socket.IO packet", "data", msgStr)
	}
}

// sendSocketIOEvent sends a Socket.IO EVENT packet: 42/signaling,["event_name",{payload}]
func sendSocketIOEvent(conn *websocket.Conn, event string, payload interface{}) error {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshalling event payload: %w", err)
	}

	// Socket.IO EVENT format: 42/signaling,["event_name",payload]
	packet := fmt.Sprintf(`42/signaling,["%s",%s]`, event, string(payloadJSON))
	return conn.WriteMessage(websocket.TextMessage, []byte(packet))
}

// handleSocketIOEvent processes a Socket.IO EVENT array: ["event_name", payload]
// The raw input has the "42" prefix already stripped and is a JSON array.
//
// Rate limiting: each event type is checked against the EventRateLimiter before
// dispatch. If the rate limit is exceeded, the event is silently dropped.
//
// Payload validation: basic size checks are applied before unmarshalling to
// reject oversized or malformed payloads early.
func handleSocketIOEvent(ctx context.Context, conn *websocket.Conn, raw []byte, sigHandler *p2p.SignalingHandler, limiter *EventRateLimiter) error {
	// Parse the JSON array: ["event_name", {...payload...}]
	var arr []json.RawMessage
	if err := json.Unmarshal(raw, &arr); err != nil {
		return fmt.Errorf("unmarshalling Socket.IO event array: %w", err)
	}
	if len(arr) < 1 {
		return fmt.Errorf("empty Socket.IO event array")
	}

	var eventName string
	if err := json.Unmarshal(arr[0], &eventName); err != nil {
		return fmt.Errorf("unmarshalling event name: %w", err)
	}

	// The payload is the second element (if present), or empty JSON object
	var payload json.RawMessage
	if len(arr) >= 2 {
		payload = arr[1]
	} else {
		payload = json.RawMessage(`{}`)
	}

	msgType := MessageType(eventName)

	// Rate limit check — drop excessive messages
	if limiter != nil && !limiter.Allow(msgType) {
		return nil // silently dropped
	}

	// Payload size validation
	if err := ValidateGenericPayload(msgType, payload); err != nil {
		slog.Warn("payload validation failed", "event", eventName, "error", err)
		return nil // drop invalid payloads
	}

	slog.Debug("received Socket.IO event", "event", eventName)

	switch msgType {
	case MsgSessionOffer:
		if err := ValidateSessionOffer(payload); err != nil {
			slog.Warn("session offer validation failed", "error", err)
			return nil
		}
		return handleSessionOffer(ctx, conn, payload, sigHandler)

	case MsgSessionRequest:
		// Legacy handler for backward compatibility with older control plane versions.
		return handleSessionRequest(ctx, conn, payload)

	case MsgIceCandidate:
		if err := ValidateIceCandidate(payload); err != nil {
			slog.Warn("ICE candidate validation failed", "error", err)
			return nil
		}
		return handleIceCandidateMessage(payload, sigHandler)

	case MsgIceComplete:
		return handleIceCompleteMessage(payload, sigHandler)

	case MsgSessionEnd, MsgSessionEnded:
		return handleSessionEnd(payload, sigHandler)

	case MsgConfigUpdate:
		return handleConfigUpdate(payload)

	case MsgQosProfileChange:
		return handleQosProfileChange(payload, sigHandler)

	case MsgCapabilityClient:
		return handleCapabilityClient(payload, sigHandler)

	case MsgCapabilityAck:
		return handleCapabilityAck(payload, sigHandler)

	default:
		slog.Warn("unknown Socket.IO event", "event", eventName)
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
// Accepts both camelCase (from Socket.IO gateway) and snake_case (legacy).
func handleSessionEnd(payload json.RawMessage, sigHandler *p2p.SignalingHandler) error {
	var data struct {
		SessionID  string `json:"sessionId"`
		SessionID2 string `json:"session_id"` // legacy fallback
		Reason     string `json:"reason"`
	}
	if err := json.Unmarshal(payload, &data); err != nil {
		return fmt.Errorf("unmarshalling session end: %w", err)
	}
	if data.SessionID == "" {
		data.SessionID = data.SessionID2
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

// handleQosProfileChange processes a streaming profile change request from a client.
func handleQosProfileChange(payload json.RawMessage, sigHandler *p2p.SignalingHandler) error {
	var msg QosProfileChangeMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		return fmt.Errorf("unmarshalling qos:profile-change: %w", err)
	}

	slog.Info("streaming profile change requested",
		"sessionId", msg.SessionID,
		"profile", msg.Profile,
	)

	// Delegate to the signaling handler which has access to the streamer manager
	if sigHandler != nil {
		session := sigHandler.GetCurrentSession()
		if session != nil && session.SessionID == msg.SessionID {
			mgr := sigHandler.GetStreamerManager()
			if mgr != nil {
				if err := mgr.SetGamingMode(msg.Profile); err != nil {
					slog.Error("failed to apply profile change", "error", err)
					return err
				}
				slog.Info("streaming profile changed", "profile", msg.Profile)
			}
		}
	}

	return nil
}

// handleCapabilityClient processes a capability:client message relayed by the server.
// Contains the remote client's display, decoder, and input capabilities.
func handleCapabilityClient(payload json.RawMessage, sigHandler *p2p.SignalingHandler) error {
	var data struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(payload, &data); err != nil {
		return fmt.Errorf("unmarshalling capability:client sessionId: %w", err)
	}

	slog.Debug("received client capabilities", "sessionId", data.SessionID)

	if sigHandler != nil {
		sigHandler.HandleClientCapability(data.SessionID, payload)
	}

	return nil
}

// handleCapabilityAck processes a capability:ack from the server, indicating
// that both client and host capabilities have been exchanged successfully.
func handleCapabilityAck(payload json.RawMessage, sigHandler *p2p.SignalingHandler) error {
	var data struct {
		SessionID  string `json:"sessionId"`
		Negotiated bool   `json:"negotiated"`
	}
	if err := json.Unmarshal(payload, &data); err != nil {
		return fmt.Errorf("unmarshalling capability:ack: %w", err)
	}

	slog.Info("capability negotiation acknowledged",
		"sessionId", data.SessionID,
		"negotiated", data.Negotiated,
	)

	if sigHandler != nil {
		sigHandler.HandleCapabilityAck(data.SessionID)
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

// sendMessage marshals a payload and sends it as a Socket.IO EVENT packet.
// Format: 42/signaling,["event_name",{payload}]
func sendMessage(conn *websocket.Conn, msgType MessageType, payload interface{}) error {
	return sendSocketIOEvent(conn, string(msgType), payload)
}

// SendQosStats sends QoS statistics for an active session to the control plane.
// This should be called periodically (~every 2 seconds) by the QoS reporter goroutine.
func SendQosStats(conn *websocket.Conn, stats QosStatsPayload) error {
	return sendMessage(conn, MsgQosStats, stats)
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
