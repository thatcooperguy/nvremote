'use client';

import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/lib/auth';
import {
  Smartphone,
  RefreshCw,
  AlertCircle,
  Users,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClientInsights {
  platformDistribution: Record<string, number>;
  failureRateByPlatform: Record<string, number>;
  decoderSupport: Record<string, number>;
  avgSessionDurationByPlatform: Record<string, number>;
  totalClients: number;
}

const platformIcons: Record<string, string> = {
  android: '📱',
  windows: '💻',
  macos: '🖥️',
  web: '🌐',
  unknown: '❓',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

export default function AdminClientsPage() {
  const [data, setData] = useState<ClientInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch('/api/v1/admin/clients');
      if (!res.ok) {
        if (res.status === 403) { setError('Access denied. Admin privileges required.'); return; }
        throw new Error(`Failed to load client insights (${res.status})`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load client insights');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const platforms = data ? Object.entries(data.platformDistribution).sort((a, b) => b[1] - a[1]) : [];
  const totalSessions = platforms.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
            <Smartphone size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Client Insights</h1>
            <p className="text-gray-500 text-sm">
              {data ? `${data.totalClients} unique clients (last 30 days)` : 'Loading...'}
            </p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading && !data ? (
        <div className="text-center py-12 text-gray-400">Loading client insights...</div>
      ) : data ? (
        <>
          {/* Platform breakdown cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {platforms.map(([platform, count]) => {
              const pct = totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0;
              const failRate = data.failureRateByPlatform[platform] ?? 0;
              const avgDuration = data.avgSessionDurationByPlatform[platform] ?? 0;

              return (
                <div key={platform} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{platformIcons[platform.toLowerCase()] || platformIcons.unknown}</span>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 capitalize">{platform}</h3>
                        <p className="text-xs text-gray-400">{pct}% of sessions</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-gray-900">{count}</span>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle size={12} className="text-gray-400" />
                        <span className="text-xs text-gray-500">Failure rate</span>
                      </div>
                      <span className={cn(
                        'text-xs font-medium',
                        failRate > 10 ? 'text-red-600' : failRate > 5 ? 'text-amber-600' : 'text-green-600'
                      )}>
                        {failRate}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-gray-400" />
                        <span className="text-xs text-gray-500">Avg duration</span>
                      </div>
                      <span className="text-xs font-medium text-gray-700">
                        {formatDuration(avgDuration)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Decoder support matrix */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Hardware Decoder Support</h3>
            </div>
            {Object.keys(data.decoderSupport).length === 0 ? (
              <p className="text-xs text-gray-400">No decoder data yet</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(data.decoderSupport)
                  .sort((a, b) => b[1] - a[1])
                  .map(([decoder, count]) => (
                    <div key={decoder} className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-lg font-bold text-gray-900">{count}</p>
                      <p className="text-xs text-gray-500 uppercase font-medium">{decoder}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
