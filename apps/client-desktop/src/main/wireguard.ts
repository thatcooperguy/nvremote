import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile, mkdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { app } from 'electron';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WgConfig {
  /** Client's WireGuard private key (base64). Generated locally, never sent to server. */
  privateKey: string;
  /** Client tunnel IP assigned by the server, e.g. 10.101.x.y/32 */
  address: string;
  /** DNS server to use inside the tunnel, e.g. 10.100.0.1 */
  dns: string;
  /** Gateway's WireGuard public key (base64), received from server */
  peerPublicKey: string;
  /** Gateway's public endpoint (ip:port), received from server */
  peerEndpoint: string;
  /** Allowed IPs routed through the tunnel, e.g. 10.100.0.0/16 */
  allowedIps: string;
}

export interface WgKeyPair {
  /** Base64-encoded Curve25519 private key */
  privateKey: string;
  /** Base64-encoded Curve25519 public key */
  publicKey: string;
}

export interface TunnelStatus {
  connected: boolean;
  interfaceName: string | null;
  latestHandshake: string | null;
  transferRx: number;
  transferTx: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TUNNEL_NAME = 'nvrs0';
const CONFIG_DIR = path.join(app.getPath('userData'), 'wireguard');
const TUNNEL_UP_TIMEOUT_MS = 15_000;
const TUNNEL_UP_POLL_MS = 500;
const SERVICE_STOP_TIMEOUT_MS = 10_000;

// Cache resolved executable paths so we only search once per session.
let _cachedWireGuardExe: string | null = null;
let _cachedWgExe: string | null = null;

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/**
 * Generate a Curve25519 keypair using Node's built-in crypto module.
 * This avoids requiring wg.exe to be installed just for key generation.
 * The private key never leaves this machine.
 */
export function generateKeyPair(): WgKeyPair {
  const keyPair = crypto.generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  // X25519 PKCS#8 DER: the raw 32-byte private key occupies the last 32 bytes.
  const rawPrivate = keyPair.privateKey.subarray(keyPair.privateKey.length - 32);
  // X25519 SPKI DER: the raw 32-byte public key occupies the last 32 bytes.
  const rawPublic = keyPair.publicKey.subarray(keyPair.publicKey.length - 32);

  return {
    privateKey: rawPrivate.toString('base64'),
    publicKey: rawPublic.toString('base64'),
  };
}

// ---------------------------------------------------------------------------
// Tunnel lifecycle
// ---------------------------------------------------------------------------

/**
 * Establish a WireGuard tunnel using the Windows WireGuard tunnel service.
 *
 * Steps:
 *  1. Ensure the config directory exists.
 *  2. Write the .conf file.
 *  3. Install the tunnel service via `wireguard.exe /installtunnelservice`.
 *  4. Poll `wg show <iface>` until a handshake is observed or timeout.
 */
export async function connectTunnel(config: WgConfig): Promise<void> {
  // Tear down any leftover tunnel from a previous session.
  await disconnectTunnel().catch(() => {
    // Ignore errors from cleaning up a tunnel that may not exist.
  });

  // 1. Ensure config directory
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }

  // 2. Write config
  const confPath = path.join(CONFIG_DIR, `${TUNNEL_NAME}.conf`);
  const confContent = [
    '[Interface]',
    `PrivateKey = ${config.privateKey}`,
    `Address = ${config.address}`,
    `DNS = ${config.dns}`,
    '',
    '[Peer]',
    `PublicKey = ${config.peerPublicKey}`,
    `Endpoint = ${config.peerEndpoint}`,
    `AllowedIPs = ${config.allowedIps}`,
    'PersistentKeepalive = 25',
    '',
  ].join('\n');

  await writeFile(confPath, confContent, { encoding: 'utf-8' });

  // 3. Install tunnel service
  const wireGuardExe = findWireGuardExe();

