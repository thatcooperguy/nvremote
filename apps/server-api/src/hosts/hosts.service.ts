import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HostStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../common/prisma.service';
import {
  RegisterHostDto,
  HeartbeatDto,
  UpdateHostDto,
  HostResponseDto,
  BootstrapTokenResponseDto,
} from './dto/hosts.dto';

/** CIDR 10.100.0.0/16 -- first usable 10.100.0.1, last 10.100.255.254 */
const TUNNEL_NETWORK_BASE = 0x0a640000; // 10.100.0.0
const TUNNEL_HOST_MIN = 1;
const TUNNEL_HOST_MAX = 65534;

@Injectable()
export class HostsService {
  private readonly logger = new Logger(HostsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  /**
   * Register a new host using a valid bootstrap token.
   * Assigns a unique tunnel IP from the 10.100.0.0/16 range.
   */
  async registerHost(dto: RegisterHostDto): Promise<HostResponseDto> {
    // Find a placeholder host row that holds the bootstrap token
    const placeholder = await this.prisma.host.findFirst({
      where: { bootstrapToken: dto.bootstrapToken },
    });

    if (!placeholder) {
      throw new BadRequestException('Invalid or expired bootstrap token');
    }

    // Check token expiry
    if (
      placeholder.bootstrapTokenExpiresAt &&
      placeholder.bootstrapTokenExpiresAt < new Date()
    ) {
      // Clean up expired placeholder
      await this.prisma.host.delete({ where: { id: placeholder.id } });
      throw new BadRequestException('Bootstrap token has expired');
    }

    const tunnelIp = await this.allocateTunnelIp(placeholder.orgId);

    const host = await this.prisma.host.update({
      where: { id: placeholder.id },
      data: {
        name: dto.name,
        hostname: dto.hostname,
        publicIp: dto.publicIp ?? null,
        privateIp: dto.privateIp ?? null,
        gpuInfo: dto.gpuInfo ?? null,
        nvstreamerVersion: dto.nvstreamerVersion ?? null,
        nvstreamerPorts: dto.nvstreamerPorts ?? undefined,
        tunnelIp,
        status: HostStatus.ONLINE,
        bootstrapToken: null, // consume the token
        lastSeenAt: new Date(),
      },
    });

    this.logger.log(
      `Host ${host.id} registered in org ${host.orgId} with tunnel IP ${tunnelIp}`,
    );

    return this.toResponse(host);
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  async getHostsForOrg(orgId: string): Promise<HostResponseDto[]> {
    const hosts = await this.prisma.host.findMany({
      where: { orgId, bootstrapToken: null },
      orderBy: { createdAt: 'desc' },
    });
    return hosts.map(this.toResponse);
  }

  async getHost(hostId: string): Promise<HostResponseDto> {
    const host = await this.prisma.host.findUnique({
      where: { id: hostId },
    });

    if (!host || host.bootstrapToken !== null) {
      throw new NotFoundException('Host not found');
    }

    return this.toResponse(host);
  }

  // -----------------------------------------------------------------------
  // Heartbeat
  // -----------------------------------------------------------------------

  async heartbeat(hostId: string, dto: HeartbeatDto): Promise<HostResponseDto> {
    const host = await this.prisma.host.findUnique({
      where: { id: hostId },
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    const updated = await this.prisma.host.update({
      where: { id: hostId },
      data: {
        status: dto.status ?? HostStatus.ONLINE,
        publicIp: dto.publicIp ?? host.publicIp,
        gpuInfo: dto.gpuInfo ?? host.gpuInfo,
        nvstreamerVersion: dto.nvstreamerVersion ?? host.nvstreamerVersion,
        nvstreamerPorts: dto.nvstreamerPorts ?? host.nvstreamerPorts ?? undefined,
        lastSeenAt: new Date(),
      },
    });

    return this.toResponse(updated);
  }

  // -----------------------------------------------------------------------
  // Update / Delete
  // -----------------------------------------------------------------------

  async updateHost(
    hostId: string,
    userId: string,
    dto: UpdateHostDto,
  ): Promise<HostResponseDto> {
    const host = await this.prisma.host.findUnique({
      where: { id: hostId },
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    // Verify the user is a member of the host's org
    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_orgId: { userId, orgId: host.orgId } },
    });

    if (!membership) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.host.update({
      where: { id: hostId },
      data: {
        name: dto.name ?? host.name,
        status: dto.status ?? host.status,
        gpuInfo: dto.gpuInfo ?? host.gpuInfo,
        nvstreamerPorts: dto.nvstreamerPorts ?? host.nvstreamerPorts ?? undefined,
      },
    });

    return this.toResponse(updated);
  }

  async deregisterHost(hostId: string, userId: string): Promise<void> {
    const host = await this.prisma.host.findUnique({
      where: { id: hostId },
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    // Only org admins may deregister hosts
    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_orgId: { userId, orgId: host.orgId } },
    });

    if (!membership || membership.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required to deregister hosts');
    }

    await this.prisma.host.delete({ where: { id: hostId } });

    this.logger.log(`Host ${hostId} deregistered by user ${userId}`);
  }

  // -----------------------------------------------------------------------
  // Bootstrap token
  // -----------------------------------------------------------------------

  async generateBootstrapToken(
    orgId: string,
    userId: string,
  ): Promise<BootstrapTokenResponseDto> {
    // Verify user is an admin of the org
    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_orgId: { userId, orgId } },
    });

