'use client';

import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/lib/auth';
import {
  AlertOctagon,
  RefreshCw,
  AlertCircle,
  Cpu,
  Clock,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorEntry {
  id: string;
  sessionId: string;
  hostName?: string | null;
  gpuInfo?: string | null;
  errorType: string;
  errorMessage?: string | null;
  occurredAt: string;
  platform?: string | null;
  codec?: string | null;
}

interface ErrorSummary {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByGpu: Record<string, number>;
  recentErrors: ErrorEntry[];
}

const errorTypeColors: Record<string, string> = {
  ENCODER_FAILURE: 'bg-red-100 text-red-700',
  ICE_FAILURE: 'bg-orange-100 text-orange-700',
  AUTH_FAILURE: 'bg-yellow-100 text-yellow-700',
  TIMEOUT: 'bg-purple-100 text-purple-700',
  HOST_CRASH: 'bg-red-100 text-red-700',
  CLIENT_CRASH: 'bg-pink-100 text-pink-700',
  UNKNOWN: 'bg-gray-100 text-gray-700',
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ErrorTypeTag({ type }: { type: string }) {
  const colorClass = errorTypeColors[type] || errorTypeColors.UNKNOWN;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase', colorClass)}>
      {type.replace(/_/g, ' ')}
    </span>
  );
}

export default function AdminErrorsPage() {
  const [data, setData] = useState<ErrorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch('/api/v1/admin/errors');
      if (!res.ok) {
        if (res.status === 403) { setError('Access denied. Admin privileges required.'); return; }
        throw new Error(`Failed to load error dashboard (${res.status})`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load error dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const errorsByType = data ? Object.entries(data.errorsByType).sort((a, b) => b[1] - a[1]) : [];
  const errorsByGpu = data ? Object.entries(data.errorsByGpu).sort((a, b) => b[1] - a[1]) : [];
  const totalByType = errorsByType.reduce((s, [, v]) => s + v, 0);
  const totalByGpu = errorsByGpu.reduce((s, [, v]) => s + v, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center">
            <AlertOctagon size={20} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Error Dashboard</h1>
            <p className="text-gray-500 text-sm">
              {data ? `${data.totalErrors} errors (last 7 days)` : 'Loading...'}
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
        <div className="text-center py-12 text-gray-400">Loading error dashboard...</div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-1">
                <AlertOctagon size={14} className="text-red-500" />
                <span className="text-xs text-gray-500">Total Errors</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{data.totalErrors}</p>
              <p className="text-xs text-gray-400 mt-1">Last 7 days</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-1">
                <Tag size={14} className="text-orange-500" />
                <span className="text-xs text-gray-500">Error Types</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{errorsByType.length}</p>
              <p className="text-xs text-gray-400 mt-1">Distinct categories</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-1">
                <Cpu size={14} className="text-purple-500" />
                <span className="text-xs text-gray-500">Affected GPUs</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{errorsByGpu.length}</p>
              <p className="text-xs text-gray-400 mt-1">Distinct GPU models</p>
            </div>
          </div>

          {/* Breakdowns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Errors by Type */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Tag size={16} className="text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Errors by Type</h3>
              </div>
              {errorsByType.length === 0 ? (
                <p className="text-xs text-gray-400">No errors recorded</p>
              ) : (
                <div className="space-y-3">
                  {errorsByType.map(([type, count]) => {
                    const pct = totalByType > 0 ? Math.round((count / totalByType) * 100) : 0;
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between mb-1">
                          <ErrorTypeTag type={type} />
                          <span className="text-xs text-gray-500">{pct}% ({count})</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-red-400 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Errors by GPU */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Cpu size={16} className="text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Errors by GPU Model</h3>
              </div>
              {errorsByGpu.length === 0 ? (
                <p className="text-xs text-gray-400">No GPU-correlated errors</p>
              ) : (
                <div className="space-y-3">
                  {errorsByGpu.map(([gpu, count]) => {
                    const pct = totalByGpu > 0 ? Math.round((count / totalByGpu) * 100) : 0;
                    return (
                      <div key={gpu}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700">{gpu}</span>
                          <span className="text-xs text-gray-500">{pct}% ({count})</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-purple-400 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent Errors Table */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Recent Errors</h3>
              <span className="text-[10px] text-gray-400 ml-auto">{data.recentErrors.length} shown</span>
            </div>
            {data.recentErrors.length === 0 ? (
              <p className="text-xs text-gray-400">No recent errors — looking good!</p>
            ) : (
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 font-semibold text-gray-500">Type</th>
                      <th className="text-left py-2 pr-4 font-semibold text-gray-500">Message</th>
                      <th className="text-left py-2 pr-4 font-semibold text-gray-500">Host</th>
                      <th className="text-left py-2 pr-4 font-semibold text-gray-500">GPU</th>
                      <th className="text-left py-2 pr-4 font-semibold text-gray-500">Platform</th>
                      <th className="text-left py-2 pr-4 font-semibold text-gray-500">Codec</th>
                      <th className="text-right py-2 font-semibold text-gray-500">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentErrors.map((err) => (
                      <tr key={err.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 pr-4"><ErrorTypeTag type={err.errorType} /></td>
                        <td className="py-2.5 pr-4 text-gray-700 max-w-[200px] truncate">{err.errorMessage || '—'}</td>
                        <td className="py-2.5 pr-4 text-gray-600">{err.hostName || '—'}</td>
                        <td className="py-2.5 pr-4 text-gray-600">{err.gpuInfo || '—'}</td>
                        <td className="py-2.5 pr-4 text-gray-600 capitalize">{err.platform || '—'}</td>
                        <td className="py-2.5 pr-4 text-gray-600 uppercase">{err.codec || '—'}</td>
                        <td className="py-2.5 text-right text-gray-400">{formatRelativeTime(err.occurredAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
