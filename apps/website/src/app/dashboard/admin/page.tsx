'use client';

import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/lib/auth';
import {
  ShieldCheck,
  Activity,
  Server,
  Users,
  Building2,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';

interface PlatformStats {
  activeSessions: number;
  peakSessionsToday: number;
  sessionsLast24h: number;
  sessionsLast7d: number;
  successRate24h: number;
  successRate7d: number;
  hostsOnline: number;
  hostsOffline: number;
  hostsTotal: number;
  totalUsers: number;
  totalOrgs: number;
  p2pSessions: number;
  relaySessions: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch('/api/v1/admin/stats');
      if (!res.ok) {
        if (res.status === 403) {
          setError('Access denied. Admin privileges required.');
          return;
        }
        throw new Error(`Failed to load stats (${res.status})`);
      }
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platform stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cs-green/10 border border-cs-green/20 flex items-center justify-center">
            <ShieldCheck size={20} className="text-cs-green" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Health</h1>
            <p className="text-gray-500 text-sm">Real-time overview of the NVRemote platform.</p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchStats(); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Top-level health status */}
      <div className="mb-6 flex items-center gap-3 rounded-xl bg-white border border-gray-200 px-5 py-4">
        {stats && !loading ? (
          <>
            <div className={`w-3 h-3 rounded-full ${
              stats.hostsOnline > 0 && stats.successRate24h >= 80
                ? 'bg-green-500'
                : stats.hostsTotal > 0
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }`} />
            <span className="text-sm font-medium text-gray-900">
              {stats.hostsOnline > 0 && stats.successRate24h >= 80
                ? 'All systems operational'
                : stats.hostsTotal > 0
                  ? 'Degraded performance'
                  : 'No hosts registered'}
            </span>
          </>
        ) : (
          <>
            <div className="w-3 h-3 rounded-full bg-gray-300 animate-pulse" />
            <span className="text-sm text-gray-400">Loading status...</span>
          </>
        )}
      </div>

      {/* Stats Grid — Row 1: Sessions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          icon={<Activity size={20} />}
          label="Active Sessions"
          value={loading ? '...' : `${stats?.activeSessions ?? 0}`}
          detail={loading ? 'Loading...' : `Peak today: ${stats?.peakSessionsToday ?? 0}`}
          color="green"
        />
        <StatCard
          icon={<TrendingUp size={20} />}
          label="Sessions (24h)"
          value={loading ? '...' : `${stats?.sessionsLast24h ?? 0}`}
          detail={loading ? 'Loading...' : `${stats?.sessionsLast7d ?? 0} in last 7 days`}
          color="blue"
        />
        <StatCard
          icon={<CheckCircle2 size={20} />}
          label="Success Rate (24h)"
          value={loading ? '...' : `${stats?.successRate24h ?? 0}%`}
          detail={loading ? 'Loading...' : `${stats?.successRate7d ?? 0}% over 7 days`}
          color="emerald"
        />
        <StatCard
          icon={<Wifi size={20} />}
          label="P2P vs Relay"
          value={loading ? '...' : `${stats?.p2pSessions ?? 0} / ${stats?.relaySessions ?? 0}`}
          detail={loading ? 'Loading...' : 'P2P direct / TURN relay (24h)'}
          color="purple"
        />
      </div>

      {/* Stats Grid — Row 2: Infrastructure */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Server size={20} />}
          label="Hosts Online"
          value={loading ? '...' : `${stats?.hostsOnline ?? 0}`}
          detail={loading ? 'Loading...' : `${stats?.hostsTotal ?? 0} total registered`}
          color="green"
        />
        <StatCard
          icon={<WifiOff size={20} />}
          label="Hosts Offline"
          value={loading ? '...' : `${stats?.hostsOffline ?? 0}`}
          detail={loading ? 'Loading...' : stats?.hostsOffline === 0 ? 'All hosts online' : 'Hosts not responding'}
          color="red"
        />
        <StatCard
          icon={<Users size={20} />}
          label="Total Users"
          value={loading ? '...' : `${stats?.totalUsers ?? 0}`}
          detail={loading ? 'Loading...' : 'Registered accounts'}
          color="blue"
        />
        <StatCard
          icon={<Building2 size={20} />}
          label="Organizations"
          value={loading ? '...' : `${stats?.totalOrgs ?? 0}`}
          detail={loading ? 'Loading...' : 'Active organisations'}
          color="purple"
        />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a
          href="/dashboard/admin/sessions"
          className="flex items-center gap-4 rounded-xl bg-white border border-gray-200 p-5 hover:border-cs-green/30 hover:shadow-sm transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            <Activity size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-cs-green transition-colors">
              Session Explorer
            </h3>
            <p className="text-xs text-gray-500">Browse all sessions, filter by status, host, or user</p>
          </div>
        </a>
        <a
          href="/dashboard/admin/hosts"
          className="flex items-center gap-4 rounded-xl bg-white border border-gray-200 p-5 hover:border-cs-green/30 hover:shadow-sm transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
            <Server size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-cs-green transition-colors">
              Host Management
            </h3>
            <p className="text-xs text-gray-500">View host diagnostics, GPU info, and connection status</p>
          </div>
        </a>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.green}`}
        >
          {icon}
        </div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{detail}</p>
    </div>
  );
}
