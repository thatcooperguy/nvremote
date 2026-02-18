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
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found. Ensure index.html contains a <div id="root">.');
}

// HashRouter is required for Electron production builds where the renderer
// loads from a file:// URL. BrowserRouter relies on HTML5 pushState which
// doesn't work with the file:// protocol.
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
