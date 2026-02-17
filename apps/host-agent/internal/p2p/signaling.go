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

// TurnServerConfig represents a TURN server with ephemeral credentials.
// Credentials are HMAC-SHA1 based with an embedded expiry timestamp.
type TurnServerConfig struct {
	URLs       string `json:"urls"`
	Username   string `json:"username"`
	Credential string `json:"credential"`
}

// SessionOffer represents a new session offer received from the control plane.
// It contains the negotiation parameters sent by the client.
// JSON tags use camelCase to match the NestJS Socket.IO gateway format.
type SessionOffer struct {
	SessionID   string             `json:"sessionId"`
	UserID      string             `json:"userId"`
	Codecs      []string           `json:"codecs"`
	MaxBitrate  int                `json:"maxBitrate"`
	TargetFPS   int                `json:"targetFps"`
	Resolution  string             `json:"resolution"` // e.g., "1920x1080"
	GamingMode  interface{}        `json:"gamingMode"`  // bool or string depending on source
	StunServers []string           `json:"stunServers"`
	TurnServers []TurnServerConfig `json:"turnServers"`
}

// SessionAnswer is the response sent back to the control plane after processing
// a session offer. It contains the selected codec, capabilities, and ICE candidates.
// JSON tags use camelCase to match the NestJS Socket.IO gateway format.
type SessionAnswer struct {
	SessionID    string            `json:"session_id"`
	Codec        string            `json:"codec"`
	Capabilities json.RawMessage   `json:"capabilities"`
	Candidates   []IceCandidate    `json:"candidates"`
}

// Keeping session_id in snake_case for the answer because the server-side
// session:answer handler reads payload.session_id (which we control).

