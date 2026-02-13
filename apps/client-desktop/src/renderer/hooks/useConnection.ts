import { useEffect, useCallback, useRef } from 'react';
import {
  useConnectionStore,
  type ConnectionStatus,
  type TunnelStatus,
} from '../store/connectionStore';
import { useHostStore } from '../store/hostStore';
import { toast } from '../components/Toast';
import type { Host } from '../components/HostCard';

interface UseConnectionReturn {
  status: ConnectionStatus;
  tunnelStatus: TunnelStatus;
  error: string | null;
  connectedHost: Host | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: (host: Host) => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
}

/**
 * Hook that manages the full connection lifecycle:
 * WireGuard keypair generation -> API connect -> WireGuard tunnel -> Geronimo launch.
 *
 * Also listens for force-disconnect events from the main process and handles
 * deep-link connect requests.
 */
export function useConnection(): UseConnectionReturn {
  const status = useConnectionStore((s) => s.status);
  const tunnelStatus = useConnectionStore((s) => s.tunnelStatus);
  const error = useConnectionStore((s) => s.error);
  const connectedHost = useConnectionStore((s) => s.connectedHost);
  const storeConnect = useConnectionStore((s) => s.connect);
  const storeDisconnect = useConnectionStore((s) => s.disconnect);

  const lastHostRef = useRef<Host | null>(null);

  // Listen for disconnection events pushed from the main process (e.g. tray
  // disconnect, or tunnel teardown initiated by the system).
  useEffect(() => {
    const cleanup = window.nvrs.connection.onDisconnected(() => {
      useConnectionStore.getState().setStatus('disconnected');
      useConnectionStore.getState().setTunnelStatus('disconnected');
      toast.info('Disconnected from host');
    });

    return cleanup;
  }, []);

  // Listen for deep-link connect events (nvrs://connect?host=<id>).
  useEffect(() => {
    const cleanup = window.nvrs.deepLink.onConnect(async (data) => {
      const hosts = useHostStore.getState().hosts;
      let host = hosts.find((h) => h.id === data.hostId);

      if (!host) {
        // Host list may be stale; attempt a refresh.
        try {
          await useHostStore.getState().fetchHosts();
          host = useHostStore.getState().hosts.find((h) => h.id === data.hostId);
        } catch {
          // Fetch failed; fall through to error toast.
        }
      }

      if (host) {
        try {
          await storeConnect(host);
          toast.success(`Connected to ${host.name}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Connection failed';
          toast.error(message);
        }
      } else {
        toast.error('Host not found. Try refreshing the host list.');
      }
    });

    return cleanup;
  }, [storeConnect]);

  // The connection store already runs a 10s health-check interval and a
  // Geronimo exit listener internally, so we do not duplicate those here.
  // We only surface a UI toast when the tunnel status degrades.
  useEffect(() => {
    if (tunnelStatus === 'error' && status === 'connected') {
      toast.warning('WireGuard tunnel appears to be down');
    }
  }, [tunnelStatus, status]);

  const connect = useCallback(
    async (host: Host) => {
      lastHostRef.current = host;
      await storeConnect(host);
    },
    [storeConnect]
  );

  const disconnect = useCallback(async () => {
    await storeDisconnect();
  }, [storeDisconnect]);

  const reconnect = useCallback(async () => {
    const host = lastHostRef.current || connectedHost;
    if (!host) {
      toast.error('No host to reconnect to');
      return;
    }

    // Disconnect first, then reconnect after a brief cooldown.
    await storeDisconnect();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      await storeConnect(host);
      toast.success(`Reconnected to ${host.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reconnection failed';
      toast.error(message);
    }
  }, [connectedHost, storeConnect, storeDisconnect]);

  return {
    status,
    tunnelStatus,
    error,
    connectedHost,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    connect,
    disconnect,
    reconnect,
  };
}
