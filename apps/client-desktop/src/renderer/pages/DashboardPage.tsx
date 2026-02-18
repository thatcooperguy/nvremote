import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors, radius, spacing, typography, transitions, statusColors } from '../styles/theme';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { HostCard } from '../components/HostCard';
import { ErrorState } from '../components/ErrorState';
import { useHostStore } from '../store/hostStore';
import { useConnectionStore } from '../store/connectionStore';
import { useHostAgentStore } from '../store/hostAgentStore';
import { useSessionStore, type Session } from '../store/sessionStore';
import { toast } from '../components/Toast';

export function DashboardPage(): React.ReactElement {
  const navigate = useNavigate();
  const hosts = useHostStore((s) => s.hosts);
  const fetchHosts = useHostStore((s) => s.fetchHosts);
  const selectHost = useHostStore((s) => s.selectHost);
  const connect = useConnectionStore((s) => s.connect);

  const hostStatus = useHostAgentStore((s) => s.status);
  const config = useHostAgentStore((s) => s.config);
  const sessions = useSessionStore((s) => s.sessions);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectingHostId, setConnectingHostId] = useState<string | null>(null);
  const [showHosts, setShowHosts] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      await Promise.all([fetchHosts(), fetchSessions()]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  }, [fetchHosts, fetchSessions]);

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      fetchHosts().catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchHosts, fetchSessions]);

  const handleConnect = useCallback(
    async (hostId: string) => {
      const host = hosts.find((h) => h.id === hostId);
      if (!host) return;
      setConnectingHostId(hostId);
      selectHost(host);
      try {
        await connect(host);
        toast.success(`Connected to ${host.name}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Connection failed');
      } finally {
        setConnectingHostId(null);
      }
    },
    [hosts, selectHost, connect]
  );

  const filteredHosts = useMemo(() => {
    if (!searchQuery) return hosts;
    const q = searchQuery.toLowerCase();
    return hosts.filter(
      (h) => h.name.toLowerCase().includes(q) || h.hostname.toLowerCase().includes(q)
    );
  }, [hosts, searchQuery]);

  const recentSessions = useMemo(() => sessions.slice(0, 5), [sessions]);

  // Readiness checks
  const gpuReady = Boolean(hostStatus.gpuModel);
  const networkReady = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const signalingReady = hostStatus.signalingConnected;
  const hostRunning = hostStatus.state === 'running';

  const modeLabel = config?.mode === 'host'
    ? 'Host'
    : config?.mode === 'both'
      ? 'Host + Client'
      : 'Client';

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>Dashboard</h1>

      {/* Load error */}
      {loadError && (
        <ErrorState
          title="Failed to load dashboard"
          description={loadError}
          causes={['Network connection may be down', 'Server may be unreachable']}
          fixes={['Check your internet connection', 'Try refreshing in a moment']}
          onRetry={loadData}
          compact
        />
      )}

      {/* 2×2 Card Grid */}
      <div style={styles.cardGrid}>
        {/* Card 1: Mode + Readiness */}
        <Card>
          <div style={styles.cardInner}>
            <div style={styles.cardHeader}>
              <ModeIcon />
              <span style={styles.cardTitle}>Mode &amp; Readiness</span>
            </div>
            <div style={styles.modeRow}>
              <span style={styles.modeBadge}>{modeLabel}</span>
            </div>
            <div style={styles.readinessList}>
              <ReadinessItem label="GPU" ready={gpuReady} detail={hostStatus.gpuModel || 'Not detected'} />
              <ReadinessItem label="Network" ready={networkReady} detail={networkReady ? 'Online' : 'Offline'} />
              <ReadinessItem label="Signaling" ready={signalingReady} detail={signalingReady ? 'Connected' : 'Disconnected'} />
              <ReadinessItem label="Host Agent" ready={hostRunning} detail={hostStatus.state} />
            </div>
          </div>
        </Card>

        {/* Card 2: Quick Actions */}
        <Card>
          <div style={styles.cardInner}>
            <div style={styles.cardHeader}>
              <QuickActionsIcon />
              <span style={styles.cardTitle}>Quick Actions</span>
            </div>
            <div style={styles.quickGrid}>
              <QuickTile
                label="Start Hosting"
                icon={<HostTileIcon />}
                onClick={() => navigate('/host')}
              />
              <QuickTile
                label="Connect"
                icon={<ConnectTileIcon />}
                onClick={() => navigate('/client')}
              />
              <QuickTile
                label="Diagnostics"
                icon={<DiagTileIcon />}
                onClick={() => navigate('/diagnostics')}
              />
              <QuickTile
                label="Devices"
                icon={<DevicesTileIcon />}
                onClick={() => navigate('/devices')}
              />
            </div>
          </div>
        </Card>

        {/* Card 3: Recent Sessions */}
        <Card>
          <div style={styles.cardInner}>
            <div style={styles.cardHeader}>
              <SessionsCardIcon />
              <span style={styles.cardTitle}>Recent Sessions</span>
              <button
                style={styles.viewAllLink}
                onClick={() => navigate('/sessions')}
              >
                View All
              </button>
            </div>
            {recentSessions.length === 0 ? (
              <div style={styles.sessionEmpty}>
                <span style={styles.sessionEmptyText}>No sessions yet</span>
              </div>
            ) : (
              <div style={styles.sessionList}>
                {recentSessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Card 4: App Info */}
        <Card>
          <div style={styles.cardInner}>
            <div style={styles.cardHeader}>
              <InfoCardIcon />
              <span style={styles.cardTitle}>App Info</span>
            </div>
            <div style={styles.infoList}>
              <InfoRow label="Version" value="v0.5.1-beta" />
              <InfoRow label="Platform" value={
                navigator.platform.includes('Win') ? 'Windows' :
                navigator.platform.includes('Mac') ? 'macOS' : 'Linux'
              } />
              <InfoRow label="Hosts" value={`${hosts.length} paired`} />
              <InfoRow label="Sessions" value={`${sessions.length} total`} />
            </div>
          </div>
        </Card>
      </div>

      {/* Collapsible Host Grid */}
      <div style={styles.hostSection}>
        <button
          onClick={() => setShowHosts(!showHosts)}
          style={styles.hostSectionHeader}
        >
          <h2 style={styles.hostSectionTitle}>Your Hosts</h2>
          <span style={styles.hostCount}>{hosts.length}</span>
          <ChevronIcon expanded={showHosts} />
        </button>

        {showHosts && (
          <>
            {hosts.length > 3 && (
              <div style={styles.searchContainer}>
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Search hosts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={styles.searchInput}
                />
              </div>
            )}

            {isLoading ? (
              <div style={styles.grid}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : filteredHosts.length === 0 ? (
              <div style={styles.emptyHosts}>
                <span style={styles.emptyHostsText}>
                  {hosts.length === 0
                    ? 'No hosts yet — go to Client to pair one'
                    : 'No matching hosts'}
                </span>
              </div>
            ) : (
              <div style={styles.grid}>
                {filteredHosts.map((host) => (
                  <HostCard
                    key={host.id}
                    host={host}
                    onConnect={handleConnect}
                    connecting={connectingHostId === host.id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function ReadinessItem({ label, ready, detail }: { label: string; ready: boolean; detail: string }): React.ReactElement {
  return (
    <div style={styles.readinessItem}>
      <span
        style={{
          ...styles.readinessDot,
          backgroundColor: ready ? statusColors.connected : statusColors.disconnected,
        }}
      />
      <span style={styles.readinessLabel}>{label}</span>
      <span style={styles.readinessDetail}>{detail}</span>
    </div>
  );
}

function QuickTile({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.quickTile,
        ...(hovered ? styles.quickTileHover : {}),
      }}
    >
      <span style={styles.quickTileIcon}>{icon}</span>
      <span style={styles.quickTileLabel}>{label}</span>
    </button>
  );
}

function SessionRow({ session }: { session: Session }): React.ReactElement {
  const durationMin = Math.round(session.durationMs / 60000);
  const dateStr = new Date(session.startedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div style={styles.sessionRow}>
      <span style={styles.sessionHost}>{session.hostName}</span>
      <span style={styles.sessionDate}>{dateStr}</span>
      <span style={styles.sessionDuration}>{durationMin > 0 ? `${durationMin}m` : '<1m'}</span>
      <span style={{
        ...styles.sessionStatus,
        color: session.status === 'completed' ? statusColors.connected :
               session.status === 'active' ? statusColors.hosting :
               session.status === 'failed' ? statusColors.error : colors.text.disabled,
      }}>
        {session.status}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoValue}>{value}</span>
    </div>
  );
}

function SkeletonCard(): React.ReactElement {
  return (
    <div style={styles.skeletonCard}>
      <div style={{ ...styles.skeletonLine, width: '60%', height: 20 }} className="skeleton" />
      <div style={{ ...styles.skeletonLine, width: '40%', height: 14 }} className="skeleton" />
      <div style={{ ...styles.skeletonLine, width: '50%', height: 24, marginTop: 12 }} className="skeleton" />
    </div>
  );
}

/* ---------- Icons ---------- */

function ModeIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke={colors.accent.default} strokeWidth="1.5" />
      <path d="M8 4v4l3 2" stroke={colors.accent.default} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function QuickActionsIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1v6M8 9v6M1 8h6M9 8h6" stroke={colors.accent.default} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SessionsCardIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="2" stroke={colors.accent.default} strokeWidth="1.5" />
      <path d="M5 7h6M5 9.5h4" stroke={colors.accent.default} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function InfoCardIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke={colors.accent.default} strokeWidth="1.5" />
      <path d="M8 7v4" stroke={colors.accent.default} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.75" fill={colors.accent.default} />
    </svg>
  );
}

function HostTileIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="9" r="1.5" fill="currentColor" />
      <line x1="10" y1="14" x2="10" y2="17" stroke="currentColor" strokeWidth="1.4" />
      <line x1="7" y1="17" x2="13" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ConnectTileIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M6 10h8M14 10l-3-3M14 10l-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function DiagTileIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DevicesTileIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="8" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{
        transform: expanded ? 'rotate(180deg)' : 'none',
        transition: `transform ${transitions.fast}`,
        marginLeft: 'auto',
      }}
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
    >
      <circle cx="7" cy="7" r="5.5" stroke={colors.text.disabled} strokeWidth="1.5" />
      <path d="M11 11L14 14" stroke={colors.text.disabled} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Styles ---------- */

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
  // 2×2 card grid
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: spacing.md,
  },
  cardInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  // Mode + Readiness
  modeRow: {
    display: 'flex',
    alignItems: 'center',
  },
  modeBadge: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.accent.default,
    backgroundColor: colors.accent.muted,
    padding: '3px 10px',
    borderRadius: radius.full,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  readinessList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  readinessItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  readinessDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  readinessLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
    width: 80,
  },
  readinessDetail: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
    fontFamily: typography.fontMono,
  },
  // Quick actions
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: spacing.sm,
  },
  quickTile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.md}px ${spacing.sm}px`,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    backgroundColor: 'transparent',
    color: colors.text.secondary,
    cursor: 'pointer',
    transition: `all ${transitions.fast}`,
    outline: 'none',
    fontFamily: typography.fontFamily,
  },
  quickTileHover: {
    borderColor: colors.accent.default,
    color: colors.accent.default,
    backgroundColor: colors.accent.muted,
  },
  quickTileIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTileLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  // Recent sessions
  viewAllLink: {
    marginLeft: 'auto',
    fontSize: typography.fontSize.xs,
    color: colors.accent.default,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: typography.fontFamily,
    fontWeight: typography.fontWeight.medium,
    outline: 'none',
  },
  sessionList: {
    display: 'flex',
    flexDirection: 'column',
  },
  sessionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: '4px 0',
    borderBottom: `1px solid ${colors.border.default}`,
  },
  sessionHost: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    flex: 2,
  },
  sessionDate: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    flex: 1,
  },
  sessionDuration: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    fontFamily: typography.fontMono,
    width: 40,
    textAlign: 'right',
  },
  sessionStatus: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    width: 70,
    textAlign: 'right',
    textTransform: 'capitalize' as const,
  },
  sessionEmpty: {
    display: 'flex',
    justifyContent: 'center',
    padding: `${spacing.md}px`,
  },
  sessionEmptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
  },
  // App info
  infoList: {
    display: 'flex',
    flexDirection: 'column',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 0',
  },
  infoLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  infoValue: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontMono,
  },
  // Collapsible host section
  hostSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  hostSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    padding: 0,
    outline: 'none',
    color: colors.text.secondary,
  },
  hostSectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  hostCount: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.disabled,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: '1px 8px',
    borderRadius: radius.full,
  },
  searchContainer: {
    position: 'relative',
    maxWidth: 400,
  },
  searchInput: {
    width: '100%',
    height: 36,
    paddingLeft: 36,
    paddingRight: 12,
    backgroundColor: colors.bg.surface,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    outline: 'none',
    fontFamily: typography.fontFamily,
    transition: `border-color ${transitions.fast}`,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: spacing.md,
  },
  emptyHosts: {
    display: 'flex',
    justifyContent: 'center',
    padding: `${spacing.xl}px`,
  },
  emptyHostsText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
  },
  skeletonCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: spacing.lg,
    backgroundColor: colors.bg.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.lg,
  },
  skeletonLine: {
    borderRadius: radius.sm,
  },
};
