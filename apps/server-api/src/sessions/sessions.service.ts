import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionStatus, HostStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { GatewayService } from '../common/gateway.service';
import { SignalingGatewayWs } from '../signaling/signaling.gateway';
import {
  CreateSessionDto,
  SessionResponseDto,
  SessionConnectionInfoDto,
} from './dto/sessions.dto';

/** Default ports exposed by the Geronimo streaming agent on the host. */
const DEFAULT_GERONIMO_PORTS = { video: 8600, audio: 8601, input: 8602 };

/** CIDR block from which client tunnel IPs are allocated: 10.101.0.0/16. */
const CLIENT_TUNNEL_BASE = 0x0a650000; // 10.101.0.0
const CLIENT_TUNNEL_MIN = 2; // .0.2  -- reserve .0.1 for the gateway
const CLIENT_TUNNEL_MAX = 65534;

/** Routes the WireGuard tunnel should carry -- the entire host address space. */
const ALLOWED_IPS = '10.100.0.0/16';

/** DNS resolver inside the tunnel (typically the gateway itself). */
const TUNNEL_DNS = '10.100.0.1';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly gateway: GatewayService,
    private readonly signaling: SignalingGatewayWs,
  ) {}

  // -----------------------------------------------------------------------
  // Create session
  // -----------------------------------------------------------------------

  /**
   * Create a new streaming session.
   *
   * 1. Validates user access and host availability.
   * 2. Allocates a unique client tunnel IP from 10.101.0.0/16.
   * 3. Registers the client's WireGuard public key with the gateway.
   * 4. Persists the session with tunnel metadata.
   * 5. Notifies the host agent via the signaling WebSocket.
   * 6. Returns the connection info the client needs to configure WireGuard.
   */
  async createSession(
    userId: string,
    dto: CreateSessionDto,
  ): Promise<SessionConnectionInfoDto> {
    // -- Host validation ----------------------------------------------------
    const host = await this.prisma.host.findUnique({
      where: { id: dto.hostId },
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_orgId: { userId, orgId: host.orgId } },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this host');
    }

    if (host.status !== HostStatus.ONLINE) {
      throw new BadRequestException(
        `Host is not available (status: ${host.status})`,
      );
    }

    if (!host.tunnelIp) {
      throw new BadRequestException(
        'Host does not have a tunnel IP assigned',
      );
    }

    // -- Tunnel IP allocation -----------------------------------------------
    const clientTunnelIp = await this.allocateClientTunnelIp();
    const clientAddress = `${clientTunnelIp}/32`;

    // -- Gateway registration -----------------------------------------------
    const serverPublicKey = await this.gateway.getServerPublicKey();

    try {
      await this.gateway.addPeer(dto.clientPublicKey, clientAddress, {
        sessionId: undefined, // will be filled after the DB insert
      });
    } catch (err) {
      this.logger.error(
        `Failed to register client peer with gateway: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Could not register WireGuard peer with the gateway',
      );
    }

    // -- Persist session ----------------------------------------------------
    let session;
    try {
      session = await this.prisma.session.create({
        data: {
          userId,
          hostId: dto.hostId,
          status: SessionStatus.ACTIVE,
          clientIp: dto.clientIp ?? null,
          metadata: {
            ...(dto.metadata ?? {}),
            clientPublicKey: dto.clientPublicKey,
            clientTunnelIp,
            hostTunnelIp: host.tunnelIp,
          },
        },
      });
    } catch (err) {
      // Roll back the gateway peer if the DB insert fails.
      this.logger.error(
        `Session DB insert failed, removing gateway peer: ${(err as Error).message}`,
      );
      await this.gateway.removePeer(dto.clientPublicKey).catch((removeErr) => {
        this.logger.error(
          `Failed to clean up gateway peer after DB error: ${(removeErr as Error).message}`,
        );
      });
      throw new InternalServerErrorException(
        'Failed to create session record',
      );
    }

    // Update the gateway peer metadata with the session ID (best-effort).
    // Not critical -- the peer is already registered.
    this.gateway
      .addPeer(dto.clientPublicKey, clientAddress, {
        sessionId: session.id,
        hostId: dto.hostId,
      })
      .catch(() => {
        // Swallow -- this is a metadata update only.
      });

    this.logger.log(
      `Session ${session.id} created for user ${userId} -> host ${dto.hostId} ` +
        `(client tunnel: ${clientTunnelIp}, host tunnel: ${host.tunnelIp})`,
    );

    // -- Notify host agent --------------------------------------------------
    const hostNotified = this.signaling.notifyHostOfSession(dto.hostId, {
      sessionId: session.id,
      clientPublicKey: dto.clientPublicKey,
      clientTunnelIp,
      hostTunnelIp: host.tunnelIp,
      gatewayEndpoint: this.gateway.gatewayEndpoint,
      gatewayPublicKey: serverPublicKey,
    });

    if (!hostNotified) {
      this.logger.warn(
        `Host ${dto.hostId} could not be notified (socket offline)`,
      );
    }

    // -- Build response -----------------------------------------------------
    const ports = (host.nvstreamerPorts as Record<string, number> | null) ?? {};

    return {
      sessionId: session.id,
      wireguard: {
        clientAddress,
        serverPublicKey,
        serverEndpoint: this.gateway.gatewayEndpoint,
        allowedIps: ALLOWED_IPS,
        dns: TUNNEL_DNS,
      },
      geronimo: {
        hostIp: host.tunnelIp,
        ports: {
          video: ports['video'] ?? DEFAULT_GERONIMO_PORTS.video,
          audio: ports['audio'] ?? DEFAULT_GERONIMO_PORTS.audio,
          input: ports['input'] ?? DEFAULT_GERONIMO_PORTS.input,
        },
      },
    };
  }

  // -----------------------------------------------------------------------
  // End session
  // -----------------------------------------------------------------------

  async endSession(
    sessionId: string,
    userId: string,
  ): Promise<SessionResponseDto> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You can only end your own sessions');
    }

    if (session.status === SessionStatus.ENDED) {
      return this.toResponse(session);
    }

    // -- Remove client peer from the gateway --------------------------------
    const meta = session.metadata as Record<string, unknown> | null;
    const clientPublicKey = meta?.['clientPublicKey'] as string | undefined;

    if (clientPublicKey) {
      try {
        await this.gateway.removePeer(clientPublicKey);
      } catch (err) {
        // Log but do not block session termination.
        this.logger.error(
          `Failed to remove gateway peer for session ${sessionId}: ${(err as Error).message}`,
        );
      }
    }

    // -- Mark session as ended in DB ----------------------------------------
    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.ENDED,
        endedAt: new Date(),
      },
    });

    this.logger.log(`Session ${sessionId} ended by user ${userId}`);

    // -- Notify host agent --------------------------------------------------
    this.signaling.notifyHostSessionEnded(session.hostId, sessionId);

    return this.toResponse(updated);
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  async listSessions(userId: string): Promise<SessionResponseDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });

    return sessions.map(this.toResponse);
  }

  async getSession(
    sessionId: string,
    userId: string,
  ): Promise<SessionResponseDto> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.toResponse(session);
  }

  // -----------------------------------------------------------------------
  // Client tunnel-IP allocation
  // -----------------------------------------------------------------------

  /**
   * Allocate the next available client tunnel IP from the 10.101.0.0/16 range.
   *
   * We look at all ACTIVE sessions' metadata.clientTunnelIp values to find
   * which addresses are currently in use and pick the first free one.
   */
  private async allocateClientTunnelIp(): Promise<string> {
    // Fetch all active sessions that carry a clientTunnelIp in metadata.
    const activeSessions = await this.prisma.session.findMany({
      where: {
        status: { in: [SessionStatus.ACTIVE, SessionStatus.PENDING] },
      },
      select: { metadata: true },
    });

    const usedIps = new Set<string>();
    for (const s of activeSessions) {
      const meta = s.metadata as Record<string, unknown> | null;
      const ip = meta?.['clientTunnelIp'] as string | undefined;
      if (ip) {
        usedIps.add(ip);
      }
    }

    for (let offset = CLIENT_TUNNEL_MIN; offset <= CLIENT_TUNNEL_MAX; offset++) {
      const ipNum = CLIENT_TUNNEL_BASE + offset;
      const ip = [
        (ipNum >>> 24) & 0xff,
        (ipNum >>> 16) & 0xff,
        (ipNum >>> 8) & 0xff,
        ipNum & 0xff,
      ].join('.');

      if (!usedIps.has(ip)) {
        return ip;
      }
    }

    throw new BadRequestException(
      'Client tunnel IP address space exhausted',
    );
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private toResponse(session: any): SessionResponseDto {
    return {
      id: session.id,
      userId: session.userId,
      hostId: session.hostId,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      clientIp: session.clientIp,
      metadata: session.metadata as Record<string, unknown> | null,
    };
  }
}
