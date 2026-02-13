import { create } from 'zustand';
import { apiClient } from '../services/api';
import { useSessionStore } from './sessionStore';
import type { Host } from '../components/HostCard';

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type TunnelStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

interface WireguardConnectInfo {
  clientAddress: string;   // 10.101.x.y/32
  serverPublicKey: string; // base64
  serverEndpoint: string;  // ip:port
  allowedIps: string;      // 10.100.0.0/16
  dns: string;             // 10.100.0.1
}

interface GeronimoConnectInfo {
  hostIp: string;
  ports: {
    video: number;
    audio: number;
    input: number;
  };
}

interface ConnectionApiResponse {
  sessionId: string;
  wireguard: WireguardConnectInfo;
  geronimo: GeronimoConnectInfo;
}

// ---------------------------------------------------------------------------
// Store state & actions
// ---------------------------------------------------------------------------

interface ConnectionState {
  status: ConnectionStatus;
  tunnelStatus: TunnelStatus;
  error: string | null;
  connectedHost: Host | null;
  sessionId: string | null;

  /** Client's WG private key for the active session (kept in memory only). */
  _clientPrivateKey: string | null;

  connect: (host: Host) => Promise<void>;
  disconnect: () => Promise<void>;
  setStatus: (status: ConnectionStatus) => void;
  setTunnelStatus: (tunnelStatus: TunnelStatus) => void;
  setError: (error: string | null) => void;
}

// ---------------------------------------------------------------------------
// Health-check interval handle
// ---------------------------------------------------------------------------

let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let geronimoExitCleanup: (() => void) | null = null;

function startHealthCheck(): void {
  stopHealthCheck();

  healthCheckInterval = setInterval(async () => {
    const { status } = useConnectionStore.getState();
    if (status !== 'connected') {
      stopHealthCheck();
      return;
    }

    try {
      const result = await window.nvrs.wireguard.status();
      if (result.success && result.status && !result.status.connected) {
        console.warn('[HealthCheck] WireGuard tunnel is no longer connected.');
        useConnectionStore.getState().setTunnelStatus('error');
      }
    } catch {
      // Non-fatal; the next tick will try again.
    }
  }, 10_000);
}

