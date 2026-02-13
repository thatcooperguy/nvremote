// Package p2p implements ICE candidate gathering and P2P signaling for
// establishing direct connections between the host streamer and remote clients.
package p2p

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"log/slog"
	"net"
	"sort"
	"strings"
	"time"
)

const (
	// stunBindingRequest is the STUN message type for Binding Request (RFC 5389).
	stunBindingRequest uint16 = 0x0001

	// stunBindingResponse is the STUN message type for Binding Success Response.
	stunBindingResponse uint16 = 0x0101

	// stunMagicCookie is the fixed value in the STUN header (RFC 5389 Section 6).
	stunMagicCookie uint32 = 0x2112A442

	// stunAttrXorMappedAddress is the XOR-MAPPED-ADDRESS attribute type (0x0020).
	stunAttrXorMappedAddress uint16 = 0x0020

	// stunAttrMappedAddress is the MAPPED-ADDRESS attribute type (0x0001).
	stunAttrMappedAddress uint16 = 0x0001

	// stunHeaderSize is the fixed size of the STUN message header (20 bytes).
	stunHeaderSize = 20

	// stunTransactionIDSize is the size of the STUN transaction ID (12 bytes).
	stunTransactionIDSize = 12

	// stunTimeout is how long to wait for a STUN response.
	stunTimeout = 3 * time.Second

	// stunRetries is how many times to retry a failed STUN request.
	stunRetries = 2

	// IPv4 family identifier in STUN attributes.
	stunFamilyIPv4 byte = 0x01

	// IPv6 family identifier in STUN attributes.
	stunFamilyIPv6 byte = 0x02
)

// IceCandidate represents an ICE candidate (RFC 8445) for P2P connectivity checks.
type IceCandidate struct {
	// Type is the candidate type: "host", "srflx" (server-reflexive), or "relay".
	Type string `json:"type"`

	// IP is the candidate IP address.
	IP string `json:"ip"`

	// Port is the candidate port number.
	Port uint16 `json:"port"`

	// Protocol is the transport protocol, typically "udp".
	Protocol string `json:"protocol"`

	// Priority is the candidate priority computed per RFC 8445 Section 5.1.2.
	Priority uint32 `json:"priority"`

	// Foundation is a string used to group candidates that share a base.
	Foundation string `json:"foundation"`
}

// IceAgent gathers ICE candidates by enumerating local network interfaces and
// performing STUN binding requests to discover server-reflexive candidates.
type IceAgent struct {
	stunServers []string
	candidates  []IceCandidate
}

// NewIceAgent creates a new ICE agent with the given STUN server addresses.
// Each STUN server should be in "host:port" format.
func NewIceAgent(stunServers []string) *IceAgent {
	return &IceAgent{
		stunServers: stunServers,
	}
}

// GatherCandidates discovers all available ICE candidates: local (host) candidates
// from network interfaces and server-reflexive candidates via STUN binding.
// Returns candidates sorted by priority (highest first).
func (a *IceAgent) GatherCandidates() ([]IceCandidate, error) {
	a.candidates = nil

	// Gather host candidates from local network interfaces.
	hostCandidates := a.getLocalCandidates()
	a.candidates = append(a.candidates, hostCandidates...)

	slog.Info("gathered host candidates", "count", len(hostCandidates))

	// Gather server-reflexive candidates via STUN.
	reflexiveCandidates := a.getReflexiveCandidates()
	a.candidates = append(a.candidates, reflexiveCandidates...)

	slog.Info("gathered server-reflexive candidates", "count", len(reflexiveCandidates))

	if len(a.candidates) == 0 {
		return nil, fmt.Errorf("no ICE candidates gathered")
	}

	// Sort by priority descending.
	sort.Slice(a.candidates, func(i, j int) bool {
		return a.candidates[i].Priority > a.candidates[j].Priority
	})

	return a.candidates, nil
}

