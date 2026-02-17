'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { isAuthenticated, authFetch } from '@/lib/auth';
import {
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  XCircle,
  WifiOff,
  Monitor,
  Gamepad2,
  Keyboard,
  MousePointer2,
  Gauge,
  ArrowDown,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StreamStats {
  bitrateKbps: number;
  fps: number;
  packetLossPercent: number;
  jitterMs: number;
  rttMs: number;
  codec: string;
  width: number;
  height: number;
}

type ConnectionState =
  | 'connecting'
  | 'signaling'
  | 'streaming'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

// ---------------------------------------------------------------------------
// Input message types (sent via DataChannel to host)
// ---------------------------------------------------------------------------

interface MouseMoveMsg {
  type: 'mousemove';
  dx: number;
  dy: number;
  ts: number;
}

interface MouseButtonMsg {
  type: 'mousedown' | 'mouseup';
  button: number;
  ts: number;
}

interface MouseWheelMsg {
  type: 'wheel';
  dx: number;
  dy: number;
  ts: number;
}

interface KeyMsg {
  type: 'keydown' | 'keyup';
  code: string;
  key: string;
  ts: number;
}

interface GamepadMsg {
  type: 'gamepad';
  index: number;
  axes: number[];
  buttons: { pressed: boolean; value: number }[];
  ts: number;
}

type InputMessage =
  | MouseMoveMsg
  | MouseButtonMsg
  | MouseWheelMsg
  | KeyMsg
  | GamepadMsg;

// ---------------------------------------------------------------------------
// Web Client Page
// ---------------------------------------------------------------------------

export default function WebStreamPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const gamepadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const icePollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<ConnectionState>('connecting');
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [reconnectToast, setReconnectToast] = useState<string | null>(null);

  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectToastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxReconnectAttempts = 3;
  const prevBytesRef = useRef(0);
  const prevTimestampRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Auth check
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace(`/login?redirect=/stream/${sessionId}`);
    }
  }, [router, sessionId]);

  // ---------------------------------------------------------------------------
  // Send input via DataChannel
  // ---------------------------------------------------------------------------
  const sendInput = useCallback((msg: InputMessage) => {
    const dc = dataChannelRef.current;
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(msg));
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Signaling connection
  // ---------------------------------------------------------------------------
  const connect = useCallback(async () => {
    try {
      setState('signaling');

      // Fetch session info to get ICE servers
      const res = await authFetch(`/api/v1/sessions/${sessionId}`);
      if (!res.ok) {
        throw new Error(`Session not found (${res.status})`);
      }

      const sessionInfo = await res.json();

      // Build ICE server config
      const iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];

      // Add TURN servers if provided
      if (sessionInfo.turnServers) {
        for (const turn of sessionInfo.turnServers) {
          iceServers.push({
            urls: turn.urls,
            username: turn.username,
            credential: turn.credential,
          });
        }
      }

      const pc = new RTCPeerConnection({
        iceServers,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });
      peerConnectionRef.current = pc;

      // Receive-only transceivers for video and audio
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      // Create ordered DataChannel for input forwarding
      const dc = pc.createDataChannel('input', {
        ordered: true,
        maxRetransmits: 3,
      });
      dataChannelRef.current = dc;

      dc.onopen = () => {};
      dc.onclose = () => {};

      // Handle incoming tracks
      pc.ontrack = (event) => {
        if (event.track.kind === 'video' && videoRef.current) {
          const existing = videoRef.current.srcObject as MediaStream | null;
          if (existing) {
            existing.addTrack(event.track);
          } else {
            const stream = new MediaStream([event.track]);
            videoRef.current.srcObject = stream;
          }
          videoRef.current.play().catch(() => {});
          setState('streaming');
        }
        if (event.track.kind === 'audio' && videoRef.current) {
          const existing = videoRef.current.srcObject as MediaStream | null;
          if (existing) {
            existing.addTrack(event.track);
          }
        }
      };

      // ICE connection state
      pc.oniceconnectionstatechange = () => {
        switch (pc.iceConnectionState) {
          case 'connected':
          case 'completed':
            if (state === 'reconnecting') {
              setReconnectToast('Connection restored');
              if (reconnectToastTimeout.current) clearTimeout(reconnectToastTimeout.current);
              reconnectToastTimeout.current = setTimeout(() => setReconnectToast(null), 4000);
            }
            setState('streaming');
            reconnectAttemptRef.current = 0;
            break;
          case 'disconnected':
            // Attempt ICE restart before giving up
            if (reconnectAttemptRef.current < maxReconnectAttempts) {
              reconnectAttemptRef.current += 1;
              setState('reconnecting');
              pc.restartIce();
              // Create a new offer with iceRestart to trigger re-negotiation
              pc.createOffer({ iceRestart: true })
                .then((restartOffer) => pc.setLocalDescription(restartOffer))
                .then(() => {
                  return authFetch(`/api/v1/sessions/${sessionId}/offer`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      sdp: pc.localDescription?.sdp,
                      type: pc.localDescription?.type,
                    }),
                  });
                })
                .then(async (restartRes) => {
                  if (restartRes.ok) {
                    const restartAnswer = await restartRes.json();
                    if (restartAnswer.sdp) {
                      await pc.setRemoteDescription(
                        new RTCSessionDescription({
                          type: 'answer',
                          sdp: restartAnswer.sdp,
                        }),
                      );
                    }
                  }
                })
                .catch(() => {
                  // ICE restart failed, will fall through on next state change
                });
            } else {
              setState('disconnected');
            }
            break;
          case 'failed':
            setState('error');
            setError('ICE connection failed — try refreshing or check your network');
            break;
        }
      };

      // Create SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer to the host via the REST signaling relay
      const offerRes = await authFetch(`/api/v1/sessions/${sessionId}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: offer.sdp,
          type: offer.type,
        }),
      });

      if (!offerRes.ok) {
        throw new Error(`Signaling failed (${offerRes.status})`);
      }

      const answer = await offerRes.json();
      if (answer.error) {
        throw new Error(answer.error);
      }

      if (answer.sdp) {
        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: answer.sdp }),
        );
      }

      // ICE candidate trickle: send local candidates to the API
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await authFetch(`/api/v1/sessions/${sessionId}/ice-candidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            }),
          }).catch(() => {});
        }
      };

      // Poll for host ICE candidates
      let gatheringComplete = false;
      icePollIntervalRef.current = setInterval(async () => {
        if (gatheringComplete) {
          if (icePollIntervalRef.current) {
            clearInterval(icePollIntervalRef.current);
            icePollIntervalRef.current = null;
          }
          return;
        }

        try {
          const pollRes = await authFetch(
            `/api/v1/sessions/${sessionId}/ice-candidates`,
          );
          if (pollRes.ok) {
            const data = await pollRes.json();
            for (const c of data.candidates) {
              await pc.addIceCandidate(
                new RTCIceCandidate({
                  candidate: c.candidate,
                  sdpMid: c.sdpMid,
                  sdpMLineIndex: c.sdpMLineIndex,
                }),
              );
            }
            if (data.gatheringComplete) {
              gatheringComplete = true;
            }
          }
        } catch {
          // Non-fatal; next poll will retry
        }
      }, 500);

      // Start stats polling
      statsIntervalRef.current = setInterval(() => {
        if (pc.connectionState === 'connected') {
          pc.getStats().then((report) => {
            let bitrateKbps = 0;
            let fps = 0;
            let packetsReceived = 0;
            let packetsLost = 0;
            let jitterMs = 0;
            let rttMs = 0;
            let codec = '';
            let width = 0;
            let height = 0;

            report.forEach((stat) => {
              if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
                fps = stat.framesPerSecond || 0;
                packetsReceived = stat.packetsReceived || 0;
                packetsLost = stat.packetsLost || 0;
                jitterMs = (stat.jitter || 0) * 1000;
                width = stat.frameWidth || 0;
                height = stat.frameHeight || 0;
                // Compute delta bitrate (per-second) instead of cumulative
                const nowBytes = stat.bytesReceived || 0;
                const nowTs = stat.timestamp || Date.now();
                if (prevBytesRef.current > 0 && prevTimestampRef.current > 0) {
                  const deltaBytes = nowBytes - prevBytesRef.current;
                  const deltaSec = (nowTs - prevTimestampRef.current) / 1000;
                  bitrateKbps = deltaSec > 0 ? (deltaBytes * 8) / 1000 / deltaSec : 0;
                }
                prevBytesRef.current = nowBytes;
                prevTimestampRef.current = nowTs;
              }
              if (stat.type === 'candidate-pair' && stat.nominated) {
                rttMs = stat.currentRoundTripTime
                  ? stat.currentRoundTripTime * 1000
                  : 0;
              }
              if (stat.type === 'codec' && stat.mimeType?.startsWith('video/')) {
                codec = stat.mimeType.replace('video/', '');
              }
            });

            const total = packetsReceived + packetsLost;
            const loss = total > 0 ? (packetsLost / total) * 100 : 0;

            setStats({
              bitrateKbps: Math.round(bitrateKbps),
              fps: Math.round(fps),
              packetLossPercent: Math.round(loss * 10) / 10,
              jitterMs: Math.round(jitterMs * 10) / 10,
              rttMs: Math.round(rttMs * 10) / 10,
              codec,
              width,
              height,
            });
          });
        }
      }, 1000);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [sessionId]);

  // ---------------------------------------------------------------------------
  // Lifecycle: connect on mount, cleanup on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isAuthenticated()) {
      connect();
    }

    return () => {
      peerConnectionRef.current?.close();
      dataChannelRef.current?.close();
      if (icePollIntervalRef.current) clearInterval(icePollIntervalRef.current);
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      if (gamepadIntervalRef.current) clearInterval(gamepadIntervalRef.current);
    };
  }, [connect]);

  // ---------------------------------------------------------------------------
  // Controls auto-hide
  // ---------------------------------------------------------------------------
  const resetControlsTimer = useCallback(() => {
    if (isPointerLocked) return; // Don't show controls when pointer is locked
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      if (state === 'streaming') setShowControls(false);
    }, 3000);
  }, [state, isPointerLocked]);

  // ---------------------------------------------------------------------------
  // Fullscreen toggle
  // ---------------------------------------------------------------------------
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Keyboard/mouse capture (Pointer Lock)
  // ---------------------------------------------------------------------------
  const requestPointerLock = useCallback(() => {
    videoRef.current?.requestPointerLock();
  }, []);

  // Pointer Lock state tracking
  useEffect(() => {
    const handleLockChange = () => {
      const locked = document.pointerLockElement === videoRef.current;
      setIsPointerLocked(locked);
      if (locked) {
        setShowControls(false);
      }
    };

    document.addEventListener('pointerlockchange', handleLockChange);
    return () => {
      document.removeEventListener('pointerlockchange', handleLockChange);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Mouse input forwarding (when pointer is locked)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isPointerLocked) return;

    const handleMouseMove = (e: MouseEvent) => {
      sendInput({
        type: 'mousemove',
        dx: e.movementX,
        dy: e.movementY,
        ts: Date.now(),
      });
    };

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      sendInput({
        type: 'mousedown',
        button: e.button,
        ts: Date.now(),
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      sendInput({
        type: 'mouseup',
        button: e.button,
        ts: Date.now(),
      });
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      sendInput({
        type: 'wheel',
        dx: e.deltaX,
        dy: e.deltaY,
        ts: Date.now(),
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('wheel', handleWheel);
    };
  }, [isPointerLocked, sendInput]);

  // ---------------------------------------------------------------------------
  // Keyboard input forwarding (when pointer is locked)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isPointerLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow Escape to exit pointer lock
      if (e.code === 'Escape') return;
      e.preventDefault();
      sendInput({
        type: 'keydown',
        code: e.code,
        key: e.key,
        ts: Date.now(),
      });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Escape') return;
      e.preventDefault();
      sendInput({
        type: 'keyup',
        code: e.code,
        key: e.key,
        ts: Date.now(),
      });
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPointerLocked, sendInput]);

  // ---------------------------------------------------------------------------
  // Gamepad API support
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleGamepadConnected = () => {
      setGamepadConnected(true);
    };

    const handleGamepadDisconnected = () => {
      const gamepads = navigator.getGamepads();
      const hasGamepad = gamepads.some((gp) => gp !== null);
      setGamepadConnected(hasGamepad);
    };

    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

    return () => {
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
    };
  }, []);

  // Gamepad polling (Gamepad API requires polling, not events)
  useEffect(() => {
    if (!gamepadConnected || state !== 'streaming') {
      if (gamepadIntervalRef.current) {
        clearInterval(gamepadIntervalRef.current);
        gamepadIntervalRef.current = null;
      }
      return;
    }

    gamepadIntervalRef.current = setInterval(() => {
      const gamepads = navigator.getGamepads();
      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (!gp) continue;

        sendInput({
          type: 'gamepad',
          index: gp.index,
          axes: Array.from(gp.axes),
          buttons: gp.buttons.map((b) => ({
            pressed: b.pressed,
            value: b.value,
          })),
          ts: Date.now(),
        });
      }
    }, 16); // ~60Hz gamepad polling

    return () => {
      if (gamepadIntervalRef.current) {
        clearInterval(gamepadIntervalRef.current);
        gamepadIntervalRef.current = null;
      }
    };
  }, [gamepadConnected, state, sendInput]);

  // ---------------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------------
  const disconnect = useCallback(async () => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    if (icePollIntervalRef.current) clearInterval(icePollIntervalRef.current);
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    if (gamepadIntervalRef.current) clearInterval(gamepadIntervalRef.current);

    try {
      await authFetch(`/api/v1/sessions/${sessionId}/end`, { method: 'POST' });
    } catch {
      // best effort
    }

    setState('disconnected');
    router.push('/dashboard');
  }, [sessionId, router]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      className="relative w-screen h-screen bg-black overflow-hidden cursor-none"
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        muted={isMuted}
        onDoubleClick={toggleFullscreen}
      />

      {/* Connection overlay */}
      {state !== 'streaming' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center space-y-4">
            {state === 'reconnecting' ? (
              <>
                <div className="w-12 h-12 border-3 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-white text-lg">Reconnecting...</p>
                <p className="text-gray-400 text-sm">
                  Attempt {reconnectAttemptRef.current} of {maxReconnectAttempts}
                </p>
                <button
                  onClick={disconnect}
                  className="mt-4 px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : state === 'connecting' || state === 'signaling' ? (
              <>
                <div className="w-12 h-12 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-white text-lg">
                  {state === 'connecting'
                    ? 'Connecting...'
                    : 'Establishing WebRTC session...'}
                </p>
                <p className="text-gray-400 text-sm">
                  Negotiating peer connection with host
                </p>
              </>
            ) : state === 'error' ? (
              <>
                <WifiOff className="w-12 h-12 text-red-500 mx-auto" />
                <p className="text-white text-lg">Connection Error</p>
                <p className="text-red-400 text-sm max-w-md">{error}</p>
                <div className="flex gap-3 justify-center mt-4">
                  <button
                    onClick={() => {
                      setState('connecting');
                      connect();
                    }}
                    className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Dashboard
                  </button>
                </div>
              </>
            ) : (
              <>
                <WifiOff className="w-12 h-12 text-yellow-500 mx-auto" />
                <p className="text-white text-lg">Disconnected</p>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="mt-4 px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Back to Dashboard
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Pointer lock hint overlay */}
      {state === 'streaming' && !isPointerLocked && showControls && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div className="bg-black/60 backdrop-blur-sm px-6 py-3 rounded-xl text-center">
            <MousePointer2 className="w-6 h-6 text-white mx-auto mb-2" />
            <p className="text-white text-sm">
              Click the{' '}
              <Keyboard className="inline w-4 h-4 mx-1" />
              button to capture mouse &amp; keyboard
            </p>
            <p className="text-gray-400 text-xs mt-1">Press Esc to release</p>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 p-4 transition-opacity duration-300 z-30',
          'bg-gradient-to-t from-black/80 to-transparent',
          showControls && !isPointerLocked
            ? 'opacity-100'
            : 'opacity-0 pointer-events-none',
        )}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Left controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            <button
              onClick={requestPointerLock}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isPointerLocked
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'hover:bg-white/10 text-white',
              )}
              title="Capture mouse & keyboard (Esc to release)"
            >
              <Keyboard size={20} />
            </button>

            {gamepadConnected && (
              <div className="flex items-center gap-1 text-emerald-400 text-xs">
                <Gamepad2 size={16} />
                <span>Gamepad</span>
              </div>
            )}
          </div>

          {/* Center: stats badge */}
          {stats && showStats && (
            <div className="flex items-center gap-4 text-xs text-gray-300 bg-black/60 px-4 py-2 rounded-full">
              <span>
                {stats.width}×{stats.height}
              </span>
              <span>{stats.fps} fps</span>
              <span>{stats.codec.toUpperCase()}</span>
              <span>{stats.bitrateKbps} kbps</span>
              <span>{stats.rttMs}ms RTT</span>
              {stats.packetLossPercent > 0 && (
                <span className="text-yellow-400">
                  {stats.packetLossPercent}% loss
                </span>
              )}
            </div>
          )}

          {/* Right controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowStats(!showStats)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                showStats
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'hover:bg-white/10 text-white',
              )}
              title="Toggle stats"
            >
              <Monitor size={20} />
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 size={20} />
              ) : (
                <Maximize2 size={20} />
              )}
            </button>

            <button
              onClick={disconnect}
              className="p-2 rounded-lg hover:bg-red-500/20 transition-colors text-red-400"
              title="Disconnect"
            >
              <XCircle size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Connection indicator */}
      <div
        className={cn(
          'absolute top-4 right-4 z-30 transition-opacity duration-300',
          showControls && !isPointerLocked ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
            state === 'streaming'
              ? 'bg-green-500/20 text-green-400'
              : state === 'error'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-yellow-500/20 text-yellow-400',
          )}
        >
          <div
            className={cn(
              'w-2 h-2 rounded-full',
              state === 'streaming'
                ? 'bg-green-400 animate-pulse'
                : 'bg-yellow-400',
            )}
          />
          {state === 'streaming' ? 'Live' : state}
        </div>
      </div>

      {/* Persistent latency + bandwidth badge (always visible when streaming) */}
      {state === 'streaming' && stats && (
        <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium backdrop-blur-sm',
              stats.rttMs < 30
                ? 'bg-green-500/20 text-green-400'
                : stats.rttMs < 80
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-red-500/20 text-red-400',
            )}
          >
            <Clock size={12} />
            {stats.rttMs}ms
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/10 backdrop-blur-sm text-gray-300">
            <ArrowDown size={12} />
            {stats.bitrateKbps > 1000
              ? `${(stats.bitrateKbps / 1000).toFixed(1)} Mbps`
              : `${stats.bitrateKbps} kbps`}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/10 backdrop-blur-sm text-gray-300">
            <Gauge size={12} />
            {stats.fps} fps
          </div>
        </div>
      )}

      {/* Reconnection toast */}
      {reconnectToast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 backdrop-blur-sm border border-green-500/30 text-green-400 text-sm font-medium">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            {reconnectToast}
          </div>
        </div>
      )}
    </div>
  );
}
