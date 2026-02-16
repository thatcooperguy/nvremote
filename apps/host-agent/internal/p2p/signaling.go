package p2p

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/nvidia/nvremote/host-agent/internal/streamer"
)

// SessionOffer represents a new session offer received from the control plane.
// It contains the negotiation parameters sent by the client.
type SessionOffer struct {
	SessionID  string   `json:"session_id"`
	UserID     string   `json:"user_id"`
	Codecs     []string `json:"codecs"`
	MaxBitrate int      `json:"max_bitrate"`
	TargetFPS  int      `json:"target_fps"`
	Resolution string   `json:"resolution"` // e.g., "1920x1080"
	GamingMode string   `json:"gaming_mode"`
	StunServers []string `json:"stun_servers"`
	TurnServers []string `json:"turn_servers"`
}

// SessionAnswer is the response sent back to the control plane after processing
// a session offer. It contains the selected codec, capabilities, and ICE candidates.
type SessionAnswer struct {
	SessionID    string            `json:"session_id"`
	Codec        string            `json:"codec"`
	Capabilities json.RawMessage   `json:"capabilities"`
	Candidates   []IceCandidate    `json:"candidates"`
}

// SessionState tracks the current state of an active or pending session.
type SessionState struct {
	SessionID       string
	Offer           SessionOffer
	LocalCandidates []IceCandidate
	RemoteCandidates []IceCandidate
	SelectedPeer    *streamer.PeerInfo
	State           string // "preparing", "gathering", "connecting", "active", "closed"
	CreatedAt       time.Time
}

// SignalingHandler orchestrates the P2P session negotiation flow. It receives
// session offers from the control plane WebSocket, gathers ICE candidates,
// exchanges them with the remote client, and instructs the streamer to start
// streaming once connectivity is established.
type SignalingHandler struct {
	streamerManager *streamer.Manager
	iceAgent        *IceAgent
	currentSession  *SessionState
	stunServers     []string
	mu              sync.Mutex
}

// NewSignalingHandler creates a new signaling handler with the given streamer
// manager and default STUN servers. Per-session STUN servers from the offer
// override the defaults.
func NewSignalingHandler(mgr *streamer.Manager, stunServers []string) *SignalingHandler {
	return &SignalingHandler{
		streamerManager: mgr,
		stunServers:     stunServers,
	}
}

