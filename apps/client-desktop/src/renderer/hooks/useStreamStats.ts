import { useState, useEffect, useRef } from 'react';
import { useConnectionStore, type StreamStats } from '../store/connectionStore';

/**
 * Custom hook that provides real-time streaming stats from the native viewer.
 *
 * Polls the viewer:stats IPC channel at the specified interval and returns
 * the latest stats. Returns null when not streaming.
 *
 * The connection store already polls at 500ms and stores the result. This
 * hook primarily reads from the store but can also poll independently for
 * components that need a different update frequency.
 *
 * @param intervalMs - Polling interval in milliseconds (default: 500)
 */
export function useStreamStats(intervalMs = 500): StreamStats | null {
  const status = useConnectionStore((s) => s.status);
  const storeStats = useConnectionStore((s) => s.stats);
  const [stats, setStats] = useState<StreamStats | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status !== 'streaming') {
      setStats(null);

      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Use the store stats as the initial value
    if (storeStats) {
      setStats(storeStats);
    }

    // If the requested interval matches the store's default (500ms),
    // just subscribe to the store instead of opening another polling loop.
    if (intervalMs === 500) {
      // Stats come from the store via the subscription below
      return;
    }

    // For custom intervals, poll independently
    const poll = async () => {
      try {
        const result = await window.nvrs.viewer.stats();
        if (result.success && result.stats) {
          setStats(result.stats);
        }
      } catch {
        // Non-fatal
      }
    };

    poll(); // Initial fetch
    intervalRef.current = setInterval(poll, intervalMs);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status, intervalMs]);

  // Sync with store stats when using the default interval
  useEffect(() => {
    if (intervalMs === 500 && storeStats) {
      setStats(storeStats);
    }
  }, [storeStats, intervalMs]);

  return status === 'streaming' ? stats : null;
}
