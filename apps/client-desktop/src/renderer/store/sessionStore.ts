import { create } from 'zustand';
import { apiClient } from '../services/api';

export interface Session {
  id: string;
  hostId: string;
  hostName: string;
  userId: string;
  status: 'active' | 'completed' | 'failed' | 'terminated';
  startedAt: string;
  endedAt?: string;
  durationMs: number;
  connectionType: 'direct' | 'wireguard';
  metrics?: SessionMetrics;
}

export interface SessionMetrics {
  avgLatencyMs: number;
  avgBitrateMbps: number;
  avgFps: number;
  packetLossPercent: number;
}

interface CreateSessionPayload {
  hostId: string;
  connectionType: 'direct' | 'wireguard';
}

interface SessionState {
  activeSession: Session | null;
  sessions: Session[];
  isLoading: boolean;

  fetchSessions: () => Promise<void>;
  createSession: (payload: CreateSessionPayload) => Promise<Session>;
  endSession: (sessionId?: string) => Promise<void>;
  updateActiveSession: (updates: Partial<Session>) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,
  sessions: [],
  isLoading: false,

  fetchSessions: async () => {
    set({ isLoading: true });

    try {
      const response = await apiClient.get<Session[]>('/sessions');
      set({
        sessions: response.data.sort(
          (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        ),
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      set({ isLoading: false });
      throw err;
    }
  },

  createSession: async (payload: CreateSessionPayload) => {
    try {
      const response = await apiClient.post<Session>('/sessions', payload);
      const session = response.data;

      set((state) => ({
        activeSession: session,
        sessions: [session, ...state.sessions],
      }));

      return session;
    } catch (err) {
      console.error('Failed to create session:', err);
      throw err;
    }
  },

  endSession: async (sessionId?: string) => {
    const { activeSession } = get();
    const id = sessionId || activeSession?.id;

    if (!id) {
      console.warn('No active session to end');
      return;
    }

    try {
      const response = await apiClient.patch<Session>(`/sessions/${id}`, {
        status: 'completed',
      });

      const endedSession = response.data;

      set((state) => ({
        activeSession: state.activeSession?.id === id ? null : state.activeSession,
        sessions: state.sessions.map((s) =>
          s.id === id ? endedSession : s
        ),
      }));
    } catch (err) {
      console.error('Failed to end session:', err);
      // Still clear active session locally even if API call fails
      set((state) => ({
        activeSession: state.activeSession?.id === id ? null : state.activeSession,
      }));
      throw err;
    }
  },

  updateActiveSession: (updates: Partial<Session>) => {
    set((state) => {
      if (!state.activeSession) return state;
      return {
        activeSession: { ...state.activeSession, ...updates },
      };
    });
  },
}));