// getLocalCandidates enumerates local network interfaces and creates host
// candidates for each non-loopback IPv4 address.
func (a *IceAgent) getLocalCandidates() []IceCandidate {
	var candidates []IceCandidate

	ifaces, err := net.Interfaces()
	if err != nil {
		slog.Warn("failed to enumerate network interfaces", "error", err)
		return candidates
	}

	foundationIndex := 0
	for _, iface := range ifaces {
		// Skip loopback, down, and non-multicast interfaces.
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if iface.Flags&net.FlagUp == 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			slog.Debug("failed to get addresses for interface", "iface", iface.Name, "error", err)
			continue
		}

		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok {
				continue
			}

			ip := ipNet.IP
			// Only use IPv4 for now; skip link-local addresses.
			if ip.To4() == nil {
				continue
			}
			if ip.IsLoopback() || ip.IsLinkLocalUnicast() {
				continue
			}

			// Allocate a local UDP port for this candidate.
			localPort, err := allocateUDPPort(ip.String())
			if err != nil {
				slog.Debug("failed to allocate UDP port", "ip", ip.String(), "error", err)
				continue
			}

			foundationIndex++
			candidate := IceCandidate{
				Type:       "host",
				IP:         ip.String(),
				Port:       uint16(localPort),
				Protocol:   "udp",
				Priority:   computePriority("host", foundationIndex),
				Foundation: fmt.Sprintf("host%d", foundationIndex),
			}

			candidates = append(candidates, candidate)
			slog.Debug("host candidate", "ip", candidate.IP, "port", candidate.Port, "iface", iface.Name)
		}
	}

	return candidates
}

// getReflexiveCandidates performs STUN binding requests against each configured
// STUN server to discover the public (server-reflexive) IP address and port.
func (a *IceAgent) getReflexiveCandidates() []IceCandidate {
	var candidates []IceCandidate

	if len(a.stunServers) == 0 {
		slog.Debug("no STUN servers configured, skipping reflexive candidates")
		return candidates
	}

	// Use one of the host candidates as the local port for STUN.
	// If no host candidates exist, bind to any available port.
	localAddr := "0.0.0.0:0"

	seen := make(map[string]bool)
	for i, server := range a.stunServers {
		candidate, err := stunBindingRequestWithRetry(server, localAddr)
		if err != nil {
			slog.Warn("STUN binding request failed", "server", server, "error", err)
			continue
		}

		// Deduplicate reflexive candidates (same public IP:port from different servers).
		key := fmt.Sprintf("%s:%d", candidate.IP, candidate.Port)
		if seen[key] {
			continue
		}
		seen[key] = true

		candidate.Type = "srflx"
		candidate.Foundation = fmt.Sprintf("srflx%d", i+1)
		candidate.Priority = computePriority("srflx", i+1)

		candidates = append(candidates, *candidate)
		slog.Debug("reflexive candidate", "ip", candidate.IP, "port", candidate.Port, "server", server)
	}

	return candidates
}

// stunBindingRequestWithRetry attempts a STUN binding request with retries.
func stunBindingRequestWithRetry(stunServer string, localAddr string) (*IceCandidate, error) {
	var lastErr error
	for attempt := 0; attempt <= stunRetries; attempt++ {
		candidate, err := StunBindingRequest(stunServer, localAddr)
		if err == nil {
			return candidate, nil
		}
		lastErr = err
		slog.Debug("STUN request attempt failed", "server", stunServer, "attempt", attempt, "error", err)
	}
	return nil, fmt.Errorf("STUN binding to %s failed after %d attempts: %w", stunServer, stunRetries+1, lastErr)
}

// StunBindingRequest sends a STUN Binding Request (RFC 5389) to the given STUN server
// and parses the XOR-MAPPED-ADDRESS from the response to determine the public IP and port.
//
// The STUN Binding Request format:
//
//	Bytes 0-1:   Message Type (0x0001 = Binding Request)
//	Bytes 2-3:   Message Length (0 for request with no attributes)
//	Bytes 4-7:   Magic Cookie (0x2112A442)
//	Bytes 8-19:  Transaction ID (random 12 bytes)
//
// The response contains an XOR-MAPPED-ADDRESS attribute (type 0x0020) with:
//
//	Byte 0:      Reserved (0x00)
//	Byte 1:      Family (0x01 = IPv4, 0x02 = IPv6)
//	Bytes 2-3:   XOR'd Port (port ^ (magic_cookie >> 16))
//	Bytes 4-7:   XOR'd IP (IPv4 XOR'd with magic_cookie)
func StunBindingRequest(stunServer string, localAddr string) (*IceCandidate, error) {
	// Resolve the STUN server address.
	if !strings.Contains(stunServer, ":") {
		stunServer = stunServer + ":3478"
	}

	serverAddr, err := net.ResolveUDPAddr("udp4", stunServer)
	if err != nil {
		return nil, fmt.Errorf("resolving STUN server %s: %w", stunServer, err)
	}

	localUDPAddr, err := net.ResolveUDPAddr("udp4", localAddr)
	if err != nil {
		return nil, fmt.Errorf("resolving local address %s: %w", localAddr, err)
	}

	conn, err := net.DialUDP("udp4", localUDPAddr, serverAddr)
	if err != nil {
		return nil, fmt.Errorf("dialing STUN server %s: %w", stunServer, err)
	}
	defer conn.Close()

	// Build the STUN Binding Request (20 bytes total, no attributes).
	request := make([]byte, stunHeaderSize)

	// Message Type: Binding Request (0x0001).
	binary.BigEndian.PutUint16(request[0:2], stunBindingRequest)

	// Message Length: 0 (no attributes in request).
	binary.BigEndian.PutUint16(request[2:4], 0)

	// Magic Cookie.
	binary.BigEndian.PutUint32(request[4:8], stunMagicCookie)

	// Transaction ID: 12 random bytes.
	transactionID := make([]byte, stunTransactionIDSize)
	if _, err := rand.Read(transactionID); err != nil {
		return nil, fmt.Errorf("generating transaction ID: %w", err)
	}
	copy(request[8:20], transactionID)

	// Send the request.
	if err := conn.SetWriteDeadline(time.Now().Add(stunTimeout)); err != nil {
		return nil, fmt.Errorf("setting write deadline: %w", err)
	}

	if _, err := conn.Write(request); err != nil {
		return nil, fmt.Errorf("sending STUN request: %w", err)
	}

	// Read the response.
	if err := conn.SetReadDeadline(time.Now().Add(stunTimeout)); err != nil {
		return nil, fmt.Errorf("setting read deadline: %w", err)
	}

	response := make([]byte, 1024)
	n, err := conn.Read(response)
	if err != nil {
		return nil, fmt.Errorf("reading STUN response: %w", err)
	}
	response = response[:n]

	// Parse the STUN response.
	return parseStunResponse(response, transactionID)
}

