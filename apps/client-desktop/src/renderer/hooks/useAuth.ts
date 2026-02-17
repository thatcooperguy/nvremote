import { useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { connectSocket, disconnectSocket } from '../services/socket';
import { toast } from '../components/Toast';

/**
 * Auth hook that manages authentication state, listens for auth callbacks
 * from deep links, and handles socket connection lifecycle.
 */
export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const tokens = useAuthStore((s) => s.tokens);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);

  // Listen for auth callback from deep link (after Google OAuth redirect)
  useEffect(() => {
    const cleanup = window.nvrs.auth.onAuthCallback(async (data) => {
      try {
        await login(data.token, data.refreshToken || '');
        toast.success('Signed in successfully');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sign-in failed';
        toast.error(message);
      }
    });

    return cleanup;
  }, [login]);

  // Manage socket connection based on auth state
  useEffect(() => {
    if (isAuthenticated && tokens?.accessToken) {
      connectSocket();
    } else {
      disconnectSocket();
    }

    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated, tokens?.accessToken]);

  // Set up proactive token refresh
  useEffect(() => {
    if (!tokens?.expiresAt) return;

    const now = Date.now();
    const expiresAt = tokens.expiresAt;
    // Refresh 5 minutes before expiry
    const refreshTime = expiresAt - 5 * 60 * 1000;
    const delay = Math.max(refreshTime - now, 0);

    if (delay <= 0) {
      // Token already expired or about to expire - refresh now
      useAuthStore.getState().refreshToken();
      return;
    }

    const timer = setTimeout(() => {
      useAuthStore.getState().refreshToken();
    }, delay);

    return () => clearTimeout(timer);
  }, [tokens?.expiresAt]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const result = await window.nvrs.auth.googleSignIn();
      if (!result.success) {
        toast.error(result.error || 'Failed to open sign-in page');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      toast.error(message);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
      toast.info('Signed out');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-out failed';
      toast.error(message);
    }
  }, [logout]);

  return {
    user,
    tokens,
    isAuthenticated,
    isLoading,
    signInWithGoogle,
    signOut,
  };
}