function stopHealthCheck(): void {
  if (healthCheckInterval !== null) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Geronimo exit listener
// ---------------------------------------------------------------------------

function attachGeronimoExitListener(): void {
  detachGeronimoExitListener();

  geronimoExitCleanup = window.nvrs.geronimo.onExit((exitCode) => {
    const { status } = useConnectionStore.getState();
    if (status === 'connected' || status === 'connecting') {
      console.warn(
        `[ConnectionStore] Geronimo exited unexpectedly with code ${exitCode}. ` +
          'Triggering auto-disconnect.'
      );
      // Fire-and-forget disconnect. The UI will observe the state change.
      useConnectionStore.getState().disconnect().catch((err) => {
        console.error('[ConnectionStore] Auto-disconnect after Geronimo exit failed:', err);
      });
    }
  });
}

function detachGeronimoExitListener(): void {
  if (geronimoExitCleanup) {
    geronimoExitCleanup();
    geronimoExitCleanup = null;
  }
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: 'disconnected',
  tunnelStatus: 'disconnected',
  error: null,
  connectedHost: null,
  sessionId: null,
  _clientPrivateKey: null,

  // -----------------------------------------------------------------------
  // connect
  // -----------------------------------------------------------------------
  connect: async (host: Host) => {
    const { status } = get();
    if (status === 'connecting' || status === 'connected') {
      throw new Error('Already connected or connecting. Disconnect first.');
    }

    set({
      status: 'connecting',
      tunnelStatus: 'disconnected',
      error: null,
      connectedHost: host,
      sessionId: null,
      _clientPrivateKey: null,
    });

    try {
      // 1. Generate a WireGuard keypair locally.
      //    The private key never leaves the client.
      const keyResult = await window.nvrs.wireguard.generateKeyPair();
      if (!keyResult.success || !keyResult.publicKey || !keyResult.privateKey) {
        throw new Error(keyResult.error || 'Failed to generate WireGuard keypair.');
      }

      set({ _clientPrivateKey: keyResult.privateKey });

      // 2. Call the server with our public key.
      //    Server allocates a tunnel IP, returns its own WG public key & endpoint.
      const response = await apiClient.post<ConnectionApiResponse>(
        `/hosts/${host.id}/connect`,
        { clientPublicKey: keyResult.publicKey }
      );

      const { wireguard, geronimo, sessionId } = response.data;

      set({ sessionId });

      // 3. Establish WireGuard tunnel using our LOCAL private key combined
      //    with the server-provided configuration.
      set({ tunnelStatus: 'connecting' });

      const wgResult = await window.nvrs.wireguard.connect({
        privateKey: keyResult.privateKey, // local -- never sent to server
        address: wireguard.clientAddress,
        dns: wireguard.dns,
        peerPublicKey: wireguard.serverPublicKey,
        peerEndpoint: wireguard.serverEndpoint,
        allowedIps: wireguard.allowedIps,
      });

      if (!wgResult.success) {
        throw new Error(wgResult.error || 'Failed to establish WireGuard tunnel.');
      }

      set({ tunnelStatus: 'connected' });

      // 4. Launch Geronimo streaming client.
      const geroResult = await window.nvrs.geronimo.launch({
        hostIp: geronimo.hostIp,
        ports: geronimo.ports,
      });

      if (!geroResult.success) {
        // Tunnel is up but Geronimo failed. Roll back the tunnel.
        await window.nvrs.wireguard.disconnect().catch(() => {});
        set({ tunnelStatus: 'disconnected' });
        throw new Error(geroResult.error || 'Failed to launch streaming client.');
      }

      // 5. Fully connected. Wire up health monitoring.
      set({ status: 'connected' });
      window.nvrs.tray.updateDisconnect(true);

      attachGeronimoExitListener();
      startHealthCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      console.error('[ConnectionStore] Connection error:', message);

      set({
        status: 'error',
        error: message,
        tunnelStatus: 'disconnected',
        _clientPrivateKey: null,
      });

      // Best-effort cleanup of any partial state.
      try { await window.nvrs.geronimo.kill(); } catch { /* ignore */ }
      try { await window.nvrs.wireguard.disconnect(); } catch { /* ignore */ }

      stopHealthCheck();
      detachGeronimoExitListener();

      // Notify the server that the session failed.
      try {
        await useSessionStore.getState().endSession();
      } catch {
        // ignore
      }

      throw err;
    }
  },

  // -----------------------------------------------------------------------
  // disconnect
  // -----------------------------------------------------------------------
  disconnect: async () => {
    // Immediately update UI state.
    set({
      status: 'disconnected',
      tunnelStatus: 'disconnected',
      _clientPrivateKey: null,
    });

    stopHealthCheck();
    detachGeronimoExitListener();

    const errors: string[] = [];

    // 1. Kill Geronimo
    try {
      const result = await window.nvrs.geronimo.kill();
      if (!result.success) {
        errors.push(result.error || 'Failed to stop streaming client');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Geronimo kill failed: ${msg}`);
    }

    // 2. Disconnect WireGuard
    try {
      const result = await window.nvrs.wireguard.disconnect();
      if (!result.success) {
        errors.push(result.error || 'Failed to disconnect tunnel');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`WireGuard disconnect failed: ${msg}`);
    }

    // 3. End the server-side session.
    try {
      await useSessionStore.getState().endSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Session end failed: ${msg}`);
    }

    set({
      connectedHost: null,
      sessionId: null,
      error: errors.length > 0 ? errors.join('; ') : null,
    });

    window.nvrs.tray.updateDisconnect(false);

    if (errors.length > 0) {
      console.warn('[ConnectionStore] Disconnect completed with errors:', errors);
    }
  },

  setStatus: (status: ConnectionStatus) => set({ status }),
  setTunnelStatus: (tunnelStatus: TunnelStatus) => set({ tunnelStatus }),
  setError: (error: string | null) => set({ error }),
}));
