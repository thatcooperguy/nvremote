import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SessionStatus, HostStatus, Session } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { IceConfigService } from '../common/gateway.service';
import { SignalingGatewayWs } from '../signaling/signaling.gateway';
import { AuditService } from '../audit/audit.service';
import {
  CreateSessionDto,
  SessionResponseDto,
  SessionConnectionInfoDto,
} from './dto/sessions.dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly iceConfig: IceConfigService,
    private readonly signaling: SignalingGatewayWs,
    private readonly audit: AuditService,
  ) {}

  // -----------------------------------------------------------------------
  // Create session
  // -----------------------------------------------------------------------

  /**
   * Create a new streaming session.
   *
   * 1. Validates user access and host availability.
   * 2. Persists the session with P2P metadata (codec, gaming mode, etc.).
   * 3. Notifies the host agent via the signaling WebSocket with the STUN
   *    server list and client preferences so it can begin ICE negotiation.
   * 4. Returns the STUN/TURN configuration the client needs to start its
   *    own ICE candidate gathering.
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

    // -- Persist session ----------------------------------------------------
    const session = await this.prisma.session.create({
      data: {
        userId,
        hostId: dto.hostId,
        status: SessionStatus.ACTIVE,
        clientIp: dto.clientIp ?? null,
        metadata: {
          ...(dto.metadata ?? {}),
          codec: dto.codecs?.[0] ?? null,
          codecs: dto.codecs ?? [],
          gamingMode: dto.gamingMode ?? false,
          maxBitrate: dto.maxBitrate ?? null,
          targetFps: dto.targetFps ?? null,
          resolution: dto.resolution ?? null,
          connectionType: 'p2p', // will be updated to 'relay' if TURN fallback is used
        },
      },
    });

    this.logger.log(
      `Session ${session.id} created for user ${userId} -> host ${dto.hostId} ` +
        `(codec: ${dto.codecs?.[0] ?? 'default'}, gaming: ${dto.gamingMode ?? false})`,
    );

    // -- Audit log: session started -----------------------------------------
    this.audit.log({
      orgId: host.orgId,
      userId,
      action: 'session.started',
      resourceType: 'session',
      resourceId: session.id,
      metadata: {
        hostId: dto.hostId,
        hostName: host.name,
        codec: dto.codecs?.[0] ?? null,
        gamingMode: dto.gamingMode ?? false,
        maxBitrate: dto.maxBitrate ?? null,
        targetFps: dto.targetFps ?? null,
        resolution: dto.resolution ?? null,
        clientIp: dto.clientIp ?? null,
      },
    });

    // -- Notify host agent --------------------------------------------------
    const stunServers = this.iceConfig.getStunServers();
    const turnServers = this.iceConfig.getTurnServers(session.id);

    const hostNotified = this.signaling.notifyHostOfSession(dto.hostId, {
      sessionId: session.id,
      stunServers,
      turnServers: turnServers.length > 0 ? turnServers : undefined,
      codecs: dto.codecs ?? [],
      gamingMode: dto.gamingMode ?? false,
      maxBitrate: dto.maxBitrate ?? null,
      targetFps: dto.targetFps ?? null,
      resolution: dto.resolution ?? null,
    });

    if (!hostNotified) {
      this.logger.warn(
        `Host ${dto.hostId} could not be notified (socket offline)`,
      );
    }

    // -- Build response -----------------------------------------------------
    return {
      sessionId: session.id,
      stunServers,
      turnServers: turnServers.length > 0 ? turnServers : undefined,
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
      include: { host: { select: { orgId: true, name: true } } },
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

    // -- Mark session as ended in DB ----------------------------------------
    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.ENDED,
        endedAt: new Date(),
      },
    });

    this.logger.log(`Session ${sessionId} ended by user ${userId}`);

    // -- Audit log: session ended -------------------------------------------
    const durationMs = updated.endedAt
      ? updated.endedAt.getTime() - session.startedAt.getTime()
      : 0;
    const meta = (session.metadata as Record<string, unknown>) ?? {};

    this.audit.log({
      orgId: session.host.orgId,
      userId,
      action: 'session.ended',
      resourceType: 'session',
      resourceId: sessionId,
      metadata: {
        hostId: session.hostId,
        hostName: session.host.name,
        durationMs,
        durationFormatted: formatDuration(durationMs),
        codec: meta.codec ?? null,
        gamingMode: meta.gamingMode ?? null,
        connectionType: meta.connectionType ?? null,
      },
    });

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
  // Helpers
  // -----------------------------------------------------------------------

  private toResponse(session: Session): SessionResponseDto {
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

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
