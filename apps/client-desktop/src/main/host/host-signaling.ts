/**
 * host-signaling.ts — Host-side P2P Session Handler
 *
 * Ported from:
 *   apps/host-agent/internal/p2p/signaling.go
 *   apps/host-agent/internal/heartbeat/websocket.go
 *
 * Uses socket.io-client (already a dependency) for real-time signaling
 * with the NVRemote control plane. Handles session offers, ICE exchange,
 * and coordinates with the streamer process.
 */

import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import type { HostStreamer, SessionConfig, PeerInfo, SessionStats } from './host-streamer';
import { IceAgent, type IceCandidate } from './host-ice';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TurnServerConfig {
  urls: string;
  username: string;
  credential: string;
}

interface SessionOffer {
  sessionId: string;
  userId: string;
  codecs: string[];
  maxBitrate: number;
  targetFps: number;
  resolution: string;
  gamingMode: string | boolean;
  stunServers: string[];
  turnServers: TurnServerConfig[];
}

interface SessionState {
  sessionId: string;
  offer: SessionOffer;
  localCandidates: IceCandidate[];
  remoteCandidates: IceCandidate[];
  selectedPeer: PeerInfo | null;
  state: 'preparing' | 'gathering' | 'connecting' | 'active' | 'closed';
  connectionType: string;
  createdAt: Date;
}