// HandleSessionOffer processes a new session offer from the control plane.
// This replaces the old WireGuard-based session handling with P2P ICE negotiation.
//
// The flow is:
//  1. Parse the offer and validate parameters.
//  2. Prepare the streamer session via IPC (configures encoder).
//  3. Gather ICE candidates (host + server-reflexive via STUN).
//  4. Send ICE candidates back through the WebSocket as ice:candidate messages.
//  5. Send a session:answer with selected codec and capabilities.
func (h *SignalingHandler) HandleSessionOffer(conn *websocket.Conn, offer SessionOffer) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	slog.Info("handling session offer",
		"sessionId", offer.SessionID,
		"userId", offer.UserID,
		"codecs", offer.Codecs,
		"resolution", offer.Resolution,
	)

	// If there is an existing session, stop it first.
	if h.currentSession != nil && h.currentSession.State != "closed" {
		slog.Warn("closing existing session before starting new one",
			"existingSessionId", h.currentSession.SessionID,
		)
		if err := h.streamerManager.StopSession(h.currentSession.SessionID); err != nil {
			slog.Warn("failed to stop existing session", "error", err)
		}
		// Release UDP sockets held by the previous ICE agent.
		if h.iceAgent != nil {
			h.iceAgent.Close()
		}
	}

	// Create new session state.
	session := &SessionState{
		SessionID: offer.SessionID,
		Offer:     offer,
		State:     "preparing",
		CreatedAt: time.Now(),
	}
	h.currentSession = session

	// Step 1: Select codec from offer (prefer h265, then h264, then first available).
	selectedCodec := selectCodec(offer.Codecs)
	if selectedCodec == "" {
		return h.sendSessionReject(conn, offer.SessionID, "no supported codec")
	}

	// Step 2: Parse resolution.
	width, height, err := parseResolution(offer.Resolution)
	if err != nil {
		slog.Warn("invalid resolution in offer, using 1920x1080", "resolution", offer.Resolution, "error", err)
		width, height = 1920, 1080
	}

	// Step 3: Prepare the streamer via IPC.
	sessionConfig := streamer.SessionConfig{
		SessionID:   offer.SessionID,
		Codec:       selectedCodec,
		BitrateKbps: offer.MaxBitrate,
		FPS:         offer.TargetFPS,
		Width:       width,
		Height:      height,
		GamingMode:  offer.GamingMode,
		StunServers: offer.StunServers,
	}

	if err := h.streamerManager.PrepareSession(sessionConfig); err != nil {
		slog.Error("failed to prepare streamer session", "error", err)
		return h.sendSessionReject(conn, offer.SessionID, "streamer preparation failed")
	}

	session.State = "gathering"

	// Step 4: Gather ICE candidates.
	stunServers := offer.StunServers
	if len(stunServers) == 0 {
		stunServers = h.stunServers
	}
	h.iceAgent = NewIceAgent(stunServers)

	candidates, err := h.iceAgent.GatherCandidates()
	if err != nil {
		slog.Error("failed to gather ICE candidates", "error", err)
		return h.sendSessionReject(conn, offer.SessionID, "ICE gathering failed")
	}

	session.LocalCandidates = candidates

	// Step 5: Send each ICE candidate to the control plane.
	for _, candidate := range candidates {
		if err := h.sendIceCandidate(conn, offer.SessionID, candidate); err != nil {
			slog.Warn("failed to send ICE candidate", "error", err)
		}
	}

	// Signal that all local candidates have been gathered.
	if err := h.sendIceGatheringComplete(conn, offer.SessionID); err != nil {
		slog.Warn("failed to send ICE gathering complete", "error", err)
	}

	// Step 6: Get streamer capabilities and send session:answer.
	caps, err := h.streamerManager.GetCapabilities()
	if err != nil {
		slog.Warn("could not get streamer capabilities", "error", err)
	}

	var capsJSON json.RawMessage
	if caps != nil {
		capsJSON, _ = json.Marshal(caps)
	}

	answer := SessionAnswer{
		SessionID:    offer.SessionID,
		Codec:        selectedCodec,
		Capabilities: capsJSON,
		Candidates:   candidates,
	}

	if err := sendWSMessage(conn, "session:answer", answer); err != nil {
		return fmt.Errorf("sending session:answer: %w", err)
	}

	session.State = "connecting"
	slog.Info("session answer sent, waiting for remote candidates",
		"sessionId", offer.SessionID,
		"codec", selectedCodec,
		"localCandidates", len(candidates),
	)

	return nil
}

// HandleIceCandidate processes a remote ICE candidate received from the client
// via the control plane WebSocket.
func (h *SignalingHandler) HandleIceCandidate(sessionID string, candidate IceCandidate) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.currentSession == nil || h.currentSession.SessionID != sessionID {
		return fmt.Errorf("no active session with ID %s", sessionID)
	}

	slog.Debug("received remote ICE candidate",
		"sessionId", sessionID,
		"type", candidate.Type,
		"ip", candidate.IP,
		"port", candidate.Port,
	)

	h.currentSession.RemoteCandidates = append(h.currentSession.RemoteCandidates, candidate)

	return nil
}

// HandleIceComplete is called when the remote side signals that all ICE candidates
// have been gathered. At this point, we select the best candidate pair and instruct
// the streamer to begin streaming to the selected peer.
func (h *SignalingHandler) HandleIceComplete(sessionID string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.currentSession == nil || h.currentSession.SessionID != sessionID {
		return fmt.Errorf("no active session with ID %s", sessionID)
	}

	slog.Info("remote ICE gathering complete",
		"sessionId", sessionID,
		"remoteCandidates", len(h.currentSession.RemoteCandidates),
	)

	if len(h.currentSession.RemoteCandidates) == 0 {
		return fmt.Errorf("no remote ICE candidates received for session %s", sessionID)
	}

	// Select the best remote candidate.
	// Priority: prefer host candidates, then srflx, then relay.
	peer := selectBestPeer(h.currentSession.RemoteCandidates)
	if peer == nil {
		return fmt.Errorf("could not select a suitable peer from remote candidates")
	}

	h.currentSession.SelectedPeer = peer

	slog.Info("selected peer for streaming",
		"sessionId", sessionID,
		"peerIP", peer.IP,
		"peerPort", peer.Port,
	)

	// Instruct the streamer to start streaming to the selected peer.
	if err := h.streamerManager.StartSession(*peer); err != nil {
		return fmt.Errorf("starting streamer session: %w", err)
	}

	h.currentSession.State = "active"
	slog.Info("streaming session is now active", "sessionId", sessionID)

	return nil
}

