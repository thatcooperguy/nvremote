import { contextBridge, ipcRenderer } from 'electron';

// ---------------------------------------------------------------------------
// IPC result wrapper returned by most handlers
// ---------------------------------------------------------------------------

export interface IpcResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

// ---------------------------------------------------------------------------
// Window controls
// ---------------------------------------------------------------------------

const windowApi = {
  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  close: (): void => ipcRenderer.send('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChange: (callback: (isMaximized: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: boolean) =>
      callback(value);
    ipcRenderer.on('window:maximize-change', handler);
    return () => ipcRenderer.removeListener('window:maximize-change', handler);
  },
};

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

const authApi = {
  googleSignIn: (): Promise<IpcResult> =>
    ipcRenderer.invoke('auth:google-sign-in'),

  logout: (): Promise<IpcResult> =>
    ipcRenderer.invoke('auth:logout'),

  setTokens: (tokens: { access: string; refresh: string }): Promise<IpcResult> =>
    ipcRenderer.invoke('auth:set-tokens', tokens),

  getTokens: (): Promise<{ access: string; refresh: string } | null> =>
    ipcRenderer.invoke('auth:get-tokens'),

  onAuthCallback: (
    callback: (data: { token: string; refreshToken?: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { token: string; refreshToken?: string }
    ) => callback(data);
    ipcRenderer.on('deep-link:auth', handler);
    return () => ipcRenderer.removeListener('deep-link:auth', handler);
  },
};

// ---------------------------------------------------------------------------
// Viewer (native nvremote-viewer addon)
// ---------------------------------------------------------------------------

interface ViewerStartConfig {
  sessionId: string;
  codec: string;
  windowHandle: Buffer;
  gamingMode: 'competitive' | 'balanced' | 'cinematic';
  maxBitrate?: number;
  targetFps?: number;
}

const viewerApi = {
  start: (config: ViewerStartConfig): Promise<IpcResult> =>
    ipcRenderer.invoke('viewer:start', config),

  stop: (): Promise<IpcResult> =>
    ipcRenderer.invoke('viewer:stop'),

  stats: (): Promise<{
    success: boolean;
    stats?: {
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
    };
    error?: string;
  }> => ipcRenderer.invoke('viewer:stats'),

  setQuality: (preset: string): Promise<IpcResult> =>
    ipcRenderer.invoke('viewer:set-quality', preset),

  setGamingMode: (mode: string): Promise<IpcResult> =>
    ipcRenderer.invoke('viewer:set-gaming-mode', mode),

  available: (): Promise<{ available: boolean }> =>
    ipcRenderer.invoke('viewer:available'),
};

// ---------------------------------------------------------------------------
// P2P / ICE signaling
// ---------------------------------------------------------------------------

interface IceCandidate {
  type: 'host' | 'srflx' | 'relay';
  ip: string;
  port: number;
  protocol: string;
  priority: number;
  foundation: string;
}

interface SessionOptions {
  codecs: string[];
  gamingMode: 'competitive' | 'balanced' | 'cinematic';
  maxBitrate?: number;
  targetFps?: number;
}

interface SessionInfo {
  sessionId: string;
  hostId: string;
  codec: string;
  gamingMode: 'competitive' | 'balanced' | 'cinematic';
  dtlsFingerprint?: string;
  stunServers?: string[];
  turnServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>;
}

const p2pApi = {
  connectSignaling: (accessToken: string): Promise<IpcResult> =>
    ipcRenderer.invoke('p2p:connect-signaling', accessToken),

  disconnectSignaling: (): Promise<IpcResult> =>
    ipcRenderer.invoke('p2p:disconnect-signaling'),

  requestSession: (
    hostId: string,
    options: SessionOptions,
  ): Promise<{
    success: boolean;
    session?: SessionInfo;
    error?: string;
  }> => ipcRenderer.invoke('p2p:request-session', hostId, options),

  gatherCandidates: (stunServers: string[]): Promise<{
    success: boolean;
    candidates?: IceCandidate[];
    error?: string;
  }> => ipcRenderer.invoke('p2p:gather-candidates', stunServers),

  addRemoteCandidate: (candidate: IceCandidate): Promise<IpcResult> =>
    ipcRenderer.invoke('p2p:add-remote-candidate', candidate),

  connect: (config: { dtlsFingerprint: string }): Promise<{
    success: boolean;
    connectionType?: string;
    error?: string;
  }> => ipcRenderer.invoke('p2p:connect', config),

  disconnect: (): Promise<IpcResult> =>
    ipcRenderer.invoke('p2p:disconnect'),

  reconnect: (): Promise<IpcResult> =>
    ipcRenderer.invoke('p2p:reconnect'),

  status: (): Promise<{
    signalingConnected: boolean;
    sessionId: string | null;
  }> => ipcRenderer.invoke('p2p:status'),

  // Event listeners for P2P lifecycle events forwarded from main process
  onSessionAccepted: (
    callback: (info: {
      sessionId: string;
      codec: string;
      capabilities: {
        maxBitrate: number;
        maxFps: number;
        maxResolution: { width: number; height: number };
        supportedCodecs: string[];
      };
      dtlsFingerprint: string;
      stunServers: string[];
    }) => void
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: Parameters<typeof callback>[0]) =>
      callback(info);
    ipcRenderer.on('p2p:session-accepted', handler);
    return () => ipcRenderer.removeListener('p2p:session-accepted', handler);
  },

  onConnected: (
    callback: (info: { sessionId: string; connectionType: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      info: { sessionId: string; connectionType: string }
    ) => callback(info);
    ipcRenderer.on('p2p:connected', handler);
    return () => ipcRenderer.removeListener('p2p:connected', handler);
  },

  onDisconnected: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('p2p:disconnected', handler);
    return () => ipcRenderer.removeListener('p2p:disconnected', handler);
  },

  onSessionEnded: (
    callback: (data: { reason: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { reason: string }
    ) => callback(data);
    ipcRenderer.on('p2p:session-ended', handler);
    return () => ipcRenderer.removeListener('p2p:session-ended', handler);
  },

  onSessionError: (
    callback: (data: { error: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { error: string }
    ) => callback(data);
    ipcRenderer.on('p2p:session-error', handler);
    return () => ipcRenderer.removeListener('p2p:session-error', handler);
  },

  onRemoteCandidate: (callback: (candidate: IceCandidate) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      candidate: IceCandidate
    ) => callback(candidate);
    ipcRenderer.on('p2p:remote-candidate', handler);
    return () => ipcRenderer.removeListener('p2p:remote-candidate', handler);
  },

  onRemoteIceComplete: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('p2p:remote-ice-complete', handler);
    return () => ipcRenderer.removeListener('p2p:remote-ice-complete', handler);
  },

  onHostCapabilities: (
    callback: (info: {
      sessionId: string;
      gpu: { name: string; vram?: number; nvencGen?: string };
      encoders: string[];
      maxEncode?: Record<string, string>;
      captureApi?: string;
      displays?: Array<{ width: number; height: number; refreshRate: number }>;
    }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      info: Parameters<typeof callback>[0]
    ) => callback(info);
    ipcRenderer.on('p2p:host-capabilities', handler);
    return () => ipcRenderer.removeListener('p2p:host-capabilities', handler);
  },

  onCapabilityNegotiated: (
    callback: (info: { sessionId: string; negotiated: boolean }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      info: { sessionId: string; negotiated: boolean }
    ) => callback(info);
    ipcRenderer.on('p2p:capability-negotiated', handler);
    return () => ipcRenderer.removeListener('p2p:capability-negotiated', handler);
  },
};

