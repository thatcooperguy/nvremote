import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { colors, radius, spacing, typography, transitions } from '../styles/theme';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState } from '../components/ErrorState';
import { useHostStore } from '../store/hostStore';
import { useConnectionStore } from '../store/connectionStore';
import { useSessionStore } from '../store/sessionStore';
import { toast } from '../components/Toast';

export function HostDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const hosts = useHostStore((s) => s.hosts);
  const selectHost = useHostStore((s) => s.selectHost);
  const connect = useConnectionStore((s) => s.connect);
  const connectionStatus = useConnectionStore((s) => s.status);
  const sessions = useSessionStore((s) => s.sessions);

  const fetchHosts = useHostStore((s) => s.fetchHosts);
  const [connecting, setConnecting] = useState(false);

  const host = hosts.find((h) => h.id === id) ?? null;

  const hostSessions = sessions.filter(
    (s) => s.hostId === id
  ).slice(0, 10);

  const handleConnect = useCallback(async () => {
    if (!host) return;
    setConnecting(true);
    selectHost(host);

    try {
      await connect(host);
      toast.success(`Connected to ${host.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      toast.error(message);
    } finally {
      setConnecting(false);
    }
  }, [host, selectHost, connect]);

  if (!host) {
    return (
      <div style={styles.page}>
        <ErrorState
          title="Host not found"
          description={`No host with ID "${id || 'unknown'}" was found in your paired devices.`}
          causes={[
            'The host may have been removed or unpaired',
            'The link may be outdated or incorrect',
          ]}
          fixes={[
            'Go back to the Dashboard and select a host',
            'Refresh the host list to check for updates',
          ]}
          onRetry={() => { fetchHosts().catch(() => {}); }}
        />
      </div>
    );
  }

  const isOnline = host.status === 'online';

  return (
    <div style={styles.page}>
      {/* Back button */}
      <button
        onClick={() => navigate('/dashboard')}
        style={styles.backButton}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = colors.text.primary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = colors.text.secondary;
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to Dashboard
      </button>

      {/* Header Card */}
      <Card padding={32}>
        <div style={styles.headerRow}>
          <div style={styles.headerInfo}>
            <div style={styles.nameRow}>
              <h1 style={styles.hostName}>{host.name}</h1>
              <StatusBadge status={host.status} size="md" />
            </div>
            <span style={styles.hostname}>{host.hostname}</span>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={handleConnect}
            disabled={!isOnline || connectionStatus === 'connected'}
            loading={connecting}
          >
            {connectionStatus === 'connected' ? 'Connected' : 'Connect'}
          </Button>
        </div>
      </Card>

      {/* Info Grid */}
      <div style={styles.infoGrid}>
        <InfoCard label="GPU" value={host.gpuModel || 'N/A'} icon={<GpuIcon />} />
        <InfoCard label="VRAM" value={host.gpuVram || 'N/A'} icon={<MemoryIcon />} />
        <InfoCard label="Operating System" value={host.os || 'Windows'} icon={<OsIcon />} />
        <InfoCard
          label="Host Version"
          value={host.hostVersion || 'N/A'}
          icon={<VersionIcon />}
        />
        <InfoCard
          label="Latency"
          value={host.latencyMs !== undefined ? `${host.latencyMs}ms` : 'N/A'}
          icon={<LatencyIcon />}
        />
        <InfoCard label="Status" value={host.status} icon={<StatusIcon />} />
      </div>

      {/* Connection History */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Connection History</h2>
        {hostSessions.length === 0 ? (
          <Card>
            <div style={styles.emptySessionState}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.5 }}>
                <rect x="6" y="10" width="36" height="24" rx="4" stroke={colors.text.disabled} strokeWidth="2" />
                <path d="M6 18H42" stroke={colors.text.disabled} strokeWidth="2" />
                <path d="M18 40H30" stroke={colors.text.disabled} strokeWidth="2" strokeLinecap="round" />
                <path d="M24 34V40" stroke={colors.text.disabled} strokeWidth="2" strokeLinecap="round" />
                <path d="M20 26L24 22L28 26" stroke={colors.text.disabled} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={styles.emptySessionContent}>
                <span style={styles.emptySessionTitle}>No sessions yet</span>
                <span style={styles.emptySessionDesc}>
                  Click Connect above to start your first streaming session. Session history and performance metrics will appear here.
                </span>
              </div>
            </div>
          </Card>
        ) : (
          <div style={styles.sessionList}>
            {hostSessions.map((session) => (
              <Card key={session.id} padding={16}>
                <div style={styles.sessionRow}>
                  <div style={styles.sessionInfo}>
                    <span style={styles.sessionDate}>
                      {new Date(session.startedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span style={styles.sessionDuration}>
                      Duration: {formatDuration(session.durationMs)}
                    </span>
                  </div>
                  <span
                    style={{
                      ...styles.sessionStatus,
                      color:
                        session.status === 'completed'
                          ? colors.semantic.success
                          : colors.semantic.error,
                    }}
                  >
                    {session.status}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface InfoCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

function InfoCard({ label, value, icon }: InfoCardProps): React.ReactElement {
  const isNA = value === 'N/A';
  return (
    <div style={styles.infoCard}>
      <div style={styles.infoCardIcon}>{icon}</div>
      <div style={styles.infoCardContent}>
        <span style={styles.infoCardLabel}>{label}</span>
        <span style={{
          ...styles.infoCardValue,
          ...(isNA ? { color: colors.text.disabled, fontStyle: 'italic' } : {}),
        }}>{value}</span>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '--';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function GpuIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="4" width="16" height="12" rx="2" stroke={colors.accent.default} strokeWidth="1.5" />
      <rect x="5" y="7" width="4" height="6" rx="1" fill={colors.accent.default} opacity="0.4" />
      <rect x="11" y="7" width="4" height="6" rx="1" fill={colors.accent.default} opacity="0.4" />
    </svg>
  );
}

function MemoryIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="5" width="14" height="10" rx="2" stroke={colors.accent.default} strokeWidth="1.5" />
      <path d="M6 2V5M10 2V5M14 2V5M6 15V18M10 15V18M14 15V18" stroke={colors.accent.default} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function OsIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="2" width="14" height="12" rx="2" stroke={colors.accent.default} strokeWidth="1.5" />
      <path d="M7 18H13M10 14V18" stroke={colors.accent.default} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function VersionIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke={colors.accent.default} strokeWidth="1.5" />
      <path d="M10 6V10L13 12" stroke={colors.accent.default} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LatencyIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M2 14L6 8L10 11L14 5L18 9" stroke={colors.accent.default} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke={colors.accent.default} strokeWidth="1.5" />
      <path d="M7 10L9 12L13 8" stroke={colors.accent.default} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    animation: 'fadeIn 300ms ease',
    maxWidth: 900,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    color: colors.text.secondary,
  },
  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: `${spacing.xs}px ${spacing.sm}px`,
    marginLeft: -spacing.sm,
    border: 'none',
    background: 'transparent',
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily,
    fontWeight: typography.fontWeight.medium,
    cursor: 'pointer',
    transition: `color ${transitions.fast}`,
    outline: 'none',
    alignSelf: 'flex-start',
    borderRadius: radius.md,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.lg,
  },
  headerInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hostName: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
  },
  hostname: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    fontFamily: typography.fontMono,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: spacing.sm,
  },
  infoCard: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md,
    backgroundColor: colors.bg.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    transition: `border-color ${transitions.fast}`,
  },
  infoCardIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accent.muted,
    flexShrink: 0,
  },
  infoCardContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  infoCardLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  infoCardValue: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  emptyText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
    margin: 0,
    textAlign: 'center',
    padding: spacing.lg,
  },
  emptySessionState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.xl}px ${spacing.lg}px`,
  },
  emptySessionContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    textAlign: 'center',
    maxWidth: 380,
  },
  emptySessionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  emptySessionDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 1.5,
  },
  sessionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  sessionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  sessionDate: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
  },
  sessionDuration: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  sessionStatus: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
};
