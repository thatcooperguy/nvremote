import { useEffect, useCallback, useMemo } from 'react';
import { useHostStore } from '../store/hostStore';
import { useAuthStore } from '../store/authStore';
import type { Host } from '../components/HostCard';
import type { HostStatus } from '../components/StatusBadge';

interface UseHostsOptions {
  /** Auto-fetch on mount (default: true) */
  autoFetch?: boolean;
  /** Auto-refresh interval in ms (default: 30000; set to 0 to disable) */
  refreshInterval?: number;
  /** Filter by status */
  statusFilter?: HostStatus | 'all';
  /** Search query */
  searchQuery?: string;
}

interface UseHostsReturn {
  hosts: Host[];
  filteredHosts: Host[];
  selectedHost: Host | null;
  isLoading: boolean;
  error: string | null;
  fetchHosts: () => Promise<void>;
  selectHost: (host: Host | null) => void;
  onlineCount: number;
  offlineCount: number;
  totalCount: number;
}

/**
 * Hook for managing host data with filtering, auto-refresh,
 * and computed host metrics.
 */
export function useHosts(options: UseHostsOptions = {}): UseHostsReturn {
  const {
    autoFetch = true,
    refreshInterval = 30000,
    statusFilter = 'all',
    searchQuery = '',
  } = options;

  const hosts = useHostStore((s) => s.hosts);
  const selectedHost = useHostStore((s) => s.selectedHost);
  const isLoading = useHostStore((s) => s.isLoading);
  const error = useHostStore((s) => s.error);
  const fetchHosts = useHostStore((s) => s.fetchHosts);
  const selectHost = useHostStore((s) => s.selectHost);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch && isAuthenticated) {
      fetchHosts().catch(() => {
        // Error is stored in the store
      });
    }
  }, [autoFetch, isAuthenticated, fetchHosts]);

  // Auto-refresh interval
  useEffect(() => {
    if (!isAuthenticated || refreshInterval <= 0) return;

    const timer = setInterval(() => {
      fetchHosts().catch(() => {
        // Silent refresh failure
      });
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [isAuthenticated, refreshInterval, fetchHosts]);

  // Filtered hosts
  const filteredHosts = useMemo(() => {
    return hosts.filter((host) => {
      const matchesStatus =
        statusFilter === 'all' || host.status === statusFilter;

      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        query === '' ||
        host.name.toLowerCase().includes(query) ||
        host.hostname.toLowerCase().includes(query) ||
        (host.gpuModel && host.gpuModel.toLowerCase().includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [hosts, statusFilter, searchQuery]);

  // Computed counts
  const onlineCount = useMemo(
    () => hosts.filter((h) => h.status === 'online').length,
    [hosts]
  );

  const offlineCount = useMemo(
    () => hosts.filter((h) => h.status === 'offline').length,
    [hosts]
  );

  return {
    hosts,
    filteredHosts,
    selectedHost,
    isLoading,
    error,
    fetchHosts,
    selectHost,
    onlineCount,
    offlineCount,
    totalCount: hosts.length,
  };
}