// ---------------------------------------------------------------------------
// Connection lifecycle events from main process
// ---------------------------------------------------------------------------

const connectionApi = {
  onDisconnected: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('connection:disconnected', handler);
    return () => ipcRenderer.removeListener('connection:disconnected', handler);
  },
  onError: (callback: (data: { message: string }) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { message: string }
    ) => callback(data);
    ipcRenderer.on('connection:error', handler);
    return () => ipcRenderer.removeListener('connection:error', handler);
  },
};

// ---------------------------------------------------------------------------
// Deep link events
// ---------------------------------------------------------------------------

const deepLinkApi = {
  onConnect: (callback: (data: { hostId: string }) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { hostId: string }
    ) => callback(data);
    ipcRenderer.on('deep-link:connect', handler);
    return () => ipcRenderer.removeListener('deep-link:connect', handler);
  },
  onAuth: (
    callback: (data: { token: string; refreshToken: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { token: string; refreshToken: string }
    ) => callback(data);
    ipcRenderer.on('deep-link:auth', handler);
    return () => ipcRenderer.removeListener('deep-link:auth', handler);
  },
};

// ---------------------------------------------------------------------------
// System tray
// ---------------------------------------------------------------------------

const trayApi = {
  updateDisconnect: (enabled: boolean): void =>
    ipcRenderer.send('tray:update-disconnect', enabled),
};

