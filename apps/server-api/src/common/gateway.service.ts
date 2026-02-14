import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Shape of a single TURN server entry (kept for type compatibility). */
export interface TurnServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

/**
 * Provides the STUN server configuration used for ICE negotiation.
 *
 * GridStreamer is P2P-only — no TURN/relay servers are used.
 * This enforces zero egress cost by design: all media flows directly
 * between host and viewer over ICE-lite + STUN.
 *
 * Reads from environment variables:
 *   - STUN_SERVERS  — comma-separated list of STUN URIs
 *                     (default: stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302)
 */
@Injectable()
export class IceConfigService {
  private readonly logger = new Logger(IceConfigService.name);

  private readonly stunServers: string[];

  constructor(private readonly config: ConfigService) {
    const stunEnv = this.config.get<string>(
      'STUN_SERVERS',
      'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302',
    );

    this.stunServers = stunEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (this.config.get<string>('TURN_SERVERS')) {
      this.logger.warn(
        'TURN_SERVERS env var is set but GridStreamer is P2P-only. ' +
          'TURN relay is disabled by design to enforce zero egress cost. ' +
          'Remove TURN_SERVERS from your environment.',
      );
    }

    this.logger.log(
      `ICE config: ${this.stunServers.length} STUN server(s), 0 TURN (P2P-only)`,
    );
  }

  /** Return the configured list of STUN server URIs. */
  getStunServers(): string[] {
    return [...this.stunServers];
  }

  /** Always returns empty — GridStreamer is P2P-only, no TURN relay. */
  getTurnServers(): TurnServerConfig[] {
    return [];
  }
}
