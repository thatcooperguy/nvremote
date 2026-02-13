import React, { useState, useCallback } from 'react';
import { colors, radius, spacing, typography, transitions, shadows } from '../styles/theme';
import { useConnectionStore, type GamingMode } from '../store/connectionStore';
import { useStreamStats } from '../hooks/useStreamStats';
import { GamingModeSelector } from './GamingModeSelector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StreamControlsProps {
  visible: boolean;
  onDisconnect: () => void;
  onToggleFullscreen: () => void;
  onToggleStats: () => void;
  isFullscreen: boolean;
  showStats: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBitrate(kbps: number): string {
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  return `${Math.round(kbps)} kbps`;
}

function formatResolution(res: { width: number; height: number }): string {
  if (res.height >= 2160) return '4K';
  if (res.height >= 1440) return '1440p';
  if (res.height >= 1080) return '1080p';
  if (res.height >= 720) return '720p';
  return `${res.width}x${res.height}`;
}

function getLatencyColor(rtt: number): string {
  if (rtt < 15) return colors.semantic.success;
  if (rtt < 40) return colors.semantic.warning;
  return colors.semantic.error;
}

function getConnectionIcon(type: string): string {
  return type === 'p2p' ? 'P2P' : 'Relay';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StreamControls({
  visible,
  onDisconnect,
  onToggleFullscreen,
  onToggleStats,
  isFullscreen,
  showStats,
}: StreamControlsProps): React.ReactElement {
  const stats = useStreamStats();
  const gamingMode = useConnectionStore((s) => s.gamingMode);
  const setGamingMode = useConnectionStore((s) => s.setGamingMode);
  const connectedHost = useConnectionStore((s) => s.connectedHost);
  const connectionType = useConnectionStore((s) => s.connectionType);
  const codec = useConnectionStore((s) => s.codec);
  const [showGamingModes, setShowGamingModes] = useState(false);

  const handleGamingModeChange = useCallback(
    (mode: GamingMode) => {
      setGamingMode(mode);
      setShowGamingModes(false);
    },
    [setGamingMode]
  );

  return (
    <div
      style={{
        ...styles.overlay,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transform: visible ? 'translateY(0)' : 'translateY(-20px)',
      }}
    >
      <div style={styles.container}>
        {/* Left: Host info & stats badges */}
        <div style={styles.leftSection}>
          <span style={styles.hostName}>
            {connectedHost?.name || 'Remote Host'}
          </span>

          <div style={styles.statsBadges}>
            {/* Latency */}
            {stats && (
              <div style={styles.badge}>
                <div
                  style={{
                    ...styles.badgeDot,
                    backgroundColor: getLatencyColor(stats.rtt),
                    boxShadow: `0 0 6px ${getLatencyColor(stats.rtt)}`,
                  }}
                />
                <span style={{ ...styles.badgeValue, color: getLatencyColor(stats.rtt) }}>
                  {stats.rtt}ms
                </span>
              </div>
            )}

            {/* Bitrate */}
            {stats && (
              <div style={styles.badge}>
                <span style={styles.badgeLabel}>Bitrate</span>
                <span style={styles.badgeValue}>{formatBitrate(stats.bitrate)}</span>
              </div>
            )}

            {/* FPS */}
            {stats && (
              <div style={styles.badge}>
                <span style={styles.badgeLabel}>FPS</span>
                <span style={styles.badgeValue}>{stats.fps}</span>
              </div>
            )}

            {/* Codec */}
            {(codec || stats?.codec) && (
              <div style={styles.badge}>
                <span style={styles.badgeLabel}>Codec</span>
                <span style={styles.badgeValue}>{stats?.codec || codec}</span>
              </div>
            )}

            {/* Resolution */}
            {stats && (
              <div style={styles.badge}>
                <span style={styles.badgeLabel}>Res</span>
                <span style={styles.badgeValue}>{formatResolution(stats.resolution)}</span>
              </div>
            )}

            {/* Connection type */}
            {connectionType && (
              <div
                style={{
                  ...styles.badge,
                  backgroundColor: connectionType === 'p2p'
                    ? 'rgba(118, 185, 0, 0.2)'
                    : 'rgba(74, 158, 255, 0.2)',
                }}
              >
                <span
                  style={{
                    ...styles.badgeValue,
                    color: connectionType === 'p2p' ? colors.accent.default : colors.semantic.info,
                    fontSize: typography.fontSize.xs,
                  }}
                >
                  {getConnectionIcon(connectionType)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Center: Gaming mode selector */}
        <div style={styles.centerSection}>
          <GamingModeSelector
            value={gamingMode}
            onChange={handleGamingModeChange}
            compact
          />
        </div>

        {/* Right: Action buttons */}
        <div style={styles.rightSection}>
          <ControlButton
            label={showStats ? 'Hide Stats' : 'Stats'}
            icon={<StatsIcon />}
            onClick={onToggleStats}
            active={showStats}
          />
          <ControlButton
            label={isFullscreen ? 'Windowed' : 'Fullscreen'}
            icon={isFullscreen ? <WindowedIcon /> : <FullscreenIcon />}
            onClick={onToggleFullscreen}
          />
          <ControlButton
            label="Disconnect"
            icon={<DisconnectIcon />}
            onClick={onDisconnect}
            variant="danger"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Control button sub-component
// ---------------------------------------------------------------------------

interface ControlButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  variant?: 'default' | 'danger';
}

function ControlButton({
  label,
  icon,
  onClick,
  active = false,
  variant = 'default',
}: ControlButtonProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  const bgColor = variant === 'danger'
    ? isHovered ? 'rgba(255, 68, 68, 0.3)' : 'rgba(255, 68, 68, 0.15)'
    : active
    ? 'rgba(118, 185, 0, 0.2)'
    : isHovered
    ? 'rgba(255, 255, 255, 0.15)'
    : 'rgba(255, 255, 255, 0.08)';

  const textColor = variant === 'danger'
    ? colors.semantic.error
    : active
    ? colors.accent.default
    : colors.text.primary;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...styles.controlButton,
        backgroundColor: bgColor,
        color: textColor,
      }}
      title={label}
    >
      <span style={styles.controlIcon}>{icon}</span>
      <span style={styles.controlLabel}>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function StatsIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="8" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.6" />
      <rect x="5.5" y="4" width="3" height="9" rx="0.5" fill="currentColor" opacity="0.8" />
      <rect x="10" y="1" width="3" height="12" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function FullscreenIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 5V1H5M9 1H13V5M13 9V13H9M5 13H1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WindowedIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5 1H1V5M13 5V1H9M9 13H13V9M1 9V13H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DisconnectIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M10 7H14M10 7L12 5M10 7L12 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 1C3.686 1 1 3.686 1 7C1 10.314 3.686 13 7 13C8.657 13 10.157 12.328 11.243 11.243" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 500,
    display: 'flex',
    justifyContent: 'center',
    padding: `${spacing.sm}px ${spacing.lg}px`,
    transition: `opacity 300ms ease, transform 300ms ease`,
    pointerEvents: 'none',
  },
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.lg,
    padding: `${spacing.sm}px ${spacing.md}px`,
    backgroundColor: 'rgba(20, 20, 20, 0.88)',
    backdropFilter: 'blur(12px)',
    borderRadius: radius.lg,
    border: `1px solid rgba(118, 185, 0, 0.15)`,
    boxShadow: `${shadows.lg}, 0 0 30px rgba(0, 0, 0, 0.3)`,
    maxWidth: '100%',
    pointerEvents: 'auto',
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 0,
  },
  hostName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    whiteSpace: 'nowrap',
  },
  statsBadges: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: radius.sm,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
  },
  badgeLabel: {
    fontSize: 10,
    color: colors.text.disabled,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  badgeValue: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    fontFamily: typography.fontMono,
  },
  centerSection: {
    display: 'flex',
    alignItems: 'center',
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  controlButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 10px',
    border: 'none',
    borderRadius: radius.sm,
    cursor: 'pointer',
    transition: `all ${transitions.fast}`,
    outline: 'none',
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    whiteSpace: 'nowrap',
  },
  controlIcon: {
    display: 'flex',
    alignItems: 'center',
  },
  controlLabel: {
    lineHeight: 1,
  },
};
