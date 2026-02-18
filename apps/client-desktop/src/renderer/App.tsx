import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { Toast } from './components/Toast';
import { ConnectionOverlay } from './components/ConnectionOverlay';
import { StreamView } from './components/StreamView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { HostDetailPage } from './pages/HostDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { SessionsPage } from './pages/SessionsPage';
import { HostPage } from './pages/HostPage';
import { ClientPage } from './pages/ClientPage';
import { DevicesPage } from './pages/DevicesPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { useAuthStore } from './store/authStore';
import { useConnectionStore } from './store/connectionStore';
import { useHostAgentStore } from './store/hostAgentStore';
import { FirstRunDialog } from './components/FirstRunDialog';
import { colors, spacing, typography } from './styles/theme';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps): React.ReactElement {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function OfflineBanner(): React.ReactElement | null {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div style={styles.offlineBanner}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <span>You&apos;re offline. Some features may be unavailable.</span>
    </div>
  );
}

function AuthenticatedLayout(): React.ReactElement {
  const navigate = useNavigate();
  const [showShortcuts, setShowShortcuts] = useState(false);

  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // ? to show shortcuts help
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }

      // Ctrl+D → Dashboard
      if (e.key === 'd' && e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        navigate('/dashboard');
        return;
      }

      // Ctrl+S → Sessions (only when not streaming)
      if (e.key === 's' && e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        navigate('/sessions');
        return;
      }

      // Ctrl+E → Diagnostics
      if (e.key === 'e' && e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        navigate('/diagnostics');
        return;
      }

      // Ctrl+, → Settings
      if (e.key === ',' && e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        navigate('/settings');
        return;
      }
    },
    [navigate]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  return (
    <div style={styles.authenticatedLayout}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <OfflineBanner />
        <main style={styles.mainContent}>
          <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/hosts/:id" element={<HostDetailPage />} />
          <Route path="/host" element={<HostPage />} />
          <Route path="/client" element={<ClientPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
        <StatusBar />
      </div>
      <KeyboardShortcutsModal
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  );
}

export function App(): React.ReactElement {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const connectionStatus = useConnectionStore((state) => state.status);
  const config = useHostAgentStore((state) => state.config);

  const [firstRunDismissed, setFirstRunDismissed] = useState(false);

  // Show first-run dialog when authenticated but mode is not yet set
  const showFirstRun = isAuthenticated && config && !config.mode && !firstRunDismissed;

  const isStreaming = connectionStatus === 'streaming' || connectionStatus === 'reconnecting';
  const isConnecting =
    connectionStatus === 'requesting' ||
    connectionStatus === 'signaling' ||
    connectionStatus === 'ice-gathering' ||
    connectionStatus === 'connecting';

  return (
    <ErrorBoundary>
      <div style={styles.app}>
        <TopBar />
        <div style={styles.content}>
          <Routes>
            <Route
              path="/"
              element={
                isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />
              }
            />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
        {/* Full-screen stream view when actively streaming */}
        {isStreaming && <StreamView />}
        {/* Connection overlay shown during the connecting phase */}
        {isConnecting && <ConnectionOverlay />}
        {/* First-run guided setup */}
        <FirstRunDialog
          open={!!showFirstRun}
          onComplete={() => setFirstRunDismissed(true)}
        />
        <Toast />
      </div>
    </ErrorBoundary>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  authenticatedLayout: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  mainContent: {
    flex: 1,
    overflow: 'auto',
    padding: spacing.lg,
  },
  offlineBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    backgroundColor: colors.semantic.warningBg,
    color: colors.semantic.warningText,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    flexShrink: 0,
  },
};
