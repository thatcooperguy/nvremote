import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/** Shape of a single TURN server entry returned to clients. */
export interface TurnServerConfig {
  urls: string;
  username: string;
  credential: string;
}

/**
 * Provides the STUN and TURN server configuration used for ICE negotiation.
 *
 * STUN servers are read from `STUN_SERVERS` env var.
 * TURN servers are enabled when `TURN_SERVER` and `TURN_SECRET` are both set.
 *
 * TURN uses HMAC-based ephemeral credentials (RFC 5766 long-term auth with
 * shared secret, also called "REST API for TURN" or coturn --use-auth-secret).
 *
 * Credential format:
 *   - username = "<expiry_timestamp>:<random_or_session_id>"
 *   - credential = HMAC-SHA1(shared_secret, username) base64-encoded
 *
 * Environment variables:
 *   - STUN_SERVERS   — comma-separated list of STUN URIs
 *   - TURN_SERVER    — TURN server URI (e.g. "turn:1.2.3.4:3478")
 *   - TURN_SECRET    — shared secret for HMAC credential generation
 *   - TURN_REALM     — TURN realm (default: nvremote.com)
 *   - TURN_TTL       — credential TTL in seconds (default: 86400 = 24h)
 */
@Injectable()
export class IceConfigService {
  private readonly logger = new Logger(IceConfigService.name);

  private readonly stunServers: string[];
  private readonly turnServer: string | null;
  private readonly turnSecret: string | null;
  private readonly turnRealm: string;
  private readonly turnTtl: number;

  constructor(private readonly config: ConfigService) {
    // STUN configuration
    const stunEnv = this.config.get<string>(
      'STUN_SERVERS',
      'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302',
    );

    this.stunServers = stunEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // TURN configuration
    this.turnServer = this.config.get<string>('TURN_SERVER', '') || null;
    this.turnSecret = this.config.get<string>('TURN_SECRET', '') || null;
    this.turnRealm = this.config.get<string>('TURN_REALM', 'nvremote.com');
    this.turnTtl = parseInt(this.config.get<string>('TURN_TTL', '86400'), 10);

    const turnEnabled = this.turnServer && this.turnSecret;

    this.logger.log(
      `ICE config: ${this.stunServers.length} STUN server(s), ` +
        `TURN ${turnEnabled ? 'enabled' : 'disabled'}` +
        (turnEnabled ? ` (${this.turnServer}, TTL: ${this.turnTtl}s)` : ''),
    );
  }

  /** Return the configured list of STUN server URIs. */
  getStunServers(): string[] {
    return [...this.stunServers];
  }

  /** Whether TURN relay is available. */
  isTurnEnabled(): boolean {
    return !!(this.turnServer && this.turnSecret);
  }

  /**
   * Generate time-limited TURN credentials for a session.
   *
   * Uses HMAC-SHA1 ephemeral credential mechanism compatible with coturn's
   * --use-auth-secret mode. The username encodes an expiry timestamp and
   * an optional session identifier; the credential is an HMAC of the username.
   *
   * @param sessionId — optional session identifier embedded in the username
   * @returns array of TURN server configs with ephemeral credentials, or
   *          empty array if TURN is not configured.
   */
  getTurnServers(sessionId?: string): TurnServerConfig[] {
    if (!this.turnServer || !this.turnSecret) {
      return [];
    }

    const expiry = Math.floor(Date.now() / 1000) + this.turnTtl;
    const username = `${expiry}:${sessionId ?? 'anonymous'}`;

    const hmac = crypto.createHmac('sha1', this.turnSecret);
    hmac.update(username);
    const credential = hmac.digest('base64');

    // Return both UDP and TCP TURN URIs so clients have maximum connectivity
    const servers: TurnServerConfig[] = [
      {
        urls: this.turnServer,
        username,
        credential,
      },
    ];

    // If the primary URL uses turn:, also offer turn over TCP
    if (this.turnServer.startsWith('turn:')) {
      servers.push({
        urls: this.turnServer + '?transport=tcp',
        username,
        credential,
      });
    }

    return servers;
  }
}
