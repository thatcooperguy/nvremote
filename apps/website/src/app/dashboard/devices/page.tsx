'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Monitor,
  Laptop,
  Smartphone,
  Server,
  Globe,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Trash2,
  Download,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch, isAuthenticated } from '@/lib/auth';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types matching the API response from HostResponseDto
// ---------------------------------------------------------------------------

interface HostResponse {
  id: string;
  orgId: string;
  name: string;
  hostname: string;
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
  publicIp?: string | null;
  privateIp?: string | null;
  tunnelIp?: string | null;
  gpuInfo?: string | null;
  hostVersion?: string | null;
  hostPorts?: Record<string, number> | null;
  lastSeenAt?: string | null;
  createdAt: string;
}

interface OrgResponse {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map API host status to display status */
function mapStatus(status: string): 'Online' | 'Idle' | 'Offline' {
  switch (status) {
    case 'ONLINE':
      return 'Online';
    case 'MAINTENANCE':
      return 'Idle';
    default:
      return 'Offline';
  }
}

/** Pick an appropriate icon component based on hostname / name heuristics */
function pickIcon(host: HostResponse): typeof Monitor {
  const lower = (host.name + ' ' + host.hostname).toLowerCase();
  if (lower.includes('laptop') || lower.includes('macbook') || lower.includes('notebook')) return Laptop;
  if (lower.includes('phone') || lower.includes('pixel') || lower.includes('iphone') || lower.includes('android')) return Smartphone;
  if (lower.includes('server') || lower.includes('ubuntu') || lower.includes('linux')) return Server;
  if (lower.includes('chrome') || lower.includes('browser') || lower.includes('web')) return Globe;
  return Monitor;
}

/** Format a date string to a human-readable "time ago" */
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/** Mask an IP address for display (show first parts, mask last octet) */
function maskIp(ip: string | null | undefined): string {
  if (!ip) return '--';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
  }
  return ip;
}

const statusStyles: Record<string, { dot: string; text: string }> = {
  Online: { dot: 'bg-nv-green', text: 'text-nv-green' },
  Idle: { dot: 'bg-amber-400', text: 'text-amber-600' },
  Offline: { dot: 'bg-gray-400', text: 'text-gray-400' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DevicesPage() {
  const [hosts, setHosts] = useState<HostResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    if (!isAuthenticated()) return;

    try {
      setError(null);

      // Step 1: get the user's organisations
      const orgsRes = await authFetch('/api/v1/orgs');
      if (!orgsRes.ok) {
        throw new Error(`Failed to load organisations (${orgsRes.status})`);
      }
      const orgsData = await orgsRes.json();
      const orgs: OrgResponse[] = Array.isArray(orgsData) ? orgsData : orgsData.data ?? [];

      if (orgs.length === 0) {
        setHosts([]);
        return;
      }

      // Step 2: fetch hosts for all user orgs in parallel
      const hostsResults = await Promise.all(
        orgs.map(async (org) => {
          const res = await authFetch(`/api/v1/hosts?orgId=${org.id}`);
          if (!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data) ? data : data.data ?? [];
        }),
      );

      const allHosts: HostResponse[] = hostsResults.flat();
      setHosts(allHosts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  /** Remove (deregister) a host */
  const handleRemove = async (hostId: string) => {
    if (removingId) return; // prevent double-click

    setRemovingId(hostId);
    try {
      const res = await authFetch(`/api/v1/hosts/${hostId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.message || `Failed to remove device (${res.status})`;
        setError(msg);
        return;
      }
      // Remove from local state immediately
      setHosts((prev) => prev.filter((h) => h.id !== hostId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove device');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight"
          >
            Connected Devices
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-sm text-gray-500 mt-1"
          >
            {loading
              ? 'Loading devices...'
              : hosts.length === 0
                ? 'No devices registered'
                : `${hosts.length} registered device${hosts.length !== 1 ? 's' : ''}`}
          </motion.p>
        </div>
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          onClick={() => {
            setLoading(true);
            fetchDevices();
          }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </motion.button>
      </div>

      {/* Error Banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600 text-xs font-medium"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      {/* Loading State */}
      {loading && hosts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Loader2 size={32} className="animate-spin mb-3" />
          <p className="text-sm">Loading devices...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && hosts.length === 0 && !error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center mb-4">
            <Monitor size={28} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            No devices registered yet
          </h3>
          <p className="text-sm text-gray-500 mb-6 max-w-sm">
            Install the NVRemote Host Agent on your NVIDIA-powered machine to get started.
          </p>
          <Link
            href="/downloads"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-nv-green text-white text-sm font-medium hover:bg-nv-green-700 transition-colors shadow-sm"
          >
            <Download size={16} />
            Download Host Agent
          </Link>
        </motion.div>
      )}

      {/* Device cards grid */}
      {hosts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {hosts.map((host, i) => {
            const displayStatus = mapStatus(host.status);
            const Icon = pickIcon(host);
            const isRemoving = removingId === host.id;

            return (
              <motion.div
                key={host.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.06 }}
                className="gradient-border gradient-border-hover p-5 transition-all duration-300 hover:shadow-card-hover"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center border bg-nv-green/10 border-nv-green/20">
                      <Icon className="w-5 h-5 text-nv-green" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {host.name}
                      </h3>
                      <p className="text-xs text-gray-500">{host.hostname}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        statusStyles[displayStatus].dot,
                        displayStatus === 'Online' && 'animate-pulse'
                      )}
                    />
                    <span
                      className={cn(
                        'text-xs font-medium',
                        statusStyles[displayStatus].text
                      )}
                    >
                      {displayStatus}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Last seen</span>
                    <span className="text-xs text-gray-600">
                      {timeAgo(host.lastSeenAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">IP Address</span>
                    <span className="text-xs font-mono text-gray-600">
                      {maskIp(host.publicIp || host.privateIp)}
                    </span>
                  </div>
                  {host.gpuInfo && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">GPU</span>
                      <span className="text-xs text-gray-600 truncate ml-4 text-right">
                        {host.gpuInfo}
                      </span>
                    </div>
                  )}
                  {host.hostVersion && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Version</span>
                      <span className="text-xs font-mono text-gray-600">
                        v{host.hostVersion}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Auth Method</span>
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                      <ShieldCheck className="w-3 h-3 text-nv-green" />
                      OAuth
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200/60">
                  <button
                    onClick={() => handleRemove(host.id)}
                    disabled={isRemoving}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-medium transition-colors',
                      isRemoving
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'text-gray-400 hover:text-red-400'
                    )}
                  >
                    {isRemoving ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    {isRemoving ? 'Removing...' : 'Revoke Access'}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
