/**
 * Sentry client-side configuration for the Next.js website.
 *
 * This captures:
 * - Unhandled JavaScript errors in the browser
 * - Performance traces for page loads and navigations
 *
 * Set NEXT_PUBLIC_SENTRY_DSN in your environment to enable.
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,
});
