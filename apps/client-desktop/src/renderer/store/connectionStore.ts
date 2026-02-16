import { create } from 'zustand';
import { useSessionStore } from './sessionStore';
import { useAuthStore } from './authStore';
import type { Host } from '../components/HostCard';

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type ConnectionStatus =
  | 'disconnected'
  | 'requesting'
  | 'signaling'
  | 'ice-gathering'
  | 'connecting'
  | 'connected'
  | 'streaming'
  | 'error';

export type GamingMode = 'competitive' | 'balanced' | 'cinematic';

/**
 * Connection mode — determines how the client connects to the host.
 * - auto: P2P first, automatic TURN fallback (default)
 * - vpn: NVRemote WireGuard VPN relay (user override)
 * - custom-vpn: Route through user's existing VPN
 */
export type ConnectionMode = 'auto' | 'vpn' | 'custom-vpn';

// ---------------------------------------------------------------------------
// Stream stats type (mirroring the native viewer stats)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Store state & actions
// ---------------------------------------------------------------------------

interface ConnectionState {
  status: ConnectionStatus;
  sessionId: string | null;
  hostId: string | null;
  connectedHost: Host | null;
  codec: string | null;
  gamingMode: GamingMode;
  connectionMode: ConnectionMode;
  connectionType: string | null; // 'p2p' or 'relay'
  error: string | null;
  stats: StreamStats | null;

  connect: (host: Host) => Promise<void>;
  disconnect: () => Promise<void>;
  setStatus: (status: ConnectionStatus) => void;
  setError: (error: string | null) => void;
  setGamingMode: (mode: GamingMode) => void;
  setConnectionMode: (mode: ConnectionMode) => void;
  updateStats: (stats: StreamStats) => void;
}

// ---------------------------------------------------------------------------
// Stats polling interval
// ---------------------------------------------------------------------------

let statsInterval: ReturnType<typeof setInterval> | null = null;

function startStatsPolling(): void {
  stopStatsPolling();

  statsInterval = setInterval(async () => {
    const { status } = useConnectionStore.getState();
    if (status !== 'streaming') {
      stopStatsPolling();
      return;
    }

    try {
      const result = await window.nvrs.viewer.stats();
      if (result.success && result.stats) {
        useConnectionStore.getState().updateStats(result.stats);
      }
    } catch {
      // Non-fatal; next tick will retry.
    }
  }, 500);
}

