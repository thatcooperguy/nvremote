// ---------------------------------------------------------------------------
// Type declarations for window.nvrs -- the IPC bridge exposed by preload.ts
// ---------------------------------------------------------------------------

/** Generic IPC result envelope. */
interface IpcResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

// ---------------------------------------------------------------------------
// Stream Stats types
// ---------------------------------------------------------------------------

interface StreamStatsResult {
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
// Viewer types
// ---------------------------------------------------------------------------

interface ViewerStartConfig {
  sessionId: string;
  codec: string;
  windowHandle: Buffer;
  gamingMode: 'competitive' | 'balanced' | 'cinematic';
  maxBitrate?: number;
  targetFps?: number;
}

interface ViewerStatsResponse {
  success: boolean;
  stats?: StreamStatsResult;
  error?: string;
}

// ---------------------------------------------------------------------------
// P2P / ICE types
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

interface SessionRequestResult {
  success: boolean;
  session?: SessionInfo;
  error?: string;
}

interface GatherCandidatesResult {
  success: boolean;
  candidates?: IceCandidate[];
  error?: string;
}

interface P2PConnectResult {
  success: boolean;
  connectionType?: string;
  error?: string;
}

interface P2PStatusResult {
  signalingConnected: boolean;
  sessionId: string | null;
}

interface SessionAcceptedInfo {
  sessionId: string;
  hostId?: string;
  codec: string;
  capabilities?: {
    maxBitrate: number;
    maxFps: number;
    maxResolution: { width: number; height: number };
    supportedCodecs: string[];
  };
  dtlsFingerprint?: string;
  stunServers?: string[];
  turnServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  /** Pre-gathered ICE candidates from the host, bundled in session:answer */
  candidates?: IceCandidate[];
}

/** Host GPU and encoder capabilities received via capability:host */
interface HostCapabilityInfo {
  sessionId: string;
  gpu: { name: string; vram?: number; nvencGen?: string };
  encoders: string[];
  maxEncode?: Record<string, string>;
  captureApi?: string;
  displays?: Array<{ width: number; height: number; refreshRate: number }>;
}

/** Capability negotiation acknowledgment */
interface CapabilityNegotiatedInfo {
  sessionId: string;
  negotiated: boolean;
}

// ---------------------------------------------------------------------------
// Auth types
// ---------------------------------------------------------------------------

interface AuthTokens {
  access: string;
  refresh: string;
}

// ---------------------------------------------------------------------------
// The full API shape exposed on window.nvrs
// ---------------------------------------------------------------------------

interface NvrsApi {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximizeChange: (cb: (isMaximized: boolean) => void) => () => void;
  };

  auth: {
    googleSignIn: () => Promise<IpcResult>;
    logout: () => Promise<IpcResult>;
    setTokens: (tokens: AuthTokens) => Promise<IpcResult>;
    getTokens: () => Promise<AuthTokens | null>;
    onAuthCallback: (
      cb: (data: { token: string; refreshToken?: string }) => void
    ) => () => void;
  };

  viewer: {
    start: (config: ViewerStartConfig) => Promise<IpcResult>;
    stop: () => Promise<IpcResult>;
    stats: () => Promise<ViewerStatsResponse>;
    setQuality: (preset: string) => Promise<IpcResult>;
    setGamingMode: (mode: string) => Promise<IpcResult>;
    available: () => Promise<{ available: boolean }>;
  };

  p2p: {
    connectSignaling: (accessToken: string) => Promise<IpcResult>;
    disconnectSignaling: () => Promise<IpcResult>;
    requestSession: (hostId: string, options: SessionOptions) => Promise<SessionRequestResult>;
    gatherCandidates: (stunServers: string[]) => Promise<GatherCandidatesResult>;
    addRemoteCandidate: (candidate: IceCandidate) => Promise<IpcResult>;
    connect: (config: { dtlsFingerprint: string }) => Promise<P2PConnectResult>;
    disconnect: () => Promise<IpcResult>;
    reconnect: () => Promise<IpcResult>;
    status: () => Promise<P2PStatusResult>;
    onSessionAccepted: (cb: (info: SessionAcceptedInfo) => void) => () => void;
    onConnected: (cb: (info: { sessionId: string; connectionType: string }) => void) => () => void;
    onDisconnected: (cb: () => void) => () => void;
    onSessionEnded: (cb: (data: { reason: string }) => void) => () => void;
    onSessionError: (cb: (data: { error: string }) => void) => () => void;
    onRemoteCandidate: (cb: (candidate: IceCandidate) => void) => () => void;
    onRemoteIceComplete: (cb: () => void) => () => void;
    onHostCapabilities: (cb: (info: HostCapabilityInfo) => void) => () => void;
    onCapabilityNegotiated: (cb: (info: CapabilityNegotiatedInfo) => void) => () => void;
  };

  connection: {
    onDisconnected: (cb: () => void) => () => void;
    onError: (cb: (data: { message: string }) => void) => () => void;
  };

  deepLink: {
    onConnect: (cb: (data: { hostId: string }) => void) => () => void;
    onAuth: (
      cb: (data: { token: string; refreshToken: string }) => void
    ) => () => void;
  };

  tray: {
    updateDisconnect: (enabled: boolean) => void;
  };

  platform: {
    os: 'win32' | 'darwin' | 'linux';
    nativeStreamingSupported: boolean;
    hostModeSupported: boolean;
  };

  host: {
    setMode: (mode: 'client' | 'host' | 'both') => Promise<IpcResult>;
    getStatus: () => Promise<HostAgentStatus>;
    register: (data: { bootstrapToken: string; hostName: string }) => Promise<IpcResult>;
    getConfig: () => Promise<HostAgentConfig>;
    setConfig: (partial: Record<string, unknown>) => Promise<IpcResult>;
    getStreamerStats: () => Promise<unknown>;
    forceIDR: () => Promise<IpcResult>;
    start: () => Promise<IpcResult>;
    stop: () => Promise<IpcResult>;
    onStatusChange: (cb: (status: HostAgentStatus) => void) => () => void;
    onSessionStarted: (
      cb: (data: { sessionId: string; codec: string; userId: string }) => void
    ) => () => void;
    onSessionEnded: (cb: (data: { sessionId: string }) => void) => () => void;
    onStreamerStats: (cb: (stats: unknown) => void) => () => void;
  };
}

// ---------------------------------------------------------------------------
// Host Agent types
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

interface HostAgentConfig {
  mode: string;
  bootstrapToken: string;
  hostId: string;
  apiToken: string;
  hostName: string;
  stunServers: string[];
  registeredAt: string;
  controlPlaneUrl: string;
}

// ---------------------------------------------------------------------------
// Augment the global Window interface
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    nvrs: NvrsApi;
  }
}

export {};
