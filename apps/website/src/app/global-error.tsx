'use client';

import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Report to Sentry on mount — can't use useEffect in global-error
  // because it renders outside the React tree, but Sentry's client SDK
  // will pick up the error through its global handlers. We explicitly
  // capture here as a safety net.
  if (typeof window !== 'undefined') {
    Sentry.captureException(error, {
      tags: { boundary: 'global-error.tsx' },
      extra: { digest: error.digest },
    });
  }

  return (
    <html>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', backgroundColor: '#fff' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <h2
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#111',
                marginBottom: 12,
              }}
            >
              Something went wrong
            </h2>
            <p style={{ color: '#666', marginBottom: 24, lineHeight: 1.6 }}>
              A critical error occurred. Please try reloading the page.
            </p>
            <button
              onClick={reset}
              style={{
                padding: '12px 24px',
                fontSize: '0.875rem',
                fontWeight: 600,
                borderRadius: 12,
                border: 'none',
                backgroundColor: '#76B900',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
