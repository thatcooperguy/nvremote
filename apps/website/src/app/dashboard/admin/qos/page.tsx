'use client';

import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/lib/auth';
import {
  BarChart3,
  RefreshCw,
  AlertCircle,
  Wifi,
  Gauge,
  Monitor,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QosAnalytics {
  codecDistribution: Record<string, number>;
  resolutionDistribution: Record<string, number>;
  profileDistribution: Record<string, number>;
  connectionTypeDistribution: Record<string, number>;
  avgBitrateKbps: number;
  avgPacketLossPercent: number;
  avgRttMs: number;
  avgJitterMs: number;
  totalSessionsAnalyzed: number;
}

const barColors = [
  'bg-cs-green',
  'bg-blue-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-red-500',
  'bg-teal-500',
  'bg-pink-500',
];

function DistributionChart({ data, title, icon: Icon }: {
  data: Record<string, number>;
  title: string;
  icon: React.ComponentType<{ size: number; className?: string }>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon size={16} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="text-xs text-gray-400">No data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-[10px] text-gray-400 ml-auto">{total} total</span>
      </div>
      <div className="space-y-3">
        {entries.map(([key, value], idx) => {
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">{key}</span>
                <span className="text-xs text-gray-500">{pct}% ({value})</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', barColors[idx % barColors.length])}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminQosPage() {
  const [data, setData] = useState<QosAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch('/api/v1/admin/qos');
      if (!res.ok) {
        if (res.status === 403) { setError('Access denied. Admin privileges required.'); return; }
        throw new Error(`Failed to load QoS analytics (${res.status})`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load QoS analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center">
            <BarChart3 size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">QoS Analytics</h1>
            <p className="text-gray-500 text-sm">
              {data ? `${data.totalSessionsAnalyzed} sessions analyzed (last 7 days)` : 'Loading...'}
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
        <div className="text-center py-12 text-gray-400">Loading QoS analytics...</div>
      ) : data ? (
        <>
          {/* Average metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Avg Bitrate', value: `${data.avgBitrateKbps} kbps`, icon: Gauge },
              { label: 'Avg Packet Loss', value: `${data.avgPacketLossPercent}%`, icon: AlertCircle },
              { label: 'Avg RTT', value: `${data.avgRttMs} ms`, icon: Wifi },
              { label: 'Avg Jitter', value: `${data.avgJitterMs} ms`, icon: Radio },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <stat.icon size={14} className="text-gray-400" />
                  <span className="text-xs text-gray-500">{stat.label}</span>
                </div>
                <p className="text-lg font-bold text-gray-900">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Distribution charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DistributionChart data={data.codecDistribution} title="Codec Distribution" icon={Monitor} />
            <DistributionChart data={data.resolutionDistribution} title="Resolution Distribution" icon={Monitor} />
            <DistributionChart data={data.profileDistribution} title="Profile Distribution" icon={Gauge} />
            <DistributionChart data={data.connectionTypeDistribution} title="Connection Type" icon={Wifi} />
          </div>
        </>
      ) : null}
    </div>
  );
}