// parseStunResponse parses a STUN Binding Success Response and extracts the
// XOR-MAPPED-ADDRESS (or MAPPED-ADDRESS as fallback).
func parseStunResponse(response []byte, expectedTxnID []byte) (*IceCandidate, error) {
	if len(response) < stunHeaderSize {
		return nil, fmt.Errorf("STUN response too short: %d bytes", len(response))
	}

	// Verify message type is Binding Success Response.
	msgType := binary.BigEndian.Uint16(response[0:2])
	if msgType != stunBindingResponse {
		return nil, fmt.Errorf("unexpected STUN message type: 0x%04x", msgType)
	}

	// Verify magic cookie.
	cookie := binary.BigEndian.Uint32(response[4:8])
	if cookie != stunMagicCookie {
		return nil, fmt.Errorf("invalid STUN magic cookie: 0x%08x", cookie)
	}

	// Verify transaction ID matches.
	for i := 0; i < stunTransactionIDSize; i++ {
		if response[8+i] != expectedTxnID[i] {
			return nil, fmt.Errorf("STUN transaction ID mismatch")
		}
	}

	// Message length (number of bytes after the header).
	msgLen := binary.BigEndian.Uint16(response[2:4])
	if int(msgLen)+stunHeaderSize > len(response) {
		return nil, fmt.Errorf("STUN message length %d exceeds response size %d", msgLen, len(response))
	}

	// Parse attributes looking for XOR-MAPPED-ADDRESS (preferred) or MAPPED-ADDRESS.
	attrs := response[stunHeaderSize : stunHeaderSize+int(msgLen)]
	var candidate *IceCandidate

	offset := 0
	for offset+4 <= len(attrs) {
		attrType := binary.BigEndian.Uint16(attrs[offset : offset+2])
		attrLen := binary.BigEndian.Uint16(attrs[offset+2 : offset+4])
		attrValue := attrs[offset+4 : offset+4+int(attrLen)]

		switch attrType {
		case stunAttrXorMappedAddress:
			c, err := parseXorMappedAddress(attrValue, response[4:8], response[8:20])
			if err == nil {
				return c, nil // Prefer XOR-MAPPED-ADDRESS.
			}
			slog.Debug("failed to parse XOR-MAPPED-ADDRESS", "error", err)

		case stunAttrMappedAddress:
			c, err := parseMappedAddress(attrValue)
			if err == nil {
				candidate = c // Use as fallback.
			}
		}

		// Attributes are padded to 4-byte boundaries.
		padded := int(attrLen)
		if padded%4 != 0 {
			padded += 4 - (padded % 4)
		}
		offset += 4 + padded
	}

	if candidate != nil {
		return candidate, nil
	}

	return nil, fmt.Errorf("no MAPPED-ADDRESS or XOR-MAPPED-ADDRESS found in STUN response")
}

