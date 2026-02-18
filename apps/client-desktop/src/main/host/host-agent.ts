/**
 * host-agent.ts — Top-Level Orchestrator
 *
 * Ported from: apps/host-agent/cmd/agent/main.go runAgent()
 *
 * Coordinates all host-mode subsystems: streamer process management,
 * registration, heartbeat, and signaling. This is the single entry point
 * that main.ts instantiates and drives via IPC.
 */

import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { HostStreamer, type StreamerInfo, type SessionStats } from './host-streamer';
import { HostRegistration, type HostConfig, type RegistrationResponse } from './host-registration';
import { HostSignaling } from './host-signaling';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HostAgentState = 'stopped' | 'starting' | 'running' | 'error';

export interface HostAgentStatus {
  state: HostAgentState;
  hostId: string;
  gpuModel: string;
  codecs: string[];
  streamerRunning: boolean;
  signalingConnected: boolean;
  activeSession: {
    sessionId: string;
    codec: string;
    connectionType: string;
    userId: string;
  } | null;
  error: string | null;
}

export interface HostAgentConfig {
  mode: 'client' | 'host' | 'both';
  bootstrapToken: string;
  hostId: string;
  apiToken: string;
  hostName: string;
  stunServers: string[];
  registeredAt: string;
  controlPlaneUrl: string;
}

// Re-export child types for external consumers.
export type { StreamerInfo, SessionStats, RegistrationResponse, HostConfig };

// ---------------------------------------------------------------------------
// HostAgent
// ---------------------------------------------------------------------------

export class HostAgent extends EventEmitter {
  private state: HostAgentState = 'stopped';
  private config: HostAgentConfig;
  private streamer: HostStreamer;
  private registration: HostRegistration;
  private signaling: HostSignaling;
  private streamerInfo: StreamerInfo | null = null;
  private lastError: string | null = null;
  private mainWindow: BrowserWindow | null = null;

  constructor(config: HostAgentConfig) {
    super();
    this.config = config;

    // Instantiate subsystems.
    this.streamer = new HostStreamer();
    this.registration = new HostRegistration({
      mode: config.mode,
      bootstrapToken: config.bootstrapToken,
      hostId: config.hostId,
      apiToken: config.apiToken,
      hostName: config.hostName,
      stunServers: config.stunServers,
      registeredAt: config.registeredAt,
      controlPlaneUrl: config.controlPlaneUrl,
    });
    this.registration.setStreamer(this.streamer);

    this.signaling = new HostSignaling(this.streamer, config.stunServers);
    this.setupSignalingEvents();
  }

  /** Set the main window reference for IPC events to the renderer. */
  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start the host agent:
   *   1. Detect streamer binary
   *   2. Load / register with control plane
   *   3. Start streamer in standby mode
   *   4. Start heartbeat
   *   5. Connect signaling
   */
  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') return;

    this.setState('starting');
    this.lastError = null;

