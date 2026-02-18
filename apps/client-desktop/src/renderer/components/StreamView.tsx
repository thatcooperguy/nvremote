import React, { useState, useEffect, useRef, useCallback } from 'react';
import { colors, typography, spacing, radius, shadows } from '../styles/theme';
import { useConnectionStore, type StreamStats } from '../store/connectionStore';
import { useStreamStats } from '../hooks/useStreamStats';
import { StreamControls } from './StreamControls';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTROLS_HIDE_DELAY_MS = 3000;

// ---------------------------------------------------------------------------
// Stats overlay sub-component
// ---------------------------------------------------------------------------

interface StatsOverlayProps {
  stats: StreamStats | null;
}

function StatsOverlay({ stats }: StatsOverlayProps): React.ReactElement | null {
  if (!stats) return null;

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Bitrate', value: `${(stats.bitrate / 1000).toFixed(1)} Mbps` },
    { label: 'FPS', value: `${stats.fps}` },
    { label: 'Resolution', value: `${stats.resolution.width}x${stats.resolution.height}` },
    { label: 'Codec', value: stats.codec },
    { label: 'RTT', value: `${stats.rtt} ms` },
    { label: 'Jitter', value: `${stats.jitter.toFixed(1)} ms` },
    { label: 'Packet Loss', value: `${stats.packetLoss.toFixed(1)}%` },
    { label: 'Decode Time', value: `${stats.decodeTimeMs.toFixed(1)} ms` },
    { label: 'Render Time', value: `${stats.renderTimeMs.toFixed(1)} ms` },
    { label: 'Connection', value: stats.connectionType },
    { label: 'Gaming Mode', value: stats.gamingMode },
  ];

  return (
    <div style={statsStyles.overlay}>
      <div style={statsStyles.header}>Stream Statistics</div>
      {rows.map((row) => (
        <div key={row.label} style={statsStyles.row}>
          <span style={statsStyles.label}>{row.label}</span>
          <span style={statsStyles.value}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

const statsStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 60,
    left: spacing.md,
    backgroundColor: 'rgba(10, 10, 10, 0.85)',
    backdropFilter: 'blur(8px)',
    borderRadius: radius.md,
    border: `1px solid ${colors.border.default}`,
    padding: spacing.md,
    zIndex: 499,
    minWidth: 220,
    boxShadow: shadows.md,
  },
  header: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.accent.default,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottom: `1px solid ${colors.border.default}`,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '2px 0',
  },
  label: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
  },
  value: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    fontFamily: typography.fontMono,
  },
};

// ---------------------------------------------------------------------------
// Stream View component
// ---------------------------------------------------------------------------

