import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '../store/authStore';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

/**
 * Shared Axios client with automatic JWT attachment and 401 token refresh.
 *
 * Tokens are sourced from two locations:
 *  1. The in-memory authStore (localStorage-backed, populated on app start).
 *  2. The main-process encrypted store via `window.nvrs.auth.getTokens()`.
 *
 * The authStore is the primary source because it lives in-process and avoids
 * an IPC round-trip on every request. The IPC path is used as a fallback and
 * during the 401 refresh flow to persist new tokens securely.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ---------------------------------------------------------------------------
// Concurrent-refresh guard
// ---------------------------------------------------------------------------

let isRefreshing = false;
let pendingRequests: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

function processPendingRequests(
  token: string | null,
  error: Error | null
): void {
  for (const req of pendingRequests) {
    if (token) {
      req.resolve(token);
    } else {
      req.reject(error || new Error('Token refresh failed'));
    }
  }
  pendingRequests = [];
}

// ---------------------------------------------------------------------------
// Request interceptor -- attach JWT
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Prefer the in-memory store for speed.
    let accessToken = useAuthStore.getState().tokens?.accessToken;

    // Fall back to the encrypted IPC store if in-memory token is absent.
    if (!accessToken && window.nvrs?.auth?.getTokens) {
      try {
        const ipcTokens = await window.nvrs.auth.getTokens();
        if (ipcTokens?.access) {
          accessToken = ipcTokens.access;
        }
      } catch {
        // IPC may not be ready yet during app startup; proceed without token.
      }
    }

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Response interceptor -- auto-refresh on 401
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Only attempt refresh on 401 and only once per request.
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // If another refresh is already in flight, queue this request.
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        pendingRequests.push({ resolve, reject });
      })
        .then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    isRefreshing = true;

    try {
      const refreshed = await useAuthStore.getState().refreshToken();

      if (refreshed) {
        const newAccessToken = useAuthStore.getState().tokens?.accessToken;

        if (newAccessToken) {
          // Persist the refreshed tokens into the encrypted main-process store.
          const refreshToken =
            useAuthStore.getState().tokens?.refreshToken ?? '';
          window.nvrs?.auth
            ?.setTokens({ access: newAccessToken, refresh: refreshToken })
            .catch(() => {
              // Best-effort persist
            });

          processPendingRequests(newAccessToken, null);
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return apiClient(originalRequest);
        }
      }

      // Refresh failed -- force logout.
      processPendingRequests(null, new Error('Token refresh failed'));
      await useAuthStore.getState().logout();
      return Promise.reject(error);
    } catch (refreshError) {
      const refreshErr =
        refreshError instanceof Error
          ? refreshError
          : new Error('Token refresh failed');
      processPendingRequests(null, refreshErr);
      await useAuthStore.getState().logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

// ---------------------------------------------------------------------------
// Typed API helpers for all resource endpoints
// ---------------------------------------------------------------------------

export const api = {
  auth: {
    me: () => apiClient.get('/auth/me'),
    refresh: (refreshToken: string) =>
      apiClient.post('/auth/refresh', { refreshToken }),
  },

  hosts: {
    list: () => apiClient.get('/hosts'),
    get: (id: string) => apiClient.get(`/hosts/${id}`),
    connect: (id: string, payload: { clientPublicKey: string }) =>
      apiClient.post(`/hosts/${id}/connect`, payload),
    disconnect: (id: string) => apiClient.post(`/hosts/${id}/disconnect`),
    ping: (id: string) => apiClient.get(`/hosts/${id}/ping`),
  },

  sessions: {
    list: () => apiClient.get('/sessions'),
    get: (id: string) => apiClient.get(`/sessions/${id}`),
    create: (payload: { hostId: string; connectionType: string }) =>
      apiClient.post('/sessions', payload),
    end: (id: string) =>
      apiClient.patch(`/sessions/${id}`, { status: 'completed' }),
  },

  orgs: {
    list: () => apiClient.get('/orgs'),
    get: (id: string) => apiClient.get(`/orgs/${id}`),
    members: (id: string) => apiClient.get(`/orgs/${id}/members`),
  },

  settings: {
    get: () => apiClient.get('/settings'),
    update: (settings: Record<string, unknown>) =>
      apiClient.patch('/settings', settings),
  },
} as const;
