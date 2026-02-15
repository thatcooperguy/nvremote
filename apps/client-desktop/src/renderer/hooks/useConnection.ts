import { useEffect, useCallback, useRef } from 'react';
import {
  useConnectionStore,
  type ConnectionStatus,
  type GamingMode,
  type StreamStats,
} from '../store/connectionStore';
import { useHostStore } from '../store/hostStore';
import { toast } from '../components/Toast';
import type { Host } from '../components/HostCard';

interface UseConnectionReturn {
  status: ConnectionStatus;
  gamingMode: GamingMode;
  connectionType: string | null;
  error: string | null;
  connectedHost: Host | null;
  stats: StreamStats | null;
  isStreaming: boolean;
  isConnecting: boolean;
  connect: (host: Host) => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  setGamingMode: (mode: GamingMode) => void;
}

/**
 * Hook that manages the full P2P connection lifecycle:
 * Connect signaling -> request session -> gather ICE -> P2P connect -> start viewer.
 *
 * Also listens for force-disconnect events from the main process and handles
 * deep-link connect requests.
 */
export function useConnection(): UseConnectionReturn {
  const status = useConnectionStore((s) => s.status);
  const gamingMode = useConnectionStore((s) => s.gamingMode);
  const connectionType = useConnectionStore((s) => s.connectionType);
  const error = useConnectionStore((s) => s.error);
  const connectedHost = useConnectionStore((s) => s.connectedHost);
  const stats = useConnectionStore((s) => s.stats);
  const storeConnect = useConnectionStore((s) => s.connect);
  const storeDisconnect = useConnectionStore((s) => s.disconnect);
  const setGamingMode = useConnectionStore((s) => s.setGamingMode);

  const lastHostRef = useRef<Host | null>(null);

  // Listen for disconnection events pushed from the main process (e.g. tray
  // disconnect, or P2P teardown initiated by the system).
  useEffect(() => {
    const cleanup = window.nvrs.connection.onDisconnected(() => {
      useConnectionStore.getState().setStatus('disconnected');
      toast.info('Disconnected from host');
    });

    return cleanup;
  }, []);

  // Listen for deep-link connect events (nvremote://connect?host=<id>).
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

  // Surface a UI toast when there is a connection error
  useEffect(() => {
    if (status === 'error' && error) {
      toast.error(error);
    }
  }, [status, error]);

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

  const isConnecting = status === 'requesting' || status === 'signaling' || status === 'ice-gathering' || status === 'connecting';

  return {
    status,
    gamingMode,
    connectionType,
    error,
    connectedHost,
    stats,
    isStreaming: status === 'streaming',
    isConnecting,
    connect,
    disconnect,
    reconnect,
    setGamingMode,
  };
}
