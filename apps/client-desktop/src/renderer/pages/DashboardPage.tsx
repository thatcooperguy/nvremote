import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors, radius, spacing, typography } from '../styles/theme';
import { Button } from '../components/Button';
import { HostCard } from '../components/HostCard';
import { useHostStore } from '../store/hostStore';
import { useConnectionStore } from '../store/connectionStore';
import { toast } from '../components/Toast';

export function DashboardPage(): React.ReactElement {
  const hosts = useHostStore((s) => s.hosts);
  const fetchHosts = useHostStore((s) => s.fetchHosts);
  const selectHost = useHostStore((s) => s.selectHost);
  const connect = useConnectionStore((s) => s.connect);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [connectingHostId, setConnectingHostId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        await fetchHosts();
      } catch {
        toast.error('Failed to load hosts');
      } finally {
        setIsLoading(false);
      }
    };
    load();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchHosts().catch(() => {
        // Silent refresh failure
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchHosts]);

  const filteredHosts = useMemo(() => {
    return hosts.filter((host) => {
      const matchesSearch =
        searchQuery === '' ||
        host.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        host.hostname.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || host.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [hosts, searchQuery, statusFilter]);

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
        const message = err instanceof Error ? err.message : 'Connection failed';
        toast.error(message);
      } finally {
        setConnectingHostId(null);
      }
    },
    [hosts, selectHost, connect]
  );

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.pageTitle}>Dashboard</h1>
        <div style={styles.filters}>
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
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | 'online' | 'offline')
            }
            style={styles.filterSelect}
          >
            <option value="all">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filteredHosts.length === 0 ? (
        <EmptyState hasHosts={hosts.length > 0} />
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
    </div>
  );
}

function EmptyState({ hasHosts }: { hasHosts: boolean }): React.ReactElement {
  const navigate = useNavigate();
  const hostModeSupported = window.nvrs?.platform?.hostModeSupported ?? false;

  if (hasHosts) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="28" r="12" stroke={colors.text.disabled} strokeWidth="2" />
            <path d="M24 28L32 28" stroke={colors.text.disabled} strokeWidth="2" strokeLinecap="round" />
            <path d="M32 20L32 36" stroke={colors.text.disabled} strokeWidth="2" strokeLinecap="round" />
            <path d="M18 44H46" stroke={colors.text.disabled} strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h3 style={styles.emptyTitle}>No matching hosts</h3>
        <p style={styles.emptyDescription}>
          Try adjusting your search or filter criteria.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <rect
            x="10"
            y="18"
            width="60"
            height="40"
            rx="6"
            stroke={colors.accent.default}
            strokeWidth="2"
            strokeDasharray="4 4"
            opacity="0.5"
          />
          <path d="M36 38L44 42L36 46V38Z" fill={colors.accent.default} opacity="0.6" />
          <path d="M40 58V66" stroke={colors.text.disabled} strokeWidth="2" strokeLinecap="round" />
          <path d="M30 66H50" stroke={colors.text.disabled} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <h3 style={styles.emptyTitle}>Get started with NVRemote</h3>
      <p style={styles.emptyDescription}>
        No hosts are registered to your account yet. Set up a host machine to
        start streaming your GPU desktop remotely.
      </p>

      <div style={styles.setupSteps}>
        <SetupStep
          number={1}
          title={hostModeSupported ? 'Enable Host mode' : 'Set up a host machine'}
          description={
            hostModeSupported
              ? 'Go to Settings and switch to Host or Both mode on this machine.'
              : 'Install NVRemote on a Windows PC with an NVIDIA GPU and enable Host mode.'
          }
        />
        <SetupStep
          number={2}
          title="Register the host"
          description="Generate a bootstrap token from nvremote.com/dashboard and register through the host setup wizard."
        />
        <SetupStep
          number={3}
          title="Connect and stream"
          description="Once registered, the host will appear here. Click Connect to start streaming."
        />
      </div>

      {hostModeSupported && (
        <div style={styles.emptyActions}>
          <Button variant="primary" size="md" onClick={() => navigate('/settings')}>
            Open Settings
          </Button>
        </div>
      )}
    </div>
  );
}

function SetupStep({ number, title, description }: { number: number; title: string; description: string }): React.ReactElement {
  return (
    <div style={styles.setupStep}>
      <div style={styles.stepNumber}>
        <span style={styles.stepNumberText}>{number}</span>
      </div>
      <div style={styles.stepContent}>
        <span style={styles.stepTitle}>{title}</span>
        <span style={styles.stepDescription}>{description}</span>
      </div>
    </div>
  );
}

function SkeletonCard(): React.ReactElement {
  return (
    <div style={styles.skeletonCard}>
      <div style={{ ...styles.skeletonLine, width: '60%', height: 20 }} className="skeleton" />
      <div style={{ ...styles.skeletonLine, width: '40%', height: 14 }} className="skeleton" />
      <div style={{ ...styles.skeletonLine, width: '50%', height: 24, marginTop: 12 }} className="skeleton" />
      <div style={styles.skeletonFooter}>
        <div style={{ ...styles.skeletonLine, width: 60, height: 14 }} className="skeleton" />
        <div style={{ ...styles.skeletonLine, width: 80, height: 32, borderRadius: 6 }} className="skeleton" />
      </div>
    </div>
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    animation: 'fadeIn 300ms ease',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  pageTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
  },
  filters: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'center',
  },
  searchContainer: {
    position: 'relative',
    flex: 1,
    maxWidth: 400,
  },
  searchInput: {
    width: '100%',
    height: 40,
    paddingLeft: 36,
    paddingRight: 12,
    backgroundColor: colors.bg.surface,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    outline: 'none',
    fontFamily: typography.fontFamily,
    transition: 'border-color 150ms ease',
  },
  filterSelect: {
    height: 40,
    padding: '0 12px',
    backgroundColor: colors.bg.surface,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    outline: 'none',
    fontFamily: typography.fontFamily,
    cursor: 'pointer',
    minWidth: 120,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: spacing.md,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${spacing['2xl'] * 2}px 0`,
    gap: spacing.md,
  },
  emptyIcon: {
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  emptyDescription: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    margin: 0,
    textAlign: 'center',
    maxWidth: 460,
    lineHeight: 1.5,
  },
  setupSteps: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    width: '100%',
    maxWidth: 480,
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.bg.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.lg,
  },
  setupStep: {
    display: 'flex',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.accent.muted,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumberText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.accent.default,
  },
  stepContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
  },
  stepTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  stepDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 1.4,
  },
  emptyActions: {
    marginTop: spacing.lg,
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
  skeletonFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTop: `1px solid ${colors.border.default}`,
  },
};