  try {
    await execFileAsync(wireGuardExe, ['/installtunnelservice', confPath], {
      timeout: 15_000,
      windowsHide: true,
    });
  } catch (err: unknown) {
    await secureDeleteConfig(confPath);
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('Access is denied') || msg.includes('elevation')) {
      throw new Error(
        'Administrator privileges are required to manage WireGuard tunnels. ' +
          'Please run the application as Administrator.'
      );
    }
    if (msg.includes('already exists')) {
      // Tunnel service was already installed; try to continue. We will verify
      // connectivity below via polling.
      console.warn('WireGuard tunnel service already existed; continuing.');
    } else {
      throw new Error(`Failed to install WireGuard tunnel service: ${msg}`);
    }
  }

  // 4. Poll for tunnel to come up
  const wgExe = findWgExe();
  const deadline = Date.now() + TUNNEL_UP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync(wgExe, ['show', TUNNEL_NAME], {
        timeout: 5_000,
        windowsHide: true,
      });
      // If we get output that includes a public key line, the interface exists.
      // A latest-handshake line means a successful handshake with the peer.
      if (stdout.includes('latest handshake')) {
        return; // Tunnel is up and peer has responded.
      }
      if (stdout.includes('public key')) {
        // Interface exists but no handshake yet; keep polling.
      }
    } catch {
      // Interface not yet created; keep polling.
    }

    await sleep(TUNNEL_UP_POLL_MS);
  }

  // If we reach here without a handshake, the interface may still be up but
  // the peer may simply not have responded yet (e.g., NAT traversal delay).
  // Do one final check: if the interface exists at all, treat it as success
  // and let the health-check system monitor the handshake.
  try {
    const { stdout } = await execFileAsync(wgExe, ['show', TUNNEL_NAME], {
      timeout: 5_000,
      windowsHide: true,
    });
    if (stdout.includes('public key')) {
      console.warn(
        'WireGuard tunnel interface is up but no peer handshake within timeout. ' +
          'Proceeding; health checks will monitor connectivity.'
      );
      return;
    }
  } catch {
    // Interface still does not exist.
  }

  // Timeout: clean up and throw.
  await disconnectTunnel().catch(() => {});
  throw new Error(
    `WireGuard tunnel did not come up within ${TUNNEL_UP_TIMEOUT_MS / 1000}s. ` +
      'Verify that the server endpoint is reachable and WireGuard is properly installed.'
  );
}

/**
 * Disconnect and remove the WireGuard tunnel service.
 *
 * 1. Uninstall the tunnel service.
 * 2. Wait for the service to fully stop.
 * 3. Securely delete the config file (overwrite then unlink).
 */
export async function disconnectTunnel(): Promise<void> {
  const wireGuardExe = findWireGuardExe();

  // 1. Uninstall tunnel service
  try {
    await execFileAsync(
      wireGuardExe,
      ['/uninstalltunnelservice', TUNNEL_NAME],
      { timeout: SERVICE_STOP_TIMEOUT_MS, windowsHide: true }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If the service does not exist, that is fine.
    if (
      !msg.includes('does not exist') &&
      !msg.includes('not found') &&
      !msg.includes('could not be opened')
    ) {
      console.warn('WireGuard service uninstall warning:', msg);
    }
  }

  // 2. Wait briefly for the service to finish stopping.
  const wgExe = findWgExe();
  const stopDeadline = Date.now() + SERVICE_STOP_TIMEOUT_MS;
  while (Date.now() < stopDeadline) {
    try {
      await execFileAsync(wgExe, ['show', TUNNEL_NAME], {
        timeout: 3_000,
        windowsHide: true,
      });
      // Still running; keep waiting.
      await sleep(500);
    } catch {
      // Interface is gone; good.
      break;
    }
  }

  // 3. Securely delete the config file.
  const confPath = path.join(CONFIG_DIR, `${TUNNEL_NAME}.conf`);
  await secureDeleteConfig(confPath);
}

/**
 * Query the status of the WireGuard tunnel interface.
 * Parses the output of `wg show <iface>` for handshake and transfer data.
 */
export async function getTunnelStatus(): Promise<TunnelStatus> {
  const disconnectedStatus: TunnelStatus = {
    connected: false,
    interfaceName: null,
    latestHandshake: null,
    transferRx: 0,
    transferTx: 0,
  };

  let wgExe: string;
  try {
    wgExe = findWgExe();
  } catch {
    return disconnectedStatus;
  }

  try {
    const { stdout } = await execFileAsync(wgExe, ['show', TUNNEL_NAME], {
      timeout: 5_000,
      windowsHide: true,
    });

    const handshakeMatch = stdout.match(/latest handshake:\s*(.+)/);
    const transferMatch = stdout.match(
      /transfer:\s*([\d.]+\s*\w+)\s+received,\s*([\d.]+\s*\w+)\s+sent/
    );

    return {
      connected: true,
      interfaceName: TUNNEL_NAME,
      latestHandshake: handshakeMatch?.[1]?.trim() ?? null,
      transferRx: transferMatch ? parseTransferBytes(transferMatch[1]) : 0,
      transferTx: transferMatch ? parseTransferBytes(transferMatch[2]) : 0,
    };
  } catch {
    return disconnectedStatus;
  }
}

// ---------------------------------------------------------------------------
// Executable discovery
// ---------------------------------------------------------------------------

/**
 * Locate wireguard.exe on disk.
 * Search order: cached value, PATH, Program Files, Program Files (x86).
 */
export function findWireGuardExe(): string {
  if (_cachedWireGuardExe && existsSync(_cachedWireGuardExe)) {
    return _cachedWireGuardExe;
  }

  // Check PATH via `where`
  try {
    const { execSync } = require('child_process');
    const output: string = execSync('where wireguard.exe', {
      encoding: 'utf-8',
      timeout: 5_000,
      windowsHide: true,
    });
    const first = output.trim().split(/\r?\n/)[0]?.trim();
    if (first && existsSync(first)) {
      _cachedWireGuardExe = first;
      return first;
    }
  } catch {
    // Not on PATH
  }

  // Common installation directories
  const candidates = [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'WireGuard', 'wireguard.exe'),
    path.join(
      process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
      'WireGuard',
      'wireguard.exe'
    ),
    'C:\\Windows\\System32\\wireguard.exe',
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      _cachedWireGuardExe = candidate;
      return candidate;
    }
  }

  throw new Error(
    'WireGuard is not installed or could not be found. ' +
      'Please install WireGuard from https://www.wireguard.com/install/ and ensure ' +
      'wireguard.exe is in your PATH or installed to the default location.'
  );
}

