/**
 * Sentry server-side configuration for the Next.js website.
 *
 * This captures:
 * - Server-side rendering errors
 * - API route errors
 * - Server component errors
 *
 * Set SENTRY_DSN in your environment to enable.
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});
