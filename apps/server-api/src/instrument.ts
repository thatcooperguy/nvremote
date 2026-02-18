/**
 * Sentry instrumentation — must be imported before all other modules.
 *
 * This file initializes Sentry for the NestJS backend. It captures:
 * - Unhandled exceptions and promise rejections
 * - HTTP request performance traces
 * - Database query spans (via Prisma integration)
 *
 * Environment variables:
 *   SENTRY_DSN  — Sentry project DSN (required to enable)
 *   NODE_ENV    — sets Sentry environment tag
 *
 * If SENTRY_DSN is not set, Sentry is silently disabled (safe for local dev).
 */

import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.NODE_ENV || 'development',
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  integrations: [
    nodeProfilingIntegration(),
  ],
});
