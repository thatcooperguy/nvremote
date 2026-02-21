import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../common/prisma.service';

/**
 * Health and metrics controller.
 *
 * All endpoints are public (no auth) — designed for:
 *   - Load balancer health checks (Cloud Run, Docker HEALTHCHECK)
 *   - Prometheus scraping (metrics endpoint)
 *   - Uptime monitors (UptimeRobot, Pingdom, etc.)
 */
@ApiTags('health')
@Controller()
export class HealthController {
  private readonly startTime = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Health check — returns 200 if healthy, 503 if degraded.
   *
   * Cloud Run and load balancers use the HTTP status code to determine
   * whether to route traffic to this instance. Returning 503 on degraded
   * state ensures unhealthy instances are removed from the pool.
   */
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({ description: 'Service healthy' })
  @ApiServiceUnavailableResponse({ description: 'Service degraded (database unreachable)' })
  async health(@Res() res: Response) {
    let dbHealthy = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }

    const uptimeMs = Date.now() - this.startTime;

    const body = {
      status: dbHealthy ? 'ok' : 'degraded',
      uptime: Math.floor(uptimeMs / 1000),
      database: dbHealthy ? 'connected' : 'unreachable',
      version: '0.5.1-beta',
      timestamp: new Date().toISOString(),
    };

    res
      .status(dbHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(body);
  }

  /**
   * Prometheus-compatible metrics endpoint.
   * Exposes key platform counters in text/plain exposition format.
   */
  @Public()
  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics' })
  async metrics(@Res() res: Response) {
    const uptimeMs = Date.now() - this.startTime;

    // Query platform counters
    const [userCount, hostCount, sessionCount, activeSessionCount, vpnPeerCount] =
      await Promise.all([
        this.prisma.user.count().catch(() => 0),
        this.prisma.host.count().catch(() => 0),
        this.prisma.session.count().catch(() => 0),
        this.prisma.session.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
        this.prisma.vpnPeer.count().catch(() => 0),
      ]);

    // Count online hosts
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const onlineHostCount = await this.prisma.host
      .count({ where: { lastSeenAt: { gte: fiveMinAgo } } })
      .catch(() => 0);

    // Database health
    let dbUp = 1;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbUp = 0;
    }

    const lines = [
      '# HELP nvremote_up Whether the NVRemote API is healthy (1 = up, 0 = down)',
      '# TYPE nvremote_up gauge',
      `nvremote_up ${dbUp}`,
      '',
      '# HELP nvremote_uptime_seconds API server uptime in seconds',
      '# TYPE nvremote_uptime_seconds gauge',
      `nvremote_uptime_seconds ${Math.floor(uptimeMs / 1000)}`,
      '',
      '# HELP nvremote_users_total Total registered users',
      '# TYPE nvremote_users_total gauge',
      `nvremote_users_total ${userCount}`,
      '',
      '# HELP nvremote_hosts_total Total registered hosts',
      '# TYPE nvremote_hosts_total gauge',
      `nvremote_hosts_total ${hostCount}`,
      '',
      '# HELP nvremote_hosts_online Hosts with heartbeat in last 5 minutes',
      '# TYPE nvremote_hosts_online gauge',
      `nvremote_hosts_online ${onlineHostCount}`,
      '',
      '# HELP nvremote_sessions_total Total sessions ever created',
      '# TYPE nvremote_sessions_total gauge',
      `nvremote_sessions_total ${sessionCount}`,
      '',
      '# HELP nvremote_sessions_active Currently active streaming sessions',
      '# TYPE nvremote_sessions_active gauge',
      `nvremote_sessions_active ${activeSessionCount}`,
      '',
      '# HELP nvremote_vpn_peers_total Registered VPN peers',
      '# TYPE nvremote_vpn_peers_total gauge',
      `nvremote_vpn_peers_total ${vpnPeerCount}`,
      '',
    ];

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(lines.join('\n'));
  }
}
