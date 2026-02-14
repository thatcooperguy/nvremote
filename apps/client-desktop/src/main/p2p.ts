// ---------------------------------------------------------------------------
// P2P Connection Orchestration via Signaling WebSocket
// ---------------------------------------------------------------------------

import { io, Socket } from 'socket.io-client';
import { BrowserWindow } from 'electron';
import { getViewer, type IceCandidate } from './viewer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { IceCandidate } from './viewer';

export interface SessionOptions {
  codecs: string[];
  gamingMode: 'competitive' | 'balanced' | 'cinematic';
  maxBitrate?: number;
  targetFps?: number;
}

export interface SessionInfo {
  sessionId: string;
  hostId: string;
  codec: string;
  gamingMode: 'competitive' | 'balanced' | 'cinematic';
}

export interface SessionAcceptedInfo {
  sessionId: string;
  codec: string;
  capabilities: {
    maxBitrate: number;
    maxFps: number;
    maxResolution: { width: number; height: number };
    supportedCodecs: string[];
  };
  dtlsFingerprint: string;
  stunServers: string[];
}

export interface SessionConnectedInfo {
  sessionId: string;
  connectionType: 'p2p' | 'relay';
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let signalingSocket: Socket | null = null;
let currentSessionId: string | null = null;
let mainWindow: BrowserWindow | null = null;

// Callbacks registered by the connection orchestrator
let onIceCandidateCallback: ((candidate: IceCandidate) => void) | null = null;
let onSessionAcceptedCallback: ((info: SessionAcceptedInfo) => void) | null = null;
let onSessionConnectedCallback: ((info: SessionConnectedInfo) => void) | null = null;
let onSessionErrorCallback: ((error: string) => void) | null = null;
let onSessionEndedCallback: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Signaling socket configuration
// ---------------------------------------------------------------------------

const SIGNALING_URL = process.env.SIGNALING_URL || 'https://api.crazystream.gg';
const SIGNALING_NAMESPACE = '/signaling';
const CONNECT_TIMEOUT_MS = 10_000;
const SESSION_REQUEST_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// P2P Connection Manager
// ---------------------------------------------------------------------------

/**
 * Initialize the P2P connection manager. Must be called once during app startup
 * so that the main window reference is available for forwarding events.
 */
export function initP2P(window: BrowserWindow): void {
  mainWindow = window;
}

/**
 * Connect to the signaling server's WebSocket namespace.
 * Authenticates using the provided access token.
 */
export function connectSignaling(accessToken: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signalingSocket?.connected) {
      resolve();
      return;
    }

    // Disconnect any stale socket
    disconnectSignaling();

    signalingSocket = io(`${SIGNALING_URL}${SIGNALING_NAMESPACE}`, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      timeout: CONNECT_TIMEOUT_MS,
    });

    const connectTimeout = setTimeout(() => {
      reject(new Error('Signaling server connection timed out'));
      signalingSocket?.disconnect();
      signalingSocket = null;
    }, CONNECT_TIMEOUT_MS);

    signalingSocket.on('connect', () => {
      clearTimeout(connectTimeout);
      console.log('[P2P] Connected to signaling server');
      resolve();
    });

    signalingSocket.on('connect_error', (err) => {
      clearTimeout(connectTimeout);
      console.error('[P2P] Signaling connection error:', err.message);
      reject(new Error(`Failed to connect to signaling server: ${err.message}`));
    });

    // Wire up signaling event handlers
    setupSignalingHandlers(signalingSocket);
  });
}

/**
 * Disconnect from the signaling server.
 */
export function disconnectSignaling(): void {
  if (signalingSocket) {
    signalingSocket.removeAllListeners();
    signalingSocket.disconnect();
    signalingSocket = null;
  }
  currentSessionId = null;
}

/**
 * Request a streaming session with the specified host.
 *
 * Flow:
 *  1. Emit session:request with hostId, codecs, gamingMode, maxBitrate, targetFps
 *  2. Wait for session:accepted from the server
 *  3. Gather local ICE candidates via the native addon
 *  4. Send ice:candidate messages through the signaling WebSocket
 *  5. Receive remote ice:candidate from host, pass to native addon
 *  6. Both sides send ice:complete
 *  7. Native addon establishes the P2P connection
 *  8. Signal session:p2p-established
 */
