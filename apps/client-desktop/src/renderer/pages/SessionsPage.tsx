import React, { useEffect } from 'react';
import { colors, radius, spacing, typography } from '../styles/theme';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { useSessionStore, type Session } from '../store/sessionStore';
import { useHostStore } from '../store/hostStore';

export function SessionsPage(): React.ReactElement {
  const sessions = useSessionStore((s) => s.sessions);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const hosts = useHostStore((s) => s.hosts);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const getHostName = (hostId: string): string => {
    const host = hosts.find((h) => h.id === hostId);
    return host?.name || 'Unknown Host';
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>Sessions</h1>
      <p style={styles.pageDescription}>
        Your streaming session history
      </p>

      {sessions.length === 0 ? (
        <Card>
          <div style={styles.emptyState}>
            <EmptyIcon />
            <h3 style={styles.emptyTitle}>No sessions yet</h3>
            <p style={styles.emptyDescription}>
              Your streaming sessions will appear here once you connect to a host.
            </p>
          </div>
        </Card>
      ) : (
        <div style={styles.sessionList}>
          {/* Table Header */}
          <div style={styles.tableHeader}>
            <span style={{ ...styles.tableHeaderCell, flex: 2 }}>Host</span>
            <span style={{ ...styles.tableHeaderCell, flex: 2 }}>Date</span>
            <span style={{ ...styles.tableHeaderCell, flex: 1 }}>Duration</span>
            <span style={{ ...styles.tableHeaderCell, flex: 1 }}>Status</span>
          </div>

          {/* Session Rows */}
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              hostName={getHostName(session.hostId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SessionRowProps {
  session: Session;
  hostName: string;
}

function SessionRow({ session, hostName }: SessionRowProps): React.ReactElement {
  const statusColor =
    session.status === 'active'
      ? colors.semantic.success
      : session.status === 'completed'
      ? colors.text.secondary
      : colors.semantic.error;

  return (
    <div style={styles.sessionRow}>
      <div style={{ ...styles.sessionCell, flex: 2 }}>
        <span style={styles.hostName}>{hostName}</span>
      </div>
      <div style={{ ...styles.sessionCell, flex: 2 }}>
        <span style={styles.sessionDate}>
          {new Date(session.startedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
        <span style={styles.sessionTime}>
          {new Date(session.startedAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      <div style={{ ...styles.sessionCell, flex: 1 }}>
        <span style={styles.duration}>{formatDuration(session.durationMs)}</span>
      </div>
      <div style={{ ...styles.sessionCell, flex: 1 }}>
        <span
          style={{
            ...styles.statusLabel,
            color: statusColor,
            backgroundColor: `${statusColor}15`,
          }}
        >
          {session.status}
        </span>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '--';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function EmptyIcon(): React.ReactElement {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.5 }}>
      <rect x="6" y="10" width="36" height="28" rx="4" stroke={colors.text.disabled} strokeWidth="2" />
      <path d="M6 18H42" stroke={colors.text.disabled} strokeWidth="2" />
      <circle cx="12" cy="14" r="1.5" fill={colors.text.disabled} />
      <circle cx="18" cy="14" r="1.5" fill={colors.text.disabled} />
      <circle cx="24" cy="14" r="1.5" fill={colors.text.disabled} />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    animation: 'fadeIn 300ms ease',
  },
  pageTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
  },
  pageDescription: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    margin: 0,
    marginTop: -spacing.sm,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing['2xl']}px`,
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  emptyDescription: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    margin: 0,
    textAlign: 'center',
  },
  sessionList: {
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: `${spacing.sm + 4}px ${spacing.md}px`,
    backgroundColor: colors.bg.surface,
    borderBottom: `1px solid ${colors.border.default}`,
  },
  tableHeaderCell: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.disabled,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  sessionRow: {
    display: 'flex',
    alignItems: 'center',
    padding: `${spacing.sm + 4}px ${spacing.md}px`,
    backgroundColor: colors.bg.card,
    borderBottom: `1px solid ${colors.border.default}`,
    transition: 'background-color 150ms ease',
    cursor: 'default',
  },
  sessionCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  hostName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  sessionDate: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
  },
  sessionTime: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  duration: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
  },
  statusLabel: {
    display: 'inline-block',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'capitalize',
    padding: '3px 8px',
    borderRadius: radius.full,
  },
};