// ---------------------------------------------------------------------------
// Host Agent (host-side streamer management — Windows only)
// ---------------------------------------------------------------------------

interface HostAgentStatus {
  state: string;
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

const hostApi = {
  setMode: (mode: 'client' | 'host' | 'both'): Promise<IpcResult> =>
    ipcRenderer.invoke('host:set-mode', mode),

  getStatus: (): Promise<HostAgentStatus> =>
    ipcRenderer.invoke('host:get-status'),

  register: (data: { bootstrapToken: string; hostName: string }): Promise<IpcResult> =>
    ipcRenderer.invoke('host:register', data),

  getConfig: (): Promise<{
    mode: string;
    bootstrapToken: string;
    hostId: string;
    apiToken: string;
    hostName: string;
    stunServers: string[];
    registeredAt: string;
    controlPlaneUrl: string;
  }> => ipcRenderer.invoke('host:get-config'),

  setConfig: (partial: Record<string, unknown>): Promise<IpcResult> =>
    ipcRenderer.invoke('host:set-config', partial),

  getStreamerStats: (): Promise<unknown> =>
    ipcRenderer.invoke('host:get-streamer-stats'),

  forceIDR: (): Promise<IpcResult> =>
    ipcRenderer.invoke('host:force-idr'),

  start: (): Promise<IpcResult> =>
    ipcRenderer.invoke('host:start'),

  stop: (): Promise<IpcResult> =>
    ipcRenderer.invoke('host:stop'),

  // Event listeners for host agent lifecycle.
  onStatusChange: (callback: (status: HostAgentStatus) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: HostAgentStatus
    ) => callback(status);
    ipcRenderer.on('host:status-change', handler);
    return () => ipcRenderer.removeListener('host:status-change', handler);
  },

  onSessionStarted: (
    callback: (data: { sessionId: string; codec: string; userId: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { sessionId: string; codec: string; userId: string }
    ) => callback(data);
    ipcRenderer.on('host:session-started', handler);
    return () => ipcRenderer.removeListener('host:session-started', handler);
  },

  onSessionEnded: (callback: (data: { sessionId: string }) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { sessionId: string }
    ) => callback(data);
    ipcRenderer.on('host:session-ended', handler);
    return () => ipcRenderer.removeListener('host:session-ended', handler);
  },

  onStreamerStats: (callback: (stats: unknown) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      stats: unknown
    ) => callback(stats);
    ipcRenderer.on('host:streamer-stats', handler);
    return () => ipcRenderer.removeListener('host:streamer-stats', handler);
  },
};

// ---------------------------------------------------------------------------
// Assemble and expose
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Platform info
// ---------------------------------------------------------------------------

const platformApi = {
  os: process.platform as 'win32' | 'darwin' | 'linux',
  /** Native streaming is currently only available on Windows. */
  nativeStreamingSupported: process.platform === 'win32',
  /** Host mode is currently only available on Windows. */
  hostModeSupported: process.platform === 'win32',
};

const api = {
  window: windowApi,
  auth: authApi,
  viewer: viewerApi,
  p2p: p2pApi,
  connection: connectionApi,
  deepLink: deepLinkApi,
  tray: trayApi,
  platform: platformApi,
  host: hostApi,
};

contextBridge.exposeInMainWorld('nvrs', api);

export type NvrsApi = typeof api;
