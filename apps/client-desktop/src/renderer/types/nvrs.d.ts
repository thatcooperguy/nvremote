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
  codec: string;
  capabilities: {
    maxBitrate: number;
    maxFps: number;
    maxResolution: { width: number; height: number };
    supportedCodecs: string[];
  };
  dtlsFingerprint: string;
  stunServers: string[];
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
    status: () => Promise<P2PStatusResult>;
    onSessionAccepted: (cb: (info: SessionAcceptedInfo) => void) => () => void;
    onConnected: (cb: (info: { sessionId: string; connectionType: string }) => void) => () => void;
    onDisconnected: (cb: () => void) => () => void;
    onSessionEnded: (cb: (data: { reason: string }) => void) => () => void;
    onSessionError: (cb: (data: { error: string }) => void) => () => void;
    onRemoteCandidate: (cb: (candidate: IceCandidate) => void) => () => void;
    onRemoteIceComplete: (cb: () => void) => () => void;
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
