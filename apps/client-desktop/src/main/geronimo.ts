import { spawn, execSync, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { app, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeronimoConfig {
  /** The host machine's tunnel IP, e.g. 10.100.x.y */
  hostIp: string;
  ports: {
    video: number;  // Default 8443
    audio: number;  // Default 8444
    input: number;  // Default 8445
  };
}

export interface GeronimoStatus {
  running: boolean;
  pid: number | null;
  exitCode: number | null;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let geronimoProcess: ChildProcess | null = null;
let lastExitCode: number | null = null;
let isLaunching = false;

/**
 * Event emitter for Geronimo lifecycle events.
 * Emits:
 *   'exit' (exitCode: number | null)  -- when the process terminates
 */
export const geronimoEvents = new EventEmitter();

const GERONIMO_EXE_NAME = 'geronimo.exe';

const COMMON_INSTALL_PATHS = [
  // Env var override -- highest priority
  process.env.GERONIMO_PATH,
  // NVIDIA standard locations
  path.join(
    process.env.PROGRAMFILES || 'C:\\Program Files',
    'NVIDIA Corporation',
    'Geronimo',
    GERONIMO_EXE_NAME
  ),
  path.join(
    process.env.PROGRAMFILES || 'C:\\Program Files',
    'NVIDIA',
    'GeForce Experience',
    GERONIMO_EXE_NAME
  ),
  path.join(
    process.env.PROGRAMFILES || 'C:\\Program Files',
    'Geronimo',
    GERONIMO_EXE_NAME
  ),
  path.join(
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
    'Geronimo',
    GERONIMO_EXE_NAME
  ),
  path.join(process.env.LOCALAPPDATA || '', 'Geronimo', GERONIMO_EXE_NAME),
  path.join(process.env.APPDATA || '', 'Geronimo', GERONIMO_EXE_NAME),
].filter(Boolean) as string[];

// Also check alongside the application binary itself.
function getAppBinPath(): string {
  if (app.isPackaged) {
    return path.join(path.dirname(app.getPath('exe')), 'bin', GERONIMO_EXE_NAME);
  }
  return path.join(app.getAppPath(), 'bin', GERONIMO_EXE_NAME);
}

// ---------------------------------------------------------------------------
// Registry search
// ---------------------------------------------------------------------------

function findInRegistry(): string | null {
  const registryPaths = [
    'HKLM\\SOFTWARE\\NVIDIA Corporation\\Geronimo',
    'HKLM\\SOFTWARE\\Geronimo',
    'HKCU\\SOFTWARE\\Geronimo',
    'HKLM\\SOFTWARE\\WOW6432Node\\Geronimo',
  ];

  for (const regPath of registryPaths) {
    try {
      const output = execSync(`reg query "${regPath}" /v InstallPath`, {
        encoding: 'utf-8',
        timeout: 5_000,
        windowsHide: true,
      });

      const match = output.match(/InstallPath\s+REG_SZ\s+(.+)/);
      if (match) {
        const installPath = match[1].trim();
        const exePath = path.join(installPath, GERONIMO_EXE_NAME);
        if (existsSync(exePath)) {
          console.log(`[Geronimo] Found via registry at: ${exePath}`);
          return exePath;
        }
      }
    } catch {
      // Registry key not found; continue.
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// PATH search
// ---------------------------------------------------------------------------

function findInPath(): string | null {
  try {
    const output = execSync(`where ${GERONIMO_EXE_NAME}`, {
      encoding: 'utf-8',
      timeout: 5_000,
      windowsHide: true,
    });
    const firstPath = output.trim().split(/\r?\n/)[0]?.trim();
    if (firstPath && existsSync(firstPath)) {
      console.log(`[Geronimo] Found on PATH at: ${firstPath}`);
      return firstPath;
    }
  } catch {
    // Not found in PATH
  }
  return null;
}

// ---------------------------------------------------------------------------
// Executable discovery
// ---------------------------------------------------------------------------

/**
 * Search all known locations for the Geronimo executable.
 * Returns the absolute path to the first found binary, or null if not found.
 */
export function findGeronimoExe(): string | null {
  // 1. GERONIMO_PATH env var (exact file path)
  if (process.env.GERONIMO_PATH && existsSync(process.env.GERONIMO_PATH)) {
    console.log(`[Geronimo] Found via GERONIMO_PATH: ${process.env.GERONIMO_PATH}`);
    return process.env.GERONIMO_PATH;
  }

  // 2. PATH
  const pathResult = findInPath();
  if (pathResult) return pathResult;

  // 3. App-bundled binary
  const appBinPath = getAppBinPath();
  if (existsSync(appBinPath)) {
    console.log(`[Geronimo] Found bundled at: ${appBinPath}`);
    return appBinPath;
  }

  // 4. Common install locations
  for (const candidate of COMMON_INSTALL_PATHS) {
    if (existsSync(candidate)) {
      console.log(`[Geronimo] Found at: ${candidate}`);
      return candidate;
    }
  }

  // 5. Windows registry
  const registryResult = findInRegistry();
  if (registryResult) return registryResult;

  return null;
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

/**
 * Launch the Geronimo streaming client.
 *
 * If Geronimo is already running, the existing process is killed first.
 * The spawned process's exit event is forwarded to `geronimoEvents` so
 * the main process can relay it to the renderer.
 *
 * @returns The PID of the spawned process.
 */
export async function launchGeronimo(
  config: GeronimoConfig
): Promise<{ pid: number }> {
  if (isLaunching) {
    throw new Error('A Geronimo launch is already in progress. Please wait.');
  }

  // Kill any existing process first.
  if (geronimoProcess && !geronimoProcess.killed) {
    console.warn('[Geronimo] Already running -- killing existing process before relaunch.');
    await killGeronimo();
  }

  isLaunching = true;
  lastExitCode = null;

  try {
    const executablePath = findGeronimoExe();
    if (!executablePath) {
      throw new Error(
        'Geronimo executable not found. Please install Geronimo or set the ' +
          'GERONIMO_PATH environment variable to the full path of geronimo.exe. ' +
          'Searched locations:\n  - PATH\n  - ' +
          COMMON_INSTALL_PATHS.join('\n  - ') +
          '\n  - Windows Registry'
      );
    }

    const args = [
      '--host', config.hostIp,
      '--video-port', String(config.ports.video),
      '--audio-port', String(config.ports.audio),
      '--input-port', String(config.ports.input),
      '--fullscreen',
      '--vsync',
      '--hardware-decode',
    ];

    console.log(`[Geronimo] Launching: ${executablePath} ${args.join(' ')}`);

    return await new Promise<{ pid: number }>((resolve, reject) => {
      geronimoProcess = spawn(executablePath, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false, // Geronimo needs a visible window
      });

      const pid = geronimoProcess.pid;

      if (pid === undefined) {
        geronimoProcess = null;
        reject(new Error('Failed to start Geronimo process: no PID was assigned.'));
        return;
      }

      let stderrBuffer = '';

      geronimoProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        if (text) console.log(`[Geronimo stdout] ${text}`);
      });

      geronimoProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        stderrBuffer += text + '\n';
        if (text) console.error(`[Geronimo stderr] ${text}`);
      });

      geronimoProcess.on('error', (err) => {
        console.error('[Geronimo] Process error:', err.message);
        geronimoProcess = null;
        isLaunching = false;
        reject(new Error(`Failed to launch Geronimo: ${err.message}`));
      });

      geronimoProcess.on('exit', (code, signal) => {
        const exitCode = code ?? (signal ? -1 : null);
        lastExitCode = exitCode;
        console.log(
          `[Geronimo] Exited with code=${code}, signal=${signal}`
        );

        if (code !== null && code !== 0 && stderrBuffer.trim()) {
          console.error(`[Geronimo] stderr output:\n${stderrBuffer.trim()}`);
        }

        geronimoProcess = null;

        // Emit exit event so main process can forward to renderer.
        geronimoEvents.emit('exit', exitCode);
      });

      // Give the process a brief moment to fail-fast (e.g. bad executable,
      // missing DLLs). If it survives 500ms, treat it as a successful launch.
      const earlyFailTimer = setTimeout(() => {
        isLaunching = false;
        resolve({ pid });
      }, 500);

      // If the process errors before the timer fires, the error handler
      // above will reject and we should cancel the timer.
      geronimoProcess.once('error', () => {
        clearTimeout(earlyFailTimer);
      });

      // If the process exits very quickly (within the 500ms window),
      // it is likely a crash.
      geronimoProcess.once('exit', (code) => {
        clearTimeout(earlyFailTimer);
        isLaunching = false;
        if (code !== 0 && code !== null) {
          reject(
            new Error(
              `Geronimo exited immediately with code ${code}. ` +
                (stderrBuffer.trim()
                  ? `stderr: ${stderrBuffer.trim().slice(0, 500)}`
                  : 'No error output captured.')
            )
          );
        }
        // code === 0 means normal exit; resolve is fine.
      });
    });
  } finally {
    isLaunching = false;
  }
}

// ---------------------------------------------------------------------------
// Kill
// ---------------------------------------------------------------------------

/**
 * Kill the Geronimo process.
 *
 * 1. Attempt a graceful kill (SIGTERM / process.kill()).
 * 2. Wait up to 5 seconds for the process to exit.
 * 3. If still running, force-kill via `taskkill /F /PID`.
 */
export async function killGeronimo(): Promise<void> {
  if (!geronimoProcess || geronimoProcess.killed) {
    geronimoProcess = null;
    return;
  }

  const processRef = geronimoProcess;
  const pid = processRef.pid;

  return new Promise<void>((resolve) => {
    // Set a deadline for the graceful shutdown.
    const forceKillTimer = setTimeout(() => {
      if (processRef && !processRef.killed && pid) {
        console.warn(`[Geronimo] Graceful shutdown timed out. Force-killing PID ${pid}.`);
        try {
          execSync(`taskkill /F /PID ${pid}`, {
            windowsHide: true,
            timeout: 5_000,
          });
        } catch {
          // Process may already be dead; that is fine.
        }
        try {
          processRef.kill('SIGKILL');
        } catch {
          // Best-effort
        }
      }
      geronimoProcess = null;
      resolve();
    }, 5_000);

    processRef.once('exit', () => {
      clearTimeout(forceKillTimer);
      geronimoProcess = null;
      resolve();
    });

    // Attempt graceful kill.
    try {
      processRef.kill('SIGTERM');
    } catch {
      clearTimeout(forceKillTimer);
      geronimoProcess = null;
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Return the current state of the Geronimo process.
 */
export function getGeronimoStatus(): GeronimoStatus {
  if (geronimoProcess && !geronimoProcess.killed) {
    return {
      running: true,
      pid: geronimoProcess.pid ?? null,
      exitCode: null,
    };
  }

  return {
    running: false,
    pid: null,
    exitCode: lastExitCode,
  };
}
