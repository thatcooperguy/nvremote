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
import { HostStatus, SessionStatus } from '@prisma/client';

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

/** Data forwarded to the host agent when a new streaming session is created. */
export interface SessionOfferData {
  sessionId: string;
  clientPublicKey: string;
  clientTunnelIp: string;
  hostTunnelIp: string;
  gatewayEndpoint: string;
  gatewayPublicKey: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/signaling',
  transports: ['websocket', 'polling'],
})
export class SignalingGatewayWs
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SignalingGatewayWs.name);

  /** Map hostId -> socketId for quick lookup */
  private hostSockets = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

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
        metadata: payload.metadata ?? undefined,
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
  // Public methods (called by SessionsService)
  // -----------------------------------------------------------------------

  /**
   * Notify the host agent that a new streaming session has been created.
   *
   * Emits a `session:offer` event to the host's socket room containing the
   * WireGuard and tunnel details the host needs to prepare for the client.
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
}
