/**
 * host-ice.ts — ICE Candidate Gathering
 *
 * Ported from: apps/host-agent/internal/p2p/ice.go
 *
 * Enumerates local IPv4 interfaces for host candidates and performs STUN
 * binding requests (RFC 5389) to discover server-reflexive candidates.
 * Uses Node.js `dgram` for UDP sockets — no native addons.
 */

import dgram from 'dgram';
import crypto from 'crypto';
import os from 'os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IceCandidate {
  type: 'host' | 'srflx' | 'relay';
  ip: string;
  port: number;
  protocol: string;
  priority: number;
  foundation: string;
}

// ---------------------------------------------------------------------------
// Constants (RFC 5389 / 8445)
// ---------------------------------------------------------------------------

const STUN_BINDING_REQUEST = 0x0001;
const STUN_BINDING_RESPONSE = 0x0101;
const STUN_MAGIC_COOKIE = 0x2112a442;
const STUN_ATTR_XOR_MAPPED_ADDRESS = 0x0020;
const STUN_ATTR_MAPPED_ADDRESS = 0x0001;
const STUN_HEADER_SIZE = 20;
const STUN_TRANSACTION_ID_SIZE = 12;
const STUN_FAMILY_IPV4 = 0x01;

const STUN_TIMEOUT = 3_000;  // 3s per request
const STUN_RETRIES = 2;

// ---------------------------------------------------------------------------
// IceAgent
// ---------------------------------------------------------------------------

export class IceAgent {
  private stunServers: string[];
  private candidates: IceCandidate[] = [];
  private sockets: dgram.Socket[] = [];

  constructor(stunServers: string[]) {
    this.stunServers = stunServers;
  }

  /** Release all held UDP sockets. Call when the session ends. */
  close(): void {
    for (const sock of this.sockets) {
      try { sock.close(); } catch { /* already closed */ }
    }
    this.sockets = [];
    console.log('[host-ice] released all held UDP sockets');
  }

  /**
   * Gather all available ICE candidates (host + server-reflexive).
   * Returns candidates sorted by priority descending.
   * Keeps UDP sockets open — call close() when done.
   */
  async gatherCandidates(): Promise<IceCandidate[]> {
    this.candidates = [];
    this.sockets = [];

    // Host candidates from local interfaces.
    const hostCandidates = await this.getLocalCandidates();
    this.candidates.push(...hostCandidates);
    console.log(`[host-ice] gathered ${hostCandidates.length} host candidates`);

    // Server-reflexive candidates via STUN.
    const srflxCandidates = await this.getReflexiveCandidates();
    this.candidates.push(...srflxCandidates);
    console.log(`[host-ice] gathered ${srflxCandidates.length} reflexive candidates`);

    if (this.candidates.length === 0) {
      throw new Error('No ICE candidates gathered');
    }

    // Sort by priority descending.
    this.candidates.sort((a, b) => b.priority - a.priority);

    return this.candidates;
  }

  // -----------------------------------------------------------------------
  // Host Candidates
  // -----------------------------------------------------------------------

  private async getLocalCandidates(): Promise<IceCandidate[]> {
    const candidates: IceCandidate[] = [];
    const interfaces = os.networkInterfaces();
    let foundationIndex = 0;

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;

      for (const info of addrs) {
        // Only IPv4, skip loopback and link-local.
        if (info.family !== 'IPv4') continue;
        if (info.internal) continue;
        if (info.address.startsWith('169.254.')) continue;

        // Allocate a UDP port for this candidate.
        try {
          const { socket, port } = await this.allocateUDPPort(info.address);
          this.sockets.push(socket);

          foundationIndex++;
          candidates.push({
            type: 'host',
            ip: info.address,
            port,
            protocol: 'udp',
            priority: computePriority('host', foundationIndex),
            foundation: `host${foundationIndex}`,
          });

          console.log(`[host-ice] host candidate: ${info.address}:${port} iface=${name}`);
        } catch (err) {
          console.warn(`[host-ice] failed to allocate UDP port on ${info.address}:`, (err as Error).message);
        }
      }
    }

