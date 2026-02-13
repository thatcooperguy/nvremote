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
import {
  launchGeronimo,
  killGeronimo,
  getGeronimoStatus,
  geronimoEvents,
} from './geronimo';
import {
  generateKeyPair,
  connectTunnel,
  disconnectTunnel,
  getTunnelStatus,
} from './wireguard';
import type { WgConfig } from './wireguard';

// ---------------------------------------------------------------------------
// Encrypted token storage using electron-store
// ---------------------------------------------------------------------------

let store: import('electron-store').default | null = null;

async function getStore(): Promise<import('electron-store').default> {
  if (store) return store;
  // electron-store v8+ is ESM-only. Dynamic import is required.
  const ElectronStore = (await import('electron-store')).default;
  store = new ElectronStore({
    name: 'nvrs-secure',
    encryptionKey: 'nvrs-client-v1', // obfuscation; not a security boundary
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
let isQuitting = false;

const PROTOCOL = 'nvrs';
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
    : 'https://api.remotestream.nvidia.com';
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
    icon: path.join(__dirname, '../../build/icon.ico'),
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
      label: 'Show NVIDIA Remote Stream',
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

  tray.setToolTip('NVIDIA Remote Stream');
  tray.setContextMenu(contextMenu);

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

  // ── WireGuard ────────────────────────────────────────────────────────
  ipcMain.handle('wireguard:generate-keypair', () => {
    try {
      const keyPair = generateKeyPair();
      return {
        success: true,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Key generation failed';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('wireguard:connect', async (_event, config: WgConfig) => {
    try {
      await connectTunnel(config);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect tunnel';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('wireguard:disconnect', async () => {
    try {
      await disconnectTunnel();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect tunnel';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('wireguard:status', async () => {
    try {
      const status = await getTunnelStatus();
      return { success: true, status };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get tunnel status';
      return { success: false, error: message };
    }
  });

  // ── Geronimo ─────────────────────────────────────────────────────────
  ipcMain.handle(
    'geronimo:launch',
    async (
      _event,
      config: { hostIp: string; ports: { video: number; audio: number; input: number } }
    ) => {
      try {
        const result = await launchGeronimo(config);
        return { success: true, pid: result.pid };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to launch Geronimo';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle('geronimo:kill', async () => {
    try {
      await killGeronimo();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to kill Geronimo';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('geronimo:status', () => {
    return getGeronimoStatus();
  });

  // ── Tray updates ─────────────────────────────────────────────────────
  ipcMain.on('tray:update-disconnect', (_event, enabled: boolean) => {
    if (!tray) return;
    const menu = tray.contextMenu;
    const menuItem = menu?.getMenuItemById('disconnect') ?? null;
    if (menuItem) {
      menuItem.enabled = enabled;
    }
  });
}

// ---------------------------------------------------------------------------
// Forward Geronimo exit events to the renderer
// ---------------------------------------------------------------------------

function setupGeronimoEventForwarding(): void {
  geronimoEvents.on('exit', (exitCode: number | null) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('geronimo:exit', exitCode ?? -1);
    }
  });
}

// ---------------------------------------------------------------------------
// Disconnect helper (used by tray and quit)
// ---------------------------------------------------------------------------

async function handleDisconnect(): Promise<void> {
  try {
    await killGeronimo();
    await disconnectTunnel();
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
    setupGeronimoEventForwarding();
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
    await killGeronimo();
    await disconnectTunnel();
  } catch {
    // Swallow errors during shutdown.
  }
});