    try {
      // Step 1: Detect streamer.
      console.log('[host-agent] detecting streamer...');
      this.streamerInfo = await this.streamer.detect();
      console.log(
        `[host-agent] streamer found: ${this.streamerInfo.path} v${this.streamerInfo.version} GPU=${this.streamerInfo.gpuName}`,
      );

      // Step 2: Verify registration.
      if (!this.config.hostId || !this.config.apiToken) {
        throw new Error('Host is not registered. Please register first via Settings.');
      }

      // Step 3: Start streamer in standby.
      console.log('[host-agent] starting streamer in standby...');
      await this.streamer.start();

      // Step 4: Start heartbeat.
      this.registration.startHeartbeat();

      // Step 5: Connect signaling.
      this.signaling.connect(
        this.config.controlPlaneUrl,
        this.config.hostId,
        this.config.apiToken,
      );

      this.setState('running');
      console.log('[host-agent] host agent is running');
    } catch (err) {
      const msg = (err as Error).message;
      this.lastError = msg;
      this.setState('error');
      console.error('[host-agent] start failed:', msg);
      throw err;
    }
  }

  /**
   * Stop the host agent gracefully:
   *   1. Stop QoS / active session
   *   2. Stop streamer
   *   3. Stop heartbeat
   *   4. Disconnect signaling
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped') return;

    console.log('[host-agent] stopping...');

    // Stop signaling (also stops QoS + ends active session).
    this.signaling.disconnect();

    // Stop heartbeat.
    this.registration.stopHeartbeat();

    // Stop streamer process.
    try {
      await this.streamer.stop();
    } catch (err) {
      console.warn('[host-agent] streamer stop error:', (err as Error).message);
    }

    this.setState('stopped');
    this.lastError = null;
    console.log('[host-agent] stopped');
  }

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  /**
   * Register this host with the control plane.
   * Called from the renderer's HostSetupWizard.
   */
  async register(config: {
    bootstrapToken: string;
    hostName: string;
    controlPlaneUrl: string;
  }): Promise<RegistrationResponse> {
    // Update config with new values.
    this.config.bootstrapToken = config.bootstrapToken;
    this.config.hostName = config.hostName;
    this.config.controlPlaneUrl = config.controlPlaneUrl;

    this.registration.updateConfig({
      bootstrapToken: config.bootstrapToken,
      hostName: config.hostName,
      controlPlaneUrl: config.controlPlaneUrl,
    });

    const resp = await this.registration.register();

    // Update our config with the registration data.
    this.config.hostId = resp.host_id;
    this.config.apiToken = resp.api_token;
    this.config.registeredAt = resp.registered_at;

    return resp;
  }

  // -----------------------------------------------------------------------
  // Status
  // -----------------------------------------------------------------------

  /** Get the current status of the host agent. */
  getStatus(): HostAgentStatus {
    const session = this.signaling.getCurrentSession();

    return {
      state: this.state,
      hostId: this.config.hostId,
      gpuModel: this.streamerInfo?.gpuName ?? '',
      codecs: this.streamerInfo?.codecs ?? [],
      streamerRunning: this.streamer.isRunning(),
      signalingConnected: this.signaling.isConnected(),
      activeSession: session && session.state === 'active'
        ? {
            sessionId: session.sessionId,
            codec: session.offer.codecs[0] ?? '',
            connectionType: session.connectionType,
            userId: session.offer.userId,
          }
        : null,
      error: this.lastError,
    };
  }

  /** Get current streamer stats (during active session). */
  async getStreamerStats(): Promise<SessionStats | null> {
    if (!this.streamer.isRunning() || !this.streamer.isConnected()) return null;
    try {
      return await this.streamer.getStats();
    } catch {
      return null;
    }
  }

  /** Force an IDR keyframe. */
  async forceIDR(): Promise<void> {
    await this.streamer.forceIDR();
  }

  /** Get current config. */
  getConfig(): HostAgentConfig {
    return { ...this.config };
  }

  /** Update config (e.g., from settings page). */
  updateConfig(partial: Partial<HostAgentConfig>): void {
    Object.assign(this.config, partial);
    this.registration.updateConfig(partial);
    if (partial.stunServers) {
      // We'd need to rebuild signaling if STUN servers change — but that's rare.
      // For now, it takes effect on next session.
    }
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private setState(state: HostAgentState): void {
    this.state = state;
    this.sendToRenderer('host:status-change', this.getStatus());
    this.emit('status-change', this.getStatus());
  }

  private setupSignalingEvents(): void {
    this.signaling.on('session-started', (data) => {
      this.sendToRenderer('host:session-started', data);
      this.emit('session-started', data);
    });

    this.signaling.on('session-active', (_data) => {
      this.sendToRenderer('host:status-change', this.getStatus());
    });

    this.signaling.on('session-ended', (data) => {
      this.sendToRenderer('host:session-ended', data);
      this.sendToRenderer('host:status-change', this.getStatus());
      this.emit('session-ended', data);
    });

    this.signaling.on('session-error', (data) => {
      this.sendToRenderer('host:session-error', data);
    });

    this.signaling.on('streamer-stats', (data) => {
      this.sendToRenderer('host:streamer-stats', data);
    });

    this.signaling.on('connected', () => {
      this.sendToRenderer('host:status-change', this.getStatus());
    });

    this.signaling.on('disconnected', () => {
      this.sendToRenderer('host:status-change', this.getStatus());
    });

    // Streamer process exit.
    this.streamer.on('exit', () => {
      if (this.state === 'running') {
        this.lastError = 'Streamer process exited unexpectedly';
        this.setState('error');
      }
    });
  }

  /** Send an IPC event to the renderer. */
  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}
