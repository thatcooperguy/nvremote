import { create } from 'zustand';
import { apiClient } from '../services/api';
import type { Host } from '../components/HostCard';
import type { HostStatus } from '../components/StatusBadge';

interface HostApiResponse {
  id: string;
  name: string;
  hostname: string;
  status: HostStatus;
  gpuModel?: string;
  gpuVram?: string;
  latencyMs?: number;
  os?: string;
  hostVersion?: string;
  ipAddress?: string;
  ports?: {
    video: number;
    audio: number;
    input: number;
  };
  accessControl?: {
    allowedUsers: string[];
    allowedOrgs: string[];
  };
}

interface HostState {
  hosts: Host[];
  selectedHost: Host | null;
  isLoading: boolean;
  error: string | null;

  fetchHosts: () => Promise<void>;
  selectHost: (host: Host | null) => void;
  updateHostStatus: (hostId: string, status: HostStatus) => void;
  updateHostLatency: (hostId: string, latencyMs: number) => void;
  renameHost: (hostId: string, name: string) => Promise<void>;
}

export const useHostStore = create<HostState>((set, get) => ({
  hosts: [],
  selectedHost: null,
  isLoading: false,
  error: null,

  fetchHosts: async () => {
    set({ isLoading: true, error: null });

    try {
      const response = await apiClient.get<HostApiResponse[]>('/hosts');
      const hosts: Host[] = response.data.map((h) => ({
        id: h.id,
        name: h.name,
        hostname: h.hostname,
        status: h.status,
        gpuModel: h.gpuModel,
        gpuVram: h.gpuVram,
        latencyMs: h.latencyMs,
        os: h.os,
        hostVersion: h.hostVersion,
      }));

      set({ hosts, isLoading: false });

      // Update selectedHost if it exists in the new data
      const { selectedHost } = get();
      if (selectedHost) {
        const updated = hosts.find((h) => h.id === selectedHost.id);
        if (updated) {
          set({ selectedHost: updated });
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch hosts';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  selectHost: (host: Host | null) => {
    set({ selectedHost: host });
  },

  updateHostStatus: (hostId: string, status: HostStatus) => {
    set((state) => ({
      hosts: state.hosts.map((h) =>
        h.id === hostId ? { ...h, status } : h
      ),
      selectedHost:
        state.selectedHost?.id === hostId
          ? { ...state.selectedHost, status }
          : state.selectedHost,
    }));
  },

  updateHostLatency: (hostId: string, latencyMs: number) => {
    set((state) => ({
      hosts: state.hosts.map((h) =>
        h.id === hostId ? { ...h, latencyMs } : h
      ),
      selectedHost:
        state.selectedHost?.id === hostId
          ? { ...state.selectedHost, latencyMs }
          : state.selectedHost,
    }));
  },

  renameHost: async (hostId: string, name: string) => {
    try {
      await apiClient.patch(`/hosts/${hostId}`, { name });
      set((state) => ({
        hosts: state.hosts.map((h) =>
          h.id === hostId ? { ...h, name } : h
        ),
        selectedHost:
          state.selectedHost?.id === hostId
            ? { ...state.selectedHost, name }
            : state.selectedHost,
      }));
    } catch (err) {
      console.error('Failed to rename host:', err);
      throw err;
    }
  },
}));