function stopStatsPolling(): void {
  if (statsInterval !== null) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

// ---------------------------------------------------------------------------
// P2P event listener cleanup handles
// ---------------------------------------------------------------------------

let sessionEndedCleanup: (() => void) | null = null;
let sessionErrorCleanup: (() => void) | null = null;
let p2pDisconnectedCleanup: (() => void) | null = null;

function attachP2PListeners(): void {
  detachP2PListeners();

  sessionEndedCleanup = window.nvrs.p2p.onSessionEnded((data) => {
    const { status } = useConnectionStore.getState();
    if (status === 'streaming' || status === 'connecting') {
      console.warn(`[ConnectionStore] Session ended: ${data.reason}. Triggering auto-disconnect.`);
      useConnectionStore.getState().disconnect().catch((err) => {
        console.error('[ConnectionStore] Auto-disconnect after session end failed:', err);
      });
    }
  });

  sessionErrorCleanup = window.nvrs.p2p.onSessionError((data) => {
    console.error('[ConnectionStore] Session error:', data.error);
    useConnectionStore.getState().setError(data.error);
    useConnectionStore.getState().disconnect().catch(() => {});
  });

  p2pDisconnectedCleanup = window.nvrs.p2p.onDisconnected(() => {
    const { status } = useConnectionStore.getState();
    if (status === 'streaming') {
      console.warn('[ConnectionStore] P2P disconnected unexpectedly. Triggering auto-disconnect.');
      useConnectionStore.getState().disconnect().catch(() => {});
    }
  });
}

function detachP2PListeners(): void {
  if (sessionEndedCleanup) {
    sessionEndedCleanup();
    sessionEndedCleanup = null;
  }
  if (sessionErrorCleanup) {
    sessionErrorCleanup();
    sessionErrorCleanup = null;
  }
  if (p2pDisconnectedCleanup) {
    p2pDisconnectedCleanup();
    p2pDisconnectedCleanup = null;
  }
}

// ---------------------------------------------------------------------------
// Default gaming mode presets
// ---------------------------------------------------------------------------

const GAMING_MODE_PRESETS: Record<GamingMode, { codecs: string[]; maxBitrate: number; targetFps: number }> = {
  competitive: {
    codecs: ['H.264', 'H.265', 'AV1'],
    maxBitrate: 30_000,
    targetFps: 240,
  },
  balanced: {
    codecs: ['H.265', 'AV1', 'H.264'],
    maxBitrate: 50_000,
    targetFps: 120,
  },
  cinematic: {
    codecs: ['AV1', 'H.265', 'H.264'],
    maxBitrate: 80_000,
    targetFps: 60,
  },
};

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: 'disconnected',
  sessionId: null,
  hostId: null,
  connectedHost: null,
  codec: null,
  gamingMode: 'balanced',
  connectionMode: 'auto',
  connectionType: null,
  error: null,
  stats: null,

  // -----------------------------------------------------------------------
  // connect
  //
  // New flow:
  //   1. Connect to signaling WebSocket
  //   2. Emit session:request via signaling WS
  //   3. Receive session:accepted (host accepted, get capabilities)
  //   4. Gather local ICE candidates via native addon
  //   5. Exchange candidates through signaling
  //   6. Establish P2P connection via native addon
  //   7. Start the native viewer
  // -----------------------------------------------------------------------
  connect: async (host: Host) => {
    const { status, gamingMode } = get();
    if (status === 'requesting' || status === 'signaling' || status === 'ice-gathering' || status === 'connecting' || status === 'streaming') {
      throw new Error('Already connected or connecting. Disconnect first.');
    }

    set({
      status: 'requesting',
      error: null,
      connectedHost: host,
      hostId: host.id,
      sessionId: null,
      codec: null,
      connectionType: null,
      stats: null,
    });

    try {
      // 1. Connect to the signaling server
      const accessToken = useAuthStore.getState().tokens?.accessToken;
      if (!accessToken) {
        throw new Error('No access token available. Please log in first.');
      }

      const signalingResult = await window.nvrs.p2p.connectSignaling(accessToken);
      if (!signalingResult.success) {
        throw new Error(signalingResult.error || 'Failed to connect to signaling server.');
      }

      set({ status: 'signaling' });

      // 2. Request a session with the host
      const preset = GAMING_MODE_PRESETS[gamingMode];
      const sessionResult = await window.nvrs.p2p.requestSession(host.id, {
        codecs: preset.codecs,
        gamingMode,
        maxBitrate: preset.maxBitrate,
        targetFps: preset.targetFps,
      });

      if (!sessionResult.success || !sessionResult.session) {
        throw new Error(sessionResult.error || 'Session request was rejected.');
      }

      const sessionInfo = sessionResult.session;
      set({
        sessionId: sessionInfo.sessionId,
        codec: sessionInfo.codec,
        status: 'ice-gathering',
      });

      // 3. Wait for session:accepted event and gather ICE candidates
      //    Use STUN servers from session info, falling back to defaults.
      //    TURN servers with ephemeral credentials are passed through for
      //    NAT traversal fallback.
      const stunServers = sessionInfo.stunServers ?? [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
      ];

      const gatherResult = await window.nvrs.p2p.gatherCandidates(stunServers);
      if (!gatherResult.success) {
        throw new Error(gatherResult.error || 'ICE candidate gathering failed.');
      }

      set({ status: 'connecting' });

      // 4. Establish the P2P connection
      //    The DTLS fingerprint would come from the session:accepted event in production.
      //    For now, use a placeholder that the native addon can validate.
      const connectResult = await window.nvrs.p2p.connect({
        dtlsFingerprint: 'placeholder-dtls-fingerprint',
      });

      if (!connectResult.success) {
        throw new Error(connectResult.error || 'P2P connection failed.');
      }

      set({ connectionType: connectResult.connectionType || 'p2p' });

      // 5. Start the native viewer
      const viewerResult = await window.nvrs.viewer.start({
        sessionId: sessionInfo.sessionId,
        codec: sessionInfo.codec,
        windowHandle: Buffer.alloc(0), // Main process injects the real HWND via getNativeWindowHandle()
        gamingMode,
        maxBitrate: preset.maxBitrate,
        targetFps: preset.targetFps,
      });

      if (!viewerResult.success) {
        // P2P is up but viewer failed. Roll back.
        await window.nvrs.p2p.disconnect().catch(() => {});
        throw new Error(viewerResult.error || 'Failed to start streaming viewer.');
      }

      // 6. Fully streaming. Wire up monitoring.
      set({ status: 'streaming' });
      window.nvrs.tray.updateDisconnect(true);

      attachP2PListeners();
      startStatsPolling();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      console.error('[ConnectionStore] Connection error:', message);

      set({
        status: 'error',
        error: message,
        connectionType: null,
      });

      // Best-effort cleanup of any partial state
      try { await window.nvrs.viewer.stop(); } catch { /* ignore */ }
      try { await window.nvrs.p2p.disconnect(); } catch { /* ignore */ }
      try { await window.nvrs.p2p.disconnectSignaling(); } catch { /* ignore */ }

      stopStatsPolling();
      detachP2PListeners();

      // Notify the server that the session failed
      try {
        await useSessionStore.getState().endSession();
      } catch {
        // ignore
      }

      throw err;
    }
  },

  // -----------------------------------------------------------------------
  // disconnect
  // -----------------------------------------------------------------------
  disconnect: async () => {
    // Immediately update UI state
    set({
      status: 'disconnected',
      connectionType: null,
      stats: null,
    });

    stopStatsPolling();
    detachP2PListeners();

    const errors: string[] = [];

    // 1. Stop the viewer
    try {
      const result = await window.nvrs.viewer.stop();
      if (!result.success) {
        errors.push(result.error || 'Failed to stop viewer');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Viewer stop failed: ${msg}`);
    }

    // 2. Disconnect P2P
    try {
      const result = await window.nvrs.p2p.disconnect();
      if (!result.success) {
        errors.push(result.error || 'Failed to disconnect P2P');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`P2P disconnect failed: ${msg}`);
    }

    // 3. Disconnect signaling
    try {
      await window.nvrs.p2p.disconnectSignaling();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Signaling disconnect failed: ${msg}`);
    }

    // 4. End the server-side session
    try {
      await useSessionStore.getState().endSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Session end failed: ${msg}`);
    }

    set({
      connectedHost: null,
      hostId: null,
      sessionId: null,
      codec: null,
      error: errors.length > 0 ? errors.join('; ') : null,
    });

    window.nvrs.tray.updateDisconnect(false);

    if (errors.length > 0) {
      console.warn('[ConnectionStore] Disconnect completed with errors:', errors);
    }
  },

  setStatus: (status: ConnectionStatus) => set({ status }),
  setError: (error: string | null) => set({ error }),
  setGamingMode: (mode: GamingMode) => {
    set({ gamingMode: mode });

    // If currently streaming, apply the mode change to the viewer
    const { status } = get();
    if (status === 'streaming') {
      window.nvrs.viewer.setGamingMode(mode).catch((err) => {
        console.error('[ConnectionStore] Failed to apply gaming mode:', err);
      });
    }
  },
  setConnectionMode: (mode: ConnectionMode) => {
    const { status } = get();
    if (status !== 'disconnected') {
      console.warn('[ConnectionStore] Cannot change connection mode while connected');
      return;
    }
    set({ connectionMode: mode });
  },
  updateStats: (stats: StreamStats) => set({ stats }),
}));
