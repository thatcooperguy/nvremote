import React, { useState, useCallback } from 'react';
import { colors, radius, spacing, typography, zIndex, shadows } from '../styles/theme';
import { Button } from './Button';
import { useConnectionStore } from '../store/connectionStore';
import { useHostStore } from '../store/hostStore';
import { useStreamStats } from '../hooks/useStreamStats';

export function ConnectionOverlay(): React.ReactElement {
  const [isMinimized, setIsMinimized] = useState(false);
  const stats = useStreamStats();
  const disconnect = useConnectionStore((s) => s.disconnect);
  const selectedHost = useHostStore((s) => s.selectedHost);
  const connectionType = useConnectionStore((s) => s.connectionType);
  const codec = useConnectionStore((s) => s.codec);
  const gamingMode = useConnectionStore((s) => s.gamingMode);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
  }, [disconnect]);

  const handleMinimizeToTray = useCallback(() => {
    setIsMinimized(true);
    window.nvrs.tray.updateDisconnect(true);
    window.nvrs.window.minimize();
  }, []);

  if (isMinimized) return <></>;

  const latencyMs = stats?.rtt ?? 0;
  const bitrateMbps = stats ? stats.bitrate / 1000 : 0;
  const fps = stats?.fps ?? 0;

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        {/* Connection Indicator */}
        <div style={styles.statusBar}>
          <div style={styles.connectedDot} />
          <span style={styles.connectedLabel}>Streaming</span>
        </div>

        {/* Host Info */}
        <h2 style={styles.hostname}>
          {selectedHost?.name || 'Remote Host'}
        </h2>
        <span style={styles.hostAddress}>
          {selectedHost?.hostname || 'unknown'}
        </span>

        {/* Stats Grid */}
        <div style={styles.statsGrid}>
          <StatCard label="Latency" value={`${latencyMs}ms`} status={getLatencyStatus(latencyMs)} />
          <StatCard label="Bitrate" value={`${bitrateMbps.toFixed(1)} Mbps`} status="good" />
          <StatCard label="FPS" value={`${fps}`} status={fps >= 55 ? 'good' : 'warning'} />
          <StatCard
            label="Connection"
            value={connectionType === 'p2p' ? 'P2P' : connectionType === 'relay' ? 'Relay' : 'N/A'}
            status={connectionType === 'p2p' ? 'good' : connectionType === 'relay' ? 'warning' : 'neutral'}
          />
          <StatCard
            label="Codec"
            value={stats?.codec || codec || 'N/A'}
            status="neutral"
          />
          <StatCard
            label="Mode"
            value={gamingMode.charAt(0).toUpperCase() + gamingMode.slice(1)}
            status="neutral"
          />
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <Button variant="ghost" size="md" onClick={handleMinimizeToTray}>
            Minimize to Tray
          </Button>
          <Button variant="danger" size="md" onClick={handleDisconnect}>
            Disconnect
          </Button>
        </div>
      </div>
    </div>
  );
}

type StatStatus = 'good' | 'warning' | 'bad' | 'neutral';

interface StatCardProps {
  label: string;
  value: string;
  status: StatStatus;
}

function StatCard({ label, value, status }: StatCardProps): React.ReactElement {
  const statusColor =
    status === 'good'
      ? colors.semantic.success
      : status === 'warning'
      ? colors.semantic.warning
      : status === 'bad'
      ? colors.semantic.error
      : colors.text.secondary;

  const borderHighlight = status === 'warning' || status === 'bad'
    ? { borderColor: `${statusColor}40` }
    : {};

  return (
    <div style={{ ...styles.statCard, ...borderHighlight }}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.statValue, color: statusColor }}>{value}</span>
    </div>
  );
}

function getLatencyStatus(ms: number): StatStatus {
  if (ms < 20) return 'good';
  if (ms < 50) return 'warning';
  return 'bad';
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: zIndex.overlay,
    backdropFilter: 'blur(8px)',
    animation: 'fadeIn 300ms ease',
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing['2xl'],
    backgroundColor: colors.bg.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.xl,
    boxShadow: shadows.lg,
    minWidth: 420,
    maxWidth: 520,
    animation: 'scaleIn 300ms ease',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  connectedDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: colors.semantic.success,
    boxShadow: `0 0 8px ${colors.semantic.success}`,
    animation: 'pulse 2s ease-in-out infinite',
  },
  connectedLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.semantic.success,
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  hostname: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
    textAlign: 'center',
  },
  hostAddress: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontFamily: typography.fontMono,
    marginTop: -spacing.sm,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: spacing.sm,
    width: '100%',
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: spacing.md,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    border: `1px solid ${colors.border.default}`,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontMono,
  },
  actions: {
    display: 'flex',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTop: `1px solid ${colors.border.default}`,
    width: '100%',
    justifyContent: 'center',
  },
};
