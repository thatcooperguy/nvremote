import * as Sentry from '@sentry/electron/main';
import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  shell,
  session,
  dialog,
} from 'electron';
import path from 'path';
import os from 'os';
import { autoUpdater } from 'electron-updater';

// ---------------------------------------------------------------------------
// Sentry — crash & error reporting (main process)
// ---------------------------------------------------------------------------
// Initialize before anything else so uncaught exceptions are captured.
// Silently skips if DSN is not set (safe for local dev).

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  release: `nvremote-client@${app.getVersion()}`,
  environment: app.isPackaged ? 'production' : 'development',
  enabled: !!process.env.SENTRY_DSN,
  // Capture 10% of transactions for performance monitoring
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Strip local file paths from stack traces for privacy
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (ex.stacktrace?.frames) {
          for (const frame of ex.stacktrace.frames) {
            if (frame.filename) {
              frame.filename = frame.filename.replace(/.*[/\\]app\.asar/, 'app.asar');
            }
          }
        }
      }
    }
    return event;
  },
});
import { loadViewer, getViewer, isViewerAvailable } from './viewer';
import type { ViewerConfig, IceCandidate } from './viewer';
import {
  initP2P,
  connectSignaling,
  disconnectSignaling,
  requestSession,
  gatherAndSendCandidates,
  establishP2PConnection,
  disconnectP2P,
  getCurrentSessionId,
  isSignalingConnected,
  onSessionEnded,
} from './p2p';
import type { SessionOptions } from './p2p';
import { HostAgent } from './host';
import type { HostAgentConfig } from './host';

