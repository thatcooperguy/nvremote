// ---------------------------------------------------------------------------
// Bridge to the nvremote-viewer native N-API addon
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
  /** When false, forces software decode even if GPU acceleration is available. Defaults to true. */
  hardwareDecode?: boolean;
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
  if (process.env.NVREMOTE_VIEWER_PATH) {
    paths.push(process.env.NVREMOTE_VIEWER_PATH);
  }

  if (isDev) {
    // Development: check build output directories relative to the monorepo
    const repoRoot = path.resolve(__dirname, '../../../../..');
    paths.push(
      path.join(repoRoot, 'libs', 'nvremote-viewer', 'build', 'Release', 'nvremote-viewer.node'),
      path.join(repoRoot, 'libs', 'nvremote-viewer', 'build', 'Debug', 'nvremote-viewer.node'),
      path.join(repoRoot, 'build', 'Release', 'nvremote-viewer.node'),
    );
  }

  // Production: bundled alongside the app binary
  const appDir = path.dirname(app.getPath('exe'));
  paths.push(
    path.join(appDir, 'resources', 'nvremote-viewer.node'),
    path.join(appDir, 'nvremote-viewer.node'),
  );

  // Also check next to the main JS entry
  paths.push(
    path.join(__dirname, 'nvremote-viewer.node'),
    path.join(__dirname, '..', 'nvremote-viewer.node'),
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
        'Build the nvremote-viewer addon or set NVREMOTE_VIEWER_PATH to use the real viewer.'
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
      running = true;
      currentGamingMode = config.gamingMode;
      currentCodec = config.codec;
    },

    stop(): void {
      running = false;
    },

    getStats(): StreamStats {
      return {
        bitrate: 0,
        fps: 0,
        packetLoss: 0,
        jitter: 0,
        rtt: 0,
        codec: running ? currentCodec : 'none',
        resolution: { width: 0, height: 0 },
        connectionType: running ? 'mock' : 'none',
        decodeTimeMs: 0,
        renderTimeMs: 0,
        gamingMode: currentGamingMode,
      };
    },

    onDisconnect(callback: () => void): void {
      disconnectCallback = callback;
    },

    setQuality(_preset: string): void {
      // No-op in mock mode
    },

    setGamingMode(mode: string): void {
      currentGamingMode = mode;
    },

    async gatherIceCandidates(_stunServers: string[]): Promise<IceCandidate[]> {
      // Mock returns empty candidates — real ICE requires native addon
      return [];
    },

    addRemoteCandidate(_candidate: IceCandidate): void {
      // No-op in mock mode
    },

    async connectP2P(_config: { dtlsFingerprint: string }): Promise<{ connectionType: string }> {
      return { connectionType: 'mock' };
    },

    disconnectP2P(): void {
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
 * Attempt to load the native nvremote-viewer addon.
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
      // Native addon loaded successfully
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