export function requestSession(
  hostId: string,
  options: SessionOptions,
): Promise<SessionInfo> {
  return new Promise((resolve, reject) => {
    if (!signalingSocket?.connected) {
      reject(new Error('Not connected to signaling server. Call connectSignaling() first.'));
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error('Session request timed out. The host may be unavailable.'));
    }, SESSION_REQUEST_TIMEOUT_MS);

    // Listen for the session:accepted response
    const acceptHandler = (info: SessionAcceptedInfo) => {
      clearTimeout(timeout);
      currentSessionId = info.sessionId;

      console.log('[P2P] Session accepted:', {
        sessionId: info.sessionId,
        codec: info.codec,
        stunServers: info.stunServers.length,
      });

      // Notify the stored callback
      if (onSessionAcceptedCallback) {
        onSessionAcceptedCallback(info);
      }

      // Forward to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('p2p:session-accepted', info);
      }

      resolve({
        sessionId: info.sessionId,
        hostId,
        codec: info.codec,
        gamingMode: options.gamingMode,
      });
    };

    const rejectHandler = (data: { reason: string }) => {
      clearTimeout(timeout);
      const message = data.reason || 'Session request was rejected by the host.';
      console.warn('[P2P] Session rejected:', message);
      reject(new Error(message));
    };

    signalingSocket.once('session:accepted', acceptHandler);
    signalingSocket.once('session:rejected', rejectHandler);

    // Emit the session request
    signalingSocket.emit('session:request', {
      hostId,
      codecs: options.codecs,
      gamingMode: options.gamingMode,
      maxBitrate: options.maxBitrate,
      targetFps: options.targetFps,
    });

    console.log('[P2P] Session requested for host:', hostId);
  });
}

/**
 * Gather local ICE candidates using the native viewer addon and send them
 * to the remote peer through the signaling channel.
 */
export async function gatherAndSendCandidates(
  stunServers: string[],
): Promise<IceCandidate[]> {
  const viewer = getViewer();
  const candidates = await viewer.gatherIceCandidates(stunServers);

  console.log(`[P2P] Gathered ${candidates.length} local ICE candidates`);

  // Send each candidate through the signaling channel
  for (const candidate of candidates) {
    sendIceCandidate(candidate);
  }

  // Signal that local candidate gathering is complete
  sendIceComplete();

  return candidates;
}

/**
 * Send a single ICE candidate to the remote peer via signaling.
 */
export function sendIceCandidate(candidate: IceCandidate): void {
  if (!signalingSocket?.connected || !currentSessionId) {
    console.warn('[P2P] Cannot send ICE candidate: not in an active session');
    return;
  }

  signalingSocket.emit('ice:candidate', {
    sessionId: currentSessionId,
    candidate,
  });
}

/**
 * Signal that local ICE candidate gathering is complete.
 */
export function sendIceComplete(): void {
  if (!signalingSocket?.connected || !currentSessionId) {
    console.warn('[P2P] Cannot send ICE complete: not in an active session');
    return;
  }

  signalingSocket.emit('ice:complete', {
    sessionId: currentSessionId,
  });

  console.log('[P2P] Sent ice:complete');
}

/**
 * Establish the P2P connection using the native viewer addon after ICE
 * candidate exchange is complete.
 */
export async function establishP2PConnection(
  dtlsFingerprint: string,
): Promise<{ connectionType: string }> {
  const viewer = getViewer();
  const result = await viewer.connectP2P({ dtlsFingerprint });

  console.log('[P2P] Connection established:', result.connectionType);

  // Notify the signaling server
  if (signalingSocket?.connected && currentSessionId) {
    signalingSocket.emit('session:p2p-established', {
      sessionId: currentSessionId,
      connectionType: result.connectionType,
    });
  }

  // Notify the callback
  if (onSessionConnectedCallback) {
    onSessionConnectedCallback({
      sessionId: currentSessionId || '',
      connectionType: result.connectionType as 'p2p' | 'relay',
    });
  }

  // Forward to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('p2p:connected', {
      sessionId: currentSessionId,
      connectionType: result.connectionType,
    });
  }

  return result;
}

