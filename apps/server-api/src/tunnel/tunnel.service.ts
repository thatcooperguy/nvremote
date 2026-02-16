import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma.service';
import {
  CreateTunnelDto,
  TunnelResponseDto,
  TunnelStatusDto,
  TunnelAuditEntryDto,
} from './dto/tunnel.dto';
import * as crypto from 'crypto';

/**
 * Active tunnel tracking entry.
 */
interface ActiveTunnel {
  tunnelId: string;
  sessionId: string;
  userId: string;
  hostId: string;
  endpoint: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  protocol: 'wss' | 'https';
}

/**
 * Zero-Trust Tunnel Service.
 *
 * Provides per-session authenticated tunneling for enterprise environments.
 * Each tunnel is individually authenticated and authorized — no broad network
 * access is granted. Only the specific host/port pair is exposed per session.
 *
 * Features:
 *   - Per-session JWT tokens with tunnel scope
 *   - Audit trail for every tunnel creation/destruction
 *   - Session-scoped port forwarding (no lateral movement)
 *   - Compatible with IAP-style zero-trust architectures
 *   - No client-side VPN configuration required
 *
 * Environment variables:
 *   - TUNNEL_ENABLED         — "true" to enable zero-trust tunnels
 *   - TUNNEL_PROXY_ENDPOINT  — tunnel proxy public URL
 *   - TUNNEL_SECRET          — signing secret for tunnel tokens
 *   - TUNNEL_REGION          — region label for admin display
 */
@Injectable()
export class TunnelService {
  private readonly logger = new Logger(TunnelService.name);

  private readonly enabled: boolean;
  private readonly proxyEndpoint: string;
  private readonly tunnelSecret: string;
  private readonly region: string;

  // In-memory tunnel tracking (production would use Redis or DB)
  private readonly activeTunnels = new Map<string, ActiveTunnel>();
  private readonly auditLog: TunnelAuditEntryDto[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    this.enabled = this.config.get<string>('TUNNEL_ENABLED', '') === 'true';
    this.proxyEndpoint = this.config.get<string>('TUNNEL_PROXY_ENDPOINT', '');
    this.tunnelSecret = this.config.get<string>(
      'TUNNEL_SECRET',
      crypto.randomBytes(32).toString('hex'),
    );
    this.region = this.config.get<string>('TUNNEL_REGION', 'us-west1');

    this.logger.log(
      `Zero-trust tunnel: ${this.enabled ? 'enabled' : 'disabled'}` +
        (this.enabled ? ` (${this.proxyEndpoint}, ${this.region})` : ''),
    );
  }

