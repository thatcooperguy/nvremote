import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Shape returned by the gateway health endpoint. */
interface GatewayHealthResponse {
  status: string;
  serverPublicKey: string;
  version?: string;
}

/** Status information for a single WireGuard peer. */
export interface PeerStatus {
  connected: boolean;
  lastHandshake?: string;
  transferRx?: number;
  transferTx?: number;
}

/** Payload sent to the gateway when adding a peer. */
interface AddPeerPayload {
  publicKey: string;
  allowedIPs: string;
  metadata?: Record<string, string | undefined>;
}

/**
 * Wraps all REST calls to the cloud WireGuard gateway.
 *
 * The gateway exposes:
 *   POST   /api/peers          – register a peer
 *   DELETE  /api/peers/:pubkey  – remove a peer
 *   GET    /api/peers/:pubkey  – peer status
 *   GET    /api/health         – server info (includes serverPublicKey)
 */
@Injectable()
export class GatewayService implements OnModuleInit {
  private readonly logger = new Logger(GatewayService.name);

  private readonly gatewayUrl: string;
  private readonly gatewayToken: string;

  /** Cached gateway WireGuard public key – fetched once at startup. */
  private serverPublicKey: string;

  /** Gateway public endpoint (IP:port) that clients connect to. */
  readonly gatewayEndpoint: string;

  constructor(private readonly config: ConfigService) {
    this.gatewayUrl = this.config.getOrThrow<string>('GATEWAY_URL');
    this.gatewayToken = this.config.getOrThrow<string>('GATEWAY_TOKEN');
    this.gatewayEndpoint = this.config.getOrThrow<string>('GATEWAY_ENDPOINT');

    // May be provided statically in env to avoid a runtime health-check call.
    this.serverPublicKey = this.config.get<string>('GATEWAY_PUBLIC_KEY', '');
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    if (!this.serverPublicKey) {
      try {
        this.serverPublicKey = await this.fetchServerPublicKey();
        this.logger.log('Fetched gateway public key from health endpoint');
      } catch (err) {
        this.logger.warn(
          `Could not fetch gateway public key at startup: ${(err as Error).message}. ` +
            'Will retry on first session creation.',
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Register a WireGuard peer with the gateway.
   *
   * @param publicKey  Base64-encoded Curve25519 public key of the peer.
   * @param allowedIPs Comma-separated CIDR list the peer is allowed to route.
   * @param metadata   Optional key/value pairs stored alongside the peer.
   */
  async addPeer(
    publicKey: string,
    allowedIPs: string,
    metadata?: { hostId?: string; sessionId?: string },
  ): Promise<void> {
    const body: AddPeerPayload = {
      publicKey,
      allowedIPs,
      metadata: metadata
        ? {
            hostId: metadata.hostId,
            sessionId: metadata.sessionId,
          }
        : undefined,
    };

    await this.request('POST', '/api/peers', body);
    this.logger.log(
      `Peer added: ${publicKey.slice(0, 8)}... allowedIPs=${allowedIPs}`,
    );
  }

  /**
   * Remove a WireGuard peer from the gateway.
   *
   * @param publicKey  Base64-encoded public key of the peer to remove.
   */
  async removePeer(publicKey: string): Promise<void> {
    const encoded = encodeURIComponent(publicKey);
    await this.request('DELETE', `/api/peers/${encoded}`);
    this.logger.log(`Peer removed: ${publicKey.slice(0, 8)}...`);
  }

  /**
   * Return the gateway's WireGuard server public key.
   * Uses a cached value when available; falls back to a live health check.
   */
  async getServerPublicKey(): Promise<string> {
    if (this.serverPublicKey) {
      return this.serverPublicKey;
    }

    this.serverPublicKey = await this.fetchServerPublicKey();
    return this.serverPublicKey;
  }

  /**
   * Query the live status of a peer (handshake, transfer counters, etc.).
   */
  async getPeerStatus(publicKey: string): Promise<PeerStatus> {
    const encoded = encodeURIComponent(publicKey);
    const data = await this.request<PeerStatus>(
      'GET',
      `/api/peers/${encoded}`,
    );

    return {
      connected: data?.connected ?? false,
      lastHandshake: data?.lastHandshake,
      transferRx: data?.transferRx,
      transferTx: data?.transferTx,
    };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Execute an HTTP request against the gateway with a single automatic retry.
   */
  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.gatewayUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.gatewayToken}`,
      'Content-Type': 'application/json',
    };

    const init: RequestInit = {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, init);

        if (!res.ok) {
          const text = await res.text().catch(() => '<no body>');
          throw new Error(
            `Gateway ${method} ${path} responded ${res.status}: ${text}`,
          );
        }

        // DELETE endpoints typically return 204 with no body
        if (res.status === 204 || res.headers.get('content-length') === '0') {
          return undefined as T;
        }

        return (await res.json()) as T;
      } catch (err) {
        lastError = err as Error;
        if (attempt === 0) {
          this.logger.warn(
            `Gateway request ${method} ${path} failed (attempt 1), retrying: ${lastError.message}`,
          );
          // Brief back-off before retry
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }

    this.logger.error(
      `Gateway request ${method} ${path} failed after 2 attempts: ${lastError!.message}`,
    );
    throw new InternalServerErrorException(
      'WireGuard gateway is unreachable. Please try again later.',
    );
  }

  /**
   * Fetch the server's WireGuard public key from the gateway health endpoint.
   */
  private async fetchServerPublicKey(): Promise<string> {
    const data = await this.request<GatewayHealthResponse>(
      'GET',
      '/api/health',
    );

    if (!data?.serverPublicKey) {
      throw new Error(
        'Gateway health response did not include serverPublicKey',
      );
    }

    return data.serverPublicKey;
  }
}