// ---------------------------------------------------------------------------
// Encrypted token storage using electron-store
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let store: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getStore(): Promise<any> {
  if (store) return store;
  // electron-store v8+ is ESM-only. Dynamic import is required.
  const { default: ElectronStore } = await import('electron-store');
  store = new ElectronStore({
    name: 'nvremote-secure',
    encryptionKey: 'nvremote-client-v1', // obfuscation; not a security boundary
    schema: {
      'auth.access': { type: 'string', default: '' },
      'auth.refresh': { type: 'string', default: '' },
      'host.mode': { type: 'string', default: 'client' },
      'host.bootstrapToken': { type: 'string', default: '' },
      'host.hostId': { type: 'string', default: '' },
      'host.apiToken': { type: 'string', default: '' },
      'host.hostName': { type: 'string', default: '' },
      'host.stunServers': { type: 'string', default: 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302' },
      'host.registeredAt': { type: 'string', default: '' },
      // Window state persistence
      'window.width': { type: 'number', default: 1280 },
      'window.height': { type: 'number', default: 800 },
      'window.x': { type: 'number' },
      'window.y': { type: 'number' },
      'window.isMaximized': { type: 'boolean', default: false },
      // User settings
      'settings.startOnBoot': { type: 'boolean', default: false },
      'settings.minimizeToTray': { type: 'boolean', default: true },
      'settings.autoConnect': { type: 'boolean', default: false },
      'settings.showOverlay': { type: 'boolean', default: true },
      'settings.hardwareDecode': { type: 'boolean', default: true },
      'settings.vsync': { type: 'boolean', default: false },
      'settings.autoReconnect': { type: 'boolean', default: true },
      'settings.codecPreference': { type: 'string', default: 'auto' },
      'settings.captureMode': { type: 'string', default: 'auto' },
      'settings.connectionMode': { type: 'string', default: 'auto' },
      'settings.maxBandwidth': { type: 'number', default: 0 },
    },
  });
  return store;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayContextMenu: Electron.Menu | null = null;
let isQuitting = false;
let hostAgent: HostAgent | null = null;

const PROTOCOL = 'nvremote';
const isDev = !app.isPackaged;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getPreloadPath(): string {
  return path.join(__dirname, '../preload/preload.js');
}

function getRendererUrl(): string {
  if (isDev) {
    return 'http://localhost:5173';
  }
  // On Windows, path.join produces backslashes (C:\Users\...) which are
  // invalid in file:// URLs. Convert to forward slashes and use the
  // three-slash file:/// convention for absolute paths.
  const htmlPath = path.join(__dirname, '../../dist/index.html');
  return `file:///${htmlPath.replace(/\\/g, '/')}`;
}

function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || (isDev
    ? 'http://localhost:3000/api/v1'
    : 'https://api.nvremote.com/api/v1');
}

function getControlPlaneUrl(): string {
  return process.env.CONTROL_PLANE_URL || (isDev
    ? 'http://localhost:3000'
    : 'https://api.nvremote.com');
}

/** Build a HostAgentConfig from the electron-store values. */
async function buildHostConfig(): Promise<HostAgentConfig> {
  const s = await getStore();
  const stunStr = (s.get('host.stunServers', '') as string);
  const stunServers = stunStr ? stunStr.split(',').map((x: string) => x.trim()).filter(Boolean) : [];
  return {
    mode: (s.get('host.mode', 'client') as HostAgentConfig['mode']),
    bootstrapToken: (s.get('host.bootstrapToken', '') as string),
    hostId: (s.get('host.hostId', '') as string),
    apiToken: (s.get('host.apiToken', '') as string),
    hostName: (s.get('host.hostName', '') as string) || os.hostname(),
    stunServers,
    registeredAt: (s.get('host.registeredAt', '') as string),
    controlPlaneUrl: getControlPlaneUrl(),
  };
}

/** Persist host config keys back to electron-store. */
async function saveHostConfig(cfg: Partial<HostAgentConfig>): Promise<void> {
  const s = await getStore();
  if (cfg.mode !== undefined) s.set('host.mode', cfg.mode);
  if (cfg.bootstrapToken !== undefined) s.set('host.bootstrapToken', cfg.bootstrapToken);
  if (cfg.hostId !== undefined) s.set('host.hostId', cfg.hostId);
  if (cfg.apiToken !== undefined) s.set('host.apiToken', cfg.apiToken);
  if (cfg.hostName !== undefined) s.set('host.hostName', cfg.hostName);
  if (cfg.stunServers !== undefined) s.set('host.stunServers', cfg.stunServers.join(','));
  if (cfg.registeredAt !== undefined) s.set('host.registeredAt', cfg.registeredAt);
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function setupCSP(): void {
  // Set CSP programmatically so it works correctly for both http:// (dev)
  // and file:// (production). The meta tag approach is unreliable under
  // file:// because 'self' behaves differently across Electron versions.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      // Allow 'unsafe-eval' so executeJavaScript (Sentry DSN injection) works.
      "script-src 'self' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src 'self' http://localhost:* https://api.nvremote.com https://*.nvremote.com wss://api.nvremote.com wss://*.nvremote.com https://*.nvidia.com wss://*.nvidia.com https://*.ingest.sentry.io`,
      "img-src 'self' data: https:",
    ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

async function createWindow(): Promise<void> {
  setupCSP();

  // Restore saved window bounds (or use defaults)
  const s = await getStore();
  const savedWidth = s.get('window.width', 1280) as number;
  const savedHeight = s.get('window.height', 800) as number;
  const savedX = s.get('window.x') as number | undefined;
  const savedY = s.get('window.y') as number | undefined;
  const wasMaximized = s.get('window.isMaximized', false) as boolean;

  mainWindow = new BrowserWindow({
    width: savedWidth,
    height: savedHeight,
    ...(savedX !== undefined && savedY !== undefined ? { x: savedX, y: savedY } : {}),
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1A1A1A',
    show: false,
    icon: process.platform === 'win32'
      ? path.join(__dirname, '../../build/icon.ico')
      : process.platform === 'darwin'
      ? path.join(__dirname, '../../build/icon.icns')
      : path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Inject Sentry DSN + app info into renderer window for @sentry/react
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.executeJavaScript(`
      window.__SENTRY_DSN__ = ${JSON.stringify(process.env.SENTRY_DSN || '')};
      window.__APP_VERSION__ = ${JSON.stringify(app.getVersion())};
      window.__APP_PACKAGED__ = ${JSON.stringify(app.isPackaged)};
    `).catch(() => {});
  });

  mainWindow.loadURL(getRendererUrl());

  mainWindow.once('ready-to-show', () => {
    if (wasMaximized) {
      mainWindow?.maximize();
    }
    mainWindow?.show();
  });

  // Save window state on resize/move (debounced)
  let saveTimeout: NodeJS.Timeout | null = null;
  const saveWindowState = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const isMax = mainWindow.isMaximized();
      const st = await getStore();
      st.set('window.isMaximized', isMax);
      if (!isMax) {
        const bounds = mainWindow.getBounds();
        st.set('window.width', bounds.width);
        st.set('window.height', bounds.height);
        st.set('window.x', bounds.x);
        st.set('window.y', bounds.y);
      }
    }, 500);
  };
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Forward maximize/unmaximize state changes to renderer.
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximize-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximize-change', false);
  });

  // Initialize P2P with the main window for event forwarding
  initP2P(mainWindow);

  // Register P2P session-ended callback to forward to renderer
  onSessionEnded(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connection:disconnected');
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ---------------------------------------------------------------------------
// System tray
// ---------------------------------------------------------------------------

function createTray(): void {
  const iconPath = path.join(__dirname, '../../build/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show NVRemote',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Disconnect',
      id: 'disconnect',
      enabled: false,
      click: async () => {
        await handleDisconnect();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('NVRemote');
  tray.setContextMenu(contextMenu);
  trayContextMenu = contextMenu;

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// ---------------------------------------------------------------------------
// Protocol handler
// ---------------------------------------------------------------------------

function registerProtocolHandler(): void {
  if (isDev) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

function handleDeepLink(url: string): void {
  if (!url.startsWith(`${PROTOCOL}://`)) return;

  try {
    const parsed = new URL(url);
    const action = parsed.hostname;

    switch (action) {
      case 'connect': {
        const hostId = parsed.searchParams.get('host');
        if (hostId) {
          mainWindow?.webContents.send('deep-link:connect', { hostId });
        }
        break;
      }
      case 'auth': {
        const token = parsed.searchParams.get('token');
        const refreshToken = parsed.searchParams.get('refresh');
        if (token) {
          mainWindow?.webContents.send('deep-link:auth', {
            token,
            refreshToken: refreshToken ?? '',
          });
        }
        break;
      }
      default:
        console.warn(`Unknown deep link action: ${action}`);
    }

    mainWindow?.show();
    mainWindow?.focus();
  } catch (err) {
    console.error('Failed to parse deep link:', err);
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function setupIpcHandlers(): void {
  // ── Window controls ──────────────────────────────────────────────────
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

  // ── Authentication ───────────────────────────────────────────────────
  ipcMain.handle('auth:google-sign-in', async () => {
    try {
      const authUrl = `${getApiBaseUrl()}/auth/google?state=desktop`;
      await shell.openExternal(authUrl);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      // Clear stored tokens
      const s = await getStore();
      s.delete('auth.access');
      s.delete('auth.refresh');
      // Clear Chromium session data
      await session.defaultSession.clearStorageData();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(
    'auth:set-tokens',
    async (_event, tokens: { access: string; refresh: string }) => {
      try {
        const s = await getStore();
        s.set('auth.access', tokens.access);
        s.set('auth.refresh', tokens.refresh);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle('auth:get-tokens', async () => {
    try {
      const s = await getStore();
      const access = s.get('auth.access', '') as string;
      const refresh = s.get('auth.refresh', '') as string;
      if (!access && !refresh) return null;
      return { access, refresh };
    } catch {
      return null;
    }
  });

  // ── Viewer ──────────────────────────────────────────────────────────
  ipcMain.handle('viewer:start', (_event, config: ViewerConfig) => {
    try {
      const viewer = loadViewer();

      // Inject the real native window handle (HWND on Windows, NSView* on macOS).
      // The renderer sends Buffer.alloc(0) as a placeholder; we replace it here
      // with the actual handle so the C++ input capture hooks the right window.
      if (mainWindow && (!config.windowHandle || config.windowHandle.length === 0)) {
        config.windowHandle = mainWindow.getNativeWindowHandle();
      }

      viewer.start(config);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start viewer';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('viewer:stop', () => {
    try {
      const viewer = getViewer();
      viewer.stop();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop viewer';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('viewer:stats', () => {
    try {
      const viewer = getViewer();
      const stats = viewer.getStats();
      return { success: true, stats };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get stats';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('viewer:set-quality', (_event, preset: string) => {
    try {
      const viewer = getViewer();
      viewer.setQuality(preset);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set quality';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('viewer:set-gaming-mode', (_event, mode: string) => {
    try {
      const viewer = getViewer();
      viewer.setGamingMode(mode);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set gaming mode';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('viewer:available', () => {
    return { available: isViewerAvailable() };
  });

  // ── P2P / Signaling ────────────────────────────────────────────────
  ipcMain.handle('p2p:connect-signaling', async (_event, accessToken: string) => {
    try {
      await connectSignaling(accessToken);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect signaling';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('p2p:disconnect-signaling', () => {
    try {
      disconnectSignaling();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect signaling';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(
    'p2p:request-session',
    async (_event, hostId: string, options: SessionOptions) => {
      try {
        const info = await requestSession(hostId, options);
        return { success: true, session: info };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Session request failed';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle('p2p:gather-candidates', async (_event, stunServers: string[]) => {
    try {
      const candidates = await gatherAndSendCandidates(stunServers);
      return { success: true, candidates };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ICE gathering failed';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('p2p:add-remote-candidate', (_event, candidate: IceCandidate) => {
    try {
      const viewer = getViewer();
      viewer.addRemoteCandidate(candidate);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add remote candidate';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('p2p:connect', async (_event, config: { dtlsFingerprint: string }) => {
    try {
      const result = await establishP2PConnection(config.dtlsFingerprint);
      return { success: true, connectionType: result.connectionType };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'P2P connection failed';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('p2p:disconnect', () => {
    try {
      disconnectP2P();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'P2P disconnect failed';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('p2p:reconnect', async () => {
    try {
      // Attempt ICE restart by re-establishing the P2P connection
      disconnectP2P();
      // Brief cooldown before reconnecting
      await new Promise((resolve) => setTimeout(resolve, 500));
      const result = await establishP2PConnection('');
      return { success: true, connectionType: result.connectionType };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'P2P reconnect failed';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('p2p:status', () => {
    return {
      signalingConnected: isSignalingConnected(),
      sessionId: getCurrentSessionId(),
    };
  });

  // ── Settings persistence ─────────────────────────────────────────────
  ipcMain.handle('settings:get', async () => {
    const s = await getStore();
    return {
      startOnBoot: s.get('settings.startOnBoot', false) as boolean,
      minimizeToTray: s.get('settings.minimizeToTray', true) as boolean,
      autoConnect: s.get('settings.autoConnect', false) as boolean,
      showOverlay: s.get('settings.showOverlay', true) as boolean,
      hardwareDecode: s.get('settings.hardwareDecode', true) as boolean,
      vsync: s.get('settings.vsync', false) as boolean,
      autoReconnect: s.get('settings.autoReconnect', true) as boolean,
      codecPreference: s.get('settings.codecPreference', 'auto') as string,
      captureMode: s.get('settings.captureMode', 'auto') as string,
      connectionMode: s.get('settings.connectionMode', 'auto') as string,
      maxBandwidth: s.get('settings.maxBandwidth', 0) as number,
    };
  });

  ipcMain.handle('settings:set', async (_event, key: string, value: unknown) => {
    try {
      const s = await getStore();
      s.set(`settings.${key}`, value);

      // Special handling for startOnBoot — also update OS login items
      if (key === 'startOnBoot') {
        app.setLoginItemSettings({
          openAtLogin: value as boolean,
          path: app.getPath('exe'),
        });
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save setting';
      return { success: false, error: message };
    }
  });

  // ── Tray updates ─────────────────────────────────────────────────────
  ipcMain.on('tray:update-disconnect', (_event, enabled: boolean) => {
    if (!tray) return;
    const menu = trayContextMenu;
    const menuItem = menu?.getMenuItemById('disconnect') ?? null;
    if (menuItem) {
      menuItem.enabled = enabled;
    }
  });

  // ── Host Agent ────────────────────────────────────────────────────────
  ipcMain.handle('host:set-mode', async (_event, mode: 'client' | 'host' | 'both') => {
    try {
      await saveHostConfig({ mode });

      // Start host agent if switching to host/both mode (Windows only).
      if ((mode === 'host' || mode === 'both') && process.platform === 'win32') {
        if (!hostAgent) {
          const cfg = await buildHostConfig();
          hostAgent = new HostAgent(cfg);
          if (mainWindow) hostAgent.setMainWindow(mainWindow);
        }
        // Only auto-start if already registered.
        const cfg = hostAgent.getConfig();
        if (cfg.hostId && cfg.apiToken) {
          await hostAgent.start();
        }
      } else if (mode === 'client') {
        // Stop host agent if switching to client-only.
        if (hostAgent) {
          await hostAgent.stop();
        }
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set mode';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('host:get-status', () => {
    if (!hostAgent) {
      return {
        state: 'stopped',
        hostId: '',
        gpuModel: '',
        codecs: [],
        streamerRunning: false,
        signalingConnected: false,
        activeSession: null,
        error: null,
      };
    }
    return hostAgent.getStatus();
  });

  ipcMain.handle(
    'host:register',
    async (_event, data: { bootstrapToken: string; hostName: string }) => {
      try {
        if (!hostAgent) {
          const cfg = await buildHostConfig();
          cfg.bootstrapToken = data.bootstrapToken;
          cfg.hostName = data.hostName;
          hostAgent = new HostAgent(cfg);
          if (mainWindow) hostAgent.setMainWindow(mainWindow);
        } else {
          hostAgent.updateConfig({
            bootstrapToken: data.bootstrapToken,
            hostName: data.hostName,
          });
        }

        const resp = await hostAgent.register({
          bootstrapToken: data.bootstrapToken,
          hostName: data.hostName,
          controlPlaneUrl: getControlPlaneUrl(),
        });

        // Persist registration data.
        await saveHostConfig({
          bootstrapToken: data.bootstrapToken,
          hostName: data.hostName,
          hostId: resp.host_id,
          apiToken: resp.api_token,
          registeredAt: resp.registered_at,
        });

        return { success: true, data: resp };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Registration failed';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle('host:get-config', async () => {
    return buildHostConfig();
  });

  ipcMain.handle('host:set-config', async (_event, partial: Record<string, unknown>) => {
    try {
      await saveHostConfig(partial as Partial<HostAgentConfig>);
      if (hostAgent) {
        hostAgent.updateConfig(partial as Partial<HostAgentConfig>);
      }
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save config';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('host:get-streamer-stats', async () => {
    if (!hostAgent) return null;
    return hostAgent.getStreamerStats();
  });

  ipcMain.handle('host:force-idr', async () => {
    try {
      if (!hostAgent) throw new Error('Host agent not running');
      await hostAgent.forceIDR();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to force IDR';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('host:start', async () => {
    try {
      if (!hostAgent) {
        const cfg = await buildHostConfig();
        hostAgent = new HostAgent(cfg);
        if (mainWindow) hostAgent.setMainWindow(mainWindow);
      }
      await hostAgent.start();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start host agent';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('host:stop', async () => {
    try {
      if (hostAgent) await hostAgent.stop();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop host agent';
      return { success: false, error: message };
    }
  });
}

// ---------------------------------------------------------------------------
// Disconnect helper (used by tray and quit)
// ---------------------------------------------------------------------------

async function handleDisconnect(): Promise<void> {
  try {
    getViewer().stop();
    disconnectP2P();
    disconnectSignaling();
    mainWindow?.webContents.send('connection:disconnected');
  } catch (err) {
    console.error('Error during disconnect:', err);
  }
}

// ---------------------------------------------------------------------------
// Auto-updater (electron-updater → GitHub Releases)
// ---------------------------------------------------------------------------

function initAutoUpdater(): void {
  if (isDev) return; // Skip in development

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info: { version: string; releaseDate?: string }) => {
    console.log('Update available:', info.version);
    mainWindow?.webContents.send('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
    });

    // Prompt user
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `NVRemote v${info.version} is available. Download now?`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
          mainWindow?.webContents.send('update:downloading');
        }
      });
  });

  autoUpdater.on('update-downloaded', (info: { version: string }) => {
    console.log('Update downloaded:', info.version);
    mainWindow?.webContents.send('update:ready', {
      version: info.version,
    });

    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `NVRemote v${info.version} has been downloaded. Restart to apply?`,
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          isQuitting = true;
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('error', (err: Error) => {
    console.error('Auto-update error:', err);
  });

  // Check for updates 5 seconds after startup, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates(), 5000);
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Application lifecycle
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }

    const deepLinkUrl = commandLine.find((arg) =>
      arg.startsWith(`${PROTOCOL}://`)
    );
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
  });

  app.whenReady().then(async () => {
    registerProtocolHandler();
    createWindow();
    createTray();
    setupIpcHandlers();
    initAutoUpdater();

    // Initialize host agent if mode is host or both (Windows only).
    if (process.platform === 'win32') {
      try {
        const hostCfg = await buildHostConfig();
        if (hostCfg.mode === 'host' || hostCfg.mode === 'both') {
          hostAgent = new HostAgent(hostCfg);
          if (mainWindow) hostAgent.setMainWindow(mainWindow);
          // Auto-start if registered.
          if (hostCfg.hostId && hostCfg.apiToken) {
            hostAgent.start().catch((err) => {
              console.warn('[main] host agent auto-start failed:', err.message);
            });
          }
        }
      } catch (err) {
        console.warn('[main] failed to initialize host agent:', (err as Error).message);
      }
    }
  });
}

app.on('open-url', (_event, url) => {
  handleDeepLink(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // On Windows, keep running in the system tray.
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  try {
    getViewer().stop();
    disconnectP2P();
    disconnectSignaling();
  } catch {
    // Swallow errors during shutdown.
  }
  // Stop host agent gracefully.
  if (hostAgent) {
    try {
      await hostAgent.stop();
    } catch {
      // Swallow errors during shutdown.
    }
  }
});