export function StreamView(): React.ReactElement {
  const disconnect = useConnectionStore((s) => s.disconnect);
  const stats = useStreamStats();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [showStatsOverlay, setShowStatsOverlay] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-hide controls after CONTROLS_HIDE_DELAY_MS of mouse inactivity
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);

    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
    }

    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_HIDE_DELAY_MS);
  }, []);

  // Show controls on mouse enter, start hide timer
  const handleMouseEnter = useCallback(() => {
    resetHideTimer();
  }, [resetHideTimer]);

  // Keep controls visible when mouse is at the top edge (for control interaction)
  const handleMouseMoveDetailed = useCallback(
    (e: React.MouseEvent) => {
      if (e.clientY < 60) {
        // Near the top, keep controls visible
        setControlsVisible(true);
        if (hideTimerRef.current !== null) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
      } else {
        resetHideTimer();
      }
    },
    [resetHideTimer]
  );

  // Initial setup: start hide timer
  useEffect(() => {
    resetHideTimer();

    return () => {
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [resetHideTimer]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to show controls or disconnect
      if (e.key === 'Escape') {
        if (controlsVisible) {
          // If controls are already showing, disconnect
          disconnect();
        } else {
          // Show controls first
          resetHideTimer();
        }
        return;
      }

      // F11 or F for fullscreen toggle
      if (e.key === 'F11' || (e.key === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey)) {
        handleToggleFullscreen();
        return;
      }

      // Tab to toggle stats overlay
      if (e.key === 'Tab') {
        e.preventDefault();
        setShowStatsOverlay((prev) => !prev);
        return;
      }

      // Any other key shows controls briefly
      resetHideTimer();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [controlsVisible, disconnect, resetHideTimer]);

  // Fullscreen change detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleDisconnect = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
    await disconnect();
  }, [disconnect]);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (containerRef.current) {
        await containerRef.current.requestFullscreen();
      }
    } catch {
      // Fullscreen not supported or denied
    }
  }, []);

  const handleToggleStats = useCallback(() => {
    setShowStatsOverlay((prev) => !prev);
  }, []);

  // Cursor hiding: hide cursor after 2s of no movement during stream
  const [cursorHidden, setCursorHidden] = useState(false);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleMouseMoveForCursor = () => {
      setCursorHidden(false);
      if (cursorTimerRef.current) {
        clearTimeout(cursorTimerRef.current);
      }
      cursorTimerRef.current = setTimeout(() => {
        if (!controlsVisible) {
          setCursorHidden(true);
        }
      }, 2000);
    };

    window.addEventListener('mousemove', handleMouseMoveForCursor);
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveForCursor);
      if (cursorTimerRef.current) {
        clearTimeout(cursorTimerRef.current);
      }
    };
  }, [controlsVisible]);

  return (
    <div
      ref={containerRef}
      style={{
        ...viewStyles.container,
        cursor: cursorHidden ? 'none' : 'default',
      }}
      onMouseMove={handleMouseMoveDetailed}
      onMouseEnter={handleMouseEnter}
    >
      {/* Native viewer render surface placeholder */}
      <div style={viewStyles.renderSurface}>
        {/* In production, the native addon renders directly into this surface
            via the window handle. For development, show a placeholder. */}
        <div style={viewStyles.placeholder}>
          <div style={viewStyles.placeholderContent}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="12" fill={colors.accent.muted} />
              <path
                d="M20 24L28 32L20 40M34 40H44"
                stroke={colors.accent.default}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span style={viewStyles.placeholderText}>
              NVRemote Viewer Active
            </span>
            <span style={viewStyles.placeholderSubtext}>
              Native render surface -- streaming content appears here
            </span>
          </div>
        </div>
      </div>

      {/* Stream controls HUD */}
      <StreamControls
        visible={controlsVisible}
        onDisconnect={handleDisconnect}
        onToggleFullscreen={handleToggleFullscreen}
        onToggleStats={handleToggleStats}
        isFullscreen={isFullscreen}
        showStats={showStatsOverlay}
      />

      {/* Stats overlay */}
      {showStatsOverlay && <StatsOverlay stats={stats} />}

      {/* Network health indicator — always visible in bottom-right */}
      <NetworkHealthIndicator stats={stats} visible={!controlsVisible} />

      {/* Reconnecting overlay */}
      <ReconnectOverlay />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Network health indicator — always-visible small badge in bottom-right
// ---------------------------------------------------------------------------

type HealthLevel = 'excellent' | 'good' | 'fair' | 'poor';

function getNetworkHealth(stats: StreamStats | null): { level: HealthLevel; label: string } {
  if (!stats) return { level: 'good', label: 'Connecting' };

  const { rtt, packetLoss, jitter, fps } = stats;

  // Score from 0–100 based on multiple factors
  let score = 100;
  if (rtt > 10) score -= Math.min(40, (rtt - 10) * 0.8);
  if (packetLoss > 0) score -= Math.min(30, packetLoss * 15);
  if (jitter > 2) score -= Math.min(20, (jitter - 2) * 2);
  if (fps < 55) score -= Math.min(10, (55 - fps) * 0.5);

  if (score >= 85) return { level: 'excellent', label: 'Excellent' };
  if (score >= 65) return { level: 'good', label: 'Good' };
  if (score >= 40) return { level: 'fair', label: 'Fair' };
  return { level: 'poor', label: 'Poor' };
}

function getHealthColor(level: HealthLevel): string {
  switch (level) {
    case 'excellent': return colors.semantic.success;
    case 'good': return colors.semantic.success;
    case 'fair': return colors.semantic.warning;
    case 'poor': return colors.semantic.error;
  }
}

interface NetworkHealthIndicatorProps {
  stats: StreamStats | null;
  visible: boolean;
}

function NetworkHealthIndicator({ stats, visible }: NetworkHealthIndicatorProps): React.ReactElement {
  const { level, label } = getNetworkHealth(stats);
  const color = getHealthColor(level);
  const barCount = level === 'excellent' ? 4 : level === 'good' ? 3 : level === 'fair' ? 2 : 1;

  return (
    <div
      style={{
        ...healthStyles.container,
        opacity: visible ? 0.85 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
      }}
    >
      {/* Signal bars */}
      <div style={healthStyles.bars}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: 4 + i * 3,
              borderRadius: 1,
              backgroundColor: i <= barCount ? color : 'rgba(255,255,255,0.15)',
              transition: 'background-color 500ms ease',
            }}
          />
        ))}
      </div>
      <span style={{ ...healthStyles.label, color }}>{label}</span>
      {stats && (
        <span style={healthStyles.rtt}>{stats.rtt}ms</span>
      )}
    </div>
  );
}

const healthStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: spacing.md,
    right: spacing.md,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    backgroundColor: 'rgba(10, 10, 10, 0.75)',
    backdropFilter: 'blur(8px)',
    borderRadius: radius.md,
    border: '1px solid rgba(255,255,255,0.06)',
    zIndex: 498,
    transition: 'opacity 400ms ease, transform 400ms ease',
    pointerEvents: 'none',
  },
  bars: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
  },
  label: {
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  rtt: {
    fontSize: 10,
    fontFamily: typography.fontMono,
    color: colors.text.disabled,
  },
};

// ---------------------------------------------------------------------------
// Reconnect overlay
// ---------------------------------------------------------------------------

function ReconnectOverlay(): React.ReactElement | null {
  const status = useConnectionStore((s) => s.status);
  const attempts = useConnectionStore((s) => s.reconnectAttempts);
  const disconnect = useConnectionStore((s) => s.disconnect);

  if (status !== 'reconnecting') return null;

  return (
    <div style={reconnectStyles.overlay}>
      <div style={reconnectStyles.card}>
        <div style={reconnectStyles.spinner} />
        <span style={reconnectStyles.title}>Reconnecting...</span>
        <span style={reconnectStyles.subtitle}>
          Attempt {attempts} of 3
        </span>
        <button
          onClick={() => disconnect()}
          style={reconnectStyles.cancelBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)';
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const reconnectStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 500,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(20, 20, 20, 0.9)',
    border: `1px solid ${colors.border.default}`,
    boxShadow: shadows.lg,
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid rgba(255,255,255,0.15)',
    borderTopColor: '#EAB308',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
  },
  cancelBtn: {
    marginTop: 8,
    padding: '8px 24px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const viewStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    inset: 0,
    backgroundColor: '#000000',
    zIndex: 400,
    display: 'flex',
    flexDirection: 'column',
  },
  renderSurface: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  placeholder: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `radial-gradient(ellipse at center, ${colors.bg.surface} 0%, #000000 70%)`,
  },
  placeholderContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.md,
    opacity: 0.6,
  },
  placeholderText: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  placeholderSubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
    textAlign: 'center',
    maxWidth: 400,
  },
};