/**
 * Locate wg.exe on disk.
 * Search order: cached value, same directory as wireguard.exe, PATH.
 */
export function findWgExe(): string {
  if (_cachedWgExe && existsSync(_cachedWgExe)) {
    return _cachedWgExe;
  }

  // Look alongside wireguard.exe first
  try {
    const wireGuardDir = path.dirname(findWireGuardExe());
    const wgPath = path.join(wireGuardDir, 'wg.exe');
    if (existsSync(wgPath)) {
      _cachedWgExe = wgPath;
      return wgPath;
    }
  } catch {
    // wireguard.exe was not found; try other strategies.
  }

  // Check PATH
  try {
    const { execSync } = require('child_process');
    const output: string = execSync('where wg.exe', {
      encoding: 'utf-8',
      timeout: 5_000,
      windowsHide: true,
    });
    const first = output.trim().split(/\r?\n/)[0]?.trim();
    if (first && existsSync(first)) {
      _cachedWgExe = first;
      return first;
    }
  } catch {
    // Not on PATH
  }

  // Common locations
  const candidates = [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'WireGuard', 'wg.exe'),
    path.join(
      process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
      'WireGuard',
      'wg.exe'
    ),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      _cachedWgExe = candidate;
      return candidate;
    }
  }

  throw new Error(
    'wg.exe not found. It is typically installed alongside WireGuard. ' +
      'Please reinstall WireGuard from https://www.wireguard.com/install/'
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Overwrite a config file with zeros and then unlink it.
 * This prevents the private key from remaining on disk.
 */
async function secureDeleteConfig(filePath: string): Promise<void> {
  if (!existsSync(filePath)) return;

  try {
    const fileStat = await stat(filePath);
    const zeros = Buffer.alloc(fileStat.size, 0);
    await writeFile(filePath, zeros);
    await unlink(filePath);
  } catch (err) {
    console.error('Failed to securely delete WireGuard config:', err);
    // Attempt a plain delete as fallback
    try {
      await unlink(filePath);
    } catch {
      // Best-effort; config directory will be cleaned on next connect.
    }
  }
}

/**
 * Parse a human-readable transfer value like "1.23 MiB" into bytes.
 */
function parseTransferBytes(value: string): number {
  const match = value.trim().match(/([\d.]+)\s*(\w+)/);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    b: 1,
    kib: 1024,
    mib: 1024 * 1024,
    gib: 1024 * 1024 * 1024,
    tib: 1024 * 1024 * 1024 * 1024,
    kb: 1000,
    mb: 1000 * 1000,
    gb: 1000 * 1000 * 1000,
    tb: 1000 * 1000 * 1000 * 1000,
  };

  return Math.round(num * (multipliers[unit] || 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
