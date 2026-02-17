import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../common/prisma.service';
import { HostStatus, Prisma, SessionStatus } from '@prisma/client';
import { TurnServerConfig } from '../common/gateway.service';

// ---------------------------------------------------------------------------
// Socket & payload types
// ---------------------------------------------------------------------------

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string;
    hostId?: string;
    orgId?: string;
  };
}

interface HostRegisterPayload {
  hostId: string;
}

interface HostHeartbeatPayload {
  hostId: string;
  status?: HostStatus;
}

interface SessionRequestPayload {
  hostId: string;
  metadata?: Record<string, unknown>;
}

interface SessionAcceptPayload {
  sessionId: string;
}

interface SessionEndPayload {
  sessionId: string;
}

// -- ICE / P2P payloads -----------------------------------------------------

interface IceCandidatePayload {
  sessionId: string;
  candidate: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

interface IceCompletePayload {
  sessionId: string;
}

interface P2PEstablishedPayload {
  sessionId: string;
  connectionType?: 'p2p' | 'relay';
}

interface SessionReconnectPayload {
  sessionId: string;
}

// -- Capability negotiation --------------------------------------------------

interface ClientCapabilityPayload {
  sessionId: string;
  display: {
    width: number;
    height: number;
    refreshRate: number;
    hdr?: boolean;
  };
  decoders: string[];
  maxDecode?: Record<string, string>;
  network?: {
    type?: string;
    downlink?: number;
    rtt?: number;
  };
  platform: string;
  input?: {
    touch?: boolean;
    gamepad?: boolean;
    keyboard?: boolean;
  };
}

interface HostCapabilityPayload {
  sessionId: string;
  gpu: {
    name: string;
    vram?: number;
    nvencGen?: string;
  };
  encoders: string[];
  maxEncode?: Record<string, string>;
  captureApi?: string;
  displays?: Array<{
    width: number;
    height: number;
    refreshRate: number;
  }>;
}

// -- QoS stat reporting & profile control -----------------------------------

interface QosStatsPayload {
  sessionId: string;
  bitrateKbps: number;
  fps: number;
  width: number;
  height: number;
  codec: string;
  profile: string;
  packetLossPercent: number;
  rttMs: number;
  jitterMs: number;
  fecRatio: number;
  estimatedBwKbps: number;
  decodeTimeUs?: number;
  qosState: 'INCREASE' | 'HOLD' | 'DECREASE';
}

interface QosProfileChangePayload {
  sessionId: string;
  profile: string;  // e.g. 'Competitive', 'Balanced', 'Cinematic', 'Creative', 'CAD', 'MobileSaver', 'LAN'
}

// ---------------------------------------------------------------------------
// Data forwarded to the host agent when a new streaming session is created.
// ---------------------------------------------------------------------------

/** P2P session offer sent to the host agent. */
export interface SessionOfferData {
  sessionId: string;
  stunServers: string[];
  turnServers?: TurnServerConfig[];
  codecs: string[];
  gamingMode: boolean;
  maxBitrate: number | null;
  targetFps: number | null;
  resolution: string | null;
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()) || ['https://nvremote.com'] },
  namespace: '/signaling',
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 65536, // 64KB cap — prevents DoS via oversized payloads
})
export class SignalingGatewayWs
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SignalingGatewayWs.name);

  /** Map hostId -> socketId for quick lookup */
  private hostSockets = new Map<string, string>();

  /**
   * Callback for web client SDP answer relay.
   * Set by WebRtcRelayService on init to avoid circular dependency.
   */
  private onWebRtcAnswer?: (sessionId: string, sdp: string, type: string) => void;

  /**
   * Callback for web client ICE candidate relay (host → web client).
   * Set by WebRtcRelayService on init.
   */
  private onWebRtcHostCandidate?: (
    sessionId: string,
    candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null },
  ) => void;

  /**
   * Callback for web client ICE gathering complete.
   */
  private onWebRtcHostGatheringComplete?: (sessionId: string) => void;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Register callbacks for web client WebRTC relay.
   * Called by WebRtcRelayService to avoid circular dependency.
   */
  registerWebRtcRelayCallbacks(callbacks: {
    onAnswer: (sessionId: string, sdp: string, type: string) => void;
    onHostCandidate: (
      sessionId: string,
      candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null },
    ) => void;
    onHostGatheringComplete: (sessionId: string) => void;
  }): void {
    this.onWebRtcAnswer = callbacks.onAnswer;
    this.onWebRtcHostCandidate = callbacks.onHostCandidate;
    this.onWebRtcHostGatheringComplete = callbacks.onHostGatheringComplete;
    this.logger.log('WebRTC relay callbacks registered');
  }

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        throw new WsException('Missing authentication token');
      }

      const payload = this.jwtService.verify<{ sub: string; email: string }>(
        token,
      );

      client.data.userId = payload.sub;

      // Join user to their personal room
      await client.join(`user:${payload.sub}`);

      // Join all org rooms the user belongs to
      const memberships = await this.prisma.orgMember.findMany({
        where: { userId: payload.sub },
        select: { orgId: true },
      });

      for (const m of memberships) {
        await client.join(`org:${m.orgId}`);
      }

      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub})`);
    } catch (error) {
      this.logger.warn(
        `WebSocket authentication failed for ${client.id}: ${(error as Error).message}`,
      );
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const { hostId } = client.data;

    // If this was a host agent socket, mark the host offline
    if (hostId) {
      this.hostSockets.delete(hostId);
      await this.prisma.host.update({
        where: { id: hostId },
        data: { status: HostStatus.OFFLINE },
      }).catch(() => {
        // host may have been deleted
      });

      const host = await this.prisma.host.findUnique({
        where: { id: hostId },
        select: { orgId: true },
      });

      if (host) {
        this.server
          .to(`org:${host.orgId}`)
          .emit('host:status', { hostId, status: HostStatus.OFFLINE });
      }
    }

    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // -----------------------------------------------------------------------
  // Host agent messages
  // -----------------------------------------------------------------------

  @SubscribeMessage('host:register')
  async handleHostRegister(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: HostRegisterPayload,
  ): Promise<{ success: boolean }> {
    const host = await this.prisma.host.findUnique({
      where: { id: payload.hostId },
    });

    if (!host) {
      throw new WsException('Host not found');
    }

    // Verify the authenticated user is a member of the host's org
    const userId = client.data.userId;
    if (userId) {
      const membership = await this.prisma.orgMember.findUnique({
        where: { userId_orgId: { userId, orgId: host.orgId } },
      });
      if (!membership) {
        throw new WsException('Not authorized for this host');
      }
    }

    // Associate the socket with this host
    client.data.hostId = host.id;
    client.data.orgId = host.orgId;
    this.hostSockets.set(host.id, client.id);

    // Join the org room
    await client.join(`org:${host.orgId}`);
    await client.join(`host:${host.id}`);

    // Mark host online
    await this.prisma.host.update({
      where: { id: host.id },
      data: { status: HostStatus.ONLINE, lastSeenAt: new Date() },
    });

    // Broadcast status change
    this.server
      .to(`org:${host.orgId}`)
      .emit('host:status', { hostId: host.id, status: HostStatus.ONLINE });

    this.logger.log(`Host ${host.id} registered on socket ${client.id}`);

    return { success: true };
  }

  @SubscribeMessage('host:heartbeat')
  async handleHostHeartbeat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: HostHeartbeatPayload,
  ): Promise<{ success: boolean }> {
    const hostId = client.data.hostId ?? payload.hostId;

    if (!hostId) {
      throw new WsException('No host registered on this socket');
    }

    await this.prisma.host.update({
      where: { id: hostId },
      data: {
        status: payload.status ?? HostStatus.ONLINE,
        lastSeenAt: new Date(),
      },
    });

    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Session messages
  // -----------------------------------------------------------------------

  @SubscribeMessage('session:request')
  async handleSessionRequest(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SessionRequestPayload,
  ): Promise<{ sessionId: string }> {
    const userId = client.data.userId;

    if (!userId) {
      throw new WsException('Not authenticated');
    }

    const host = await this.prisma.host.findUnique({
      where: { id: payload.hostId },
    });

    if (!host || host.status !== HostStatus.ONLINE) {
      throw new WsException('Host not available');
    }

    // Verify membership
    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_orgId: { userId, orgId: host.orgId } },
    });

    if (!membership) {
      throw new WsException('Access denied');
    }

    const session = await this.prisma.session.create({
      data: {
        userId,
        hostId: host.id,
        status: SessionStatus.PENDING,
        metadata: (payload.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });

    // Notify the host agent
    this.server.to(`host:${host.id}`).emit('session:incoming', {
      sessionId: session.id,
      userId,
    });

    this.logger.log(
      `Session ${session.id} requested by ${userId} on host ${host.id}`,
    );

    return { sessionId: session.id };
  }

  @SubscribeMessage('session:accept')
  async handleSessionAccept(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SessionAcceptPayload,
  ): Promise<{ success: boolean }> {
    const hostId = client.data.hostId;

    if (!hostId) {
      throw new WsException('Only host agents can accept sessions');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || session.hostId !== hostId) {
      throw new WsException('Session not found on this host');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { status: SessionStatus.ACTIVE },
    });

    // Notify the requesting user
    this.server.to(`user:${session.userId}`).emit('session:accepted', {
      sessionId: session.id,
      hostId,
    });

    this.logger.log(`Session ${session.id} accepted by host ${hostId}`);

    return { success: true };
  }

  @SubscribeMessage('session:end')
  async handleSessionEnd(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SessionEndPayload,
  ): Promise<{ success: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session) {
      throw new WsException('Session not found');
    }

    // Either the user or the host agent can end a session
    const isUser = client.data.userId === session.userId;
    const isHost = client.data.hostId === session.hostId;

    if (!isUser && !isHost) {
      throw new WsException('Not authorised to end this session');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { status: SessionStatus.ENDED, endedAt: new Date() },
    });

    // Notify both parties
    this.server.to(`user:${session.userId}`).emit('session:ended', {
      sessionId: session.id,
    });
    this.server.to(`host:${session.hostId}`).emit('session:ended', {
      sessionId: session.id,
    });

    this.logger.log(`Session ${session.id} ended`);

    return { success: true };
  }

  // -----------------------------------------------------------------------
  // ICE signaling relay
  // -----------------------------------------------------------------------

  /**
   * Relay an ICE candidate from one peer to the other.
   *
   * Either the client (identified by userId) or the host (identified by
   * hostId on the socket) can send candidates.  The server looks up the
   * session, verifies the sender is a participant, and forwards the
   * candidate to the other side.
   */
  @SubscribeMessage('ice:candidate')
  async handleIceCandidate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IceCandidatePayload,
  ): Promise<{ success: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session) {
      throw new WsException('Session not found');
    }

    const isUser = client.data.userId === session.userId;
    const isHost = client.data.hostId === session.hostId;

    if (!isUser && !isHost) {
      throw new WsException('Not a participant of this session');
    }

    // Relay to the other peer
    if (isUser) {
      // Client sent candidate -> forward to host
      this.server.to(`host:${session.hostId}`).emit('ice:candidate', {
        sessionId: session.id,
        candidate: payload.candidate,
        from: 'client',
      });
    } else {
      // Host sent candidate -> forward to client
      this.server.to(`user:${session.userId}`).emit('ice:candidate', {
        sessionId: session.id,
        candidate: payload.candidate,
        from: 'host',
      });
    }

    return { success: true };
  }

  /**
   * Relay an ICE gathering complete signal from one peer to the other.
   *
   * Sent when a peer has finished gathering all its ICE candidates
   * (equivalent to a null candidate in the WebRTC API).
   */
  @SubscribeMessage('ice:complete')
  async handleIceComplete(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: IceCompletePayload,
  ): Promise<{ success: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session) {
      throw new WsException('Session not found');
    }

    const isUser = client.data.userId === session.userId;
    const isHost = client.data.hostId === session.hostId;

    if (!isUser && !isHost) {
      throw new WsException('Not a participant of this session');
    }

    const from = isUser ? 'client' : 'host';

    if (isUser) {
      this.server.to(`host:${session.hostId}`).emit('ice:complete', {
        sessionId: session.id,
        from,
      });
    } else {
      this.server.to(`user:${session.userId}`).emit('ice:complete', {
        sessionId: session.id,
        from,
      });
    }

    this.logger.debug(
      `ICE gathering complete for session ${session.id} (from: ${from})`,
    );

    return { success: true };
  }

  /**
   * Handle notification that a P2P connection has been established.
   *
   * Either side can emit this once the ICE connection state reaches
   * "connected".  The server updates the session metadata with the
   * connection type and notifies the other peer.
   */
  @SubscribeMessage('session:p2p-established')
  async handleP2PEstablished(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: P2PEstablishedPayload,
  ): Promise<{ success: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session) {
      throw new WsException('Session not found');
    }

    const isUser = client.data.userId === session.userId;
    const isHost = client.data.hostId === session.hostId;

    if (!isUser && !isHost) {
      throw new WsException('Not a participant of this session');
    }

    // Update session metadata with the connection type
    const existingMeta = (session.metadata as Record<string, unknown>) ?? {};
    const connectionType = payload.connectionType ?? 'p2p';

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        metadata: {
          ...existingMeta,
          connectionType,
          p2pEstablishedAt: new Date().toISOString(),
        },
      },
    });

    const from = isUser ? 'client' : 'host';

    // Notify the other peer
    if (isUser) {
      this.server.to(`host:${session.hostId}`).emit('session:p2p-established', {
        sessionId: session.id,
        connectionType,
        from,
      });
    } else {
      this.server.to(`user:${session.userId}`).emit('session:p2p-established', {
        sessionId: session.id,
        connectionType,
        from,
      });
    }

    this.logger.log(
      `P2P connection established for session ${session.id} ` +
        `(type: ${connectionType}, reported by: ${from})`,
    );

    return { success: true };
  }

  // -----------------------------------------------------------------------
  // session:reconnect -- ICE restart for minimal reconnect
  // -----------------------------------------------------------------------

  @SubscribeMessage('session:reconnect')
  async handleSessionReconnect(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SessionReconnectPayload,
  ): Promise<{ success: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session) {
      throw new WsException('Session not found');
    }

    if (session.status !== 'ACTIVE') {
      throw new WsException('Session is not active');
    }

    const isUser = client.data.userId === session.userId;
    const isHost = client.data.hostId === session.hostId;

    if (!isUser && !isHost) {
      throw new WsException('Not a participant of this session');
    }

    const from = isUser ? 'client' : 'host';

    // Notify the other peer to begin ICE restart
    if (isUser) {
      this.server.to(`host:${session.hostId}`).emit('session:reconnect', {
        sessionId: session.id,
        from,
      });
    } else {
      this.server.to(`user:${session.userId}`).emit('session:reconnect', {
        sessionId: session.id,
        from,
      });
    }

    // Update session metadata
    const existingMeta = (session.metadata as Record<string, unknown>) ?? {};
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        metadata: {
          ...existingMeta,
          lastReconnectAt: new Date().toISOString(),
          reconnectRequestedBy: from,
        },
      },
    });

    this.logger.log(
      `Reconnect requested for session ${session.id} by ${from}`,
    );

    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Capability negotiation
  // -----------------------------------------------------------------------

  /**
   * Client sends its capabilities (display, decoders, network, input).
   * The server stores them on the session and relays to the host.
   */
  @SubscribeMessage('capability:client')
  async handleClientCapability(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ClientCapabilityPayload,
  ): Promise<{ success: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session) throw new WsException('Session not found');

    const isUser = client.data.userId === session.userId;
    if (!isUser) throw new WsException('Not the session client');

    // Store client capabilities in session metadata
    const existingMeta = (session.metadata as Record<string, unknown>) ?? {};
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        metadata: {
          ...existingMeta,
          clientCapabilities: {
            display: payload.display,
            decoders: payload.decoders,
            maxDecode: payload.maxDecode,
            network: payload.network,
            platform: payload.platform,
            input: payload.input,
          },
        },
      },
    });

    // Relay to the host agent
    this.server.to(`host:${session.hostId}`).emit('capability:client', {
      ...payload,
      sessionId: session.id,
    });

    this.logger.log(
      `Client capabilities received for session ${session.id} (platform: ${payload.platform})`,
    );

    return { success: true };
  }

  /**
   * Host sends its capabilities (GPU, encoders, capture API, displays).
   * The server stores them on the session and relays to the client.
   */
  @SubscribeMessage('capability:host')
  async handleHostCapability(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: HostCapabilityPayload,
  ): Promise<{ success: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session) throw new WsException('Session not found');

    const isHost = client.data.hostId === session.hostId;
    if (!isHost) throw new WsException('Not the session host');

    // Store host capabilities in session metadata
    const existingMeta = (session.metadata as Record<string, unknown>) ?? {};
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        metadata: {
          ...existingMeta,
          hostCapabilities: {
            gpu: payload.gpu,
            encoders: payload.encoders,
            maxEncode: payload.maxEncode,
            captureApi: payload.captureApi,
            displays: payload.displays,
          },
        },
      },
    });

    // Relay to the client
    this.server.to(`user:${session.userId}`).emit('capability:host', {
      ...payload,
      sessionId: session.id,
    });

    // Once both capabilities are received, send an ack to both parties
    const updatedSession = await this.prisma.session.findUnique({
      where: { id: session.id },
    });
    const meta = (updatedSession?.metadata as Record<string, unknown>) ?? {};
    if (meta.clientCapabilities && meta.hostCapabilities) {
      const ack = {
        sessionId: session.id,
        negotiated: true,
      };
      this.server.to(`user:${session.userId}`).emit('capability:ack', ack);
      this.server.to(`host:${session.hostId}`).emit('capability:ack', ack);

      this.logger.log(
        `Capability negotiation complete for session ${session.id}`,
      );
    }

    return { success: true };
  }

  // -----------------------------------------------------------------------
  // QoS stats & profile control
  // -----------------------------------------------------------------------

  /**
   * Host reports real-time QoS metrics for the active session.
   * Stored on the session metadata for admin dashboard analytics.
   * Sent ~every 2 seconds by the host agent.
   */
  @SubscribeMessage('qos:stats')
  async handleQosStats(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: QosStatsPayload,
  ): Promise<{ success: boolean }> {
    const hostId = client.data.hostId;
    if (!hostId) throw new WsException('Only host agents can report QoS stats');

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || session.hostId !== hostId) {
      throw new WsException('Session not found on this host');
    }

    // Store latest QoS snapshot on session metadata
    const existingMeta = (session.metadata as Record<string, unknown>) ?? {};
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        metadata: {
          ...existingMeta,
          qosStats: {
            bitrateKbps: payload.bitrateKbps,
            fps: payload.fps,
            width: payload.width,
            height: payload.height,
            codec: payload.codec,
            profile: payload.profile,
            packetLossPercent: payload.packetLossPercent,
            rttMs: payload.rttMs,
            jitterMs: payload.jitterMs,
            fecRatio: payload.fecRatio,
            estimatedBwKbps: payload.estimatedBwKbps,
            decodeTimeUs: payload.decodeTimeUs,
            qosState: payload.qosState,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });

    // Also forward to the client so the UI can show real-time stats
    this.server.to(`user:${session.userId}`).emit('qos:stats', {
      ...payload,
      sessionId: session.id,
    });

    return { success: true };
  }

  /**
   * Client requests a streaming profile change during an active session.
   * Relayed to the host agent which applies the new profile to the QoS engine.
   */
  @SubscribeMessage('qos:profile-change')
  async handleQosProfileChange(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: QosProfileChangePayload,
  ): Promise<{ success: boolean }> {
    const userId = client.data.userId;
    if (!userId) throw new WsException('Not authenticated');

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session) throw new WsException('Session not found');
    if (session.userId !== userId) throw new WsException('Not the session owner');
    if (session.status !== 'ACTIVE') throw new WsException('Session is not active');

    // Store the profile change in session metadata
    const existingMeta = (session.metadata as Record<string, unknown>) ?? {};
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        metadata: {
          ...existingMeta,
          streamingProfile: payload.profile,
          profileChangedAt: new Date().toISOString(),
        },
      },
    });

    // Relay to the host agent
    this.server.to(`host:${session.hostId}`).emit('qos:profile-change', {
      sessionId: session.id,
      profile: payload.profile,
    });

    this.logger.log(
      `Profile change requested for session ${session.id}: ${payload.profile}`,
    );

    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Web client WebRTC relay: host → server → web client (via REST polling)
  // -----------------------------------------------------------------------

  /**
   * Host sends an SDP answer in response to a web client's offer.
   * Relayed to WebRtcRelayService which resolves the pending REST request.
   */
  @SubscribeMessage('webrtc:answer')
  async handleWebRtcAnswer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string; sdp: string; type: string },
  ): Promise<{ success: boolean }> {
    const hostId = client.data.hostId;
    if (!hostId) throw new WsException('Only host agents can send SDP answers');

    if (this.onWebRtcAnswer) {
      this.onWebRtcAnswer(payload.sessionId, payload.sdp, payload.type);
    }

    this.logger.log(
      `Host ${hostId} sent SDP answer for session ${payload.sessionId}`,
    );

    return { success: true };
  }

  /**
   * Host sends an ICE candidate for a web client session.
   */
  @SubscribeMessage('webrtc:host-ice-candidate')
  async handleWebRtcHostIceCandidate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: {
      sessionId: string;
      candidate: {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
      };
    },
  ): Promise<{ success: boolean }> {
    const hostId = client.data.hostId;
    if (!hostId) throw new WsException('Only host agents can send ICE candidates');

    if (this.onWebRtcHostCandidate) {
      this.onWebRtcHostCandidate(payload.sessionId, payload.candidate);
    }

    return { success: true };
  }

  /**
   * Host signals ICE gathering complete for a web client session.
   */
  @SubscribeMessage('webrtc:host-ice-complete')
  async handleWebRtcHostIceComplete(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { sessionId: string },
  ): Promise<{ success: boolean }> {
    const hostId = client.data.hostId;
    if (!hostId) throw new WsException('Only host agents can signal ICE complete');

    if (this.onWebRtcHostGatheringComplete) {
      this.onWebRtcHostGatheringComplete(payload.sessionId);
    }

    this.logger.debug(
      `Host ${hostId} ICE gathering complete for session ${payload.sessionId}`,
    );

    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Public methods (called by SessionsService)
  // -----------------------------------------------------------------------

  /**
   * Notify the host agent that a new streaming session has been created.
   *
   * Emits a `session:offer` event to the host's socket room containing the
   * STUN/TURN configuration and client streaming preferences so the host
   * can begin ICE negotiation.
   *
   * @returns `true` if the host had an active socket and was notified.
   */
  notifyHostOfSession(hostId: string, sessionData: SessionOfferData): boolean {
    const socketId = this.hostSockets.get(hostId);

    if (!socketId) {
      this.logger.warn(
        `Cannot notify host ${hostId} of session ${sessionData.sessionId}: no active socket`,
      );
      return false;
    }

    this.server.to(`host:${hostId}`).emit('session:offer', sessionData);

    this.logger.log(
      `Notified host ${hostId} of session ${sessionData.sessionId}`,
    );

    return true;
  }

  /**
   * Notify the host agent that a session has been ended (by the user or the
   * server).  Best-effort -- no error if the host socket is offline.
   */
  notifyHostSessionEnded(hostId: string, sessionId: string): void {
    this.server.to(`host:${hostId}`).emit('session:ended', { sessionId });

    this.logger.log(
      `Notified host ${hostId} that session ${sessionId} ended`,
    );
  }

  // -----------------------------------------------------------------------
  // Web client WebRTC relay (REST → Socket.IO bridge)
  // -----------------------------------------------------------------------

  /**
   * Relay an SDP offer from a web client to the host agent.
   * Called by WebRtcRelayService when the web client POSTs an offer.
   */
  relayWebClientOffer(
    hostId: string,
    data: { sessionId: string; sdp: string; type: string },
  ): void {
    this.server.to(`host:${hostId}`).emit('webrtc:offer', data);
    this.logger.log(
      `Relayed web client SDP offer to host ${hostId} for session ${data.sessionId}`,
    );
  }

  /**
   * Relay an ICE candidate from a web client to the host agent.
   * Called by WebRtcRelayService.
   */
  relayWebClientIceCandidate(
    hostId: string,
    data: {
      sessionId: string;
      candidate: {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
      };
    },
  ): void {
    this.server.to(`host:${hostId}`).emit('webrtc:ice-candidate', {
      ...data,
      from: 'web-client',
    });
  }
}
