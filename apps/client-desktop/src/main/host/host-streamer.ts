/**
 * host-streamer.ts — Streamer Process Manager + Named Pipe IPC
 *
 * Ported from:
 *   apps/host-agent/internal/streamer/manager.go
 *   apps/host-agent/internal/streamer/ipc.go
 *   apps/host-agent/internal/streamer/ipc_windows.go
 *
 * Manages the lifecycle of nvremote-host.exe and communicates via a Windows
 * named pipe using newline-delimited JSON (JSON-RPC style).
 */

import { ChildProcess, spawn, execFile } from 'child_process';
import net from 'net';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Types (mirrored from Go structs)
// ---------------------------------------------------------------------------

export interface StreamerInfo {
  path: string;
  version: string;
  codecs: string[];
  gpuName: string;
}

export interface StreamerCapabilities {
  codecs: string[];
  maxResolution: string;
  maxFps: number;
  gpuName: string;
  nvencVersion: string;
}

export interface SessionConfig {
  sessionId: string;
  codec: string;
  bitrateKbps: number;
  fps: number;
  width: number;
  height: number;
  gamingMode: string;
  stunServers: string[];
}

export interface PeerInfo {
  ip: string;
  port: number;
  dtlsFingerprint: string;
}

export interface SessionStats {
  bitrateKbps: number;
  fps: number;
  width: number;
  height: number;
  packetLoss: number;
  jitterMs: number;
  rttMs: number;
  framesSent: number;
  bytesSent: number;
  codec: string;
  gamingMode: string;
  fecRatio: number;
  estimatedBwKbps: number;
  decodeTimeUs: number;
  qosState: string;
}

// IPC protocol types (newline-delimited JSON)
interface IpcCommand {
  command: string;
  params?: Record<string, unknown>;
}

