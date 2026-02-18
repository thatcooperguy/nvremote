import React, { useState, useCallback } from 'react';
import { colors, radius, shadows, spacing, typography } from '../styles/theme';
import { Button } from '../components/Button';
import { useAuthStore } from '../store/authStore';
import { toast } from '../components/Toast';

const APP_VERSION = '0.5.1-beta';

export function LoginPage(): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleGoogleSignIn = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.nvrs.auth.googleSignIn();
      if (!result.success) {
        toast.error(result.error || 'Failed to initiate sign-in');
      }
      // The actual auth callback will come through the deep link handler.
      // We keep loading state until that fires or a timeout is reached.
      setTimeout(() => setLoading(false), 30000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      toast.error(message);
      setLoading(false);
    }
  }, [login]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoSection}>
          <NvidiaLogo />
          <h1 style={styles.title}>NVIDIA Remote Stream</h1>
          <p style={styles.subtitle}>Secure, low-latency remote streaming</p>
        </div>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Sign-in */}
        <div style={styles.signInSection}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleGoogleSignIn}
            loading={loading}
          >
            <GoogleIcon />
            Sign in with Google
          </Button>
          <p style={styles.signInHint}>
            Use your organization Google account to continue
          </p>
        </div>
      </div>

      {/* Version */}
      <span style={styles.version}>v{APP_VERSION}</span>
    </div>
  );
}

function NvidiaLogo(): React.ReactElement {
  return (
    <div style={styles.logoContainer}>
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect width="64" height="64" rx="16" fill={colors.accent.default} />
        <text
          x="32"
          y="44"
          textAnchor="middle"
          fill="white"
          fontSize="36"
          fontWeight="bold"
          fontFamily={typography.fontFamily}
        >
          N
        </text>
      </svg>
    </div>
  );
}

function GoogleIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    backgroundColor: colors.bg.primary,
    padding: spacing.xl,
    position: 'relative',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    padding: spacing['2xl'],
    backgroundColor: colors.bg.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.xl,
    boxShadow: shadows.lg,
    animation: 'slideUp 400ms ease',
  },
  logoSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoContainer: {
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    margin: 0,
    textAlign: 'center',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border.default,
    margin: `${spacing.lg}px 0`,
  },
  signInSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
  },
  signInHint: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    margin: 0,
    textAlign: 'center',
  },
  version: {
    position: 'absolute',
    bottom: spacing.md,
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
  },
};
