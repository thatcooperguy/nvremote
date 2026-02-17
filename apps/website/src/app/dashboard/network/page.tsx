'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Gauge,
  Radio,
  Wifi,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Globe,
  ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch, isAuthenticated } from '@/lib/auth';

interface NetworkStats {
  rtt: number | null;
  jitter: number | null;
  packetLoss: number | null;
  bitrate: number | null;
  connectionType: string | null;
  codec: string | null;
}

interface StunResult {
  success: boolean;
  rtt: number;
  publicIp: string | null;
  natType: string;
}

function ratingColor(metric: string, value: number): string {
  if (metric === 'rtt') {
    if (value < 30) return 'text-green-600';
    if (value < 80) return 'text-amber-600';
    return 'text-red-500';
  }
  if (metric === 'jitter') {
    if (value < 5) return 'text-green-600';
    if (value < 15) return 'text-amber-600';
    return 'text-red-500';
  }
  if (metric === 'packetLoss') {
    if (value < 1) return 'text-green-600';
    if (value < 3) return 'text-amber-600';
    return 'text-red-500';
  }
  return 'text-gray-900';
}

function ratingLabel(metric: string, value: number): string {
  if (metric === 'rtt') {
    if (value < 30) return 'Excellent';
    if (value < 80) return 'Good';
    return 'Poor';
  }
  if (metric === 'jitter') {
    if (value < 5) return 'Stable';
    if (value < 15) return 'Moderate';
    return 'Unstable';
  }
  if (metric === 'packetLoss') {
    if (value < 1) return 'Excellent';
    if (value < 3) return 'Acceptable';
    return 'High';
  }
  return '';
}

