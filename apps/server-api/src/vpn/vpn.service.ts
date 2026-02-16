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

  // Simple in-memory IP allocation (production would use DB)
  // Tracks: publicKey -> assigned VPN IP
  private readonly peerAllocations = new Map<string, string>();
  private nextIpOctet = 2; // Start from 10.100.0.2

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

    // Allocate or retrieve VPN IP for this peer
    let assignedIp = this.peerAllocations.get(dto.publicKey);
    if (!assignedIp) {
      assignedIp = this.allocateIp();
      this.peerAllocations.set(dto.publicKey, assignedIp);
    }

    // Store VPN info on the host record using the nvstreamerPorts JSON field
    await this.prisma.host.update({
      where: { id: hostId },
      data: {
        nvstreamerPorts: {
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

    // Allocate or retrieve VPN IP for this client
    let assignedIp = this.peerAllocations.get(dto.publicKey);
    if (!assignedIp) {
      assignedIp = this.allocateIp();
      this.peerAllocations.set(dto.publicKey, assignedIp);
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
        const hostPorts = session.host.nvstreamerPorts as Record<string, unknown> | null;
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
  getRelayStatus(): VpnRelayStatusDto {
    return {
      available: this.enabled,
      serverEndpoint: this.enabled ? this.serverEndpoint : undefined,
      registeredPeers: this.peerAllocations.size,
      subnet: this.enabled ? this.subnet : undefined,
      region: this.enabled ? this.region : undefined,
    };
  }

  /** Simple sequential IP allocation. */
  private allocateIp(): string {
    const third = Math.floor(this.nextIpOctet / 256);
    const fourth = this.nextIpOctet % 256;
    this.nextIpOctet++;
    return `10.100.${third}.${fourth}`;
  }
}
