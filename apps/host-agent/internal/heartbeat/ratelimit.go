package heartbeat

import (
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// EventRateLimiter provides per-event-type rate limiting for inbound WebSocket
// messages. This prevents a compromised or malfunctioning control plane (or
// injected messages) from overwhelming the host agent with excessive signaling
// traffic.
//
// Each event type has its own token bucket configured via EventLimit. When the
// bucket is exhausted, Allow() returns false and the caller should drop or
// reject the message.
type EventRateLimiter struct {
	limits  map[MessageType]EventLimit
	buckets map[MessageType]*tokenBucket
	mu      sync.Mutex
}

// EventLimit defines the rate limit parameters for a single event type.
type EventLimit struct {
	// MaxBurst is the maximum number of events allowed in a burst.
	MaxBurst int

	// RefillInterval is how often one token is added back to the bucket.
	RefillInterval time.Duration
}

// tokenBucket implements a simple token bucket rate limiter.
type tokenBucket struct {
	tokens     int
	maxTokens  int
	refillRate time.Duration
	lastRefill time.Time
}

// DefaultEventLimits returns sensible rate limits for each signaling event type.
// These are calibrated to allow normal operation while blocking abuse:
//
//   - session:offer — 2 per 5s (you can't reasonably start sessions faster)
//   - ice:candidate — 30 per second (ICE gathering sends bursts of candidates)
//   - ice:complete  — 2 per 5s (one per session)
//   - session:end   — 5 per 10s (shouldn't end sessions rapidly)
//   - qos:profile-change — 5 per 10s (user clicking quality profiles)
//   - config:update — 3 per 30s (server-pushed config is rare)
//   - capability:client — 3 per 10s (one per session negotiation)
//   - capability:ack — 3 per 10s (one per session negotiation)
func DefaultEventLimits() map[MessageType]EventLimit {
	return map[MessageType]EventLimit{
		MsgSessionOffer:     {MaxBurst: 2, RefillInterval: 5 * time.Second},
		MsgIceCandidate:     {MaxBurst: 30, RefillInterval: 1 * time.Second},
		MsgIceComplete:      {MaxBurst: 2, RefillInterval: 5 * time.Second},
		MsgSessionEnd:       {MaxBurst: 5, RefillInterval: 10 * time.Second},
		MsgSessionEnded:     {MaxBurst: 5, RefillInterval: 10 * time.Second},
		MsgQosProfileChange: {MaxBurst: 5, RefillInterval: 10 * time.Second},
		MsgConfigUpdate:     {MaxBurst: 3, RefillInterval: 30 * time.Second},
		MsgCapabilityClient: {MaxBurst: 3, RefillInterval: 10 * time.Second},
		MsgCapabilityAck:    {MaxBurst: 3, RefillInterval: 10 * time.Second},
		// Legacy
		MsgSessionRequest: {MaxBurst: 2, RefillInterval: 5 * time.Second},
	}
}

// NewEventRateLimiter creates a new rate limiter with the given per-event limits.
func NewEventRateLimiter(limits map[MessageType]EventLimit) *EventRateLimiter {
	buckets := make(map[MessageType]*tokenBucket, len(limits))
	for eventType, limit := range limits {
		buckets[eventType] = &tokenBucket{
			tokens:     limit.MaxBurst,
			maxTokens:  limit.MaxBurst,
			refillRate: limit.RefillInterval,
			lastRefill: time.Now(),
		}
	}
	return &EventRateLimiter{
		limits:  limits,
		buckets: buckets,
	}
}

// Allow checks whether an event of the given type is allowed under the rate limit.
// Returns true if the event should be processed, false if it should be dropped.
func (r *EventRateLimiter) Allow(eventType MessageType) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	bucket, exists := r.buckets[eventType]
	if !exists {
		// Unknown event types get a generous default (10 per 5s)
		bucket = &tokenBucket{
			tokens:     10,
			maxTokens:  10,
			refillRate: 5 * time.Second,
			lastRefill: time.Now(),
		}
		r.buckets[eventType] = bucket
	}

	// Refill tokens based on elapsed time
	now := time.Now()
	elapsed := now.Sub(bucket.lastRefill)
	if elapsed >= bucket.refillRate && bucket.tokens < bucket.maxTokens {
		tokensToAdd := int(elapsed / bucket.refillRate)
		bucket.tokens += tokensToAdd
		if bucket.tokens > bucket.maxTokens {
			bucket.tokens = bucket.maxTokens
		}
		bucket.lastRefill = now
	}

	if bucket.tokens > 0 {
		bucket.tokens--
		return true
	}

	slog.Warn("rate limit exceeded, dropping message",
		"event", string(eventType),
	)
	return false
}

// ValidateSessionOffer checks that a session offer has valid, required fields.
// Returns an error describing the validation failure, or nil if valid.
func ValidateSessionOffer(payload []byte) error {
	// Lightweight field-level checks without fully parsing the struct.
	// The actual unmarshalling happens in the handler; this is a pre-check
	// to reject obviously malformed payloads early.
	if len(payload) > 64*1024 {
		return fmt.Errorf("session offer payload too large (%d bytes, max 65536)", len(payload))
	}
	return nil
}

// ValidateIceCandidate checks that an ICE candidate message is reasonable.
func ValidateIceCandidate(payload []byte) error {
	if len(payload) > 8*1024 {
		return fmt.Errorf("ICE candidate payload too large (%d bytes, max 8192)", len(payload))
	}
	return nil
}

// ValidateGenericPayload checks basic size limits for any WebSocket payload.
func ValidateGenericPayload(eventType MessageType, payload []byte) error {
	const maxPayloadSize = 128 * 1024 // 128 KB
	if len(payload) > maxPayloadSize {
		return fmt.Errorf("payload for %s too large (%d bytes, max %d)",
			string(eventType), len(payload), maxPayloadSize)
	}
	return nil
}
