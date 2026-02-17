import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import {
  RegisterPeerDto,
  PeerRegistrationResponseDto,
  VpnConfigRequestDto,
  VpnConfigResponseDto,
  VpnRelayStatusDto,
} from './dto/vpn.dto';

/**
 * Manages WireGuard VPN relay peers and configuration.
 *
 * The VPN relay uses WireGuard on a GCE instance. Peers (host agents and
 * clients) register their public keys and receive a VPN IP assignment.
 * The relay server simply forwards encrypted packets between peers.
 *
 * Media is double-encrypted: WireGuard tunnel + DTLS/SRTP — the relay
 * never sees cleartext media.
 *
 * Peer registrations are persisted in the VpnPeer table so IP allocations
 * survive API server restarts.
 *
 * Environment variables:
 *   - VPN_ENABLED          — "true" to enable VPN relay
 *   - VPN_SERVER_ENDPOINT  — relay server public endpoint (host:port)
 *   - VPN_SERVER_PUBLIC_KEY — relay server WireGuard public key
 *   - VPN_SUBNET           — VPN address space (default: 10.100.0.0/16)
 *   - VPN_DNS              — DNS server for VPN clients (default: 1.1.1.1)
 *   - VPN_REGION           — region label for admin display
 */
@Injectable()
export class VpnService {
  private readonly logger = new Logger(VpnService.name);

  private readonly enabled: boolean;
  private readonly serverEndpoint: string;
  private readonly serverPublicKey: string;
  private readonly subnet: string;
  private readonly dns: string;
  private readonly region: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.enabled = this.config.get<string>('VPN_ENABLED', '') === 'true';
    this.serverEndpoint = this.config.get<string>('VPN_SERVER_ENDPOINT', '');
    this.serverPublicKey = this.config.get<string>('VPN_SERVER_PUBLIC_KEY', '');
    this.subnet = this.config.get<string>('VPN_SUBNET', '10.100.0.0/16');
    this.dns = this.config.get<string>('VPN_DNS', '1.1.1.1');
    this.region = this.config.get<string>('VPN_REGION', 'us-west1');

