import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  shell,
  session,
} from 'electron';
import path from 'path';
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

// ---------------------------------------------------------------------------
// Encrypted token storage using electron-store
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let store: any = null;

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
  return `file://${path.join(__dirname, '../../dist/index.html')}`;
}

function getApiBaseUrl(): string {
  return isDev
    ? 'http://localhost:3000/api'
    : 'https://api.nvremote.com';
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
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

  mainWindow.loadURL(getRendererUrl());

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

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
      const authUrl = `${getApiBaseUrl()}/auth/google`;
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

  ipcMain.handle('p2p:status', () => {
    return {
      signalingConnected: isSignalingConnected(),
      sessionId: getCurrentSessionId(),
    };
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

  app.whenReady().then(() => {
    registerProtocolHandler();
    createWindow();
    createTray();
    setupIpcHandlers();
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
});
