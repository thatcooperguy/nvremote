import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { App } from './App';
import './styles/globals.css';

// ---------------------------------------------------------------------------
// Sentry — crash & error reporting (renderer process)
// ---------------------------------------------------------------------------
// The DSN is injected via the main process or build-time env var.
// If not present, Sentry is silently disabled (safe for dev).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = window as any;

Sentry.init({
  dsn: win.__SENTRY_DSN__ || '',
  release: `nvremote-client@${win.__APP_VERSION__ || 'dev'}`,
  environment: win.__APP_PACKAGED__ ? 'production' : 'development',
  enabled: !!win.__SENTRY_DSN__,
  tracesSampleRate: 0.1,
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
  // Ignore common noisy errors from Electron renderer
  ignoreErrors: [
    'ResizeObserver loop',
    'Non-Error promise rejection',
    /Loading chunk \d+ failed/,
  ],
});

// ---------------------------------------------------------------------------
// Sentry Error Boundary fallback UI
// ---------------------------------------------------------------------------
function SentryFallback({ error, resetError }: { error: unknown; resetError: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#1A1A1A', color: '#fff', fontFamily: 'system-ui',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8 }}>
          Something went wrong
        </h2>
        <p style={{ color: '#999', fontSize: '0.875rem', marginBottom: 24, lineHeight: 1.6 }}>
          An unexpected error occurred. This has been reported automatically.
        </p>
        <button
          onClick={resetError}
          style={{
            padding: '10px 20px', fontSize: '0.875rem', fontWeight: 600,
            borderRadius: 8, border: 'none', backgroundColor: '#76B900',
            color: '#fff', cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found. Ensure index.html contains a <div id="root">.');
}

// HashRouter is required for Electron production builds where the renderer
// loads from a file:// URL. BrowserRouter relies on HTML5 pushState which
// doesn't work with the file:// protocol.
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={({ error, resetError }) =>
      <SentryFallback error={error} resetError={resetError} />
    }>
      <HashRouter>
        <App />
      </HashRouter>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
