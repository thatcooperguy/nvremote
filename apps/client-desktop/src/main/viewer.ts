// ---------------------------------------------------------------------------
// Bridge to the crazystream-viewer native N-API addon
// ---------------------------------------------------------------------------

import path from 'path';
import { app } from 'electron';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ViewerConfig {
  sessionId: string;
  codec: string;
  windowHandle: Buffer; // HWND from Electron
  gamingMode: 'competitive' | 'balanced' | 'cinematic';
  maxBitrate?: number;
  targetFps?: number;
}

export interface StreamStats {
  bitrate: number;
  fps: number;
  packetLoss: number;
  jitter: number;
  rtt: number;
  codec: string;
  resolution: { width: number; height: number };
  connectionType: string;
  decodeTimeMs: number;
  renderTimeMs: number;
  gamingMode: string;
}

export interface IceCandidate {
  type: 'host' | 'srflx' | 'relay';
  ip: string;
  port: number;
  protocol: string;
  priority: number;
  foundation: string;
}

export interface ViewerModule {
  start(config: ViewerConfig): void;
  stop(): void;
  getStats(): StreamStats;
  onDisconnect(callback: () => void): void;
  setQuality(preset: string): void;
  setGamingMode(mode: string): void;
  gatherIceCandidates(stunServers: string[]): Promise<IceCandidate[]>;
  addRemoteCandidate(candidate: IceCandidate): void;
  connectP2P(config: { dtlsFingerprint: string }): Promise<{ connectionType: string }>;
  disconnectP2P(): void;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let nativeViewer: ViewerModule | null = null;
let usingMock = false;

// ---------------------------------------------------------------------------
// Addon search paths
// ---------------------------------------------------------------------------

function getAddonSearchPaths(): string[] {
  const isDev = !app.isPackaged;

  const paths: string[] = [];

  // Environment variable override
  if (process.env.CRAZYSTREAM_VIEWER_PATH) {
    paths.push(process.env.CRAZYSTREAM_VIEWER_PATH);
  }

  if (isDev) {
    // Development: check build output directories relative to the monorepo
    const repoRoot = path.resolve(__dirname, '../../../../..');
    paths.push(
      path.join(repoRoot, 'libs', 'crazystream-viewer', 'build', 'Release', 'crazystream-viewer.node'),
      path.join(repoRoot, 'libs', 'crazystream-viewer', 'build', 'Debug', 'crazystream-viewer.node'),
      path.join(repoRoot, 'build', 'Release', 'crazystream-viewer.node'),
    );
  }

  // Production: bundled alongside the app binary
  const appDir = path.dirname(app.getPath('exe'));
  paths.push(
    path.join(appDir, 'resources', 'crazystream-viewer.node'),
    path.join(appDir, 'crazystream-viewer.node'),
  );

  // Also check next to the main JS entry
  paths.push(
    path.join(__dirname, 'crazystream-viewer.node'),
    path.join(__dirname, '..', 'crazystream-viewer.node'),
  );

  return paths;
}

// ---------------------------------------------------------------------------
// Mock viewer for development when the native addon is not built
// ---------------------------------------------------------------------------

function createMockViewer(): ViewerModule {
  const isWindows = process.platform === 'win32';
  console.warn(
    isWindows
      ? '[Viewer] Native addon not found. Using mock viewer for development.\n' +
        'Build the crazystream-viewer addon or set CRAZYSTREAM_VIEWER_PATH to use the real viewer.'
      : `[Viewer] Native streaming addon is not available on ${process.platform}.\n` +
        'GPU capture and hardware decoding require Windows with an NVIDIA GPU.\n' +
        'The app will run in limited mode (signaling, authentication, and host management only).'
  );

  let running = false;
  let currentGamingMode = 'balanced';
  let currentCodec = 'H.265';
  let disconnectCallback: (() => void) | null = null;

  return {
    start(config: ViewerConfig): void {
      console.log('[Viewer Mock] start() called with:', {
        sessionId: config.sessionId,
        codec: config.codec,
        gamingMode: config.gamingMode,
        maxBitrate: config.maxBitrate,
        targetFps: config.targetFps,
      });
      running = true;
      currentGamingMode = config.gamingMode;
      currentCodec = config.codec;
    },

    stop(): void {
      console.log('[Viewer Mock] stop() called');
      running = false;
    },

    getStats(): StreamStats {
      if (!running) {
        return {
          bitrate: 0,
          fps: 0,
          packetLoss: 0,
          jitter: 0,
          rtt: 0,
          codec: 'none',
          resolution: { width: 0, height: 0 },
          connectionType: 'none',
          decodeTimeMs: 0,
          renderTimeMs: 0,
          gamingMode: currentGamingMode,
        };
      }

      // Return simulated stats that look realistic
      return {
        bitrate: 20_000 + Math.round(Math.random() * 30_000),
        fps: currentGamingMode === 'competitive' ? 235 + Math.round(Math.random() * 10)
           : currentGamingMode === 'balanced' ? 118 + Math.round(Math.random() * 4)
           : 58 + Math.round(Math.random() * 4),
        packetLoss: Math.round(Math.random() * 5) / 10,
        jitter: Math.round(Math.random() * 3 * 10) / 10,
        rtt: 5 + Math.round(Math.random() * 15),
        codec: currentCodec,
        resolution: currentGamingMode === 'cinematic'
          ? { width: 3840, height: 2160 }
          : currentGamingMode === 'balanced'
          ? { width: 2560, height: 1440 }
          : { width: 1920, height: 1080 },
        connectionType: 'p2p',
        decodeTimeMs: Math.round(Math.random() * 3 * 10) / 10,
        renderTimeMs: Math.round(Math.random() * 2 * 10) / 10,
        gamingMode: currentGamingMode,
      };
    },

    onDisconnect(callback: () => void): void {
      disconnectCallback = callback;
      console.log('[Viewer Mock] onDisconnect() registered');
    },

    setQuality(preset: string): void {
      console.log('[Viewer Mock] setQuality():', preset);
    },

    setGamingMode(mode: string): void {
      console.log('[Viewer Mock] setGamingMode():', mode);
      currentGamingMode = mode;
    },

    async gatherIceCandidates(stunServers: string[]): Promise<IceCandidate[]> {
      console.log('[Viewer Mock] gatherIceCandidates() with STUN servers:', stunServers);

      // Simulate a brief gathering delay
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Return mock candidates
      return [
        {
          type: 'host',
          ip: '192.168.1.100',
          port: 49152,
          protocol: 'udp',
          priority: 2130706431,
          foundation: '1',
        },
        {
          type: 'srflx',
          ip: '203.0.113.50',
          port: 55000,
          protocol: 'udp',
          priority: 1694498815,
          foundation: '2',
        },
      ];
    },

    addRemoteCandidate(candidate: IceCandidate): void {
      console.log('[Viewer Mock] addRemoteCandidate():', candidate.type, candidate.ip, candidate.port);
    },

    async connectP2P(config: { dtlsFingerprint: string }): Promise<{ connectionType: string }> {
      console.log('[Viewer Mock] connectP2P() with DTLS fingerprint:', config.dtlsFingerprint.slice(0, 16) + '...');

      // Simulate connection delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      return { connectionType: 'p2p' };
    },

    disconnectP2P(): void {
      console.log('[Viewer Mock] disconnectP2P() called');
      running = false;
      if (disconnectCallback) {
        disconnectCallback();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to load the native crazystream-viewer addon.
 * Falls back to a mock implementation when the .node binary is not found
 * (typical during development before the native addon has been compiled).
 */
export function loadViewer(): ViewerModule {
  if (nativeViewer) return nativeViewer;

  const searchPaths = getAddonSearchPaths();

  for (const addonPath of searchPaths) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const addon = require(addonPath) as ViewerModule;
      console.log(`[Viewer] Native addon loaded from: ${addonPath}`);
      nativeViewer = addon;
      usingMock = false;
      return addon;
    } catch {
      // Not found at this path; try the next one.
    }
  }

  // No native addon found -- fall back to mock
  nativeViewer = createMockViewer();
  usingMock = true;
  return nativeViewer;
}

/**
 * Check whether a native viewer addon is available (has been loaded or can be loaded).
 */
export function isViewerAvailable(): boolean {
  if (nativeViewer && !usingMock) return true;

  // Attempt to load if not yet tried
  loadViewer();
  return !usingMock;
}

/**
 * Get the current viewer module. Loads it if not yet loaded.
 * Always succeeds -- returns mock if native is unavailable.
 */
export function getViewer(): ViewerModule {
  if (!nativeViewer) {
    loadViewer();
  }
  return nativeViewer!;
}

/**
 * Returns true if the current viewer is the mock implementation.
 */
export function isUsingMockViewer(): boolean {
  return usingMock;
}
