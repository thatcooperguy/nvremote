'use client';

import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/lib/auth';
import {
  Server,
  RefreshCw,
  AlertCircle,
  Cpu,
  Clock,
  Activity,
  Wifi,
  WifiOff,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminHost {
  id: string;
  orgId: string;
  orgName: string | null;
  name: string;
  hostname: string;
  status: string;
  publicIp: string | null;
  gpuInfo: string | null;
  hostVersion: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  activeSessions: number;
  totalSessions: number;
}

const hostStatusColors: Record<string, { bg: string; text: string; dot: string }> = {
  ONLINE: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  OFFLINE: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  BUSY: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  MAINTENANCE: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
};

const statusFilterOptions = ['', 'ONLINE', 'OFFLINE', 'BUSY'];

export default function AdminHostsPage() {
  const [hosts, setHosts] = useState<AdminHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchHosts = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);

      const res = await authFetch(`/api/v1/admin/hosts?${params}`);
      if (!res.ok) {
        if (res.status === 403) {
          setError('Access denied. Admin privileges required.');
          return;
        }
        throw new Error(`Failed to load hosts (${res.status})`);
      }
      const data = await res.json();
      setHosts(Array.isArray(data) ? data : data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hosts');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchHosts();
  }, [fetchHosts]);

  function timeAgo(iso: string | null): string {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
            <Server size={20} className="text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Host Management</h1>
            <p className="text-gray-500 text-sm">
              {hosts.length} registered host{hosts.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchHosts(); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <Filter size={16} className="text-gray-400" />
        <div className="flex items-center gap-2">
          {statusFilterOptions.map((s) => (
            <button
              key={s || 'all'}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                statusFilter === s
                  ? 'bg-nv-green/10 text-nv-green-700 border-nv-green/30'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              )}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Host Cards Grid */}
      {loading && hosts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Loading hosts...</div>
      ) : hosts.length === 0 ? (
        <div className="text-center py-12">
          <Server size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No hosts found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hosts.map((host) => {
            const statusStyle = hostStatusColors[host.status] || hostStatusColors.OFFLINE;
            return (
              <div
                key={host.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      statusStyle.bg
                    )}>
                      {host.status === 'ONLINE' ? (
                        <Wifi size={18} className={statusStyle.text} />
                      ) : (
                        <WifiOff size={18} className={statusStyle.text} />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{host.name}</h3>
                      <p className="text-[11px] text-gray-400">{host.hostname}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={cn('w-2 h-2 rounded-full', statusStyle.dot)} />
                    <span className={cn('text-[11px] font-medium', statusStyle.text)}>
                      {host.status}
                    </span>
                  </div>
                </div>

                {/* Info rows */}
                <div className="space-y-2.5 mb-4">
                  {host.gpuInfo && (
                    <div className="flex items-center gap-2">
                      <Cpu size={13} className="text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-600 truncate">{host.gpuInfo}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock size={13} className="text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-500">
                      Last seen: {timeAgo(host.lastSeenAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity size={13} className="text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-500">
                      {host.activeSessions} active / {host.totalSessions} total sessions
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-[10px] text-gray-400">
                    {host.orgName || 'No org'}
                  </span>
                  {host.hostVersion && (
                    <span className="text-[10px] text-gray-400 font-mono">
                      v{host.hostVersion}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
