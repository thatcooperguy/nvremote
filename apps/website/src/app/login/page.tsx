'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated, getGoogleLoginUrl } from '@/lib/auth';

/**
 * Login Page
 *
 * Shows a clean login screen with Google OAuth sign-in.
 * If already authenticated, redirects to dashboard.
 */
export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="w-full max-w-sm mx-auto px-6">
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2.5 mb-4">
              <svg
                width="40"
                height="40"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect width="32" height="32" rx="8" fill="url(#login-logo-gradient)" />
                <path
                  d="M18.5 6L11 17.5H15.5L13.5 26L21 14.5H16.5L18.5 6Z"
                  fill="#FFFFFF"
                  stroke="#FFFFFF"
                  strokeWidth="0.5"
                  strokeLinejoin="round"
                />
                <defs>
                  <linearGradient id="login-logo-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#76B900" />
                    <stop offset="1" stopColor="#9AD411" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="text-2xl font-bold tracking-tight text-gray-900">
                NV<span className="text-nv-green">REMOTE</span>
              </span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900">Welcome back</h1>
            <p className="text-sm text-gray-500 mt-1">Sign in to manage your hosts and sessions</p>
          </div>

          {/* Google Sign-In Button */}
          <a
            href={getGoogleLoginUrl()}
            className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span className="text-sm font-medium text-gray-700">Continue with Google</span>
          </a>

          {/* Divider */}
          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              By signing in, you agree to our terms of service.
            </p>
          </div>
        </div>

        {/* Back to home */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