    this.logger.log(
      `VPN relay: ${this.enabled ? 'enabled' : 'disabled'}` +
        (this.enabled ? ` (${this.serverEndpoint}, ${this.region})` : ''),
    );
  }

  /**
   * Register a host agent as a WireGuard peer.
   * Called by the host agent on startup to join the VPN mesh.
   */
  async registerPeer(
    hostId: string,
    dto: RegisterPeerDto,
  ): Promise<PeerRegistrationResponseDto> {
    if (!this.enabled) {
      throw new BadRequestException('VPN relay is not enabled');
    }

    // Upsert peer — reuse existing IP if key was seen before
    const existing = await this.prisma.vpnPeer.findUnique({
      where: { publicKey: dto.publicKey },
    });

    let assignedIp: string;

    if (existing) {
      assignedIp = existing.assignedIp;
      await this.prisma.vpnPeer.update({
        where: { id: existing.id },
        data: {
          hostId,
          endpoint: dto.endpoint ?? existing.endpoint,
          lastSeenAt: new Date(),
          region: this.region,
        },
      });
    } else {
      assignedIp = await this.allocateIp();
      await this.prisma.vpnPeer.create({
        data: {
          publicKey: dto.publicKey,
          assignedIp,
          hostId,
          endpoint: dto.endpoint ?? null,
          region: this.region,
          lastSeenAt: new Date(),
        },
      });
    }

    // Also store VPN info on the host record for quick lookup
    await this.prisma.host.update({
      where: { id: hostId },
      data: {
        hostPorts: {
          vpnPublicKey: dto.publicKey,
          vpnIp: assignedIp,
          vpnEndpoint: dto.endpoint ?? null,
          vpnRegisteredAt: new Date().toISOString(),
        },
      },
    }).catch((err: Error) => {
      this.logger.warn(`Failed to update host VPN metadata: ${err.message}`);
    });

    this.logger.log(
      `Host ${hostId} registered as VPN peer: ${assignedIp} (key: ${dto.publicKey.substring(0, 8)}...)`,
    );

    return {
      assignedIp,
      serverPublicKey: this.serverPublicKey,
      serverEndpoint: this.serverEndpoint,
      subnet: this.subnet,
      dns: this.dns,
    };
  }

  /**
   * Get VPN tunnel configuration for a client.
   * The client uses this to establish a WireGuard tunnel to the relay.
   */
  async getClientConfig(
    userId: string,
    dto: VpnConfigRequestDto,
  ): Promise<VpnConfigResponseDto> {
    if (!this.enabled) {
      throw new BadRequestException('VPN relay is not enabled');
    }

    // Upsert client peer
    const existing = await this.prisma.vpnPeer.findUnique({
      where: { publicKey: dto.publicKey },
    });

    let assignedIp: string;

    if (existing) {
      assignedIp = existing.assignedIp;
      await this.prisma.vpnPeer.update({
        where: { id: existing.id },
        data: { userId, lastSeenAt: new Date() },
      });
    } else {
      assignedIp = await this.allocateIp();
      await this.prisma.vpnPeer.create({
        data: {
          publicKey: dto.publicKey,
          assignedIp,
          userId,
          region: this.region,
          lastSeenAt: new Date(),
        },
      });
    }

    const response: VpnConfigResponseDto = {
      assignedIp,
      serverPublicKey: this.serverPublicKey,
      serverEndpoint: this.serverEndpoint,
      subnet: this.subnet,
      dns: this.dns,
      allowedIps: [this.subnet],
    };

    // If a session ID is provided, look up the host's VPN IP for routing
    if (dto.sessionId) {
      const session = await this.prisma.session.findUnique({
        where: { id: dto.sessionId },
        include: { host: true },
      });

      if (session?.host) {
        const hostPorts = session.host.hostPorts as Record<string, unknown> | null;
        if (hostPorts?.vpnIp) {
          response.hostVpnIp = hostPorts.vpnIp as string;
          // Route only to the specific host instead of the entire subnet
          response.allowedIps = [`${response.hostVpnIp}/32`];
        }
      }
    }

    this.logger.log(
      `Client ${userId} VPN config: ${assignedIp}` +
        (response.hostVpnIp ? ` -> host ${response.hostVpnIp}` : ''),
    );

    return response;
  }

  /**
   * Get VPN relay status for admin dashboard.
   */
  async getRelayStatus(): Promise<VpnRelayStatusDto> {
    const peerCount = this.enabled
      ? await this.prisma.vpnPeer.count()
      : 0;

    return {
      available: this.enabled,
      serverEndpoint: this.enabled ? this.serverEndpoint : undefined,
      registeredPeers: peerCount,
      subnet: this.enabled ? this.subnet : undefined,
      region: this.enabled ? this.region : undefined,
    };
  }

  /**
   * Allocate the next available VPN IP from the subnet.
   * Queries the database for the highest assigned IP and increments.
   * Thread-safe via unique constraint on assignedIp.
   */
  private async allocateIp(): Promise<string> {
    // Find highest allocated IP to determine next octet
    const lastPeer = await this.prisma.vpnPeer.findFirst({
      orderBy: { assignedIp: 'desc' },
      select: { assignedIp: true },
    });

    let nextOctet = 2; // Start from 10.100.0.2

    if (lastPeer) {
      const parts = lastPeer.assignedIp.split('.');
      if (parts.length === 4) {
        const third = parseInt(parts[2], 10);
        const fourth = parseInt(parts[3], 10);
        nextOctet = third * 256 + fourth + 1;
      }
    }

    const third = Math.floor(nextOctet / 256);
    const fourth = nextOctet % 256;

    if (third > 255) {
      throw new BadRequestException('VPN address space exhausted');
    }

    return `10.100.${third}.${fourth}`;
  }
}