interface IpcResponse {
  status: 'ok' | 'error';
  error?: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PIPE_NAME = '\\\\.\\pipe\\nvremote-host';
const DEFAULT_PROCESS_NAME = 'nvremote-host.exe';

const PROCESS_START_TIMEOUT = 15_000; // 15s — wait for pipe creation
const PROCESS_STOP_TIMEOUT = 10_000;  // 10s — graceful shutdown
const IPC_CONNECT_TIMEOUT = 5_000;    // 5s
const IPC_READ_TIMEOUT = 10_000;      // 10s
const IPC_WRITE_TIMEOUT = 5_000;      // 5s
const PIPE_POLL_INTERVAL = 250;       // 250ms

// ---------------------------------------------------------------------------
// HostStreamer
// ---------------------------------------------------------------------------

export class HostStreamer extends EventEmitter {
  private process: ChildProcess | null = null;
  private pipeName: string;
  private conn: net.Socket | null = null;
  private readBuffer = '';
  private pendingResolve: ((resp: IpcResponse) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private readTimer: ReturnType<typeof setTimeout> | null = null;
  private streamerPath: string | null = null;

  constructor(pipeName?: string) {
    super();
    this.pipeName = pipeName ?? DEFAULT_PIPE_NAME;
  }

  // -----------------------------------------------------------------------
  // Detection
  // -----------------------------------------------------------------------

  /**
   * Detect checks if nvremote-host.exe exists and gathers info (version,
   * GPU, codecs). Does NOT start the process.
   */
  async detect(configPath?: string): Promise<StreamerInfo> {
    const exePath = configPath || this.findStreamerPath();
    if (!exePath) {
      throw new Error('nvremote-host.exe not found');
    }

    if (!fs.existsSync(exePath)) {
      throw new Error(`nvremote-host binary not accessible at ${exePath}`);
    }

    this.streamerPath = exePath;

    const [version, gpuName, codecs] = await Promise.allSettled([
      this.getStreamerVersion(exePath),
      this.detectGPU(),
      this.queryCodecs(exePath),
    ]);

    return {
      path: exePath,
      version: version.status === 'fulfilled' ? version.value : 'unknown',
      gpuName: gpuName.status === 'fulfilled' ? gpuName.value : 'unknown',
      codecs: codecs.status === 'fulfilled' ? codecs.value : ['h264', 'h265'],
    };
  }

  // -----------------------------------------------------------------------
  // Process Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start launches nvremote-host.exe in standby mode and connects to the
   * named pipe IPC channel.
   */
  async start(configPath?: string): Promise<void> {
    if (this.process && !this.process.killed) {
      // Already running.
      return;
    }

    const exePath = configPath || this.streamerPath || this.findStreamerPath();
    if (!exePath) {
      throw new Error('nvremote-host.exe not found');
    }
    this.streamerPath = exePath;

    console.log(`[host-streamer] starting nvremote-host: ${exePath} pipe=${this.pipeName}`);

    this.process = spawn(exePath, ['--ipc-pipe', this.pipeName, '--standby'], {
      stdio: 'ignore',
      windowsHide: true,
    });

    this.process.on('exit', (code, signal) => {
      console.log(`[host-streamer] nvremote-host exited code=${code} signal=${signal}`);
      this.process = null;
      this.closeIpc();
      this.emit('exit', { code, signal });
    });

    this.process.on('error', (err) => {
      console.error('[host-streamer] nvremote-host spawn error:', err.message);
      this.emit('error', err);
    });

    console.log(`[host-streamer] nvremote-host started pid=${this.process.pid}`);

    // Wait for the pipe then connect IPC.
    await this.waitForPipe();
    await this.connectIpc();

    console.log('[host-streamer] connected to nvremote-host IPC pipe');
  }

  /**
   * Stop gracefully stops nvremote-host.exe. Sends a shutdown command via
   * IPC first, then waits. If it doesn't exit in time, force-kills.
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    const pid = this.process.pid;
    console.log(`[host-streamer] stopping nvremote-host pid=${pid}`);

    // Try graceful IPC shutdown first.
    if (this.conn) {
      try {
        await this.sendCommand('shutdown', undefined, 3_000);
        // Wait for process to exit within timeout.
        await this.waitForExit(PROCESS_STOP_TIMEOUT);
        console.log('[host-streamer] nvremote-host stopped gracefully');
        this.cleanup();
        return;
      } catch {
        console.warn('[host-streamer] graceful shutdown failed or timed out, killing');
      }
    }

    // Force kill.
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      try {
        await this.waitForExit(3_000);
      } catch {
        // Last resort.
        this.process?.kill('SIGKILL');
      }
    }

    this.cleanup();
    console.log('[host-streamer] nvremote-host process killed');
  }

  /** Returns true if the nvremote-host process is alive. */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /** Returns true if the IPC pipe connection is open. */
  isConnected(): boolean {
    return this.conn !== null && !this.conn.destroyed;
  }

  // -----------------------------------------------------------------------
  // IPC Commands
  // -----------------------------------------------------------------------

  /** Query streamer capabilities via IPC. */
  async getCapabilities(): Promise<StreamerCapabilities> {
    const data = await this.sendCommand('get_capabilities');
    return {
      codecs: (data?.codecs as string[]) ?? [],
      maxResolution: (data?.max_resolution as string) ?? '',
      maxFps: (data?.max_fps as number) ?? 0,
      gpuName: (data?.gpu_name as string) ?? '',
      nvencVersion: (data?.nvenc_version as string) ?? '',
    };
  }

  /** Prepare a session — configure encoder without starting the stream. */
  async prepareSession(config: SessionConfig): Promise<void> {
    await this.sendCommand('prepare_session', {
      session_id: config.sessionId,
      codec: config.codec,
      bitrate_kbps: config.bitrateKbps,
      fps: config.fps,
      width: config.width,
      height: config.height,
      gaming_mode: config.gamingMode,
      stun_servers: config.stunServers,
    });
    console.log(`[host-streamer] session prepared: ${config.sessionId}`);
  }

  /** Start streaming to the given peer. */
  async startSession(peer: PeerInfo): Promise<void> {
    await this.sendCommand('start_session', {
      ip: peer.ip,
      port: peer.port,
      dtls_fingerprint: peer.dtlsFingerprint,
    });
    console.log(`[host-streamer] session started: ${peer.ip}:${peer.port}`);
  }

  /** Stop the active streaming session. */
  async stopSession(sessionId: string): Promise<void> {
    await this.sendCommand('stop_session', { session_id: sessionId });
    console.log(`[host-streamer] session stopped: ${sessionId}`);
  }

  /** Get real-time statistics for the active session. */
  async getStats(): Promise<SessionStats> {
    const data = await this.sendCommand('get_stats');
    return {
      bitrateKbps: (data?.bitrate_kbps as number) ?? 0,
      fps: (data?.fps as number) ?? 0,
      width: (data?.width as number) ?? 0,
      height: (data?.height as number) ?? 0,
      packetLoss: (data?.packet_loss as number) ?? 0,
      jitterMs: (data?.jitter_ms as number) ?? 0,
      rttMs: (data?.rtt_ms as number) ?? 0,
      framesSent: (data?.frames_sent as number) ?? 0,
      bytesSent: (data?.bytes_sent as number) ?? 0,
      codec: (data?.codec as string) ?? '',
      gamingMode: (data?.gaming_mode as string) ?? '',
      fecRatio: (data?.fec_ratio as number) ?? 0,
      estimatedBwKbps: (data?.estimated_bw_kbps as number) ?? 0,
      decodeTimeUs: (data?.decode_time_us as number) ?? 0,
      qosState: (data?.qos_state as string) ?? '',
    };
  }

  /** Force an IDR (keyframe). */
  async forceIDR(): Promise<void> {
    await this.sendCommand('force_idr');
  }

  /** Set the gaming mode (competitive / balanced / cinematic). */
  async setGamingMode(mode: string): Promise<void> {
    await this.sendCommand('set_gaming_mode', { mode });
    console.log(`[host-streamer] gaming mode updated: ${mode}`);
  }

  // -----------------------------------------------------------------------
  // Named Pipe IPC (low level)
  // -----------------------------------------------------------------------

  /**
   * Connect to the named pipe. Node's `net.connect` on Windows natively
   * supports `\\.\pipe\<name>` paths — no native addons needed.
   */
  private connectIpc(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`IPC connect timeout after ${IPC_CONNECT_TIMEOUT}ms`));
      }, IPC_CONNECT_TIMEOUT);

      const sock = net.connect(this.pipeName, () => {
        clearTimeout(timeout);
        this.conn = sock;
        this.readBuffer = '';
        this.setupPipeReader();
        resolve();
      });

      sock.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`IPC connect error: ${err.message}`));
      });
    });
  }

  /**
   * Set up the data listener that accumulates newline-delimited JSON and
   * resolves the pending promise.
   */
  private setupPipeReader(): void {
    if (!this.conn) return;

    this.conn.on('data', (chunk: Buffer) => {
      this.readBuffer += chunk.toString('utf-8');

      // Process all complete lines.
      let newlineIdx: number;
      while ((newlineIdx = this.readBuffer.indexOf('\n')) !== -1) {
        const line = this.readBuffer.slice(0, newlineIdx).trim();
        this.readBuffer = this.readBuffer.slice(newlineIdx + 1);

        if (line && this.pendingResolve) {
          try {
            const resp: IpcResponse = JSON.parse(line);
            if (this.readTimer) clearTimeout(this.readTimer);
            this.readTimer = null;
            const resolveFn = this.pendingResolve;
            this.pendingResolve = null;
            this.pendingReject = null;
            resolveFn(resp);
          } catch (err) {
            if (this.pendingReject) {
              const rejectFn = this.pendingReject;
              this.pendingResolve = null;
              this.pendingReject = null;
              if (this.readTimer) clearTimeout(this.readTimer);
              this.readTimer = null;
              rejectFn(new Error(`Invalid IPC JSON: ${(err as Error).message}`));
            }
          }
        }
      }
    });

    this.conn.on('close', () => {
      if (this.pendingReject) {
        this.pendingReject(new Error('IPC pipe closed'));
        this.pendingResolve = null;
        this.pendingReject = null;
      }
      this.conn = null;
    });
  }

  /**
   * Send a JSON command over the pipe and await the response.
   */
  private sendCommand(
    command: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<Record<string, unknown> | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.conn || this.conn.destroyed) {
        return reject(new Error('IPC client not connected'));
      }

      if (this.pendingResolve) {
        return reject(new Error('Another IPC command is already pending'));
      }

      const cmd: IpcCommand = { command };
      if (params) cmd.params = params;
      const data = JSON.stringify(cmd) + '\n';

      // Set read timeout.
      const readTimeout = timeoutMs ?? IPC_READ_TIMEOUT;
      this.readTimer = setTimeout(() => {
        if (this.pendingReject) {
          const rejectFn = this.pendingReject;
          this.pendingResolve = null;
          this.pendingReject = null;
          rejectFn(new Error(`IPC read timeout after ${readTimeout}ms for "${command}"`));
        }
      }, readTimeout);

      // Install response handler.
      this.pendingResolve = (resp: IpcResponse) => {
        if (resp.status === 'error') {
          reject(new Error(`IPC command "${command}" failed: ${resp.error}`));
        } else {
          resolve(resp.data);
        }
      };
      this.pendingReject = reject;

      // Write command to pipe.
      this.conn.write(data, 'utf-8', (err) => {
        if (err) {
          if (this.readTimer) clearTimeout(this.readTimer);
          this.readTimer = null;
          this.pendingResolve = null;
          this.pendingReject = null;
          reject(new Error(`IPC write error: ${err.message}`));
        }
      });
    });
  }

  /** Close the IPC pipe connection. */
  private closeIpc(): void {
    if (this.readTimer) {
      clearTimeout(this.readTimer);
      this.readTimer = null;
    }
    if (this.pendingReject) {
      this.pendingReject(new Error('IPC connection closing'));
      this.pendingResolve = null;
      this.pendingReject = null;
    }
    if (this.conn) {
      this.conn.destroy();
      this.conn = null;
    }
    this.readBuffer = '';
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Poll for the named pipe to exist. On Windows, named pipes appear as
   * files under \\.\pipe\. We use fs.stat to check existence.
   */
  private waitForPipe(): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + PROCESS_START_TIMEOUT;

      const poll = () => {
        fs.stat(this.pipeName, (err) => {
          if (!err) {
            resolve();
            return;
          }
          if (Date.now() >= deadline) {
            reject(
              new Error(
                `nvremote-host did not create IPC pipe ${this.pipeName} within ${PROCESS_START_TIMEOUT}ms`,
              ),
            );
            return;
          }
          setTimeout(poll, PIPE_POLL_INTERVAL);
        });
      };

      poll();
    });
  }

  /** Wait for the child process to exit, with a timeout. */
  private waitForExit(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error('Process exit timeout'));
      }, timeoutMs);

      this.process.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** Full cleanup of process and IPC state. */
  private cleanup(): void {
    this.closeIpc();
    this.process = null;
  }

  /**
   * Search for nvremote-host.exe in common locations:
   *   1. Electron extraResources (packaged app)
   *   2. Project libs/build directory (dev mode)
   *   3. Program Files
   *   4. PATH
   */
  private findStreamerPath(): string | null {
    const candidates: string[] = [];

    // 1. Electron resources/ (packaged) — extraResources places files here.
    try {
      const resourcesDir = path.join(
        app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources'),
        'resources',
      );
      candidates.push(path.join(resourcesDir, DEFAULT_PROCESS_NAME));
    } catch {
      // app may not be ready yet.
    }

    // 2. Dev build output (monorepo).
    try {
      const devPath = path.resolve(
        app.getAppPath(),
        '..', '..', 'libs', 'nvremote-host', 'build', 'Release', DEFAULT_PROCESS_NAME,
      );
      candidates.push(devPath);
    } catch {
      // Ignore.
    }

    // 3. Standard installation directories.
    candidates.push(`C:\\Program Files\\NVRemote\\${DEFAULT_PROCESS_NAME}`);
    candidates.push(`C:\\Program Files (x86)\\NVRemote\\${DEFAULT_PROCESS_NAME}`);

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }

    // 4. PATH lookup.
    try {
      const { execFileSync } = require('child_process');
      const where = execFileSync('where', [DEFAULT_PROCESS_NAME], {
        encoding: 'utf-8',
        windowsHide: true,
      }).trim();
      if (where) return where.split('\n')[0].trim();
    } catch {
      // Not found in PATH.
    }

    return null;
  }

  /** Run nvremote-host.exe --version and return the trimmed output. */
  private getStreamerVersion(exePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(exePath, ['--version'], { windowsHide: true, timeout: 5_000 }, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout.trim());
      });
    });
  }

  /** Run nvremote-host.exe --list-codecs and parse one codec per line. */
  private queryCodecs(exePath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      execFile(exePath, ['--list-codecs'], { windowsHide: true, timeout: 5_000 }, (err, stdout) => {
        if (err) return reject(err);
        const codecs = stdout
          .trim()
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        if (codecs.length === 0) return reject(new Error('no codecs reported'));
        resolve(codecs);
      });
    });
  }

  /** Query GPU model via nvidia-smi. */
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
          // Multiple GPUs — take first.
          resolve(model.split('\n')[0].trim());
        },
      );
    });
  }
}
