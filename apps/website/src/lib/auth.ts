'use client';

// ---------------------------------------------------------------------------
// NVRemote Auth Client
//
// Handles token storage, refresh, and API authentication for the website.
// Tokens are stored in localStorage (access + refresh tokens).
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.nvremote.com';
const TOKEN_KEY = 'nvremote_tokens';
const USER_KEY = 'nvremote_user';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  isSuperAdmin?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  expiresAt?: number; // epoch ms (calculated on storage)
}

export interface AuthCallbackData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

// ---------------------------------------------------------------------------
// Token Storage
// ---------------------------------------------------------------------------

export function getStoredTokens(): AuthTokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeAuth(data: AuthCallbackData): void {
  const tokens: AuthTokens = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    expiresAt: Date.now() + data.expiresIn * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  const tokens = getStoredTokens();
  return tokens !== null && tokens.accessToken.length > 0;
}

// ---------------------------------------------------------------------------
// Token Refresh
// ---------------------------------------------------------------------------

let refreshPromise: Promise<AuthTokens> | null = null;

async function refreshAccessToken(): Promise<AuthTokens> {
  // Deduplicate concurrent refresh requests
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const tokens = getStoredTokens();
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (!res.ok) {
      clearAuth();
      throw new Error('Token refresh failed');
    }

    const data = await res.json();
    const newTokens: AuthTokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      expiresAt: Date.now() + data.expiresIn * 1000,
    };

    localStorage.setItem(TOKEN_KEY, JSON.stringify(newTokens));
    return newTokens;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// ---------------------------------------------------------------------------
// Authenticated Fetch
// ---------------------------------------------------------------------------

export async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  let tokens = getStoredTokens();

  // If token is expired or about to expire (within 60s), refresh first
  if (tokens && tokens.expiresAt && tokens.expiresAt < Date.now() + 60_000) {
    try {
      tokens = await refreshAccessToken();
    } catch {
      clearAuth();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  if (!tokens) {
    throw new Error('Not authenticated');
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokens.accessToken}`,
      ...options.headers,
    },
  });

  // If we get a 401, try refreshing once
  if (res.status === 401) {
    try {
      tokens = await refreshAccessToken();
      return fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.accessToken}`,
          ...options.headers,
        },
      });
    } catch {
      clearAuth();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  return res;
}

// ---------------------------------------------------------------------------
// OAuth URL
// ---------------------------------------------------------------------------

export function getGoogleLoginUrl(): string {
  return `${API_BASE}/api/v1/auth/google`;
}

export function getMicrosoftLoginUrl(): string {
  return `${API_BASE}/api/v1/auth/microsoft`;
}

export function getAppleLoginUrl(): string {
  return `${API_BASE}/api/v1/auth/apple`;
}

export function getDiscordLoginUrl(): string {
  return `${API_BASE}/api/v1/auth/discord`;
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export async function logout(): Promise<void> {
  const tokens = getStoredTokens();
  if (tokens?.refreshToken) {
    try {
      await fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    } catch {
      // Best-effort logout
    }
  }
  clearAuth();
}
