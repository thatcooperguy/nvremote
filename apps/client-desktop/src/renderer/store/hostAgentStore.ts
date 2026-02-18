/**
 * hostAgentStore.ts — Zustand store for host-mode agent status.
 *
 * Syncs with the main process HostAgent via IPC events.
 * Separate from hostStore.ts which manages client-side host list.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types (mirrored from main process)
// ---------------------------------------------------------------------------

export interface HostAgentStatus {
  state: 'stopped' | 'starting' | 'running' | 'error';
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

export interface StreamerStats {
  bitrateKbps: number;
  fps: number;
  width: number;
  height: number;
  packetLossPercent: number;
  rttMs: number;
  jitterMs: number;
  codec: string;
  profile: string;
  qosState: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface HostAgentState {
  // Status synced from main process.
  status: HostAgentStatus;
  // Live streamer stats (updated every 2s during active session).
  streamerStats: StreamerStats | null;
  // Config loaded from electron-store.
  config: HostAgentConfig | null;
  // Loading states.
  isRegistering: boolean;
  isStarting: boolean;

  // Derived convenience getters.
  isRegistered: boolean;
  isHostMode: boolean;

  // Actions.
  setMode: (mode: 'client' | 'host' | 'both') => Promise<void>;
  loadConfig: () => Promise<void>;
  register: (bootstrapToken: string, hostName: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  startAgent: () => Promise<void>;
  stopAgent: () => Promise<void>;
  forceIDR: () => Promise<void>;
  setConfig: (partial: Record<string, unknown>) => Promise<void>;
  _setStatus: (status: HostAgentStatus) => void;
  _setStreamerStats: (stats: StreamerStats) => void;
}

const defaultStatus: HostAgentStatus = {
  state: 'stopped',
  hostId: '',
  gpuModel: '',
  codecs: [],
  streamerRunning: false,
  signalingConnected: false,
  activeSession: null,
  error: null,
};

export const useHostAgentStore = create<HostAgentState>((set, get) => ({
  status: defaultStatus,
  streamerStats: null,
  config: null,
  isRegistering: false,
  isStarting: false,
  isRegistered: false,
  isHostMode: false,

  setMode: async (mode) => {
    const result = await window.nvrs.host.setMode(mode);
    if (!result.success) throw new Error(result.error || 'Failed to set mode');
    // Reload config to reflect mode change.
    await get().loadConfig();
    await get().refreshStatus();
  },

  loadConfig: async () => {
    const config = await window.nvrs.host.getConfig();
    set({
      config: config as HostAgentConfig,
      isRegistered: Boolean(config.hostId),
      isHostMode: config.mode === 'host' || config.mode === 'both',
    });
  },

  register: async (bootstrapToken, hostName) => {
    set({ isRegistering: true });
    try {
      const result = await window.nvrs.host.register({ bootstrapToken, hostName });
      if (!result.success) throw new Error(result.error || 'Registration failed');
      // Reload config and status after registration.
      await get().loadConfig();
      await get().refreshStatus();
    } finally {
      set({ isRegistering: false });
    }
  },

  refreshStatus: async () => {
    const status = await window.nvrs.host.getStatus();
    set({
      status: status as HostAgentStatus,
      isRegistered: Boolean(status.hostId),
    });
  },

  startAgent: async () => {
    set({ isStarting: true });
    try {
      const result = await window.nvrs.host.start();
      if (!result.success) throw new Error(result.error || 'Failed to start agent');
      await get().refreshStatus();
    } finally {
      set({ isStarting: false });
    }
  },

  stopAgent: async () => {
    const result = await window.nvrs.host.stop();
    if (!result.success) throw new Error(result.error || 'Failed to stop agent');
    await get().refreshStatus();
  },

  forceIDR: async () => {
    await window.nvrs.host.forceIDR();
  },

  setConfig: async (partial) => {
    const result = await window.nvrs.host.setConfig(partial);
    if (!result.success) throw new Error(result.error || 'Failed to save config');
    await get().loadConfig();
  },

  _setStatus: (status) => {
    set({
      status,
      isRegistered: Boolean(status.hostId),
    });
  },

  _setStreamerStats: (stats) => {
    set({ streamerStats: stats });
  },
}));

// ---------------------------------------------------------------------------
// IPC Event Listeners — subscribe to main process events.
// These run once on module load.
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined' && window.nvrs?.host) {
  // Status change events from main process.
  window.nvrs.host.onStatusChange((status) => {
    useHostAgentStore.getState()._setStatus(status as HostAgentStatus);
  });

  // Streamer stats during active session.
  window.nvrs.host.onStreamerStats((stats) => {
    useHostAgentStore.getState()._setStreamerStats(stats as StreamerStats);
  });

  // Session ended → clear stats.
  window.nvrs.host.onSessionEnded(() => {
    useHostAgentStore.setState({ streamerStats: null });
  });

  // Load initial config + status.
  useHostAgentStore.getState().loadConfig().catch(() => {});
  useHostAgentStore.getState().refreshStatus().catch(() => {});
}
