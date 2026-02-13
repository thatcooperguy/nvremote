import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { colors, radius, spacing, typography } from '../styles/theme';
import { HostCard, type Host } from '../components/HostCard';
import { useHostStore } from '../store/hostStore';
import { useConnectionStore } from '../store/connectionStore';
import { toast } from '../components/Toast';

export function DashboardPage(): React.ReactElement {
  const hosts = useHostStore((s) => s.hosts);
  const fetchHosts = useHostStore((s) => s.fetchHosts);
  const selectHost = useHostStore((s) => s.selectHost);
  const connect = useConnectionStore((s) => s.connect);
  const connectionStatus = useConnectionStore((s) => s.status);

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
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <rect
            x="8"
            y="16"
            width="48"
            height="32"
            rx="4"
            stroke={colors.text.disabled}
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          <circle cx="32" cy="32" r="8" stroke={colors.text.disabled} strokeWidth="2" />
          <path
            d="M28 32L30 34L36 28"
            stroke={colors.text.disabled}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 style={styles.emptyTitle}>
        {hasHosts ? 'No matching hosts' : 'No hosts registered'}
      </h3>
      <p style={styles.emptyDescription}>
        {hasHosts
          ? 'Try adjusting your search or filter criteria.'
          : 'Ask your admin to set up a host to get started with remote streaming.'}
      </p>
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(340, 1fr))',
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
    opacity: 0.5,
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
    maxWidth: 400,
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
