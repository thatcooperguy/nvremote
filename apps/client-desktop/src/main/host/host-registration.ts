/**
 * host-registration.ts — Registration + Heartbeat
 *
 * Ported from:
 *   apps/host-agent/internal/registration/registration.go
 *   apps/host-agent/internal/heartbeat/heartbeat.go
 *
 * Handles registering the host with the NVRemote control plane and sending
 * periodic heartbeat reports. Uses axios (already a dependency) for HTTP
 * and electron-store for persisting registration data.
 */

import os from 'os';
import { execFile } from 'child_process';
import axios, { AxiosInstance } from 'axios';
import type { HostStreamer, StreamerCapabilities } from './host-streamer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrationRequest {
  bootstrap_token: string;
  host_name: string;
  gpu_model: string;
  streamer_version: string;
  os: string;
  arch: string;
  platform_type: string;
}

export interface RegistrationResponse {
  host_id: string;
  tunnel_ip: string;
  gateway_endpoint: string;
  gateway_public_key: string;
  api_token: string;
  registered_at: string;
}

export interface HeartbeatPayload {
  host_id: string;
  status: string;
  streamer_running: boolean;
  streamer_version: string;
  codecs: string[];
  gpu_model: string;
  max_resolution: string;
  max_fps: number;
  nvenc_version: string;
  timestamp: string;
}

export interface HostConfig {
  mode: 'client' | 'host' | 'both';
  bootstrapToken: string;
  hostId: string;
  apiToken: string;
  hostName: string;
  stunServers: string[];
  registeredAt: string;
  controlPlaneUrl: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL = 30_000; // 30s
const HTTP_TIMEOUT = 10_000;       // 10s

// ---------------------------------------------------------------------------
// HostRegistration
// ---------------------------------------------------------------------------

export class HostRegistration {
  private config: HostConfig;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private httpClient: AxiosInstance;
  private streamer: HostStreamer | null = null;

  constructor(config: HostConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.controlPlaneUrl,
      timeout: HTTP_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** Update the reference to the streamer manager for heartbeat capability queries. */
  setStreamer(streamer: HostStreamer): void {
    this.streamer = streamer;
  }

  /** Update config (e.g. after mode change). */
  updateConfig(config: Partial<HostConfig>): void {
    Object.assign(this.config, config);

    // Rebuild HTTP client if URL changes.
    if (config.controlPlaneUrl) {
      this.httpClient = axios.create({
        baseURL: config.controlPlaneUrl,
        timeout: HTTP_TIMEOUT,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  /**
   * Register this host with the control plane using a bootstrap token.
   * Returns the registration response containing host_id and api_token.
   */
  async register(): Promise<RegistrationResponse> {
    const gpuModel = await this.detectGPU().catch(() => 'unknown');

    let streamerVersion = 'unknown';
    if (this.streamer) {
      try {
        const info = await this.streamer.detect();
        streamerVersion = info.version;
      } catch {
        // Streamer not found — OK for registration, user can configure later.
      }
    }

    const reqBody: RegistrationRequest = {
      bootstrap_token: this.config.bootstrapToken,
      host_name: this.config.hostName || os.hostname(),
      gpu_model: gpuModel,
      streamer_version: streamerVersion,
      os: process.platform,  // 'win32'
      arch: process.arch,    // 'x64'
      platform_type: 'desktop',
    };

    console.log('[host-registration] sending registration request');

    const resp = await this.httpClient.post<RegistrationResponse>(
      '/api/hosts/register',
      reqBody,
      {
        headers: {
          Authorization: `Bearer ${this.config.bootstrapToken}`,
        },
      },
    );

    const reg = resp.data;

    // Update local config with registration data.
    this.config.hostId = reg.host_id;
    this.config.apiToken = reg.api_token;
    this.config.registeredAt = reg.registered_at;

    console.log(`[host-registration] registered as host ${reg.host_id}`);
    return reg;
  }

  // -----------------------------------------------------------------------
  // Heartbeat
  // -----------------------------------------------------------------------

  /** Start the periodic heartbeat loop. Send one immediately, then every 30s. */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    console.log('[host-registration] starting heartbeat loop');

    // Send initial heartbeat.
    this.sendHeartbeat().catch((err) =>
      console.warn('[host-registration] initial heartbeat failed:', err.message),
    );

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch((err) =>
        console.warn('[host-registration] heartbeat failed:', err.message),
      );
    }, HEARTBEAT_INTERVAL);
  }

  /** Stop the heartbeat loop. */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      console.log('[host-registration] heartbeat stopped');
    }
  }

  /** Send a single heartbeat to the control plane. */
  private async sendHeartbeat(): Promise<void> {
    if (!this.config.hostId || !this.config.apiToken) {
      return; // Not registered yet.
    }

    const running = this.streamer?.isRunning() ?? false;

    let caps: StreamerCapabilities | null = null;
    let version = '';
    let gpuModel = '';

    if (running && this.streamer) {
      try {
        caps = await this.streamer.getCapabilities();
      } catch {
        // Capabilities unavailable — fine for heartbeat.
      }

      try {
        const info = await this.streamer.detect();
        version = info.version;
        if (!gpuModel) gpuModel = info.gpuName;
      } catch {
        // Detect failed.
      }
    }

    const payload: HeartbeatPayload = {
      host_id: this.config.hostId,
      status: running ? 'ready' : 'degraded-no-streamer',
      streamer_running: running,
      streamer_version: version,
      codecs: caps?.codecs ?? [],
      gpu_model: caps?.gpuName ?? gpuModel,
      max_resolution: caps?.maxResolution ?? '',
      max_fps: caps?.maxFps ?? 0,
      nvenc_version: caps?.nvencVersion ?? '',
      timestamp: new Date().toISOString(),
    };

    await this.httpClient.post(
      `/api/hosts/${this.config.hostId}/heartbeat`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
        },
      },
    );
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /** Detect GPU model via nvidia-smi. */
  private detectGPU(): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        'nvidia-smi',
        ['--query-gpu=name', '--format=csv,noheader,nounits'],
        { windowsHide: true, timeout: 5_000 },
        (err, stdout) => {
          if (err) return reject(err);
          const model = stdout.trim();
          if (!model) return reject(new Error('nvidia-smi returned empty GPU name'));
          resolve(model.split('\n')[0].trim());
        },
      );
    });
  }

  /** Get the current config. */
  getConfig(): HostConfig {
    return { ...this.config };
  }
}
