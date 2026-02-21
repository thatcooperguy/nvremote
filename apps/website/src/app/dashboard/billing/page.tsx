'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  CreditCard,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  Loader2,
  BarChart3,
  Zap,
  ExternalLink,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { authFetch, getStoredUser } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BillingAccount {
  id: string;
  stripeCustomerId: string;
  createdAt: string;
}

interface UsageSummary {
  periodStart: string;
  periodEnd: string;
  totalBytesRelay: string;
  totalBytesVpn: string;
  costCentsRaw: number;
  costCentsCharged: number;
  status: string;
}

interface BillingPeriod {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalBytesRelay: string;
  totalBytesVpn: string;
  costCentsRaw: number;
  costCentsCharged: number;
  status: 'OPEN' | 'INVOICED' | 'PAID' | 'FAILED';
  stripeInvoiceId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusBadge(status: string) {
  switch (status) {
    case 'OPEN':
      return { label: 'Current', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock };
    case 'INVOICED':
      return { label: 'Invoiced', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: CreditCard };
    case 'PAID':
      return { label: 'Paid', color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle2 };
    case 'FAILED':
      return { label: 'Failed', color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle };
    default:
      return { label: status, color: 'bg-gray-50 text-gray-700 border-gray-200', icon: Clock };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [history, setHistory] = useState<BillingPeriod[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchOrgId = useCallback(async (): Promise<string | null> => {
    const res = await authFetch('/api/v1/orgs');
    if (!res.ok) return null;
    const orgs = await res.json();
    if (orgs.length > 0) return orgs[0].id;
    return null;
  }, []);

  const fetchBillingData = useCallback(async (oid: string) => {
    const [accountRes, usageRes, historyRes] = await Promise.all([
      authFetch(`/api/v1/billing/account?orgId=${oid}`),
      authFetch(`/api/v1/billing/usage?orgId=${oid}`),
      authFetch(`/api/v1/billing/history?orgId=${oid}`),
    ]);

    if (accountRes.ok) {
      setAccount(await accountRes.json());
    } else {
      setAccount(null);
    }

    if (usageRes.ok) {
      setUsage(await usageRes.json());
    }

    if (historyRes.ok) {
      const periods: BillingPeriod[] = await historyRes.json();
      setHistory(periods);
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      const oid = await fetchOrgId();
      if (!oid) {
        setError('No organization found. Create one to enable billing.');
        return;
      }
      setOrgId(oid);
      await fetchBillingData(oid);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load billing data';
      if (!message.includes('Session expired')) {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchOrgId, fetchBillingData]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleCreateAccount = async () => {
    if (!orgId) return;
    setCreatingAccount(true);
    try {
      const user = getStoredUser();
      const res = await authFetch('/api/v1/billing/account', {
        method: 'POST',
        body: JSON.stringify({ orgId, email: user?.email }),
      });
      if (!res.ok) {
        throw new Error(`Failed to create billing account (${res.status})`);
      }
      const data = await res.json();
      setAccount(data);
      await fetchBillingData(orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create billing account');
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleOpenPortal = async () => {
    if (!orgId) return;
    setOpeningPortal(true);
    try {
      const res = await authFetch(`/api/v1/billing/portal?orgId=${orgId}`, {
        method: 'POST',
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      if (!res.ok) {
        throw new Error(`Failed to open billing portal (${res.status})`);
      }
      const data = await res.json();
      window.open(data.url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open billing portal');
    } finally {
      setOpeningPortal(false);
    }
  };

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const currentRelayBytes = usage ? Number(usage.totalBytesRelay) : 0;
  const currentVpnBytes = usage ? Number(usage.totalBytesVpn) : 0;
  const currentTotalBytes = currentRelayBytes + currentVpnBytes;
  const currentCost = usage?.costCentsCharged ?? 0;

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-8 max-w-4xl">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight"
          >
            Billing
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-sm text-gray-500 mt-1"
          >
            Manage your usage and payment details
          </motion.p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-nv-green animate-spin" />
          <span className="ml-3 text-sm text-gray-500">Loading billing...</span>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight"
        >
          Billing
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-sm text-gray-500 mt-1"
        >
          Manage your usage and payment details
        </motion.p>
      </div>

      {/* Error banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 border border-red-200"
        >
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button
            onClick={loadAll}
            className="text-xs font-medium text-red-600 hover:text-red-800 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </motion.div>
      )}

      {/* No billing account — setup prompt */}
      {!account && !error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="gradient-border p-8 text-center"
        >
          <div className="w-12 h-12 rounded-full bg-nv-green/10 flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-6 h-6 text-nv-green" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Set Up Billing
          </h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            Enable usage-based billing to pay only for the relay and VPN
            bandwidth your streams consume. Peer-to-peer traffic is always free.
          </p>
          <button
            onClick={handleCreateAccount}
            disabled={creatingAccount}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-all duration-300 disabled:opacity-70"
          >
            {creatingAccount ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {creatingAccount ? 'Setting Up...' : 'Enable Billing'}
          </button>
        </motion.div>
      )}

      {/* Billing dashboard (when account exists) */}
      {account && (
        <>
          {/* Current period overview cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="gradient-border p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <ArrowUpRight className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current Usage
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatBytes(currentTotalBytes)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Relay: {formatBytes(currentRelayBytes)} &middot; VPN: {formatBytes(currentVpnBytes)}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="gradient-border p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estimated Cost
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCents(currentCost)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {usage
                  ? `${formatDate(usage.periodStart)} — ${formatDate(usage.periodEnd)}`
                  : 'Current billing period'}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="gradient-border p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment
                </span>
              </div>
              <button
                onClick={handleOpenPortal}
                disabled={openingPortal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
              >
                {openingPortal ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                {openingPortal ? 'Opening...' : 'Manage in Stripe'}
              </button>
              <p className="text-xs text-gray-400 mt-2">
                Update payment method, view invoices
              </p>
            </motion.div>
          </div>

          {/* Pricing info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex items-start gap-3 px-4 py-3 rounded-lg bg-nv-green/[0.03] border border-nv-green/10"
          >
            <Zap className="w-4 h-4 text-nv-green shrink-0 mt-0.5" />
            <div className="text-xs text-gray-500 leading-relaxed">
              <strong className="text-gray-700">Usage-based pricing:</strong>{' '}
              You are billed monthly for relay and VPN bandwidth consumed.
              Peer-to-peer streams incur no bandwidth cost. Invoices are
              generated at the start of each month for the previous period.
            </div>
          </motion.div>

          {/* Billing history */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="gradient-border p-5 sm:p-6"
          >
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Billing History
            </h2>

            {history.length === 0 ? (
              <div className="text-center py-8">
                <BarChart3 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No billing periods yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Usage will appear here once you start streaming
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                        Period
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                        Relay
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                        VPN
                      </th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                        Amount
                      </th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {history.map((period) => {
                      const badge = statusBadge(period.status);
                      const BadgeIcon = badge.icon;
                      return (
                        <tr key={period.id} className="hover:bg-gray-50/50">
                          <td className="py-3 pr-4">
                            <span className="text-gray-900 font-medium">
                              {formatDate(period.periodStart)}
                            </span>
                            <span className="text-gray-400 mx-1">&mdash;</span>
                            <span className="text-gray-600">
                              {formatDate(period.periodEnd)}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-gray-600">
                            {formatBytes(Number(period.totalBytesRelay))}
                          </td>
                          <td className="py-3 pr-4 text-gray-600">
                            {formatBytes(Number(period.totalBytesVpn))}
                          </td>
                          <td className="py-3 pr-4 text-right font-medium text-gray-900">
                            {formatCents(period.costCentsCharged)}
                          </td>
                          <td className="py-3 text-right">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${badge.color}`}
                            >
                              <BadgeIcon className="w-3 h-3" />
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}