/**
 * Tear down the P2P connection and notify the signaling server.
 */
export function disconnectP2P(): void {
  const viewer = getViewer();
  viewer.disconnectP2P();

  if (signalingSocket?.connected && currentSessionId) {
    signalingSocket.emit('session:ended', {
      sessionId: currentSessionId,
    });
  }

  currentSessionId = null;

  console.log('[P2P] Disconnected P2P connection');

  // Forward to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('p2p:disconnected');
  }
}

// ---------------------------------------------------------------------------
// Event registration
// ---------------------------------------------------------------------------

export function onIceCandidate(callback: (candidate: IceCandidate) => void): void {
  onIceCandidateCallback = callback;
}

export function onSessionAccepted(callback: (info: SessionAcceptedInfo) => void): void {
  onSessionAcceptedCallback = callback;
}

export function onSessionConnected(callback: (info: SessionConnectedInfo) => void): void {
  onSessionConnectedCallback = callback;
}

export function onSessionError(callback: (error: string) => void): void {
  onSessionErrorCallback = callback;
}

export function onSessionEnded(callback: () => void): void {
  onSessionEndedCallback = callback;
}

/**
 * Get the current session ID if one is active.
 */
export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

/**
 * Check if the signaling socket is connected.
 */
export function isSignalingConnected(): boolean {
  return signalingSocket?.connected ?? false;
}

// ---------------------------------------------------------------------------
// Internal: Signaling event handlers
// ---------------------------------------------------------------------------

function setupSignalingHandlers(socket: Socket): void {
  // Remote ICE candidate received from the host
  socket.on('ice:candidate', (data: { sessionId: string; candidate: IceCandidate }) => {
    if (data.sessionId !== currentSessionId) return;

    console.log('[P2P] Received remote ICE candidate:', data.candidate.type, data.candidate.ip);

    // Pass to native addon
    const viewer = getViewer();
    viewer.addRemoteCandidate(data.candidate);

    // Notify callback
    if (onIceCandidateCallback) {
      onIceCandidateCallback(data.candidate);
    }

    // Forward to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('p2p:remote-candidate', data.candidate);
    }
  });

  // Remote ICE gathering complete
  socket.on('ice:complete', (data: { sessionId: string }) => {
    if (data.sessionId !== currentSessionId) return;
    console.log('[P2P] Remote ICE gathering complete');

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('p2p:remote-ice-complete');
    }
  });

  // Session ended by host or server
  socket.on('session:ended', (data: { sessionId: string; reason?: string }) => {
    if (data.sessionId !== currentSessionId) return;

    console.log('[P2P] Session ended:', data.reason || 'no reason given');

    const viewer = getViewer();
    viewer.disconnectP2P();
    currentSessionId = null;

    if (onSessionEndedCallback) {
      onSessionEndedCallback();
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('p2p:session-ended', {
        reason: data.reason || 'Session ended by host',
      });
    }
  });

  // Session error
  socket.on('session:error', (data: { sessionId: string; error: string }) => {
    if (data.sessionId !== currentSessionId) return;

    console.error('[P2P] Session error:', data.error);

    if (onSessionErrorCallback) {
      onSessionErrorCallback(data.error);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('p2p:session-error', { error: data.error });
    }
  });

  // Signaling server disconnected
  socket.on('disconnect', (reason) => {
    console.warn('[P2P] Signaling disconnected:', reason);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('p2p:signaling-disconnected', { reason });
    }
  });

  // Reconnected to signaling
  socket.on('reconnect', () => {
    console.log('[P2P] Signaling reconnected');

    // If we had an active session, try to rejoin
    if (currentSessionId) {
      socket.emit('session:rejoin', { sessionId: currentSessionId });
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('p2p:signaling-reconnected');
    }
  });
}
