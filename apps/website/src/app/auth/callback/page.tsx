'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { storeAuth, type AuthCallbackData } from '@/lib/auth';

/**
 * OAuth Callback Page
 *
 * Receives the auth tokens from the API redirect via URL fragment (#data=...).
 * Fragments are never sent to the server, keeping tokens client-side only.
 * Parses the base64url-encoded JSON payload, stores tokens, and redirects
 * to the dashboard.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Parse the fragment: #data=<base64url-encoded-json>
      const hash = window.location.hash;
      if (!hash || !hash.includes('data=')) {
        setError('No authentication data received. Please try logging in again.');
        return;
      }

      const dataParam = hash.split('data=')[1];
      if (!dataParam) {
        setError('Invalid callback data. Please try logging in again.');
        return;
      }

      // Decode base64url to JSON
      const jsonStr = atob(dataParam.replace(/-/g, '+').replace(/_/g, '/'));
      const data: AuthCallbackData = JSON.parse(jsonStr);

      if (!data.accessToken || !data.refreshToken || !data.user) {
        setError('Incomplete authentication data. Please try logging in again.');
        return;
      }

      // Store tokens and user data
      storeAuth(data);

      // Clear the hash from the URL (security: remove tokens from browser history)
      window.history.replaceState(null, '', '/auth/callback');

      // Redirect to dashboard
      router.replace('/dashboard');
    } catch (err) {
      console.error('Auth callback error:', err);
      setError('Failed to process authentication. Please try logging in again.');
    }
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Authentication Failed</h1>
          <p className="text-gray-500 mb-6">{error}</p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-cs-green text-white font-medium hover:bg-cs-green-600 transition-colors"
          >
            Try Again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 border-4 border-cs-green border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
