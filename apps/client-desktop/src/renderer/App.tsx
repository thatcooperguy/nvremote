import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { Toast } from './components/Toast';
import { ConnectionOverlay } from './components/ConnectionOverlay';
import { StreamView } from './components/StreamView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { HostDetailPage } from './pages/HostDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { SessionsPage } from './pages/SessionsPage';
import { HostPage } from './pages/HostPage';
import { useAuthStore } from './store/authStore';
import { useConnectionStore } from './store/connectionStore';

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

function AuthenticatedLayout(): React.ReactElement {
  return (
    <div style={styles.authenticatedLayout}>
      <Sidebar />
      <main style={styles.mainContent}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/hosts/:id" element={<HostDetailPage />} />
          <Route path="/host" element={<HostPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App(): React.ReactElement {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const connectionStatus = useConnectionStore((state) => state.status);

  const isStreaming = connectionStatus === 'streaming' || connectionStatus === 'reconnecting';
  const isConnecting =
    connectionStatus === 'requesting' ||
    connectionStatus === 'signaling' ||
    connectionStatus === 'ice-gathering' ||
    connectionStatus === 'connecting';

  return (
    <ErrorBoundary>
      <div style={styles.app}>
        <TitleBar />
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
    padding: '24px',
  },
};
