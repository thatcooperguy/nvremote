import { create } from 'zustand';
import { apiClient } from '../services/api';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  org?: string;
  role?: 'admin' | 'member';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  setUser: (user: User) => void;
  hydrate: () => void;
}

const STORAGE_KEY_TOKENS = 'nvrs:auth:tokens';
const STORAGE_KEY_USER = 'nvrs:auth:user';

function persistTokens(tokens: AuthTokens | null): void {
  try {
    if (tokens) {
      localStorage.setItem(STORAGE_KEY_TOKENS, JSON.stringify(tokens));
    } else {
      localStorage.removeItem(STORAGE_KEY_TOKENS);
    }
  } catch {
    // Storage may not be available
  }
}

function persistUser(user: User | null): void {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
  } catch {
    // Storage may not be available
  }
}

function loadTokens(): AuthTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TOKENS);
    if (raw) {
      const tokens = JSON.parse(raw) as AuthTokens;
      // Check if token is still valid (with 60s buffer)
      if (tokens.expiresAt > Date.now() + 60000) {
        return tokens;
      }
    }
  } catch {
    // Invalid data
  }
  return null;
}

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (raw) {
      return JSON.parse(raw) as User;
    }
  } catch {
    // Invalid data
  }
  return null;
}

function decodeTokenExpiry(token: string): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return Date.now() + 3600000; // Default 1h
    const decoded = JSON.parse(atob(payload));
    return (decoded.exp as number) * 1000;
  } catch {
    return Date.now() + 3600000;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (accessToken: string, refreshToken: string) => {
    const expiresAt = decodeTokenExpiry(accessToken);
    const tokens: AuthTokens = { accessToken, refreshToken, expiresAt };

    set({ tokens, isAuthenticated: true, isLoading: true });
    persistTokens(tokens);

    try {
      const response = await apiClient.get<User>('/auth/me');
      const user = response.data;
      set({ user, isLoading: false });
      persistUser(user);
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await window.nvrs.auth.logout();
    } catch {
      // Continue logout even if IPC fails
    }

    set({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
    });
    persistTokens(null);
    persistUser(null);
  },

  refreshToken: async () => {
    const { tokens } = get();
    if (!tokens?.refreshToken) return false;

    try {
      const response = await apiClient.post<{
        accessToken: string;
        refreshToken: string;
      }>('/auth/refresh', {
        refreshToken: tokens.refreshToken,
      });

      const newExpiresAt = decodeTokenExpiry(response.data.accessToken);
      const newTokens: AuthTokens = {
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        expiresAt: newExpiresAt,
      };

      set({ tokens: newTokens });
      persistTokens(newTokens);
      return true;
    } catch (err) {
      console.error('Token refresh failed:', err);
      // Force logout on refresh failure
      get().logout();
      return false;
    }
  },

  setUser: (user: User) => {
    set({ user });
    persistUser(user);
  },

  hydrate: () => {
    const tokens = loadTokens();
    const user = loadUser();

    if (tokens && user) {
      set({
        tokens,
        user,
        isAuthenticated: true,
      });
    }
  },
}));

// Hydrate on module load
useAuthStore.getState().hydrate();
