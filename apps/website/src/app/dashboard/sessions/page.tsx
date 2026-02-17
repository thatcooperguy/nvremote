'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Monitor,
  Play,
  RefreshCw,
  Unplug,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types — match the API DTOs
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  userId: string;
  hostId: string;
  status: string; // ACTIVE | PENDING | ENDED | FAILED
  startedAt: string;
  endedAt?: string | null;
  clientIp?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface Host {
  id: string;
  name: string;
  hostname: string;
  status: string; // ONLINE | OFFLINE | MAINTENANCE
  gpuInfo?: string | null;
  publicIp?: string | null;
  privateIp?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-nv-green/10 text-nv-green border-nv-green/20',
  PENDING: 'bg-amber-50 text-amber-600 border-amber-200',
  ENDED: 'bg-gray-100 text-gray-500 border-gray-300',
  FAILED: 'bg-red-50 text-red-600 border-red-200',
};

const statusDots: Record<string, string> = {
  ACTIVE: 'bg-nv-green',
  PENDING: 'bg-amber-400 animate-pulse',
  ENDED: 'bg-gray-400',
  FAILED: 'bg-red-400',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startedAt: string, endedAt?: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms <= 0) return '--';
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SessionsPage() {
  const router = useRouter();

  // Data state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create session form state
  const [selectedHostId, setSelectedHostId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);

  // End session state
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const [sessionsRes, hostsRes] = await Promise.all([
        authFetch('/api/v1/sessions'),
        authFetch('/api/v1/hosts').catch(() => null),
      ]);

      if (!sessionsRes.ok) {
        throw new Error(`Failed to load sessions (${sessionsRes.status})`);
      }

      const sessionsData = await sessionsRes.json();
      const sessionsList: Session[] = Array.isArray(sessionsData)
        ? sessionsData
        : sessionsData.data ?? [];
      setSessions(sessionsList);

      if (hostsRes?.ok) {
        const hostsData = await hostsRes.json();
        const hostsList: Host[] = Array.isArray(hostsData)
          ? hostsData
          : hostsData.data ?? [];
        setHosts(hostsList);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Create session
  // ---------------------------------------------------------------------------

  const handleCreateSession = async () => {
    if (!selectedHostId) {
      setCreateError('Please select a host.');
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);

      const res = await authFetch('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify({ hostId: selectedHostId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.message || `Failed to create session (${res.status})`,
        );
      }

      const data = await res.json();
      setCreatedSessionId(data.sessionId);

      // Refresh session list
      setLoading(true);
      await fetchData();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Failed to create session',
      );
    } finally {
      setCreating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // End session
  // ---------------------------------------------------------------------------

  const handleEndSession = async (sessionId: string) => {
    try {
      setEndingSessionId(sessionId);

      const res = await authFetch(`/api/v1/sessions/${sessionId}/end`, {
        method: 'POST',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.message || `Failed to end session (${res.status})`,
        );
      }

      // Refresh session list
      await fetchData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to end session',
      );
    } finally {
      setEndingSessionId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const activeSessions = sessions.filter(
    (s) => s.status === 'ACTIVE' || s.status === 'PENDING',
  );
  const pastSessions = sessions.filter(
    (s) => s.status === 'ENDED' || s.status === 'FAILED',
  );
  const selectClass =
    'w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 focus:border-nv-green/50 focus:ring-1 focus:ring-nv-green/20 focus:outline-none transition-colors appearance-none';

  // Helper to resolve host name from hostId
  const getHostName = (hostId: string): string => {
    const host = hosts.find((h) => h.id === hostId);
    return host?.name || host?.hostname || hostId.slice(0, 8);
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
            Session Management
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-sm text-gray-500 mt-1"
          >
            Create and manage streaming sessions
          </motion.p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Global error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </motion.div>
      )}

      {/* Create session form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="gradient-border p-5 sm:p-6 relative overflow-hidden"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-5">
          Start New Session
        </h2>

        <AnimatePresence mode="wait">
          {!createdSessionId ? (
            <motion.div
              key="form"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Host selector */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Select Host
                </label>
                {hosts.length === 0 && !loading ? (
                  <p className="text-sm text-gray-400 py-2">
                    No hosts registered yet. Install the host agent on an
                    NVIDIA-powered machine first.
                  </p>
                ) : (
                  <select
                    value={selectedHostId}
                    onChange={(e) => {
                      setSelectedHostId(e.target.value);
                      setCreateError(null);
                    }}
                    className={selectClass}
                  >
                    <option value="">Choose a host...</option>
                    {hosts.map((host) => (
                      <option key={host.id} value={host.id}>
                        {host.name || host.hostname}
                        {host.status === 'ONLINE' ? ' (Online)' : ` (${host.status})`}
                        {host.gpuInfo ? ` - ${host.gpuInfo}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Create error */}
              {createError && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle size={14} className="shrink-0" />
                  {createError}
                </div>
              )}

              {/* Create button */}
              <button
                onClick={handleCreateSession}
                disabled={creating || hosts.length === 0}
                className={cn(
                  'w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-nv-green text-white font-semibold text-sm rounded-lg hover:bg-nv-green-300 transition-all duration-300 shadow-glow hover:shadow-glow-lg disabled:opacity-50 disabled:cursor-not-allowed',
                  creating && 'opacity-80 cursor-wait',
                )}
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating Session...
                  </>
                ) : (
                  'Start Session'
                )}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, type: 'spring', bounce: 0.3 }}
              className="relative"
            >
              {/* Portal ring animation */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <motion.div
                  initial={{ width: 0, height: 0, opacity: 0.8 }}
                  animate={{ width: '150%', height: '150%', opacity: 0 }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                  className="absolute rounded-full border-2 border-nv-green/40"
                />
                <motion.div
                  initial={{ width: 0, height: 0, opacity: 0.5 }}
                  animate={{ width: '120%', height: '120%', opacity: 0 }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.15 }}
                  className="absolute rounded-full border border-nv-green/30"
                />
              </div>

              <div className="space-y-5">
                {/* Success header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-nv-green/10 border border-nv-green/30 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-nv-green" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Session Created
                    </h3>
                    <p className="text-xs text-gray-500">
                      Your session is being established with the host
                    </p>
                  </div>
                </div>

                {/* Session ID */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Session ID
                  </label>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-700 truncate">
                    {createdSessionId}
                  </div>
                </div>

                {/* Launch Stream button */}
                <button
                  onClick={() => router.push(`/stream/${createdSessionId}`)}
                  className={cn(
                    'w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-nv-green text-white font-semibold text-sm rounded-lg hover:bg-nv-green-300 transition-all duration-300 shadow-glow hover:shadow-glow-lg',
                  )}
                >
                  <Play className="w-4 h-4" />
                  Launch Stream in Browser
                </button>

                {/* Status */}
                <div className="flex items-center gap-2.5 py-3 px-4 rounded-lg bg-nv-green/[0.04] border border-nv-green/10">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nv-green opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-nv-green" />
                  </span>
                  <span className="text-sm text-nv-green font-medium">
                    Session ready — click above to start streaming
                  </span>
                </div>

                {/* New session button */}
                <button
                  onClick={() => {
                    setCreatedSessionId(null);
                    setSelectedHostId('');
                  }}
                  className="text-sm text-gray-500 hover:text-nv-green transition-colors font-medium"
                >
                  Create another session
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Active sessions list */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Active Sessions
        </h2>

        {loading && sessions.length === 0 ? (
          <div className="gradient-border p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Loading sessions...</p>
          </div>
        ) : activeSessions.length === 0 ? (
          <div className="gradient-border p-8 text-center">
            <Monitor className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 font-medium">
              No active sessions
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Start a new session above to begin streaming
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className="gradient-border p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {getHostName(session.hostId)}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border shrink-0',
                        statusColors[session.status] ||
                          'bg-gray-100 text-gray-500 border-gray-300',
                      )}
                    >
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          statusDots[session.status] || 'bg-gray-400',
                        )}
                      />
                      {session.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs font-mono text-gray-500">
                      {session.id.slice(0, 8)}...
                    </span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock size={11} />
                      {formatDuration(session.startedAt, session.endedAt)}
                    </span>
                    <span className="text-xs text-gray-400">
                      Started {formatTime(session.startedAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {session.status === 'ACTIVE' && (
                    <button
                      onClick={() => router.push(`/stream/${session.id}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-nv-green hover:bg-nv-green-300 rounded-lg transition-all"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Connect
                    </button>
                  )}
                  <button
                    onClick={() => handleEndSession(session.id)}
                    disabled={endingSessionId === session.id}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-400 border border-gray-200 hover:border-red-500/30 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {endingSessionId === session.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Unplug className="w-3.5 h-3.5" />
                    )}
                    {endingSessionId === session.id
                      ? 'Ending...'
                      : 'End Session'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Past sessions */}
      {pastSessions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Past Sessions
          </h2>
          <div className="space-y-3">
            {pastSessions.map((session) => (
              <div
                key={session.id}
                className="gradient-border p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {getHostName(session.hostId)}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border shrink-0',
                        statusColors[session.status] ||
                          'bg-gray-100 text-gray-500 border-gray-300',
                      )}
                    >
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          statusDots[session.status] || 'bg-gray-400',
                        )}
                      />
                      {session.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs font-mono text-gray-500">
                      {session.id.slice(0, 8)}...
                    </span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock size={11} />
                      {formatDuration(session.startedAt, session.endedAt)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatTime(session.startedAt)}
                      {session.endedAt && ` - ${formatTime(session.endedAt)}`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Empty state — no sessions at all */}
      {!loading && sessions.length === 0 && !error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="gradient-border p-10 text-center"
        >
          <Monitor className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-base font-medium text-gray-600">
            No sessions yet
          </p>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
            Select a host above and start your first streaming session. Sessions
            will appear here once created.
          </p>
        </motion.div>
      )}
    </div>
  );
}
