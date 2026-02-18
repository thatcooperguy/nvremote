import React from 'react';
import { colors, typography, spacing, radius, shadows } from '../styles/theme';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[NVRemote] Unhandled UI error:', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.iconWrap}>
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.semantic.error || '#EF4444'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={styles.title}>Something went wrong</h2>
          <p style={styles.message}>
            An unexpected error occurred. You can try again or reload the app.
          </p>
          {this.state.error && (
            <pre style={styles.errorDetail}>
              {this.state.error.message}
            </pre>
          )}
          <div style={styles.actions}>
            <button
              onClick={this.handleReset}
              style={styles.primaryBtn}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              Try Again
            </button>
            <button
              onClick={this.handleReload}
              style={styles.secondaryBtn}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: colors.bg.primary,
    padding: spacing.xl,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    maxWidth: 420,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.bg.surface,
    border: `1px solid ${colors.border.default}`,
    boxShadow: shadows.lg,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 1.6,
    marginBottom: spacing.md,
  },
  errorDetail: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontMono,
    color: colors.text.disabled,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: spacing.sm,
    borderRadius: radius.md,
    maxWidth: '100%',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    marginBottom: spacing.md,
    maxHeight: 100,
  },
  actions: {
    display: 'flex',
    gap: spacing.sm,
  },
  primaryBtn: {
    padding: `${spacing.sm}px ${spacing.lg}px`,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    borderRadius: radius.lg,
    border: 'none',
    backgroundColor: colors.accent.default,
    color: '#fff',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  secondaryBtn: {
    padding: `${spacing.sm}px ${spacing.lg}px`,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border.default}`,
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: colors.text.secondary,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};
