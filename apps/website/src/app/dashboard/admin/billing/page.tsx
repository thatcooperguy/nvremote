'use client';

import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/lib/auth';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  HardDrive,
  RefreshCw,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgRevenue {
  orgId: string;
  orgName: string;
  totalCents: number;
  currentMonthCents: number;
  totalBandwidthBytes: string;
}

interface MonthlyTrend {
  month: string;
  revenueCents: number;
  bandwidthBytes: string;
}

interface PlatformBilling {
  totalRevenueCents: number;
  currentMonthCents: number;
  mrrCents: number;
  totalBillingAccounts: number;
  totalBandwidthBytes: string;
  revenueByOrg: OrgRevenue[];
  monthlyTrend: MonthlyTrend[];
  periodsByStatus: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatBytes(bytesStr: string): string {
  const bytes = Number(bytesStr);
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}

const statusBadgeColors: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700 border-blue-200',
  INVOICED: 'bg-amber-100 text-amber-700 border-amber-200',
  PAID: 'bg-green-100 text-green-700 border-green-200',
  FAILED: 'bg-red-100 text-red-700 border-red-200',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlatformBillingPage() {
  const [billing, setBilling] = useState<PlatformBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBilling = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch('/api/v1/admin/billing');
      if (!res.ok) {
        if (res.status === 403) {
          setError('Access denied. Admin privileges required.');
          return;
        }
        throw new Error(`Failed to load billing data (${res.status})`);
      }
      setBilling(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <DollarSign size={20} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Billing</h1>
            <p className="text-gray-500 text-sm">Revenue, bandwidth, and billing overview.</p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchBilling(); }}
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
      {loading && !billing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 h-32" />
          ))}
        </div>
      )}

      {billing && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={<DollarSign size={20} />}
              label="Total Revenue"
              value={formatCents(billing.totalRevenueCents)}
              detail="All-time from paid periods"
              color="emerald"
            />
            <StatCard
              icon={<TrendingUp size={20} />}
              label="MRR"
              value={formatCents(billing.mrrCents)}
              detail="Avg of last 3 months"
              color="blue"
            />
            <StatCard
              icon={<CreditCard size={20} />}
              label="Billing Accounts"
              value={String(billing.totalBillingAccounts)}
              detail={`${formatCents(billing.currentMonthCents)} this month`}
              color="purple"
            />
            <StatCard
              icon={<HardDrive size={20} />}
              label="Total Bandwidth"
              value={formatBytes(billing.totalBandwidthBytes)}
              detail="All-time data transferred"
              color="gray"
            />
          </div>

          {/* Period status badges */}
          <div className="mb-6 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Periods:</span>
            {Object.entries(billing.periodsByStatus).map(([status, count]) => (
              <span
                key={status}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                  statusBadgeColors[status] || 'bg-gray-100 text-gray-600 border-gray-200'
                }`}
              >
                {status}
                <span className="font-mono">{count}</span>
              </span>
            ))}
          </div>

          {/* Monthly Trend */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Monthly Trend</h2>
              <p className="text-xs text-gray-400 mt-0.5">Revenue and bandwidth over the last 6 months</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-5 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Month</th>
                    <th className="px-5 py-3 text-right font-medium text-gray-500 text-xs uppercase tracking-wider">Revenue</th>
                    <th className="px-5 py-3 text-right font-medium text-gray-500 text-xs uppercase tracking-wider">Bandwidth</th>
                    <th className="px-5 py-3 text-right font-medium text-gray-500 text-xs uppercase tracking-wider">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {billing.monthlyTrend.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-xs">
                        No billing data yet.
                      </td>
                    </tr>
                  ) : (
                    billing.monthlyTrend.map((m, i) => {
                      const prev = billing.monthlyTrend[i + 1];
                      const trend = prev && prev.revenueCents > 0
                        ? ((m.revenueCents - prev.revenueCents) / prev.revenueCents) * 100
                        : null;
                      return (
                        <tr key={m.month} className="hover:bg-gray-50/50">
                          <td className="px-5 py-3 text-xs font-medium text-gray-900">{m.month}</td>
                          <td className="px-5 py-3 text-xs text-gray-700 text-right font-mono">
                            {formatCents(m.revenueCents)}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500 text-right font-mono">
                            {formatBytes(m.bandwidthBytes)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {trend !== null ? (
                              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                                trend >= 0 ? 'text-green-600' : 'text-red-500'
                              }`}>
                                {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {Math.abs(trend).toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">--</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Revenue by Org */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Revenue by Organization</h2>
              <p className="text-xs text-gray-400 mt-0.5">Breakdown by org — current month and all-time</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-5 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Organization</th>
                    <th className="px-5 py-3 text-right font-medium text-gray-500 text-xs uppercase tracking-wider">This Month</th>
                    <th className="px-5 py-3 text-right font-medium text-gray-500 text-xs uppercase tracking-wider">All-Time</th>
                    <th className="px-5 py-3 text-right font-medium text-gray-500 text-xs uppercase tracking-wider">Bandwidth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {billing.revenueByOrg.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-xs">
                        No organizations with billing data.
                      </td>
                    </tr>
                  ) : (
                    billing.revenueByOrg.map((org) => (
                      <tr key={org.orgId} className="hover:bg-gray-50/50">
                        <td className="px-5 py-3">
                          <p className="text-xs font-medium text-gray-900">{org.orgName}</p>
                          <p className="text-[11px] text-gray-400 font-mono">{org.orgId.slice(0, 8)}</p>
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-700 text-right font-mono">
                          {formatCents(org.currentMonthCents)}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-700 text-right font-mono">
                          {formatCents(org.totalCents)}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-500 text-right font-mono">
                          {formatBytes(org.totalBandwidthBytes)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
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
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    gray: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.gray}`}>
          {icon}
        </div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{detail}</p>
    </div>
  );
}