// HandleSessionEnd processes a session termination from the control plane.
func (h *SignalingHandler) HandleSessionEnd(sessionID string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.currentSession == nil || h.currentSession.SessionID != sessionID {
		slog.Debug("session end for unknown session", "sessionId", sessionID)
		return nil
	}

	slog.Info("ending session", "sessionId", sessionID)

	if err := h.streamerManager.StopSession(sessionID); err != nil {
		slog.Warn("failed to stop streamer session", "error", err)
	}

	// Release UDP sockets held by the ICE agent for this session.
	if h.iceAgent != nil {
		h.iceAgent.Close()
		h.iceAgent = nil
	}

	h.currentSession.State = "closed"
	h.currentSession = nil

	return nil
}

// GetCurrentSession returns the current session state, or nil if no session is active.
func (h *SignalingHandler) GetCurrentSession() *SessionState {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.currentSession
}

// sendIceCandidate sends a single ICE candidate to the control plane via WebSocket.
func (h *SignalingHandler) sendIceCandidate(conn *websocket.Conn, sessionID string, candidate IceCandidate) error {
	payload := struct {
		SessionID string       `json:"session_id"`
		Candidate IceCandidate `json:"candidate"`
	}{
		SessionID: sessionID,
		Candidate: candidate,
	}
	return sendWSMessage(conn, "ice:candidate", payload)
}

// sendIceGatheringComplete signals that all local ICE candidates have been gathered.
func (h *SignalingHandler) sendIceGatheringComplete(conn *websocket.Conn, sessionID string) error {
	payload := struct {
		SessionID string `json:"session_id"`
	}{
		SessionID: sessionID,
	}
	return sendWSMessage(conn, "ice:gathering_complete", payload)
}

// sendSessionReject sends a session:reject message back to the control plane.
func (h *SignalingHandler) sendSessionReject(conn *websocket.Conn, sessionID string, reason string) error {
	payload := struct {
		SessionID string `json:"session_id"`
		Reason    string `json:"reason"`
	}{
		SessionID: sessionID,
		Reason:    reason,
	}

	slog.Warn("rejecting session", "sessionId", sessionID, "reason", reason)
	return sendWSMessage(conn, "session:reject", payload)
}

// sendWSMessage marshals a payload and sends it as a typed WebSocket message.
// The message format matches the existing WSMessage envelope used throughout
// the heartbeat/websocket package.
func sendWSMessage(conn *websocket.Conn, msgType string, payload interface{}) error {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshalling payload: %w", err)
	}

	msg := struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}{
		Type:    msgType,
		Payload: payloadBytes,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshalling message: %w", err)
	}

	if err := conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return fmt.Errorf("setting write deadline: %w", err)
	}

	if err := conn.WriteMessage(websocket.TextMessage, msgBytes); err != nil {
		return fmt.Errorf("writing WebSocket message: %w", err)
	}

	slog.Debug("sent WebSocket message", "type", msgType)
	return nil
}

// selectCodec picks the best codec from the client's list.
// Preference order: h265 > h264 > av1 > first available.
func selectCodec(offered []string) string {
	preferred := []string{"h265", "h264", "av1"}

	for _, pref := range preferred {
		for _, offered := range offered {
			if offered == pref {
				return pref
			}
		}
	}

	// Fall back to the first offered codec.
	if len(offered) > 0 {
		return offered[0]
	}

	return ""
}

// selectBestPeer chooses the best remote candidate to stream to.
// It prefers host candidates over server-reflexive, and server-reflexive over relay.
func selectBestPeer(candidates []IceCandidate) *streamer.PeerInfo {
	if len(candidates) == 0 {
		return nil
	}

	// Sort by priority descending (highest priority = best candidate).
	best := candidates[0]
	for _, c := range candidates[1:] {
		if c.Priority > best.Priority {
			best = c
		}
	}

	return &streamer.PeerInfo{
		IP:   best.IP,
		Port: int(best.Port),
	}
}

// parseResolution parses a resolution string like "1920x1080" into width and height.
func parseResolution(res string) (int, int, error) {
	var w, h int
	n, err := fmt.Sscanf(res, "%dx%d", &w, &h)
	if err != nil || n != 2 {
		return 0, 0, fmt.Errorf("invalid resolution format: %s", res)
	}
	if w <= 0 || h <= 0 {
		return 0, 0, fmt.Errorf("resolution dimensions must be positive: %dx%d", w, h)
	}
	return w, h, nil
}