// parseXorMappedAddress decodes an XOR-MAPPED-ADDRESS attribute value.
// The port is XOR'd with the top 16 bits of the magic cookie,
// and the IPv4 address is XOR'd with the full 32-bit magic cookie.
func parseXorMappedAddress(value []byte, magicCookieBytes []byte, transactionID []byte) (*IceCandidate, error) {
	if len(value) < 8 {
		return nil, fmt.Errorf("XOR-MAPPED-ADDRESS too short: %d bytes", len(value))
	}

	family := value[1]

	switch family {
	case stunFamilyIPv4:
		if len(value) < 8 {
			return nil, fmt.Errorf("XOR-MAPPED-ADDRESS IPv4 value too short")
		}

		// XOR port with top 16 bits of magic cookie.
		xorPort := binary.BigEndian.Uint16(value[2:4])
		port := xorPort ^ uint16(stunMagicCookie>>16)

		// XOR IPv4 address with magic cookie.
		xorIP := make([]byte, 4)
		copy(xorIP, value[4:8])
		magicBytes := make([]byte, 4)
		binary.BigEndian.PutUint32(magicBytes, stunMagicCookie)
		for i := 0; i < 4; i++ {
			xorIP[i] ^= magicBytes[i]
		}

		ip := net.IPv4(xorIP[0], xorIP[1], xorIP[2], xorIP[3])

		return &IceCandidate{
			IP:       ip.String(),
			Port:     port,
			Protocol: "udp",
		}, nil

	case stunFamilyIPv6:
		// IPv6 support: XOR with magic cookie + transaction ID.
		if len(value) < 20 {
			return nil, fmt.Errorf("XOR-MAPPED-ADDRESS IPv6 value too short")
		}

		xorPort := binary.BigEndian.Uint16(value[2:4])
		port := xorPort ^ uint16(stunMagicCookie>>16)

		xorIP := make([]byte, 16)
		copy(xorIP, value[4:20])

		// Build the 16-byte XOR key: 4 bytes magic cookie + 12 bytes transaction ID.
		xorKey := make([]byte, 16)
		binary.BigEndian.PutUint32(xorKey[0:4], stunMagicCookie)
		copy(xorKey[4:16], transactionID)

		for i := 0; i < 16; i++ {
			xorIP[i] ^= xorKey[i]
		}

		ip := net.IP(xorIP)
		return &IceCandidate{
			IP:       ip.String(),
			Port:     port,
			Protocol: "udp",
		}, nil

	default:
		return nil, fmt.Errorf("unsupported address family: 0x%02x", family)
	}
}

// parseMappedAddress decodes a MAPPED-ADDRESS attribute value (non-XOR'd fallback).
func parseMappedAddress(value []byte) (*IceCandidate, error) {
	if len(value) < 8 {
		return nil, fmt.Errorf("MAPPED-ADDRESS too short: %d bytes", len(value))
	}

	family := value[1]
	if family != stunFamilyIPv4 {
		return nil, fmt.Errorf("unsupported MAPPED-ADDRESS family: 0x%02x", family)
	}

	port := binary.BigEndian.Uint16(value[2:4])
	ip := net.IPv4(value[4], value[5], value[6], value[7])

	return &IceCandidate{
		IP:       ip.String(),
		Port:     port,
		Protocol: "udp",
	}, nil
}

// computePriority calculates the ICE candidate priority per RFC 8445 Section 5.1.2.
// priority = (2^24) * type_preference + (2^8) * local_preference + (2^0) * (256 - component_id)
// We use component_id = 1 (RTP).
func computePriority(candidateType string, index int) uint32 {
	var typePreference uint32
	switch candidateType {
	case "host":
		typePreference = 126
	case "srflx":
		typePreference = 100
	case "relay":
		typePreference = 0
	default:
		typePreference = 50
	}

	// Local preference decreases with index to ensure uniqueness.
	localPreference := uint32(65535 - index)
	if localPreference > 65535 {
		localPreference = 0
	}

	componentID := uint32(1)

	return (typePreference << 24) + (localPreference << 8) + (256 - componentID)
}

// allocateUDPPort binds a UDP socket on the given IP and returns the allocated port.
// The socket is immediately closed; the port is used as the candidate port.
// In a real implementation, the socket would be kept open for connectivity checks.
func allocateUDPPort(ip string) (int, error) {
	addr, err := net.ResolveUDPAddr("udp4", ip+":0")
	if err != nil {
		return 0, fmt.Errorf("resolving UDP address: %w", err)
	}

	conn, err := net.ListenUDP("udp4", addr)
	if err != nil {
		return 0, fmt.Errorf("binding UDP socket: %w", err)
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.Port, nil
}
