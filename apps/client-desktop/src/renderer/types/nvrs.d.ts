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
// WireGuard types
// ---------------------------------------------------------------------------

interface WgKeyPairResult {
  success: boolean;
  publicKey?: string;
  privateKey?: string;
  error?: string;
}

interface WgConnectConfig {
  privateKey: string;
  address: string;
  dns: string;
  peerPublicKey: string;
  peerEndpoint: string;
  allowedIps: string;
}

interface TunnelStatusResult {
  connected: boolean;
  interfaceName: string | null;
  latestHandshake: string | null;
  transferRx: number;
  transferTx: number;
}

interface WgStatusResponse {
  success: boolean;
  status?: TunnelStatusResult;
  error?: string;
}

// ---------------------------------------------------------------------------
// Geronimo types
// ---------------------------------------------------------------------------

interface GeronimoLaunchConfig {
  hostIp: string;
  ports: {
    video: number;
    audio: number;
    input: number;
  };
}

interface GeronimoLaunchResult {
  success: boolean;
  pid?: number;
  error?: string;
}

interface GeronimoStatusResult {
  running: boolean;
  pid: number | null;
  exitCode: number | null;
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

  wireguard: {
    generateKeyPair: () => Promise<WgKeyPairResult>;
    connect: (config: WgConnectConfig) => Promise<IpcResult>;
    disconnect: () => Promise<IpcResult>;
    status: () => Promise<WgStatusResponse>;
  };

  geronimo: {
    launch: (config: GeronimoLaunchConfig) => Promise<GeronimoLaunchResult>;
    kill: () => Promise<IpcResult>;
    status: () => Promise<GeronimoStatusResult>;
    onExit: (cb: (exitCode: number) => void) => () => void;
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