    return candidates;
  }

  // -----------------------------------------------------------------------
  // Reflexive Candidates (STUN)
  // -----------------------------------------------------------------------

  private async getReflexiveCandidates(): Promise<IceCandidate[]> {
    const candidates: IceCandidate[] = [];

    if (this.stunServers.length === 0) {
      console.log('[host-ice] no STUN servers configured, skipping reflexive candidates');
      return candidates;
    }

    const seen = new Set<string>();

    for (let i = 0; i < this.stunServers.length; i++) {
      const server = this.stunServers[i];
      try {
        const candidate = await this.stunBindingRequestWithRetry(server);

        const key = `${candidate.ip}:${candidate.port}`;
        if (seen.has(key)) continue;
        seen.add(key);

        candidate.type = 'srflx';
        candidate.foundation = `srflx${i + 1}`;
        candidate.priority = computePriority('srflx', i + 1);

        candidates.push(candidate);
        console.log(`[host-ice] reflexive candidate: ${candidate.ip}:${candidate.port} server=${server}`);
      } catch (err) {
        console.warn(`[host-ice] STUN binding to ${server} failed:`, (err as Error).message);
      }
    }

    return candidates;
  }

  private async stunBindingRequestWithRetry(server: string): Promise<IceCandidate> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= STUN_RETRIES; attempt++) {
      try {
        return await stunBindingRequest(server);
      } catch (err) {
        lastError = err as Error;
        console.log(`[host-ice] STUN attempt ${attempt} to ${server} failed:`, lastError.message);
      }
    }
    throw new Error(`STUN binding to ${server} failed after ${STUN_RETRIES + 1} attempts: ${lastError?.message}`);
  }

  // -----------------------------------------------------------------------
  // UDP Port Allocation
  // -----------------------------------------------------------------------

  private allocateUDPPort(ip: string): Promise<{ socket: dgram.Socket; port: number }> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      socket.once('error', reject);
      socket.bind(0, ip, () => {
        const addr = socket.address();
        socket.removeListener('error', reject);
        resolve({ socket, port: addr.port });
      });
    });
  }
}

// ---------------------------------------------------------------------------
// STUN Binding Request (RFC 5389)
// ---------------------------------------------------------------------------

/**
 * Send a STUN Binding Request to the given server and parse the
 * XOR-MAPPED-ADDRESS from the response. Returns the discovered
 * public IP and port.
 *
 * STUN Binding Request format (20 bytes):
 *   Bytes 0-1:  Message Type (0x0001)
 *   Bytes 2-3:  Message Length (0)
 *   Bytes 4-7:  Magic Cookie (0x2112A442)
 *   Bytes 8-19: Transaction ID (12 random bytes)
 */
