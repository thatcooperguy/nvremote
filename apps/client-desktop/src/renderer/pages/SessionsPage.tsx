import React, { useEffect, useState } from 'react';
import { colors, radius, spacing, typography } from '../styles/theme';
import { Card } from '../components/Card';
import { useSessionStore, type Session } from '../store/sessionStore';
import { useHostStore } from '../store/hostStore';

type SortField = 'date' | 'duration';
type SortDirection = 'asc' | 'desc';

export function SessionsPage(): React.ReactElement {
  const sessions = useSessionStore((s) => s.sessions);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const hosts = useHostStore((s) => s.hosts);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        await fetchSessions();
      } catch {
        // Silent failure
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [fetchSessions]);

  const getHostName = (hostId: string): string => {
    const host = hosts.find((h) => h.id === hostId);
    return host?.name || 'Unknown Host';
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedSessions = [...sessions].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1;
    if (sortField === 'date') {
      return mul * (new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    }
    return mul * ((a.durationMs || 0) - (b.durationMs || 0));
  });

  const SortIcon = ({ field }: { field: SortField }) => (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      style={{ marginLeft: 4, opacity: sortField === field ? 1 : 0.3 }}
    >
      <path
        d="M5 1L8 4H2L5 1Z"
        fill={sortField === field && sortDir === 'asc' ? colors.accent.default : colors.text.disabled}
      />
      <path
        d="M5 9L2 6H8L5 9Z"
        fill={sortField === field && sortDir === 'desc' ? colors.accent.default : colors.text.disabled}
      />
    </svg>
  );

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>Sessions</h1>
      <p style={styles.pageDescription}>
        Your streaming session history
        {!isLoading && sessions.length > 0 && (
          <span style={{ color: colors.text.disabled }}> ({sessions.length})</span>
        )}
      </p>

      {isLoading ? (
        <div style={styles.sessionList}>
          <div style={styles.tableHeader}>
            <span style={{ ...styles.tableHeaderCell, width: 28 }} />
            <span style={{ ...styles.tableHeaderCell, flex: 2 }}>Host</span>
            <span style={{ ...styles.tableHeaderCell, flex: 2 }}>Date</span>
            <span style={{ ...styles.tableHeaderCell, flex: 1 }}>Duration</span>
            <span style={{ ...styles.tableHeaderCell, flex: 1 }}>Status</span>
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <div style={styles.emptyState}>
            <EmptyIcon />
            <h3 style={styles.emptyTitle}>No sessions yet</h3>
            <p style={styles.emptyDescription}>
              Your streaming sessions will appear here once you connect to a host.
            </p>
            <div style={styles.emptyHints}>
              <HintItem icon={<MonitorIcon />} text="Connect to a host from the Dashboard" />
              <HintItem icon={<ClockIcon />} text="Session history and metrics are saved automatically" />
              <HintItem icon={<ChartIcon />} text="View detailed stats for each session" />
            </div>
          </div>
        </Card>
      ) : (
        <div style={styles.sessionList}>
          {/* Table Header */}
          <div style={styles.tableHeader}>
            <span style={{ ...styles.tableHeaderCell, width: 28 }} />
            <span style={{ ...styles.tableHeaderCell, flex: 2 }}>Host</span>
            <button
              style={{ ...styles.tableHeaderCell, flex: 2, ...styles.sortableHeader }}
              onClick={() => handleSort('date')}
            >
              Date <SortIcon field="date" />
            </button>
            <button
              style={{ ...styles.tableHeaderCell, flex: 1, ...styles.sortableHeader }}
              onClick={() => handleSort('duration')}
            >
              Duration <SortIcon field="duration" />
            </button>
            <span style={{ ...styles.tableHeaderCell, flex: 1 }}>Status</span>
          </div>

          {/* Session Rows */}
          {sortedSessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              hostName={getHostName(session.hostId)}
              expanded={expandedId === session.id}
              onToggle={() =>
                setExpandedId(expandedId === session.id ? null : session.id)
              }
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
  expanded: boolean;
  onToggle: () => void;
}

function SessionRow({ session, hostName, expanded, onToggle }: SessionRowProps): React.ReactElement {
  const statusColor =
    session.status === 'active'
      ? colors.semantic.success
      : session.status === 'completed'
      ? colors.text.secondary
      : colors.semantic.error;

  return (
    <div>
      <div
        style={{
          ...styles.sessionRow,
          backgroundColor: expanded ? colors.bg.surface : colors.bg.card,
          cursor: 'pointer',
        }}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {/* Expand chevron */}
        <div style={{ width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{
              transition: 'transform 200ms ease',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            <path
              d="M5 3L9 7L5 11"
              stroke={expanded ? colors.accent.default : colors.text.disabled}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
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

      {/* Expandable detail panel */}
      {expanded && (
        <div style={styles.detailPanel}>
          <div style={styles.detailGrid}>
            <DetailItem label="Session ID" value={session.id.slice(0, 12) + '...'} mono />
            <DetailItem label="Host" value={hostName} />
            <DetailItem
              label="Started"
              value={new Date(session.startedAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            />
            <DetailItem label="Duration" value={formatDuration(session.durationMs)} />
            <DetailItem
              label="Connection Type"
              value={session.connectionType === 'direct' ? 'P2P Direct' : 'WireGuard VPN'}
            />
            {session.metrics && (
              <>
                <DetailItem
                  label="Avg Bitrate"
                  value={`${session.metrics.avgBitrateMbps.toFixed(1)} Mbps`}
                  mono
                />
                <DetailItem
                  label="Avg FPS"
                  value={`${session.metrics.avgFps}`}
                  mono
                />
                <DetailItem
                  label="Avg Latency"
                  value={`${session.metrics.avgLatencyMs} ms`}
                  mono
                  highlight={session.metrics.avgLatencyMs > 40 ? 'warning' : 'good'}
                />
                <DetailItem
                  label="Packet Loss"
                  value={`${session.metrics.packetLossPercent.toFixed(2)}%`}
                  mono
                  highlight={session.metrics.packetLossPercent > 1 ? 'warning' : 'good'}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface DetailItemProps {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: 'good' | 'warning' | 'bad';
}

function DetailItem({ label, value, mono, highlight }: DetailItemProps): React.ReactElement {
  const valueColor = highlight === 'good'
    ? colors.semantic.success
    : highlight === 'warning'
    ? colors.semantic.warning
    : highlight === 'bad'
    ? colors.semantic.error
    : colors.text.primary;

  return (
    <div style={styles.detailItem}>
      <span style={styles.detailLabel}>{label}</span>
      <span
        style={{
          ...styles.detailValue,
          fontFamily: mono ? typography.fontMono : typography.fontFamily,
          color: valueColor,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SkeletonRow(): React.ReactElement {
  return (
    <div style={styles.sessionRow}>
      <div style={{ width: 28, flexShrink: 0 }} />
      <div style={{ ...styles.sessionCell, flex: 2 }}>
        <div style={{ ...styles.skeletonLine, width: '70%', height: 16 }} className="skeleton" />
      </div>
      <div style={{ ...styles.sessionCell, flex: 2 }}>
        <div style={{ ...styles.skeletonLine, width: '50%', height: 16 }} className="skeleton" />
        <div style={{ ...styles.skeletonLine, width: '35%', height: 12, marginTop: 4 }} className="skeleton" />
      </div>
      <div style={{ ...styles.sessionCell, flex: 1 }}>
        <div style={{ ...styles.skeletonLine, width: '60%', height: 16 }} className="skeleton" />
      </div>
      <div style={{ ...styles.sessionCell, flex: 1 }}>
        <div style={{ ...styles.skeletonLine, width: 56, height: 22, borderRadius: 12 }} className="skeleton" />
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
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ opacity: 0.5 }}>
      <rect x="6" y="10" width="44" height="32" rx="4" stroke={colors.text.disabled} strokeWidth="2" />
      <path d="M6 18H50" stroke={colors.text.disabled} strokeWidth="2" />
      <circle cx="14" cy="14" r="1.5" fill={colors.text.disabled} />
      <circle cx="20" cy="14" r="1.5" fill={colors.text.disabled} />
      <circle cx="26" cy="14" r="1.5" fill={colors.text.disabled} />
      <path d="M20 46H36" stroke={colors.text.disabled} strokeWidth="2" strokeLinecap="round" />
      <path d="M28 42V46" stroke={colors.text.disabled} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MonitorIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="10" rx="2" stroke={colors.accent.default} strokeWidth="1.5" />
      <path d="M5 14H11M8 12V14" stroke={colors.accent.default} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke={colors.accent.default} strokeWidth="1.5" />
      <path d="M8 4.5V8L10.5 9.5" stroke={colors.accent.default} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="9" width="3" height="5" rx="0.5" fill={colors.accent.default} opacity="0.4" />
      <rect x="6.5" y="5" width="3" height="9" rx="0.5" fill={colors.accent.default} opacity="0.6" />
      <rect x="11" y="2" width="3" height="12" rx="0.5" fill={colors.accent.default} opacity="0.8" />
    </svg>
  );
}

interface HintItemProps {
  icon: React.ReactNode;
  text: string;
}

function HintItem({ icon, text }: HintItemProps): React.ReactElement {
  return (
    <div style={styles.hintItem}>
      <div style={styles.hintIcon}>{icon}</div>
      <span style={styles.hintText}>{text}</span>
    </div>
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
    maxWidth: 400,
  },
  emptyHints: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
    maxWidth: 360,
  },
  hintItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: `${spacing.xs + 2}px ${spacing.md}px`,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
  },
  hintIcon: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  hintText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
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
  sortableHeader: {
    display: 'inline-flex',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    outline: 'none',
    fontFamily: typography.fontFamily,
    transition: 'color 150ms ease',
  },
  sessionRow: {
    display: 'flex',
    alignItems: 'center',
    padding: `${spacing.sm + 4}px ${spacing.md}px`,
    backgroundColor: colors.bg.card,
    borderBottom: `1px solid ${colors.border.default}`,
    transition: 'background-color 150ms ease',
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
    fontFamily: typography.fontMono,
  },
  statusLabel: {
    display: 'inline-block',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'capitalize',
    padding: '3px 8px',
    borderRadius: radius.full,
  },
  // Expandable detail panel
  detailPanel: {
    padding: `${spacing.md}px ${spacing.lg}px`,
    backgroundColor: colors.bg.surface,
    borderBottom: `1px solid ${colors.border.default}`,
    animation: 'slideUp 200ms ease',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: `${spacing.sm}px ${spacing.lg}px`,
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  detailLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  detailValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  // Skeleton
  skeletonLine: {
    borderRadius: radius.sm,
    backgroundColor: colors.bg.surface,
  },
};