// SessionState tracks the current state of an active or pending session.
type SessionState struct {
	SessionID        string
	Offer            SessionOffer
	LocalCandidates  []IceCandidate
	RemoteCandidates []IceCandidate
	SelectedPeer     *streamer.PeerInfo
	State            string // "preparing", "gathering", "connecting", "active", "closed"
	ConnectionType   string // "p2p" or "relay"
	CreatedAt        time.Time
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
		"turnServers", len(offer.TurnServers),
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
	// GamingMode may arrive as a string ("balanced") or a boolean (from REST path).
	gamingModeStr := "balanced"
	switch v := offer.GamingMode.(type) {
	case string:
		gamingModeStr = v
	case bool:
		if v {
			gamingModeStr = "competitive"
		}
	}

	sessionConfig := streamer.SessionConfig{
		SessionID:   offer.SessionID,
		Codec:       selectedCodec,
		BitrateKbps: offer.MaxBitrate,
		FPS:         offer.TargetFPS,
		Width:       width,
		Height:      height,
		GamingMode:  gamingModeStr,
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

	// Step 7: Send capability:host for the capability negotiation protocol.
	// This provides detailed host hardware info that the server stores on the
	// session metadata and relays to the client.
	h.sendHostCapabilities(conn, offer.SessionID, caps)

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

// GetStreamerManager returns the underlying streamer manager.
// Used by the websocket handler for QoS profile changes during active sessions.
func (h *SignalingHandler) GetStreamerManager() *streamer.Manager {
	return h.streamerManager
}

// HostCapabilityPayload is the capability:host message sent to the control plane.
// The server stores these on the session metadata and relays them to the client.
// JSON tags use camelCase to match the NestJS Socket.IO gateway expectations.
type HostCapabilityPayload struct {
	SessionID  string                  `json:"sessionId"`
	GPU        HostGPUInfo             `json:"gpu"`
	Encoders   []string                `json:"encoders"`
	MaxEncode  map[string]string       `json:"maxEncode,omitempty"`
	CaptureAPI string                  `json:"captureApi"`
	Displays   []HostDisplayInfo       `json:"displays,omitempty"`
}

// HostGPUInfo describes the host GPU for capability negotiation.
type HostGPUInfo struct {
	Name     string `json:"name"`
	VRAM     int    `json:"vram,omitempty"`
	NVENCGen string `json:"nvencGen,omitempty"`
}

// HostDisplayInfo describes a display output on the host.
type HostDisplayInfo struct {
	Width       int `json:"width"`
	Height      int `json:"height"`
	RefreshRate int `json:"refreshRate"`
}

// sendHostCapabilities sends a capability:host message to the control plane
// containing detailed GPU, encoder, and display information. This feeds the
// server's capability negotiation protocol and triggers a capability:ack once
// the client has also reported its capabilities.
func (h *SignalingHandler) sendHostCapabilities(conn *websocket.Conn, sessionID string, caps *streamer.StreamerCapabilities) {
	gpu := HostGPUInfo{}
	captureAPI := "nvfbc" // Default for Windows desktop GPUs

	var encoders []string
	maxEncode := make(map[string]string)

	if caps != nil {
		gpu.Name = caps.GPUName
		gpu.NVENCGen = caps.NVENCVersion
		encoders = caps.Codecs

		// Build max encode capabilities per codec
		for _, codec := range caps.Codecs {
			switch codec {
			case "h264":
				maxEncode["h264"] = fmt.Sprintf("4096x4096@%d", caps.MaxFPS)
			case "h265":
				maxEncode["h265"] = fmt.Sprintf("8192x8192@%d", caps.MaxFPS)
			case "av1":
				maxEncode["av1"] = fmt.Sprintf("8192x8192@%d", caps.MaxFPS)
			}
		}
	}

	// If GPU name is still empty, try to detect it from nvidia-smi
	if gpu.Name == "" {
		info, err := h.streamerManager.Detect()
		if err == nil && info != nil {
			gpu.Name = info.GPUName
			if len(encoders) == 0 {
				encoders = info.Codecs
			}
		}
	}

	payload := HostCapabilityPayload{
		SessionID:  sessionID,
		GPU:        gpu,
		Encoders:   encoders,
		MaxEncode:  maxEncode,
		CaptureAPI: captureAPI,
	}

	if err := sendWSMessage(conn, "capability:host", payload); err != nil {
		slog.Warn("failed to send capability:host", "error", err)
	} else {
		slog.Info("sent host capabilities",
			"sessionId", sessionID,
			"gpu", gpu.Name,
			"encoders", encoders,
		)
	}
}

// HandleClientCapability processes a capability:client message relayed by the
// server. This contains the remote client's display, decoder, and input info.
// Currently logged for diagnostics; the QoS engine will use this data in future.
func (h *SignalingHandler) HandleClientCapability(sessionID string, payload json.RawMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.currentSession == nil || h.currentSession.SessionID != sessionID {
		slog.Debug("capability:client for unknown session", "sessionId", sessionID)
		return
	}

	// Parse just enough to log useful fields
	var data struct {
		Display struct {
			Width       int  `json:"width"`
			Height      int  `json:"height"`
			RefreshRate int  `json:"refreshRate"`
			HDR         bool `json:"hdr"`
		} `json:"display"`
		Decoders []string `json:"decoders"`
		Platform string   `json:"platform"`
	}

	if err := json.Unmarshal(payload, &data); err != nil {
		slog.Warn("failed to parse capability:client payload", "error", err)
		return
	}

	slog.Info("received client capabilities",
		"sessionId", sessionID,
		"display", fmt.Sprintf("%dx%d@%dHz", data.Display.Width, data.Display.Height, data.Display.RefreshRate),
		"hdr", data.Display.HDR,
		"decoders", data.Decoders,
		"platform", data.Platform,
	)
}

// HandleCapabilityAck processes the capability:ack message from the server,
// indicating that both client and host capabilities have been received and
// the negotiation is complete. The QoS engine can now begin adapting parameters.
func (h *SignalingHandler) HandleCapabilityAck(sessionID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.currentSession == nil || h.currentSession.SessionID != sessionID {
		return
	}

	slog.Info("capability negotiation complete", "sessionId", sessionID)
}

// sendIceCandidate sends a single ICE candidate to the control plane via WebSocket.
// Uses camelCase JSON tags to match the NestJS Socket.IO gateway expectations.
func (h *SignalingHandler) sendIceCandidate(conn *websocket.Conn, sessionID string, candidate IceCandidate) error {
	payload := struct {
		SessionID string       `json:"sessionId"`
		Candidate IceCandidate `json:"candidate"`
	}{
		SessionID: sessionID,
		Candidate: candidate,
	}
	return sendWSMessage(conn, "ice:candidate", payload)
}

// sendIceGatheringComplete signals that all local ICE candidates have been gathered.
// Uses camelCase JSON tags to match the NestJS Socket.IO gateway expectations.
func (h *SignalingHandler) sendIceGatheringComplete(conn *websocket.Conn, sessionID string) error {
	payload := struct {
		SessionID string `json:"sessionId"`
	}{
		SessionID: sessionID,
	}
	return sendWSMessage(conn, "ice:complete", payload)
}

// sendSessionReject sends a session:reject message back to the control plane.
// Uses camelCase JSON tags to match the NestJS Socket.IO gateway expectations.
func (h *SignalingHandler) sendSessionReject(conn *websocket.Conn, sessionID string, reason string) error {
	payload := struct {
		SessionID string `json:"sessionId"`
		Reason    string `json:"reason"`
	}{
		SessionID: sessionID,
		Reason:    reason,
	}

	slog.Warn("rejecting session", "sessionId", sessionID, "reason", reason)
	return sendWSMessage(conn, "session:reject", payload)
}

// sendWSMessage marshals a payload and sends it as a Socket.IO v4 EVENT packet.
//
// Socket.IO EVENT format: 42/signaling,["event_name",{payload}]
//
// The "42" prefix means Engine.IO MESSAGE (4) + Socket.IO EVENT (2).
// The "/signaling," prefix targets the /signaling namespace.
func sendWSMessage(conn *websocket.Conn, eventName string, payload interface{}) error {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshalling payload: %w", err)
	}

	// Build Socket.IO EVENT: 42/signaling,["event_name",payload]
	packet := fmt.Sprintf(`42/signaling,["%s",%s]`, eventName, string(payloadBytes))

	if err := conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return fmt.Errorf("setting write deadline: %w", err)
	}

	if err := conn.WriteMessage(websocket.TextMessage, []byte(packet)); err != nil {
		return fmt.Errorf("writing Socket.IO event: %w", err)
	}

	slog.Debug("sent Socket.IO event", "event", eventName)
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
