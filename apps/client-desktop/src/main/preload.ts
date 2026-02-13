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
// WireGuard tunnel
// ---------------------------------------------------------------------------

const wireguardApi = {
  generateKeyPair: (): Promise<{
    success: boolean;
    publicKey?: string;
    privateKey?: string;
    error?: string;
  }> => ipcRenderer.invoke('wireguard:generate-keypair'),

  connect: (config: {
    privateKey: string;
    address: string;
    dns: string;
    peerPublicKey: string;
    peerEndpoint: string;
    allowedIps: string;
  }): Promise<IpcResult> => ipcRenderer.invoke('wireguard:connect', config),

  disconnect: (): Promise<IpcResult> =>
    ipcRenderer.invoke('wireguard:disconnect'),

  status: (): Promise<{
    success: boolean;
    status?: {
      connected: boolean;
      interfaceName: string | null;
      latestHandshake: string | null;
      transferRx: number;
      transferTx: number;
    };
    error?: string;
  }> => ipcRenderer.invoke('wireguard:status'),
};

// ---------------------------------------------------------------------------
// Geronimo streaming client
// ---------------------------------------------------------------------------

const geronimoApi = {
  launch: (config: {
    hostIp: string;
    ports: { video: number; audio: number; input: number };
  }): Promise<{ success: boolean; pid?: number; error?: string }> =>
    ipcRenderer.invoke('geronimo:launch', config),

  kill: (): Promise<IpcResult> =>
    ipcRenderer.invoke('geronimo:kill'),

  status: (): Promise<{
    running: boolean;
    pid: number | null;
    exitCode: number | null;
  }> => ipcRenderer.invoke('geronimo:status'),

  onExit: (callback: (exitCode: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, code: number) =>
      callback(code);
    ipcRenderer.on('geronimo:exit', handler);
    return () => ipcRenderer.removeListener('geronimo:exit', handler);
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
// Assemble and expose
// ---------------------------------------------------------------------------

const api = {
  window: windowApi,
  auth: authApi,
  wireguard: wireguardApi,
  geronimo: geronimoApi,
  connection: connectionApi,
  deepLink: deepLinkApi,
  tray: trayApi,
};

contextBridge.exposeInMainWorld('nvrs', api);

export type NvrsApi = typeof api;
