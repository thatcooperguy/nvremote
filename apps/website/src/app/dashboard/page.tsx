'use client';

import { useEffect, useState, useCallback } from 'react';
import { getStoredUser, authFetch, isAuthenticated, type AuthUser } from '@/lib/auth';
import { Monitor, Activity, Wifi, Clock, RefreshCw, AlertCircle } from 'lucide-react';

interface DashboardStats {
  hostsOnline: number;
  hostsTotal: number;
  activeSessions: number;
  totalSessions: number;
  networkStatus: 'ready' | 'degraded' | 'offline';
  lastSessionDuration: string | null;
}

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardStats = useCallback(async () => {
    if (!isAuthenticated()) return;

    try {
      setError(null);

      // Fetch hosts and sessions in parallel
      const [hostsRes, sessionsRes] = await Promise.all([
        authFetch('/api/v1/hosts').catch(() => null),
        authFetch('/api/v1/sessions').catch(() => null),
      ]);

      let hostsOnline = 0;
      let hostsTotal = 0;
      let activeSessions = 0;
      let totalSessions = 0;
      let lastSessionDuration: string | null = null;

      if (hostsRes?.ok) {
        const hostsData = await hostsRes.json();
        const hosts = Array.isArray(hostsData) ? hostsData : hostsData.data ?? [];
        hostsTotal = hosts.length;
        hostsOnline = hosts.filter(
          (h: { status: string }) => h.status === 'ONLINE',
        ).length;
      }

      if (sessionsRes?.ok) {
        const sessionsData = await sessionsRes.json();
        const sessions = Array.isArray(sessionsData)
          ? sessionsData
          : sessionsData.data ?? [];
        totalSessions = sessions.length;
        activeSessions = sessions.filter(
          (s: { status: string }) =>
            s.status === 'ACTIVE' || s.status === 'PENDING',
        ).length;

        // Get last completed session duration
        const completed = sessions
          .filter((s: { status: string; endedAt?: string }) => s.status === 'ENDED' && s.endedAt)
          .sort(
            (a: { endedAt: string }, b: { endedAt: string }) =>
              new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime(),
          );

        if (completed.length > 0) {
          const last = completed[0];
          const start = new Date(last.createdAt || last.startedAt).getTime();
          const end = new Date(last.endedAt).getTime();
          const durationMs = end - start;
          if (durationMs > 0) {
            const mins = Math.floor(durationMs / 60000);
            const hrs = Math.floor(mins / 60);
            lastSessionDuration =
              hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
          }
        }
      }

      setStats({
        hostsOnline,
        hostsTotal,
        activeSessions,
        totalSessions,
        networkStatus: hostsOnline > 0 ? 'ready' : hostsTotal > 0 ? 'degraded' : 'offline',
        lastSessionDuration,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUser(getStoredUser());
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-gray-500 mt-1">
            Here is an overview of your NVRemote setup.
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchDashboardStats();
          }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Monitor size={20} />}
          label="Connected Hosts"
          value={loading ? '...' : `${stats?.hostsOnline ?? 0}`}
          detail={
            loading
              ? 'Loading...'
              : stats?.hostsTotal === 0
                ? 'No hosts registered yet'
                : `${stats?.hostsOnline ?? 0} of ${stats?.hostsTotal ?? 0} online`
          }
          color="green"
        />
        <StatCard
          icon={<Activity size={20} />}
          label="Active Sessions"
          value={loading ? '...' : `${stats?.activeSessions ?? 0}`}
          detail={
            loading
              ? 'Loading...'
              : stats?.totalSessions === 0
                ? 'No sessions yet'
                : `${stats?.totalSessions ?? 0} total sessions`
          }
          color="blue"
        />
        <StatCard
          icon={<Wifi size={20} />}
          label="Network Status"
          value={
            loading
              ? '...'
              : stats?.networkStatus === 'ready'
                ? 'Ready'
                : stats?.networkStatus === 'degraded'
                  ? 'Degraded'
                  : 'Offline'
          }
          detail={
            loading
              ? 'Loading...'
              : stats?.networkStatus === 'ready'
                ? 'Hosts online, P2P available'
                : stats?.networkStatus === 'degraded'
                  ? 'Some hosts offline'
                  : 'No hosts online'
          }
          color="emerald"
        />
        <StatCard
          icon={<Clock size={20} />}
          label="Last Session"
          value={loading ? '...' : stats?.lastSessionDuration ?? '--'}
          detail={
            loading
              ? 'Loading...'
              : stats?.lastSessionDuration
                ? 'Last session duration'
                : 'No completed sessions yet'
          }
          color="purple"
        />
      </div>

      {/* Getting Started */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Getting Started
        </h2>
        <div className="space-y-4">
          <StepItem
            step={1}
            title="Install the Host Agent"
            description="Download and install NVRemote Host on your NVIDIA-powered PC, workstation, or server."
            action={{ label: 'Download Host', href: '/downloads' }}
            completed={!!stats && stats.hostsTotal > 0}
          />
          <StepItem
            step={2}
            title="Install the Client"
            description="Download NVRemote Client on the device you want to stream to — Windows, macOS, Android, or use Chrome."
            action={{ label: 'Download Client', href: '/downloads' }}
          />
          <StepItem
            step={3}
            title="Start Streaming"
            description="Open the client, sign in, and connect to your host. Your GPU-accelerated desktop will stream with adaptive quality."
            completed={!!stats && stats.totalSessions > 0}
          />
        </div>
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

function StepItem({
  step,
  title,
  description,
  action,
  completed,
}: {
  step: number;
  title: string;
  description: string;
  action?: { label: string; href: string };
  completed?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          completed
            ? 'bg-nv-green text-white'
            : 'bg-nv-green/10 text-nv-green'
        }`}
      >
        {completed ? '\u2713' : step}
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        {action && !completed && (
          <a
            href={action.href}
            className="inline-flex items-center text-sm text-nv-green hover:text-nv-green-700 font-medium mt-2"
          >
            {action.label} &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