  /**
   * Create a per-session authenticated tunnel.
   *
   * The tunnel provides:
   *   - Session-scoped access (only the specific host)
   *   - Time-limited JWT token
   *   - Full audit trail
   *   - No broad network access
   */
  async createTunnel(
    userId: string,
    dto: CreateTunnelDto,
  ): Promise<TunnelResponseDto> {
    if (!this.enabled) {
      throw new BadRequestException('Zero-trust tunnel is not enabled');
    }

    // Validate session exists and user is the owner
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
      include: { host: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You can only create tunnels for your own sessions');
    }

    if (session.status !== 'ACTIVE' && session.status !== 'PENDING') {
      throw new BadRequestException('Session is not active');
    }

    // Generate tunnel ID and token
    const tunnelId = `tun_${crypto.randomBytes(16).toString('hex')}`;
    const ttl = dto.ttl ?? 86400; // 24h default
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const protocol = dto.protocol ?? 'wss';

    // Create a scoped JWT for tunnel authentication
    const tunnelToken = this.jwtService.sign(
      {
        sub: userId,
        tunnelId,
        sessionId: session.id,
        hostId: session.hostId,
        scope: 'tunnel',
        protocol,
      },
      {
        secret: this.tunnelSecret,
        expiresIn: `${ttl}s`,
      },
    );

    // Build tunnel endpoint
    const endpoint = `${this.proxyEndpoint}/tunnel/${tunnelId}`;

    // Track active tunnel
    const tunnel: ActiveTunnel = {
      tunnelId,
      sessionId: session.id,
      userId,
      hostId: session.hostId,
      endpoint,
      token: tunnelToken,
      createdAt: new Date(),
      expiresAt,
      protocol,
    };
    this.activeTunnels.set(tunnelId, tunnel);

    // Get host VPN IP if available
    const hostMeta = session.host?.metadata as Record<string, unknown> | null;
    const hostVpnIp = hostMeta?.vpnIp as string | undefined;

    // Audit log
    this.logAudit({
      tunnelId,
      sessionId: session.id,
      userId,
      hostId: session.hostId,
      action: 'created',
      timestamp: new Date().toISOString(),
    });

    // Update session metadata with tunnel info
    const existingMeta = (session.metadata as Record<string, unknown>) ?? {};
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        metadata: {
          ...existingMeta,
          connectionType: 'zero-trust-tunnel',
          tunnelId,
          tunnelCreatedAt: new Date().toISOString(),
        },
      },
    });

    this.logger.log(
      `Tunnel ${tunnelId} created for session ${session.id} ` +
        `(user: ${userId}, host: ${session.hostId}, TTL: ${ttl}s)`,
    );

    return {
      tunnelId,
      endpoint,
      tunnelToken,
      expiresAt: expiresAt.toISOString(),
      sessionId: session.id,
      hostId: session.hostId,
      hostVpnIp,
      protocol,
    };
  }

  /**
   * Destroy (revoke) an active tunnel.
   */
  async destroyTunnel(
    userId: string,
    tunnelId: string,
  ): Promise<{ success: boolean }> {
    const tunnel = this.activeTunnels.get(tunnelId);

    if (!tunnel) {
      throw new NotFoundException('Tunnel not found');
    }

    if (tunnel.userId !== userId) {
      throw new ForbiddenException('You can only destroy your own tunnels');
    }

    this.activeTunnels.delete(tunnelId);

    this.logAudit({
      tunnelId,
      sessionId: tunnel.sessionId,
      userId,
      hostId: tunnel.hostId,
      action: 'revoked',
      timestamp: new Date().toISOString(),
      reason: 'User requested destruction',
    });

    this.logger.log(`Tunnel ${tunnelId} destroyed by user ${userId}`);

    return { success: true };
  }

  /**
   * Validate a tunnel token for the proxy.
   * Called by the tunnel proxy to verify incoming connections.
   */
  validateTunnelToken(token: string): {
    valid: boolean;
    tunnelId?: string;
    sessionId?: string;
    hostId?: string;
  } {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.tunnelSecret,
      });

      if (payload.scope !== 'tunnel') {
        return { valid: false };
      }

      // Check if tunnel is still active
      const tunnel = this.activeTunnels.get(payload.tunnelId);
      if (!tunnel) {
        return { valid: false };
      }

      return {
        valid: true,
        tunnelId: payload.tunnelId,
        sessionId: payload.sessionId,
        hostId: payload.hostId,
      };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Get tunnel status for admin dashboard.
   */
  getStatus(): TunnelStatusDto {
    // Clean up expired tunnels
    const now = new Date();
    for (const [id, tunnel] of this.activeTunnels) {
      if (tunnel.expiresAt < now) {
        this.activeTunnels.delete(id);
        this.logAudit({
          tunnelId: id,
          sessionId: tunnel.sessionId,
          userId: tunnel.userId,
          hostId: tunnel.hostId,
          action: 'expired',
          timestamp: now.toISOString(),
        });
      }
    }

    return {
      available: this.enabled,
      proxyEndpoint: this.enabled ? this.proxyEndpoint : undefined,
      activeTunnels: this.activeTunnels.size,
      region: this.enabled ? this.region : undefined,
    };
  }

  /**
   * Get recent audit log entries.
   */
  getAuditLog(limit = 50): TunnelAuditEntryDto[] {
    return this.auditLog.slice(-limit).reverse();
  }

  private logAudit(entry: TunnelAuditEntryDto): void {
    this.auditLog.push(entry);
    // Keep last 1000 entries in memory
    if (this.auditLog.length > 1000) {
      this.auditLog.splice(0, this.auditLog.length - 1000);
    }
  }
}
