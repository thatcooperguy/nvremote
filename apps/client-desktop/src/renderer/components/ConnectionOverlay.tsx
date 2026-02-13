import React, { useState, useEffect, useCallback } from 'react';
import { colors, radius, spacing, typography, zIndex, shadows } from '../styles/theme';
import { Button } from './Button';
import { useConnectionStore } from '../store/connectionStore';
import { useHostStore } from '../store/hostStore';

export function ConnectionOverlay(): React.ReactElement {
  const [isMinimized, setIsMinimized] = useState(false);
  const [stats, setStats] = useState({ latencyMs: 0, bitrateMbps: 0, fps: 0 });
  const disconnect = useConnectionStore((s) => s.disconnect);
  const selectedHost = useHostStore((s) => s.selectedHost);
  const tunnelStatus = useConnectionStore((s) => s.tunnelStatus);

  // Simulate stats updates (in production, these come from Geronimo)
  useEffect(() => {
    const interval = setInterval(() => {
      setStats({
        latencyMs: Math.round(10 + Math.random() * 15),
        bitrateMbps: Math.round((20 + Math.random() * 30) * 10) / 10,
        fps: Math.round(58 + Math.random() * 4),
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
  }, [disconnect]);

  const handleMinimizeToTray = useCallback(() => {
    setIsMinimized(true);
    window.nvrs.tray.updateDisconnect(true);
    window.nvrs.window.minimize();
  }, []);

  if (isMinimized) return <></>;

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        {/* Connection Indicator */}
        <div style={styles.statusBar}>
          <div style={styles.connectedDot} />
          <span style={styles.connectedLabel}>Connected</span>
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
          <StatCard label="Latency" value={`${stats.latencyMs}ms`} status={getLatencyStatus(stats.latencyMs)} />
          <StatCard label="Bitrate" value={`${stats.bitrateMbps} Mbps`} status="good" />
          <StatCard label="FPS" value={`${stats.fps}`} status={stats.fps >= 55 ? 'good' : 'warning'} />
          <StatCard
            label="Tunnel"
            value={tunnelStatus === 'connected' ? 'Active' : 'N/A'}
            status={tunnelStatus === 'connected' ? 'good' : 'neutral'}
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

  return (
    <div style={styles.statCard}>
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
    maxWidth: 500,
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
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    marginTop: -spacing.sm,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
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
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
  },
  actions: {
    display: 'flex',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
};
