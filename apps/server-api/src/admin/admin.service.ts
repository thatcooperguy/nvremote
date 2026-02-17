import { Injectable, Logger } from '@nestjs/common';
import { SessionStatus, HostStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import {
  PlatformStatsDto,
  AdminSessionDto,
  AdminSessionListDto,
  AdminSessionQueryDto,
  AdminHostDto,
  AdminHostQueryDto,
  QosAnalyticsDto,
  ClientInsightsDto,
  ErrorSummaryDto,
  ErrorEntryDto,
} from './dto/admin.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -----------------------------------------------------------------------
  // Platform Statistics
  // -----------------------------------------------------------------------

  async getPlatformStats(): Promise<PlatformStatsDto> {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Run all queries in parallel for performance
    const [
      activeSessions,
      sessions24h,
      sessions7d,
      hostsOnline,
      hostsOffline,
      hostsTotal,
      totalUsers,
      totalOrgs,
      allSessionsToday,
    ] = await Promise.all([
      // Active sessions (PENDING or ACTIVE)
      this.prisma.session.count({
        where: { status: { in: [SessionStatus.PENDING, SessionStatus.ACTIVE] } },
      }),

      // Sessions in last 24h
      this.prisma.session.findMany({
        where: { startedAt: { gte: last24h } },
        select: { status: true, metadata: true },
      }),

      // Sessions in last 7 days
      this.prisma.session.findMany({
        where: { startedAt: { gte: last7d } },
        select: { status: true },
      }),

      // Hosts online
      this.prisma.host.count({
        where: { status: HostStatus.ONLINE, bootstrapToken: null },
      }),

      // Hosts offline
      this.prisma.host.count({
        where: { status: HostStatus.OFFLINE, bootstrapToken: null },
      }),

      // Total registered hosts (exclude pending bootstrap)
      this.prisma.host.count({
        where: { bootstrapToken: null },
      }),

      // Total users
      this.prisma.user.count(),

      // Total orgs
      this.prisma.org.count(),

      // All sessions today (for peak calculation)
      this.prisma.session.findMany({
        where: { startedAt: { gte: todayStart } },
        select: { startedAt: true, endedAt: true, status: true },
      }),
    ]);

    // Calculate success rates
    const completed24h = sessions24h.filter(
      (s) => s.status === SessionStatus.ENDED,
    ).length;
    const failed24h = sessions24h.filter(
      (s) => s.status === SessionStatus.FAILED,
    ).length;
    const total24h = completed24h + failed24h;

    const completed7d = sessions7d.filter(
      (s) => s.status === SessionStatus.ENDED,
    ).length;
    const failed7d = sessions7d.filter(
      (s) => s.status === SessionStatus.FAILED,
    ).length;
    const total7d = completed7d + failed7d;

    // Connection type breakdown (from metadata)
    let p2pSessions = 0;
    let relaySessions = 0;
    for (const s of sessions24h) {
      const meta = s.metadata as Record<string, unknown> | null;
      if (meta?.connectionType === 'relay') {
        relaySessions++;
      } else {
        p2pSessions++;
      }
    }

    // Estimate peak sessions today
    // Simple approach: count overlapping sessions per hour
    const peakSessionsToday = this.estimatePeakSessions(allSessionsToday);

    return {
      activeSessions,
      peakSessionsToday,
      sessionsLast24h: sessions24h.length,
      sessionsLast7d: sessions7d.length,
      successRate24h: total24h > 0 ? Math.round((completed24h / total24h) * 100) : 100,
      successRate7d: total7d > 0 ? Math.round((completed7d / total7d) * 100) : 100,
      hostsOnline,
      hostsOffline,
      hostsTotal,
      totalUsers,
      totalOrgs,
      p2pSessions,
      relaySessions,
    };
  }

  // -----------------------------------------------------------------------
  // Session Explorer
  // -----------------------------------------------------------------------

  async getAdminSessions(query: AdminSessionQueryDto): Promise<AdminSessionListDto> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.hostId) where.hostId = query.hostId;
    if (query.userId) where.userId = query.userId;

    const [sessions, total] = await Promise.all([
      this.prisma.session.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          host: { select: { name: true } },
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.session.count({ where }),
    ]);

    const data: AdminSessionDto[] = sessions.map((s) => {
      const meta = s.metadata as Record<string, unknown> | null;
      const durationMs =
        s.endedAt && s.startedAt
          ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
          : null;

      return {
        id: s.id,
        userId: s.userId,
        userName: s.user?.name ?? null,
        userEmail: s.user?.email ?? null,
        hostId: s.hostId,
        hostName: s.host?.name ?? null,
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMs,
        clientIp: s.clientIp,
        codec: (meta?.codec as string) ?? null,
        connectionType: (meta?.connectionType as string) ?? null,
        gamingMode: (meta?.gamingMode as boolean) ?? null,
        resolution: (meta?.resolution as string) ?? null,
        targetFps: (meta?.targetFps as number) ?? null,
        maxBitrate: (meta?.maxBitrate as number) ?? null,
        metadata: meta,
      };
    });

    return { data, total, page, limit };
  }

  // -----------------------------------------------------------------------
  // Host Management
  // -----------------------------------------------------------------------

  async getAdminHosts(query: AdminHostQueryDto): Promise<AdminHostDto[]> {
    const where: Record<string, unknown> = { bootstrapToken: null };
    if (query.status) where.status = query.status;
    if (query.orgId) where.orgId = query.orgId;

    const hosts = await this.prisma.host.findMany({
      where,
      include: {
        org: { select: { name: true } },
        sessions: {
          select: { status: true },
        },
      },
      orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
    });

    return hosts.map((h) => ({
      id: h.id,
      orgId: h.orgId,
      orgName: h.org?.name ?? null,
      name: h.name,
      hostname: h.hostname,
      status: h.status,
      publicIp: h.publicIp,
      gpuInfo: h.gpuInfo,
      hostVersion: h.hostVersion,
      lastSeenAt: h.lastSeenAt,
      createdAt: h.createdAt,
      activeSessions: h.sessions.filter(
        (s) => s.status === SessionStatus.ACTIVE || s.status === SessionStatus.PENDING,
      ).length,
      totalSessions: h.sessions.length,
    }));
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // QoS Analytics
  // -----------------------------------------------------------------------

  async getQosAnalytics(): Promise<QosAnalyticsDto> {
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const sessions = await this.prisma.session.findMany({
      where: { startedAt: { gte: last7d } },
      select: { metadata: true, status: true },
    });

    const codecDist: Record<string, number> = {};
    const resDist: Record<string, number> = {};
    const profileDist: Record<string, number> = {};
    const connDist: Record<string, number> = {};

    let totalBitrate = 0;
    let totalLoss = 0;
    let totalRtt = 0;
    let totalJitter = 0;
    let statsCount = 0;

    for (const s of sessions) {
      const meta = s.metadata as Record<string, unknown> | null;
      if (!meta) continue;

      // Connection type
      const connType = (meta.connectionType as string) || 'unknown';
      connDist[connType] = (connDist[connType] || 0) + 1;

      // QoS stats from session metadata (written by qos:stats handler)
      const qos = meta.qosStats as Record<string, unknown> | undefined;
      if (qos) {
        const codec = (qos.codec as string) || 'unknown';
        codecDist[codec] = (codecDist[codec] || 0) + 1;

        const w = qos.width as number | undefined;
        const h = qos.height as number | undefined;
        if (w && h) {
          const res = `${w}x${h}`;
          resDist[res] = (resDist[res] || 0) + 1;
        }

        const profile = (qos.profile as string) || 'unknown';
        profileDist[profile] = (profileDist[profile] || 0) + 1;

        if (typeof qos.bitrateKbps === 'number') {
          totalBitrate += qos.bitrateKbps as number;
          statsCount++;
        }
        if (typeof qos.packetLossPercent === 'number') {
          totalLoss += qos.packetLossPercent as number;
        }
        if (typeof qos.rttMs === 'number') {
          totalRtt += qos.rttMs as number;
        }
        if (typeof qos.jitterMs === 'number') {
          totalJitter += qos.jitterMs as number;
        }
      }

      // Fallback: extract codec/profile from capabilities if no QoS stats
      if (!qos) {
        const caps = meta.hostCapabilities as Record<string, unknown> | undefined;
        if (caps?.encoders) {
          const encoders = caps.encoders as string[];
          if (encoders.length > 0) {
            const codec = encoders[0];
            codecDist[codec] = (codecDist[codec] || 0) + 1;
          }
        }

        const profile = (meta.streamingProfile as string) || 'unknown';
        profileDist[profile] = (profileDist[profile] || 0) + 1;
      }
    }

    return {
      codecDistribution: codecDist,
      resolutionDistribution: resDist,
      profileDistribution: profileDist,
      connectionTypeDistribution: connDist,
      avgBitrateKbps: statsCount > 0 ? Math.round(totalBitrate / statsCount) : 0,
      avgPacketLossPercent: statsCount > 0 ? Math.round((totalLoss / statsCount) * 100) / 100 : 0,
      avgRttMs: statsCount > 0 ? Math.round(totalRtt / statsCount) : 0,
      avgJitterMs: statsCount > 0 ? Math.round((totalJitter / statsCount) * 100) / 100 : 0,
      totalSessionsAnalyzed: sessions.length,
    };
  }

  // -----------------------------------------------------------------------
  // Client Insights
  // -----------------------------------------------------------------------

  async getClientInsights(): Promise<ClientInsightsDto> {
    const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const sessions = await this.prisma.session.findMany({
      where: { startedAt: { gte: last30d } },
      select: {
        metadata: true,
        status: true,
        startedAt: true,
        endedAt: true,
        userId: true,
      },
    });

    const platformDist: Record<string, number> = {};
    const platformFailed: Record<string, number> = {};
    const platformTotal: Record<string, number> = {};
    const decoderDist: Record<string, number> = {};
    const platformDuration: Record<string, number[]> = {};
    const uniqueUsers = new Set<string>();

    for (const s of sessions) {
      const meta = s.metadata as Record<string, unknown> | null;
      const clientCaps = meta?.clientCapabilities as Record<string, unknown> | undefined;
      const platform = (clientCaps?.platform as string) || 'unknown';

      platformDist[platform] = (platformDist[platform] || 0) + 1;
      platformTotal[platform] = (platformTotal[platform] || 0) + 1;
      uniqueUsers.add(s.userId);

      if (s.status === SessionStatus.FAILED) {
        platformFailed[platform] = (platformFailed[platform] || 0) + 1;
      }

      // Decoder support
      const decoders = (clientCaps?.decoders as string[]) || [];
      for (const d of decoders) {
        decoderDist[d] = (decoderDist[d] || 0) + 1;
      }

      // Session duration
      if (s.endedAt && s.startedAt) {
        const durationSec = (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000;
        if (!platformDuration[platform]) platformDuration[platform] = [];
        platformDuration[platform].push(durationSec);
      }
    }

    // Calculate failure rates
    const failureRateByPlatform: Record<string, number> = {};
    for (const [platform, total] of Object.entries(platformTotal)) {
      const failed = platformFailed[platform] || 0;
      failureRateByPlatform[platform] = total > 0 ? Math.round((failed / total) * 10000) / 100 : 0;
    }

    // Calculate average duration
    const avgSessionDurationByPlatform: Record<string, number> = {};
    for (const [platform, durations] of Object.entries(platformDuration)) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      avgSessionDurationByPlatform[platform] = Math.round(avg);
    }

    return {
      platformDistribution: platformDist,
      failureRateByPlatform,
      decoderSupport: decoderDist,
      avgSessionDurationByPlatform,
      totalClients: uniqueUsers.size,
    };
  }

  // -----------------------------------------------------------------------
  // Error Dashboard
  // -----------------------------------------------------------------------

  async getErrorSummary(): Promise<ErrorSummaryDto> {
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const failedSessions = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.FAILED,
        startedAt: { gte: last7d },
      },
      include: {
        host: { select: { name: true, gpuInfo: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });

    const errorsByType: Record<string, number> = {};
    const errorsByGpu: Record<string, number> = {};
    const recentErrors: ErrorEntryDto[] = [];

    for (const s of failedSessions) {
      const meta = s.metadata as Record<string, unknown> | null;
      const errorType = (meta?.disconnectReason as string) || (meta?.errorType as string) || 'unknown';
      const errorMessage = (meta?.errorMessage as string) || null;
      const clientCaps = meta?.clientCapabilities as Record<string, unknown> | undefined;
      const qosStats = meta?.qosStats as Record<string, unknown> | undefined;

      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;

      const gpu = s.host?.gpuInfo || 'unknown';
      errorsByGpu[gpu] = (errorsByGpu[gpu] || 0) + 1;

      if (recentErrors.length < 20) {
        recentErrors.push({
          id: s.id,
          sessionId: s.id,
          hostName: s.host?.name || null,
          gpuInfo: s.host?.gpuInfo || null,
          errorType,
          errorMessage,
          occurredAt: s.startedAt,
          platform: (clientCaps?.platform as string) || null,
          codec: (qosStats?.codec as string) || null,
        });
      }
    }

    return {
      totalErrors: failedSessions.length,
      errorsByType,
      errorsByGpu,
      recentErrors,
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Estimate peak concurrent sessions during the day by bucketing
   * sessions into hourly windows.
   */
  private estimatePeakSessions(
    sessions: Array<{
      startedAt: Date;
      endedAt: Date | null;
      status: string;
    }>,
  ): number {
    if (sessions.length === 0) return 0;

    let peak = 0;
    const now = new Date();

    // Check each hour of today
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    for (let h = 0; h <= now.getHours(); h++) {
      const checkTime = new Date(todayStart);
      checkTime.setHours(h, 30, 0, 0); // Check at half-hour mark

      let concurrent = 0;
      for (const s of sessions) {
        const start = new Date(s.startedAt).getTime();
        const end = s.endedAt
          ? new Date(s.endedAt).getTime()
          : now.getTime();

        if (start <= checkTime.getTime() && end >= checkTime.getTime()) {
          concurrent++;
        }
      }

      if (concurrent > peak) {
        peak = concurrent;
      }
    }

    return peak;
  }
}
