import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Shape of a single TURN server entry parsed from environment config. */
export interface TurnServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

/**
 * Provides the STUN / TURN server configuration used for ICE negotiation.
 *
 * Reads from environment variables:
 *   - STUN_SERVERS  — comma-separated list of STUN URIs
 *                     (default: stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302)
 *   - TURN_SERVERS  — JSON array of { urls, username, credential } objects (optional)
 *
 * This service replaces the former GatewayService that managed WireGuard
 * peers through REST calls to a cloud gateway.
 */
@Injectable()
export class IceConfigService {
  private readonly logger = new Logger(IceConfigService.name);

  private readonly stunServers: string[];
  private readonly turnServers: TurnServerConfig[];

  constructor(private readonly config: ConfigService) {
    // -- STUN servers --------------------------------------------------------
    const stunEnv = this.config.get<string>(
      'STUN_SERVERS',
      'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302',
    );

    this.stunServers = stunEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // -- TURN servers (optional) ---------------------------------------------
    const turnEnv = this.config.get<string>('TURN_SERVERS', '');
    if (turnEnv) {
      try {
        const parsed = JSON.parse(turnEnv);
        this.turnServers = Array.isArray(parsed) ? parsed : [parsed];
      } catch (err) {
        this.logger.warn(
          `Failed to parse TURN_SERVERS env var: ${(err as Error).message}. ` +
            'TURN relay will not be available.',
        );
        this.turnServers = [];
      }
    } else {
      this.turnServers = [];
    }

    this.logger.log(
      `ICE config: ${this.stunServers.length} STUN server(s), ` +
        `${this.turnServers.length} TURN server(s)`,
    );
  }

  /** Return the configured list of STUN server URIs. */
  getStunServers(): string[] {
    return [...this.stunServers];
  }

  /** Return the configured list of TURN servers (may be empty). */
  getTurnServers(): TurnServerConfig[] {
    return this.turnServers.map((t) => ({ ...t }));
  }
}