export function stunBindingRequest(stunServer: string): Promise<IceCandidate> {
  return new Promise((resolve, reject) => {
    // Add default port if missing.
    let host = stunServer;
    let port = 3478;
    if (stunServer.includes(':')) {
      const parts = stunServer.split(':');
      host = parts[0];
      port = parseInt(parts[1], 10);
    }

    // Build the 20-byte STUN Binding Request.
    const request = Buffer.alloc(STUN_HEADER_SIZE);

    // Message Type: Binding Request.
    request.writeUInt16BE(STUN_BINDING_REQUEST, 0);
    // Message Length: 0.
    request.writeUInt16BE(0, 2);
    // Magic Cookie.
    request.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
    // Transaction ID: 12 random bytes.
    const transactionId = crypto.randomBytes(STUN_TRANSACTION_ID_SIZE);
    transactionId.copy(request, 8);

    const socket = dgram.createSocket('udp4');
    let settled = false;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        try { socket.close(); } catch { /* ignore */ }
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`STUN request to ${stunServer} timed out`));
    }, STUN_TIMEOUT);

    socket.once('error', (err) => {
      clearTimeout(timer);
      cleanup();
      reject(err);
    });

    socket.once('message', (msg) => {
      clearTimeout(timer);
      cleanup();
      try {
        const candidate = parseStunResponse(msg, transactionId);
        resolve(candidate);
      } catch (err) {
        reject(err);
      }
    });

    socket.send(request, port, host, (err) => {
      if (err) {
        clearTimeout(timer);
        cleanup();
        reject(new Error(`Failed to send STUN request: ${err.message}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// STUN Response Parser
// ---------------------------------------------------------------------------

function parseStunResponse(response: Buffer, expectedTxnId: Buffer): IceCandidate {
  if (response.length < STUN_HEADER_SIZE) {
    throw new Error(`STUN response too short: ${response.length} bytes`);
  }

  // Verify message type is Binding Success Response.
  const msgType = response.readUInt16BE(0);
  if (msgType !== STUN_BINDING_RESPONSE) {
    throw new Error(`Unexpected STUN message type: 0x${msgType.toString(16)}`);
  }

  // Verify magic cookie.
  const cookie = response.readUInt32BE(4);
  if (cookie !== STUN_MAGIC_COOKIE) {
    throw new Error(`Invalid STUN magic cookie: 0x${cookie.toString(16)}`);
  }

  // Verify transaction ID.
  const txnId = response.subarray(8, 20);
  if (!txnId.equals(expectedTxnId)) {
    throw new Error('STUN transaction ID mismatch');
  }

  const msgLen = response.readUInt16BE(2);
  if (STUN_HEADER_SIZE + msgLen > response.length) {
    throw new Error(`STUN message length ${msgLen} exceeds response size`);
  }

  // Parse attributes.
  const attrs = response.subarray(STUN_HEADER_SIZE, STUN_HEADER_SIZE + msgLen);
  let fallbackCandidate: IceCandidate | null = null;
  let offset = 0;

  while (offset + 4 <= attrs.length) {
    const attrType = attrs.readUInt16BE(offset);
    const attrLen = attrs.readUInt16BE(offset + 2);
    const attrValue = attrs.subarray(offset + 4, offset + 4 + attrLen);

    if (attrType === STUN_ATTR_XOR_MAPPED_ADDRESS) {
      const c = parseXorMappedAddress(attrValue, response.subarray(4, 8), response.subarray(8, 20));
      if (c) return c;
    } else if (attrType === STUN_ATTR_MAPPED_ADDRESS) {
      const c = parseMappedAddress(attrValue);
      if (c) fallbackCandidate = c;
    }

    // Pad to 4-byte boundary.
    const padded = attrLen % 4 === 0 ? attrLen : attrLen + (4 - (attrLen % 4));
    offset += 4 + padded;
  }

  if (fallbackCandidate) return fallbackCandidate;
  throw new Error('No MAPPED-ADDRESS or XOR-MAPPED-ADDRESS in STUN response');
}

/**
 * Decode XOR-MAPPED-ADDRESS: port XOR'd with top 16 bits of magic cookie,
 * IPv4 address XOR'd with full 32-bit magic cookie.
 */
function parseXorMappedAddress(
  value: Buffer,
  magicCookieBytes: Buffer,
  _transactionId: Buffer,
): IceCandidate | null {
  if (value.length < 8) return null;

  const family = value[1];
  if (family !== STUN_FAMILY_IPV4) return null;

  // XOR port.
  const xorPort = value.readUInt16BE(2);
  const port = xorPort ^ (STUN_MAGIC_COOKIE >>> 16);

  // XOR IPv4 address.
  const magicBuf = Buffer.alloc(4);
  magicBuf.writeUInt32BE(STUN_MAGIC_COOKIE, 0);
  const ipBytes = [
    value[4] ^ magicBuf[0],
    value[5] ^ magicBuf[1],
    value[6] ^ magicBuf[2],
    value[7] ^ magicBuf[3],
  ];

  const ip = ipBytes.join('.');

  return { type: 'host', ip, port, protocol: 'udp', priority: 0, foundation: '' };
}

function parseMappedAddress(value: Buffer): IceCandidate | null {
  if (value.length < 8) return null;
  if (value[1] !== STUN_FAMILY_IPV4) return null;

  const port = value.readUInt16BE(2);
  const ip = `${value[4]}.${value[5]}.${value[6]}.${value[7]}`;

  return { type: 'host', ip, port, protocol: 'udp', priority: 0, foundation: '' };
}

// ---------------------------------------------------------------------------
// Priority Computation (RFC 8445 Section 5.1.2)
// ---------------------------------------------------------------------------

/**
 * priority = (2^24) * type_preference + (2^8) * local_preference + (256 - component_id)
 * component_id = 1 (RTP)
 */
function computePriority(candidateType: string, index: number): number {
  let typePreference: number;
  switch (candidateType) {
    case 'host':  typePreference = 126; break;
    case 'srflx': typePreference = 100; break;
    case 'relay': typePreference = 0;   break;
    default:      typePreference = 50;
  }

  const localPreference = Math.max(0, 65535 - index);
  const componentId = 1;

  return (typePreference * (1 << 24)) + (localPreference * (1 << 8)) + (256 - componentId);
}