    if (!membership || membership.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }

    const token = uuidv4();
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create a placeholder host record holding the token
    await this.prisma.host.create({
      data: {
        orgId,
        name: '__pending_registration__',
        hostname: '__pending__',
        bootstrapToken: token,
        bootstrapTokenExpiresAt: tokenExpiresAt,
        status: HostStatus.OFFLINE,
      },
    });

    this.logger.log(`Bootstrap token created for org ${orgId} by user ${userId} (expires: ${tokenExpiresAt.toISOString()})`);

    return { token, orgId };
  }

  // -----------------------------------------------------------------------
  // Stale-host cleanup (runs every minute)
  // -----------------------------------------------------------------------

  @Cron(CronExpression.EVERY_MINUTE)
  async markOfflineStaleHosts(): Promise<void> {
    const threshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes

    const { count } = await this.prisma.host.updateMany({
      where: {
        status: HostStatus.ONLINE,
        lastSeenAt: { lt: threshold },
      },
      data: { status: HostStatus.OFFLINE },
    });

    if (count > 0) {
      this.logger.warn(`Marked ${count} stale host(s) as OFFLINE`);
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Allocate the next available tunnel IP in the 10.100.0.0/16 range.
   */
  private async allocateTunnelIp(orgId: string): Promise<string> {
    const usedIps = await this.prisma.host.findMany({
      where: { orgId, tunnelIp: { not: null } },
      select: { tunnelIp: true },
    });

    const usedSet = new Set(usedIps.map((h) => h.tunnelIp));

    for (let offset = TUNNEL_HOST_MIN; offset <= TUNNEL_HOST_MAX; offset++) {
      const ipNum = TUNNEL_NETWORK_BASE + offset;
      const ip = [
        (ipNum >>> 24) & 0xff,
        (ipNum >>> 16) & 0xff,
        (ipNum >>> 8) & 0xff,
        ipNum & 0xff,
      ].join('.');

      if (!usedSet.has(ip)) {
        return ip;
      }
    }

    throw new BadRequestException(
      'Tunnel IP address space exhausted for this organisation',
    );
  }

  private toResponse(host: any): HostResponseDto {
    return {
      id: host.id,
      orgId: host.orgId,
      name: host.name,
      hostname: host.hostname,
      status: host.status,
      publicIp: host.publicIp,
      privateIp: host.privateIp,
      tunnelIp: host.tunnelIp,
      gpuInfo: host.gpuInfo,
      nvstreamerVersion: host.nvstreamerVersion,
      nvstreamerPorts: host.nvstreamerPorts as Record<string, number> | null,
      lastSeenAt: host.lastSeenAt,
      createdAt: host.createdAt,
    };
  }
}
