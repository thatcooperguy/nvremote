import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { useHostStore } from '../store/hostStore';
import { useConnectionStore } from '../store/connectionStore';
import { useSessionStore } from '../store/sessionStore';
import { toast } from '../components/Toast';
import type { HostStatus } from '../components/StatusBadge';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

let socket: Socket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

interface HostStatusEvent {
  hostId: string;
  status: HostStatus;
  latencyMs?: number;
}

interface SessionEvent {
  sessionId: string;
  status: string;
  message?: string;
}

interface HostLatencyEvent {
  hostId: string;
  latencyMs: number;
}

export function connectSocket(): void {
  const tokens = useAuthStore.getState().tokens;
  if (!tokens?.accessToken) {
    console.warn('Cannot connect socket: no access token');
    return;
  }

  if (socket?.connected) {
    console.warn('Socket is already connected');
    return;
  }

  // Disconnect any existing socket
  disconnectSocket();

  socket = io(SOCKET_URL, {
    auth: {
      token: tokens.accessToken,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    timeout: 10000,
  });

  setupEventHandlers(socket);
}

function setupEventHandlers(sock: Socket): void {
  sock.on('connect', () => {
    reconnectAttempts = 0;
  });

  sock.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      // Server forcefully disconnected, likely auth issue
      toast.warning('Real-time connection lost. Attempting to reconnect...');
    }
  });

  sock.on('connect_error', (error) => {
    reconnectAttempts++;
    console.error('Socket connection error:', error.message);

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      toast.error('Unable to establish real-time connection. Some features may be unavailable.');
    }
  });

  sock.on('reconnect', () => {
    toast.success('Real-time connection restored');
    reconnectAttempts = 0;
  });

  // --- Application Events ---

  sock.on('host:status', (event: HostStatusEvent) => {
    const { updateHostStatus, updateHostLatency } = useHostStore.getState();
    updateHostStatus(event.hostId, event.status);

    if (event.latencyMs !== undefined) {
      updateHostLatency(event.hostId, event.latencyMs);
    }

    // Notify if a connected host goes offline
    const connectedHost = useConnectionStore.getState().connectedHost;
    if (connectedHost?.id === event.hostId && event.status === 'offline') {
      toast.warning('Connected host went offline. Connection may be interrupted.');
    }
  });

  sock.on('host:latency', (event: HostLatencyEvent) => {
    useHostStore.getState().updateHostLatency(event.hostId, event.latencyMs);
  });

  sock.on('session:updated', (event: SessionEvent) => {
    const { activeSession, updateActiveSession } = useSessionStore.getState();

    if (activeSession?.id === event.sessionId) {
      updateActiveSession({ status: event.status as 'active' | 'completed' | 'failed' });
    }

    if (event.status === 'terminated' || event.status === 'failed') {
      if (activeSession?.id === event.sessionId) {
        toast.warning(event.message || 'Session was terminated by the server.');
        useConnectionStore.getState().disconnect();
      }
    }
  });

  sock.on('session:force-disconnect', () => {
    toast.warning('You have been disconnected by an administrator.');
    useConnectionStore.getState().disconnect();
  });

  // Token refresh handling: update socket auth on token refresh
  useAuthStore.subscribe((state) => {
    if (state.tokens?.accessToken && sock.connected) {
      sock.auth = { token: state.tokens.accessToken };
    }
  });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  reconnectAttempts = 0;
}

export function getSocket(): Socket | null {
  return socket;
}

export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

/**
 * Emit an event through the socket.
 * Returns false if socket is not connected.
 */
export function emitEvent<T>(event: string, data: T): boolean {
  if (!socket?.connected) {
    console.warn(`Cannot emit '${event}': socket not connected`);
    return false;
  }
  socket.emit(event, data);
  return true;
}
