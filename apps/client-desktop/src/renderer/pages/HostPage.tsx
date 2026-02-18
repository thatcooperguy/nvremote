/**
 * HostPage.tsx — Host Dashboard
 *
 * Shows host agent status, GPU info, active session details, and quick actions.
 * Only available on Windows when mode is 'host' or 'both'.
 */

import React, { useCallback, useState } from 'react';
import { colors, spacing, typography, radius, transitions } from '../styles/theme';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useHostAgentStore } from '../store/hostAgentStore';
import { toast } from '../components/Toast';
import { HostSetupWizard } from '../components/HostSetupWizard';

export function HostPage(): React.ReactElement {
  const status = useHostAgentStore((s) => s.status);
  const stats = useHostAgentStore((s) => s.streamerStats);
  const isRegistered = useHostAgentStore((s) => s.isRegistered);
  const isStarting = useHostAgentStore((s) => s.isStarting);
  const startAgent = useHostAgentStore((s) => s.startAgent);
  const stopAgent = useHostAgentStore((s) => s.stopAgent);
  const forceIDR = useHostAgentStore((s) => s.forceIDR);

  const [showSetup, setShowSetup] = useState(false);
  const [gamingMode, setGamingMode] = useState('balanced');

  const handleStart = useCallback(async () => {
    try {
      await startAgent();
      toast.success('Host agent started');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [startAgent]);

  const handleStop = useCallback(async () => {
    try {
      await stopAgent();
      toast.info('Host agent stopped');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [stopAgent]);

  const handleForceIDR = useCallback(async () => {
    try {
      await forceIDR();
      toast.success('Keyframe sent');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [forceIDR]);

  const handleGamingModeChange = useCallback(
    async (mode: string) => {
      setGamingMode(mode);
      try {
        await window.nvrs.host.setConfig({ gamingMode: mode });
      } catch {
        toast.error('Failed to change gaming mode');
      }
    },
    []
  );

  if (!isRegistered && !showSetup) {
    return (
      <div style={styles.page}>
        <h1 style={styles.pageTitle}>Host Mode</h1>
        <Card>
          <div style={styles.emptyState}>
            <HostIcon />
            <h2 style={styles.emptyTitle}>Set Up Host</h2>
            <p style={styles.emptyText}>
              Register this machine as a streaming host to share your GPU with remote clients.
            </p>
            <Button onClick={() => setShowSetup(true)}>Get Started</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (showSetup) {
    return (
      <div style={styles.page}>
        <h1 style={styles.pageTitle}>Host Setup</h1>
        <HostSetupWizard onComplete={() => setShowSetup(false)} onCancel={() => setShowSetup(false)} />
      </div>
    );
  }

  const stateColor =
    status.state === 'running'
      ? colors.semantic.success
      : status.state === 'error'
      ? colors.semantic.error
      : colors.text.secondary;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>Host Dashboard</h1>
        <div style={styles.headerActions}>
          {status.state === 'running' ? (
            <Button variant="secondary" size="sm" onClick={handleStop}>
              Stop Agent
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleStart}
              disabled={isStarting || status.state === 'starting'}
            >
              {isStarting ? 'Starting...' : 'Start Agent'}
            </Button>
          )}
        </div>
      </div>

      {/* Status Card */}
      <Card>
        <div style={styles.statusRow}>
          <div style={styles.statusIndicator}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: stateColor,
              }}
            />
            <span style={{ ...styles.statusText, color: stateColor }}>
              {status.state.charAt(0).toUpperCase() + status.state.slice(1)}
            </span>
          </div>
          <div style={styles.statusDetails}>
            <StatusItem label="Host ID" value={status.hostId || '—'} />
            <StatusItem label="GPU" value={status.gpuModel || 'Not detected'} />
            <StatusItem label="Codecs" value={status.codecs.join(', ') || '—'} />
            <StatusItem
              label="Signaling"
              value={status.signalingConnected ? 'Connected' : 'Disconnected'}
            />
          </div>
        </div>
        {status.error && (
          <div style={styles.errorBanner}>
            <span style={styles.errorText}>{status.error}</span>
          </div>
        )}
      </Card>

      {/* Active Session Card */}
      {status.activeSession && (
        <Card>
          <h3 style={styles.cardTitle}>Active Session</h3>
          <div style={styles.sessionGrid}>
            <StatusItem label="Session" value={status.activeSession.sessionId.slice(0, 8)} />
            <StatusItem label="Viewer" value={status.activeSession.userId.slice(0, 8)} />
            <StatusItem label="Codec" value={status.activeSession.codec.toUpperCase()} />
            <StatusItem label="Connection" value={status.activeSession.connectionType} />
          </div>

          {stats && (
            <>
              <div style={styles.divider} />
              <h4 style={styles.cardSubtitle}>Live Stats</h4>
              <div style={styles.sessionGrid}>
                <StatusItem label="Bitrate" value={`${stats.bitrateKbps} kbps`} />
                <StatusItem label="FPS" value={`${stats.fps}`} />
                <StatusItem label="Resolution" value={`${stats.width}x${stats.height}`} />
                <StatusItem label="RTT" value={`${stats.rttMs.toFixed(1)} ms`} />
                <StatusItem label="Packet Loss" value={`${stats.packetLossPercent.toFixed(2)}%`} />
                <StatusItem label="Jitter" value={`${stats.jitterMs.toFixed(1)} ms`} />
              </div>
            </>
          )}

          {/* Quick Actions */}
          <div style={styles.divider} />
          <div style={styles.quickActions}>
            <Button variant="secondary" size="sm" onClick={handleForceIDR}>
              Force Keyframe
            </Button>
            <select
              value={gamingMode}
              onChange={(e) => handleGamingModeChange(e.target.value)}
              style={styles.modeSelect}
            >
              <option value="competitive">Competitive</option>
              <option value="balanced">Balanced</option>
              <option value="cinematic">Cinematic</option>
            </select>
          </div>
        </Card>
      )}

      {!status.activeSession && status.state === 'running' && (
        <Card>
          <div style={styles.waitingState}>
            <div style={styles.waitingDot} />
            <span style={styles.waitingText}>Waiting for a client to connect...</span>
            <span style={styles.waitingSubtext}>
              Share your Host ID or connect via nvremote.com/dashboard
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusItem({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={styles.statusItem}>
      <span style={styles.statusLabel}>{label}</span>
      <span style={styles.statusValue}>{value}</span>
    </div>
  );
}

function HostIcon(): React.ReactElement {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 8 }}>
      <rect x="6" y="8" width="36" height="24" rx="3" stroke={colors.text.secondary} strokeWidth="2" />
      <line x1="24" y1="32" x2="24" y2="40" stroke={colors.text.secondary} strokeWidth="2" />
      <line x1="16" y1="40" x2="32" y2="40" stroke={colors.text.secondary} strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="20" r="4" stroke={colors.accent.default} strokeWidth="2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    maxWidth: 700,
    animation: 'fadeIn 300ms ease',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: {
    display: 'flex',
    gap: spacing.sm,
  },
  pageTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
  },
  statusRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  statusDetails: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.sm,
  },
  statusItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  statusLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statusValue: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontMono,
  },
  errorBanner: {
    marginTop: spacing.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    backgroundColor: `${colors.semantic.error}15`,
    borderRadius: radius.md,
    border: `1px solid ${colors.semantic.error}4D`,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.semantic.error,
  },
  cardTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: `0 0 ${spacing.md}px`,
  },
  cardSubtitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
    margin: `0 0 ${spacing.sm}px`,
  },
  sessionGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.default,
    margin: `${spacing.md}px 0`,
  },
  quickActions: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modeSelect: {
    height: 32,
    padding: `0 ${spacing.sm + 4}px`,
    backgroundColor: colors.bg.elevated,
    color: colors.text.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily,
    outline: 'none',
    cursor: 'pointer',
    transition: `border-color ${transitions.fast}`,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: `${spacing.xl}px 0`,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  emptyText: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    textAlign: 'center',
    maxWidth: 400,
    margin: `0 0 ${spacing.md}px`,
  },
  waitingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: `${spacing.lg}px 0`,
    gap: spacing.sm,
  },
  waitingDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    backgroundColor: colors.accent.default,
    animation: 'pulse 2s ease-in-out infinite',
    marginBottom: spacing.xs,
  },
  waitingText: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
  },
  waitingSubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
};