interface HostCapabilityPayload {
  sessionId: string;
  gpu: { name: string; vram?: number; nvencGen?: string };
  encoders: string[];
  maxEncode?: Record<string, string>;
  captureApi: string;
  displays?: Array<{ width: number; height: number; refreshRate: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QOS_INTERVAL = 2_000; // 2s stats polling
const RECONNECT_DELAY_MIN = 1_000;
const RECONNECT_DELAY_MAX = 120_000;

// ---------------------------------------------------------------------------
// HostSignaling
// ---------------------------------------------------------------------------

export class HostSignaling extends EventEmitter {
  private socket: Socket | null = null;
  private streamer: HostStreamer;
  private iceAgent: IceAgent | null = null;
  private currentSession: SessionState | null = null;
  private stunServers: string[];
  private qosTimer: ReturnType<typeof setInterval> | null = null;
  private hostId: string = '';
  private apiToken: string = '';
  private controlPlaneUrl: string = '';

  constructor(streamer: HostStreamer, stunServers: string[]) {
    super();
    this.streamer = streamer;
    this.stunServers = stunServers;
  }

  // -----------------------------------------------------------------------
  // Connection
  // -----------------------------------------------------------------------

  /**
   * Connect to the signaling server via Socket.IO.
   * Uses a SEPARATE socket.io-client instance from the client-side signaling
   * so "Both" mode works (host uses api_token, client uses user access_token).
   */
  connect(controlPlaneUrl: string, hostId: string, apiToken: string): void {
    if (this.socket?.connected) {
      console.log('[host-signaling] already connected');
      return;
    }

    this.controlPlaneUrl = controlPlaneUrl;
    this.hostId = hostId;
    this.apiToken = apiToken;

    console.log(`[host-signaling] connecting to ${controlPlaneUrl}/signaling`);

    this.socket = io(`${controlPlaneUrl}/signaling`, {
      auth: { token: apiToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: RECONNECT_DELAY_MIN,
      reconnectionDelayMax: RECONNECT_DELAY_MAX,
      reconnectionAttempts: Infinity,
      forceNew: true, // Separate instance from client's socket
    });

    this.setupEventHandlers();
  }

  /** Disconnect from the signaling server. */
  disconnect(): void {
    this.stopQosReporter();

    if (this.iceAgent) {
      this.iceAgent.close();
      this.iceAgent = null;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.currentSession = null;
    console.log('[host-signaling] disconnected');
  }

  /** Returns true if connected to signaling. */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Get current session state. */
  getCurrentSession(): SessionState | null {
    return this.currentSession;
  }

  // -----------------------------------------------------------------------
  // Socket.IO Event Handlers
  // -----------------------------------------------------------------------

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[host-signaling] connected to signaling server');
      // Register as a host.
      this.socket!.emit('host:register', { hostId: this.hostId });
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`[host-signaling] disconnected: ${reason}`);
      this.stopQosReporter();
      this.emit('disconnected', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.warn(`[host-signaling] connect error: ${err.message}`);
      this.emit('error', err);
    });

    // Inbound session offer from client.
    this.socket.on('session:offer', (data: SessionOffer) => {
      this.handleSessionOffer(data).catch((err) => {
        console.error('[host-signaling] error handling session offer:', err.message);
        this.emit('session-error', { sessionId: data.sessionId, error: err.message });
      });
    });

    // Remote ICE candidate from client.
    this.socket.on('ice:candidate', (data: { sessionId: string; candidate: IceCandidate }) => {
      this.handleIceCandidate(data.sessionId, data.candidate);
    });

    // Remote ICE gathering complete.
    this.socket.on('ice:complete', (data: { sessionId: string }) => {
      this.handleIceComplete(data.sessionId).catch((err) => {
        console.error('[host-signaling] error handling ICE complete:', err.message);
      });
    });

    // Session end from server/client.
    this.socket.on('session:end', (data: { sessionId: string; reason?: string }) => {
      this.handleSessionEnd(data.sessionId);
    });

    this.socket.on('session:ended', (data: { sessionId: string; reason?: string }) => {
      this.handleSessionEnd(data.sessionId);
    });

    // QoS profile change from server.
    this.socket.on('qos:profile-change', (data: { sessionId: string; profile: string }) => {
      if (this.currentSession?.sessionId === data.sessionId) {
        this.streamer.setGamingMode(data.profile).catch((err) => {
          console.warn('[host-signaling] failed to set gaming mode:', err.message);
        });
      }
    });

    // Capability negotiation.
    this.socket.on('capability:client', (data: { sessionId: string }) => {
      console.log(`[host-signaling] received client capabilities for ${data.sessionId}`);
    });

    this.socket.on('capability:ack', (data: { sessionId: string }) => {
      console.log(`[host-signaling] capability negotiation complete for ${data.sessionId}`);
    });
  }

  // -----------------------------------------------------------------------
  // Session Offer Handling
  // -----------------------------------------------------------------------

  private async handleSessionOffer(offer: SessionOffer): Promise<void> {
    console.log(`[host-signaling] session offer: ${offer.sessionId} from ${offer.userId} codecs=${offer.codecs}`);

    // Close existing session if any.
    if (this.currentSession && this.currentSession.state !== 'closed') {
      console.warn('[host-signaling] closing existing session:', this.currentSession.sessionId);
      try {
        await this.streamer.stopSession(this.currentSession.sessionId);
      } catch { /* ignore */ }
      if (this.iceAgent) {
        this.iceAgent.close();
        this.iceAgent = null;
      }
    }

    // New session state.
    const session: SessionState = {
      sessionId: offer.sessionId,
      offer,
      localCandidates: [],
      remoteCandidates: [],
      selectedPeer: null,
      state: 'preparing',
      connectionType: '',
      createdAt: new Date(),
    };
    this.currentSession = session;

    // Step 1: Select codec.
    const selectedCodec = selectCodec(offer.codecs);
    if (!selectedCodec) {
      this.sendSessionReject(offer.sessionId, 'no supported codec');
      return;
    }

    // Step 2: Parse resolution.
    let { width, height } = parseResolution(offer.resolution);

    // Step 3: Determine gaming mode.
    let gamingMode = 'balanced';
    if (typeof offer.gamingMode === 'string') {
      gamingMode = offer.gamingMode;
    } else if (offer.gamingMode === true) {
      gamingMode = 'competitive';
    }

    // Step 4: Prepare streamer.
    const sessionConfig: SessionConfig = {
      sessionId: offer.sessionId,
      codec: selectedCodec,
      bitrateKbps: offer.maxBitrate,
      fps: offer.targetFps,
      width,
      height,
      gamingMode,
      stunServers: offer.stunServers,
    };

    try {
      await this.streamer.prepareSession(sessionConfig);
    } catch (err) {
      console.error('[host-signaling] streamer prepare failed:', (err as Error).message);
      this.sendSessionReject(offer.sessionId, 'streamer preparation failed');
      return;
    }

    session.state = 'gathering';

    // Step 5: Gather ICE candidates.
    const stunServers = offer.stunServers.length > 0 ? offer.stunServers : this.stunServers;
    this.iceAgent = new IceAgent(stunServers);

    let candidates: IceCandidate[];
    try {
      candidates = await this.iceAgent.gatherCandidates();
    } catch (err) {
      console.error('[host-signaling] ICE gathering failed:', (err as Error).message);
      this.sendSessionReject(offer.sessionId, 'ICE gathering failed');
      return;
    }

    session.localCandidates = candidates;

    // Step 6: Send each ICE candidate.
    for (const candidate of candidates) {
      this.socket?.emit('ice:candidate', {
        sessionId: offer.sessionId,
        candidate,
      });
    }

    // Signal gathering complete.
    this.socket?.emit('ice:complete', { sessionId: offer.sessionId });

    // Step 7: Get capabilities and send answer.
    let caps = null;
    try {
      caps = await this.streamer.getCapabilities();
    } catch {
      // Non-fatal.
    }

    const answer = {
      session_id: offer.sessionId,
      codec: selectedCodec,
      capabilities: caps ?? {},
      candidates,
    };

    this.socket?.emit('session:answer', answer);

    // Step 8: Send host capabilities.
    this.sendHostCapabilities(offer.sessionId, caps);

    session.state = 'connecting';

    console.log(
      `[host-signaling] answer sent for ${offer.sessionId}: codec=${selectedCodec}, candidates=${candidates.length}`,
    );

    this.emit('session-started', {
      sessionId: offer.sessionId,
      codec: selectedCodec,
      userId: offer.userId,
    });
  }

  // -----------------------------------------------------------------------
  // ICE Candidate Handling
  // -----------------------------------------------------------------------

  private handleIceCandidate(sessionId: string, candidate: IceCandidate): void {
    if (!this.currentSession || this.currentSession.sessionId !== sessionId) {
      console.warn(`[host-signaling] ICE candidate for unknown session: ${sessionId}`);
      return;
    }

    console.log(
      `[host-signaling] remote ICE: ${candidate.type} ${candidate.ip}:${candidate.port}`,
    );

    this.currentSession.remoteCandidates.push(candidate);
  }

  private async handleIceComplete(sessionId: string): Promise<void> {
    if (!this.currentSession || this.currentSession.sessionId !== sessionId) {
      console.warn(`[host-signaling] ICE complete for unknown session: ${sessionId}`);
      return;
    }

    const session = this.currentSession;

    console.log(
      `[host-signaling] remote ICE complete: ${session.remoteCandidates.length} candidates`,
    );

    if (session.remoteCandidates.length === 0) {
      throw new Error(`No remote ICE candidates received for session ${sessionId}`);
    }

    // Select best remote candidate.
    const peer = selectBestPeer(session.remoteCandidates);
    if (!peer) {
      throw new Error('Could not select a suitable peer from remote candidates');
    }

    session.selectedPeer = peer;
    session.connectionType = determinConnectionType(session.remoteCandidates);

    console.log(
      `[host-signaling] selected peer: ${peer.ip}:${peer.port} (${session.connectionType})`,
    );

    // Start streaming.
    await this.streamer.startSession(peer);

    session.state = 'active';
    console.log(`[host-signaling] session ${sessionId} is now active`);

    // Start QoS reporter.
    this.startQosReporter(sessionId);

    this.emit('session-active', {
      sessionId,
      connectionType: session.connectionType,
      peerIp: peer.ip,
    });
  }

  // -----------------------------------------------------------------------
  // Session End
  // -----------------------------------------------------------------------

  private handleSessionEnd(sessionId: string): void {
    if (!this.currentSession || this.currentSession.sessionId !== sessionId) {
      return;
    }

    console.log(`[host-signaling] ending session ${sessionId}`);

    this.stopQosReporter();

    this.streamer.stopSession(sessionId).catch((err) => {
      console.warn('[host-signaling] failed to stop streamer session:', err.message);
    });

    if (this.iceAgent) {
      this.iceAgent.close();
      this.iceAgent = null;
    }

    this.currentSession.state = 'closed';
    this.currentSession = null;

    this.emit('session-ended', { sessionId });
  }

  // -----------------------------------------------------------------------
  // QoS Stats Reporter
  // -----------------------------------------------------------------------

  private startQosReporter(sessionId: string): void {
    this.stopQosReporter();

    console.log(`[host-signaling] QoS reporter started for ${sessionId}`);

    this.qosTimer = setInterval(async () => {
      if (
        !this.currentSession ||
        this.currentSession.sessionId !== sessionId ||
        this.currentSession.state !== 'active' ||
        !this.socket?.connected
      ) {
        return;
      }

      try {
        const stats: SessionStats = await this.streamer.getStats();
        const payload = {
          sessionId,
          bitrateKbps: stats.bitrateKbps,
          fps: stats.fps,
          width: stats.width,
          height: stats.height,
          codec: stats.codec,
          profile: stats.gamingMode,
          packetLossPercent: stats.packetLoss,
          rttMs: stats.rttMs,
          jitterMs: stats.jitterMs,
          fecRatio: stats.fecRatio,
          estimatedBwKbps: stats.estimatedBwKbps,
          decodeTimeUs: stats.decodeTimeUs,
          qosState: stats.qosState,
        };

        this.socket?.emit('qos:stats', payload);
        this.emit('streamer-stats', payload);
      } catch {
        // Stats unavailable — skip this tick.
      }
    }, QOS_INTERVAL);
  }

  private stopQosReporter(): void {
    if (this.qosTimer) {
      clearInterval(this.qosTimer);
      this.qosTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Outbound Messages
  // -----------------------------------------------------------------------

  private sendSessionReject(sessionId: string, reason: string): void {
    console.warn(`[host-signaling] rejecting session ${sessionId}: ${reason}`);
    this.socket?.emit('session:reject', { sessionId, reason });
    if (this.currentSession?.sessionId === sessionId) {
      this.currentSession.state = 'closed';
      this.currentSession = null;
    }
  }

  private sendHostCapabilities(
    sessionId: string,
    caps: Awaited<ReturnType<HostStreamer['getCapabilities']>> | null,
  ): void {
    const gpu: HostCapabilityPayload['gpu'] = { name: '' };
    let encoders: string[] = [];
    const maxEncode: Record<string, string> = {};

    if (caps) {
      gpu.name = caps.gpuName;
      gpu.nvencGen = caps.nvencVersion;
      encoders = caps.codecs;

      for (const codec of caps.codecs) {
        switch (codec) {
          case 'h264':
            maxEncode['h264'] = `4096x4096@${caps.maxFps}`;
            break;
          case 'h265':
            maxEncode['h265'] = `8192x8192@${caps.maxFps}`;
            break;
          case 'av1':
            maxEncode['av1'] = `8192x8192@${caps.maxFps}`;
            break;
        }
      }
    }

    const payload: HostCapabilityPayload = {
      sessionId,
      gpu,
      encoders,
      maxEncode,
      captureApi: 'nvfbc',
    };

    this.socket?.emit('capability:host', payload);
    console.log(`[host-signaling] sent host capabilities: gpu=${gpu.name} encoders=${encoders}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Select best codec: h265 > h264 > av1 > first available. */
function selectCodec(offered: string[]): string {
  const preferred = ['h265', 'h264', 'av1'];
  for (const pref of preferred) {
    if (offered.includes(pref)) return pref;
  }
  return offered[0] ?? '';
}

/** Select the best remote candidate by priority (highest wins). */
function selectBestPeer(candidates: IceCandidate[]): PeerInfo | null {
  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (const c of candidates) {
    if (c.priority > best.priority) best = c;
  }

  return { ip: best.ip, port: best.port, dtlsFingerprint: '' };
}

/** Parse "1920x1080" → { width, height }. Falls back to 1920x1080. */
function parseResolution(res: string): { width: number; height: number } {
  if (!res) return { width: 1920, height: 1080 };
  const match = res.match(/^(\d+)x(\d+)$/);
  if (!match) return { width: 1920, height: 1080 };
  const w = parseInt(match[1], 10);
  const h = parseInt(match[2], 10);
  if (w <= 0 || h <= 0) return { width: 1920, height: 1080 };
  return { width: w, height: h };
}

/** Determine connection type from the best remote candidate type. */
function determinConnectionType(candidates: IceCandidate[]): string {
  if (candidates.length === 0) return 'unknown';

  // If the best candidate is host → P2P, otherwise relay.
  let best = candidates[0];
  for (const c of candidates) {
    if (c.priority > best.priority) best = c;
  }

  switch (best.type) {
    case 'host':
    case 'srflx':
      return 'p2p';
    case 'relay':
      return 'relay';
    default:
      return 'unknown';
  }
}