export default function NetworkPage() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stunResult, setStunResult] = useState<StunResult | null>(null);
  const [stunRunning, setStunRunning] = useState(false);

  const fetchSessionStats = useCallback(async () => {
    if (!isAuthenticated()) return;

    try {
      const res = await authFetch('/api/v1/sessions');
      if (!res.ok) return;

      const data = await res.json();
      const sessions = Array.isArray(data) ? data : data.data ?? [];
      const active = sessions.find(
        (s: { status: string }) => s.status === 'ACTIVE',
      );

      if (active) {
        setHasActiveSession(true);
        const meta = active.metadata ?? {};
        setStats({
          rtt: meta.rtt ?? meta.latencyMs ?? null,
          jitter: meta.jitter ?? null,
          packetLoss: meta.packetLoss ?? null,
          bitrate: meta.bitrate ?? meta.maxBitrate ?? null,
          connectionType: meta.connectionType ?? null,
          codec: meta.codec ?? null,
        });
      } else {
        setHasActiveSession(false);
        // Show last session stats if available
        const ended = sessions
          .filter((s: { status: string }) => s.status === 'ENDED')
          .sort(
            (a: { startedAt: string }, b: { startedAt: string }) =>
              new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
          );
        if (ended.length > 0) {
          const meta = ended[0].metadata ?? {};
          setStats({
            rtt: meta.rtt ?? meta.latencyMs ?? null,
            jitter: meta.jitter ?? null,
            packetLoss: meta.packetLoss ?? null,
            bitrate: meta.bitrate ?? meta.maxBitrate ?? null,
            connectionType: meta.connectionType ?? null,
            codec: meta.codec ?? null,
          });
        }
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessionStats();
    const interval = setInterval(fetchSessionStats, 10000);
    return () => clearInterval(interval);
  }, [fetchSessionStats]);

  const runStunTest = async () => {
    setStunRunning(true);
    const start = performance.now();

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      const result = await new Promise<StunResult>((resolve) => {
        let publicIp: string | null = null;
        let candidateCount = 0;
        let hasSrflx = false;

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            candidateCount++;
            if (e.candidate.type === 'srflx') {
              hasSrflx = true;
              const match = e.candidate.candidate.match(
                /\d+\.\d+\.\d+\.\d+/,
              );
              if (match) publicIp = match[0];
            }
          } else {
            const elapsed = Math.round(performance.now() - start);
            let natType = 'Unknown';
            if (hasSrflx) {
              natType = candidateCount > 2 ? 'Full Cone NAT' : 'Restricted NAT';
            } else if (candidateCount > 0) {
              natType = 'Symmetric NAT (TURN may be needed)';
            } else {
              natType = 'Blocked (no candidates)';
            }
            resolve({
              success: candidateCount > 0,
              rtt: elapsed,
              publicIp,
              natType,
            });
          }
        };

        pc.createDataChannel('test');
        pc.createOffer().then((o) => pc.setLocalDescription(o));

        setTimeout(() => {
          resolve({
            success: false,
            rtt: Math.round(performance.now() - start),
            publicIp: null,
            natType: 'Timeout',
          });
        }, 8000);
      });

      pc.close();
      setStunResult(result);
    } catch {
      setStunResult({
        success: false,
        rtt: Math.round(performance.now() - start),
        publicIp: null,
        natType: 'Error',
      });
    } finally {
      setStunRunning(false);
    }
  };

  const metricCards = [
    {
      label: 'Round-Trip Time',
      icon: Activity,
      value: stats?.rtt != null ? `${Math.round(stats.rtt)} ms` : '—',
      rating:
        stats?.rtt != null ? ratingLabel('rtt', stats.rtt) : 'Awaiting data',
      color: stats?.rtt != null ? ratingColor('rtt', stats.rtt) : 'text-gray-300',
    },
    {
      label: 'Jitter',
      icon: Radio,
      value: stats?.jitter != null ? `${stats.jitter.toFixed(1)} ms` : '—',
      rating:
        stats?.jitter != null
          ? ratingLabel('jitter', stats.jitter)
          : 'Awaiting data',
      color:
        stats?.jitter != null
          ? ratingColor('jitter', stats.jitter)
          : 'text-gray-300',
    },
    {
      label: 'Packet Loss',
      icon: Gauge,
      value:
        stats?.packetLoss != null ? `${stats.packetLoss.toFixed(2)}%` : '—',
      rating:
        stats?.packetLoss != null
          ? ratingLabel('packetLoss', stats.packetLoss)
          : 'Awaiting data',
      color:
        stats?.packetLoss != null
          ? ratingColor('packetLoss', stats.packetLoss)
          : 'text-gray-300',
    },
    {
      label: 'Bitrate',
      icon: Wifi,
      value:
        stats?.bitrate != null
          ? stats.bitrate >= 1000
            ? `${(stats.bitrate / 1000).toFixed(1)} Gbps`
            : `${Math.round(stats.bitrate)} Mbps`
          : '—',
      rating: stats?.bitrate != null ? 'Active' : 'Awaiting data',
      color: stats?.bitrate != null ? 'text-nv-green-600' : 'text-gray-300',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Network Diagnostics
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor connection quality and run connectivity tests.
          </p>
        </div>
        <button
          onClick={fetchSessionStats}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Status banner */}
      {!hasActiveSession && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-4 px-6 py-5 rounded-xl bg-amber-50/80 border border-amber-200"
        >
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-amber-700 mb-1">
              No Active Connection
            </h3>
            <p className="text-sm text-amber-700/80 leading-relaxed">
              {stats
                ? 'Showing stats from your last session. Connect to a host for live metrics.'
                : 'Connect to a host to see real-time network metrics. You can still run a STUN connectivity test below.'}
            </p>
          </div>
        </motion.div>
      )}

      {hasActiveSession && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-4 px-6 py-5 rounded-xl bg-green-50/80 border border-green-200"
        >
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-green-700 mb-1">
              Session Active
            </h3>
            <p className="text-sm text-green-700/80 leading-relaxed">
              Live metrics from your active streaming session.
              {stats?.connectionType && (
                <> Connection: <strong>{stats.connectionType.toUpperCase()}</strong></>
              )}
              {stats?.codec && (
                <> &middot; Codec: <strong>{stats.codec.toUpperCase()}</strong></>
              )}
            </p>
          </div>
        </motion.div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col items-start gap-3"
          >
            <div className="flex items-center gap-2 text-gray-400">
              <m.icon className="w-4 h-4" />
              <span className="text-xs font-semibold tracking-wide uppercase">
                {m.label}
              </span>
            </div>
            <span className={cn('text-3xl font-bold', m.color)}>{m.value}</span>
            <span
              className={cn(
                'text-xs',
                m.color === 'text-gray-300' ? 'text-gray-300' : 'text-gray-500',
              )}
            >
              {m.rating}
            </span>
          </motion.div>
        ))}
      </div>

      {/* STUN Connectivity Test */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">
          STUN Connectivity Test
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Tests your NAT type and ICE candidate gathering ability. Works without
          an active session — helps diagnose P2P connection issues.
        </p>

        <button
          onClick={runStunTest}
          disabled={stunRunning}
          className={cn(
            'inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200',
            stunRunning
              ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-nv-green text-white hover:bg-nv-green-500 shadow-sm',
          )}
        >
          {stunRunning ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Activity className="w-4 h-4" />
          )}
          {stunRunning ? 'Testing...' : 'Run STUN Test'}
        </button>

        {stunResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold uppercase">
                  STUN RTT
                </span>
              </div>
              <span className="text-xl font-bold text-gray-900">
                {stunResult.rtt} ms
              </span>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Globe className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold uppercase">
                  Public IP
                </span>
              </div>
              <span className="text-xl font-bold text-gray-900">
                {stunResult.publicIp ?? 'Not detected'}
              </span>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Radio className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold uppercase">
                  NAT Type
                </span>
              </div>
              <span className="text-sm font-bold text-gray-900">
                {stunResult.natType}
              </span>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                {stunResult.success ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className="text-xs font-semibold uppercase">Status</span>
              </div>
              <span
                className={cn(
                  'text-xl font-bold',
                  stunResult.success ? 'text-green-600' : 'text-red-500',
                )}
              >
                {stunResult.success ? 'Reachable' : 'Blocked'}
              </span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
