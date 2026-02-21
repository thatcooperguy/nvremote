'use client';

import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/lib/auth';
import {
  HardDrive,
  Database,
  Globe,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Radio,
  Shield,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceHealth {
  status: 'ok' | 'degraded' | 'down';
  responseTimeMs: number;
}

interface InfraHealth {
  api: ServiceHealth & { uptimeSeconds: number; version: string };
  database: ServiceHealth & { activeConnections: number; databaseSizeMb: number };
  website: ServiceHealth & { url: string };
  turn: { enabled: boolean; serverCount: number; hasCredentials: boolean };
  stun: { serverCount: number; servers: string[] };
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: 'ok' | 'degraded' | 'down' }) {
  const color =
    status === 'ok'
      ? 'bg-green-500'
      : status === 'degraded'
        ? 'bg-amber-500'
        : 'bg-red-500';
  return <div className={`w-3 h-3 rounded-full ${color} shrink-0`} />;
}

function StatusIcon({ status }: { status: 'ok' | 'degraded' | 'down' }) {
  if (status === 'ok') return <CheckCircle2 className="w-5 h-5 text-green-500" />;
  if (status === 'degraded') return <AlertTriangle className="w-5 h-5 text-amber-500" />;
  return <XCircle className="w-5 h-5 text-red-500" />;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InfrastructurePage() {
  const [health, setHealth] = useState<InfraHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch('/api/v1/admin/health');
      if (!res.ok) {
        if (res.status === 403) {
          setError('Access denied. Admin privileges required.');
          return;
        }
        throw new Error(`Failed to load health data (${res.status})`);
      }
      setHealth(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load infrastructure health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-nv-green/10 border border-nv-green/20 flex items-center justify-center">
            <HardDrive size={20} className="text-nv-green" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Infrastructure Health</h1>
            <p className="text-gray-500 text-sm">Real-time status of all platform services.</p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchHealth(); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !health && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 h-40" />
          ))}
        </div>
      )}

      {health && (
        <>
          {/* Service status cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {/* API Server */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">API Server</span>
                </div>
                <StatusIcon status={health.api.status} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <StatusDot status={health.api.status} />
                  <span className="text-sm font-medium text-gray-900 capitalize">{health.api.status}</span>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Response: {health.api.responseTimeMs}ms</p>
                  <p>Uptime: {formatUptime(health.api.uptimeSeconds)}</p>
                  <p>Version: {health.api.version}</p>
                </div>
              </div>
            </div>

            {/* Database */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Database</span>
                </div>
                <StatusIcon status={health.database.status} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <StatusDot status={health.database.status} />
                  <span className="text-sm font-medium text-gray-900 capitalize">{health.database.status}</span>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Response: {health.database.responseTimeMs}ms</p>
                  <p>Connections: {health.database.activeConnections}</p>
                  <p>Size: {health.database.databaseSizeMb} MB</p>
                </div>
              </div>
            </div>

            {/* Website */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Website</span>
                </div>
                <StatusIcon status={health.website.status} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <StatusDot status={health.website.status} />
                  <span className="text-sm font-medium text-gray-900 capitalize">{health.website.status}</span>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Response: {health.website.responseTimeMs}ms</p>
                  <p className="truncate">{health.website.url}</p>
                </div>
              </div>
            </div>
          </div>

          {/* TURN / STUN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">TURN Relay</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status={health.turn.enabled ? 'ok' : 'down'} />
                <span className="text-sm font-medium text-gray-900">
                  {health.turn.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <p>Servers: {health.turn.serverCount}</p>
                <p>Credentials: {health.turn.hasCredentials ? 'Configured' : 'Not configured'}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Radio className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">STUN Servers</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status={health.stun.serverCount > 0 ? 'ok' : 'down'} />
                <span className="text-sm font-medium text-gray-900">
                  {health.stun.serverCount} server{health.stun.serverCount !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                {health.stun.servers.map((s, i) => (
                  <p key={i} className="font-mono truncate">{s}</p>
                ))}
              </div>
            </div>
          </div>

          {/* Last checked */}
          <p className="text-xs text-gray-400 text-right">
            Last checked: {new Date(health.checkedAt).toLocaleTimeString()} &middot; Auto-refreshes every 30s
          </p>
        </>
      )}
    </div>
  );
}
