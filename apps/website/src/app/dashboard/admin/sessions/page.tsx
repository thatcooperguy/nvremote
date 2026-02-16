'use client';

import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/lib/auth';
import {
  BarChart3,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Clock,
  Wifi,
  Monitor,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminSession {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  hostId: string;
  hostName: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  clientIp: string | null;
  codec: string | null;
  connectionType: string | null;
  gamingMode: boolean | null;
  resolution: string | null;
  targetFps: number | null;
  maxBitrate: number | null;
}

interface SessionsResponse {
  data: AdminSession[];
  total: number;
  page: number;
  limit: number;
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 border-green-200',
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  ENDED: 'bg-gray-100 text-gray-600 border-gray-200',
  FAILED: 'bg-red-100 text-red-700 border-red-200',
};

const statusOptions = ['', 'ACTIVE', 'PENDING', 'ENDED', 'FAILED'];

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<SessionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<AdminSession | null>(null);
  const limit = 20;

  const fetchSessions = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (statusFilter) params.set('status', statusFilter);

      const res = await authFetch(`/api/v1/admin/sessions?${params}`);
      if (!res.ok) {
        if (res.status === 403) {
          setError('Access denied. Admin privileges required.');
          return;
        }
        throw new Error(`Failed to load sessions (${res.status})`);
      }
      const data = await res.json();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchSessions();
  }, [fetchSessions]);

  const totalPages = sessions ? Math.ceil(sessions.total / limit) : 0;

  function formatDuration(ms: number | null): string {
    if (!ms || ms <= 0) return '--';
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    if (mins > 0) return `${mins}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
            <BarChart3 size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Session Explorer</h1>
            <p className="text-gray-500 text-sm">
              {sessions ? `${sessions.total} total sessions` : 'Loading...'}
            </p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchSessions(); }}
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
          {statusOptions.map((s) => (
            <button
              key={s || 'all'}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                statusFilter === s
                  ? 'bg-cs-green/10 text-cs-green-700 border-cs-green/30'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              )}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Host</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Started</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Duration</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Codec</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Connection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && !sessions ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    Loading sessions...
                  </td>
                </tr>
              ) : sessions?.data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    No sessions found.
                  </td>
                </tr>
              ) : (
                sessions?.data.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className="hover:bg-gray-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold border',
                        statusColors[s.status] || 'bg-gray-100 text-gray-600 border-gray-200'
                      )}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900 text-xs">{s.userName || 'Unknown'}</p>
                          <p className="text-[11px] text-gray-400">{s.userEmail || s.userId.slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Monitor size={14} className="text-gray-400" />
                        <span className="text-xs text-gray-700">{s.hostName || s.hostId.slice(0, 8)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatTime(s.startedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-gray-400" />
                        <span className="text-xs text-gray-700 font-mono">{formatDuration(s.durationMs)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                      {s.codec || '--'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Wifi size={12} className="text-gray-400" />
                        <span className="text-xs text-gray-500">{s.connectionType || 'P2P'}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Page {page} of {totalPages} ({sessions?.total ?? 0} sessions)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Session Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md bg-white border-l border-gray-200 shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Session Details</h3>
              <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-gray-100">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <DetailRow label="Session ID" value={selected.id} mono />
              <DetailRow label="Status" value={selected.status} badge />
              <DetailRow label="User" value={`${selected.userName || 'Unknown'} (${selected.userEmail || selected.userId.slice(0, 8)})`} />
              <DetailRow label="Host" value={selected.hostName || selected.hostId.slice(0, 8)} />
              <DetailRow label="Started" value={formatTime(selected.startedAt)} />
              <DetailRow label="Ended" value={selected.endedAt ? formatTime(selected.endedAt) : 'Active'} />
              <DetailRow label="Duration" value={formatDuration(selected.durationMs)} />
              <div className="border-t border-gray-100 pt-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Stream Config</p>
                <div className="space-y-3">
                  <DetailRow label="Codec" value={selected.codec || '--'} />
                  <DetailRow label="Resolution" value={selected.resolution || '--'} />
                  <DetailRow label="Target FPS" value={selected.targetFps ? `${selected.targetFps}` : '--'} />
                  <DetailRow label="Max Bitrate" value={selected.maxBitrate ? `${selected.maxBitrate} kbps` : '--'} />
                  <DetailRow label="Connection" value={selected.connectionType || 'P2P'} />
                  <DetailRow label="Client IP" value={selected.clientIp || '--'} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      {badge ? (
        <span className={cn(
          'inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold border',
          statusColors[value] || 'bg-gray-100 text-gray-600 border-gray-200'
        )}>
          {value}
        </span>
      ) : (
        <span className={cn(
          'text-xs text-gray-900 text-right',
          mono && 'font-mono'
        )}>
          {value}
        </span>
      )}
    </div>
  );
}
