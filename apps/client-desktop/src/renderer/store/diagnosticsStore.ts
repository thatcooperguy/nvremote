/**
 * diagnosticsStore.ts — Persistent log capture store.
 *
 * Captures log entries from across the app (health checks, connection events,
 * host agent state changes) and persists them across page navigation.
 * Capped at 500 entries to prevent memory bloat.
 */

import { create } from 'zustand';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

const MAX_LOG_ENTRIES = 500;

let logSeq = 0;

interface DiagnosticsState {
  logs: LogEntry[];
  addLog: (level: LogEntry['level'], source: string, message: string) => void;
  clearLogs: () => void;
}

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  logs: [],

  addLog: (level, source, message) => {
    const entry: LogEntry = {
      id: `log-${++logSeq}`,
      timestamp: new Date().toLocaleTimeString(),
      level,
      source,
      message,
    };

    set((state) => ({
      logs: [...state.logs, entry].slice(-MAX_LOG_ENTRIES),
    }));
  },

  clearLogs: () => set({ logs: [] }),
}));
