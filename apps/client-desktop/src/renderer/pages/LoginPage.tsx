import React, { useState, useCallback, useEffect, useRef } from 'react';
import { colors, radius, shadows, spacing, typography, transitions } from '../styles/theme';
import { Button } from '../components/Button';
import { useAuthStore } from '../store/authStore';
import { toast } from '../components/Toast';

const APP_VERSION = '0.5.1-beta';
const SIGN_IN_TIMEOUT = 30000; // 30s

type LoginStep = 'idle' | 'opening' | 'waiting' | 'completing';

const stepLabels: Record<LoginStep, string> = {
  idle: 'Sign in with Google',
  opening: 'Opening browser...',
  waiting: 'Waiting for sign-in...',
  completing: 'Completing...',
};

export function LoginPage(): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [loginStep, setLoginStep] = useState<LoginStep>('idle');
  const [timedOut, setTimedOut] = useState(false);
  const [versionHovered, setVersionHovered] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const login = useAuthStore((s) => s.login);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    };
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    setLoading(true);
    setTimedOut(false);
    setLoginStep('opening');

    // Progress through steps for visual feedback
    stepTimerRef.current = setTimeout(() => setLoginStep('waiting'), 2000);

    try {
      const result = await window.nvrs.auth.googleSignIn();
      if (!result.success) {
        toast.error(result.error || 'Failed to initiate sign-in');
        setLoading(false);
        setLoginStep('idle');
        return;
      }
      // The actual auth callback will come through the deep link handler.
      // We keep loading state until that fires or a timeout is reached.
      timeoutRef.current = setTimeout(() => {
        setLoading(false);
        setLoginStep('idle');
        setTimedOut(true);
      }, SIGN_IN_TIMEOUT);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      toast.error(message);
      setLoading(false);
      setLoginStep('idle');
    }
  }, [login]);

  // Enter key triggers sign-in
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !loading) {
        handleGoogleSignIn();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleGoogleSignIn, loading]);

  return (
    <div style={styles.page}>
      {/* Background decoration */}
      <div style={styles.bgGlow} />

      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoSection}>
          <NVRemoteLogo />
          <h1 style={styles.title}>NVRemote</h1>
          <p style={styles.subtitle}>
            Stream your GPU desktop anywhere. Low-latency,
            <br />
            secure, peer-to-peer.
          </p>
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
            {stepLabels[loginStep]}
          </Button>

          {/* Step progress indicator */}
          {loading && (
            <div style={styles.progressSteps}>
              <StepDot active={loginStep === 'opening' || loginStep === 'waiting' || loginStep === 'completing'} />
              <StepDot active={loginStep === 'waiting' || loginStep === 'completing'} />
              <StepDot active={loginStep === 'completing'} />
            </div>
          )}

          <p style={styles.signInHint}>
            {loading
              ? 'Complete sign-in in your browser, then return here.'
              : timedOut
              ? "Browser didn't open? Click to retry."
              : 'Use your Google account to continue'}
          </p>

          {/* Timeout retry prompt */}
          {timedOut && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGoogleSignIn}
            >
              Try Again
            </Button>
          )}
        </div>

        {/* Feature bullets */}
        <div style={styles.features}>
          <FeatureItem icon={<StreamIcon />} text="Stream any game or desktop" />
          <FeatureItem icon={<P2PIcon />} text="Peer-to-peer, encrypted end-to-end" />
          <FeatureItem icon={<GPUIcon />} text="NVIDIA NVENC hardware encoding" />
        </div>
      </div>

      {/* Version */}
      <span
        style={{
          ...styles.version,
          opacity: versionHovered ? 1 : 0.5,
        }}
        onMouseEnter={() => setVersionHovered(true)}
        onMouseLeave={() => setVersionHovered(false)}
      >
        v{APP_VERSION}
      </span>
    </div>
  );
}

function StepDot({ active }: { active: boolean }): React.ReactElement {
  return (
    <div
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        backgroundColor: active ? colors.accent.default : colors.border.default,
        transition: 'background-color 300ms ease',
      }}
    />
  );
}

function FeatureItem({ icon, text }: { icon: React.ReactNode; text: string }): React.ReactElement {
  return (
    <div style={styles.featureItem}>
      <span style={styles.featureIcon}>{icon}</span>
      <span style={styles.featureText}>{text}</span>
    </div>
  );
}

function NVRemoteLogo(): React.ReactElement {
  return (
    <div style={styles.logoContainer}>
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
        <rect width="72" height="72" rx="18" fill={colors.accent.default} />
        <text
          x="36"
          y="48"
          textAnchor="middle"
          fill="white"
          fontSize="32"
          fontWeight="bold"
          fontFamily={typography.fontFamily}
        >
          NV
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

function StreamIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="2" stroke={colors.accent.default} strokeWidth="1.3" />
      <path d="M6.5 6L10.5 8L6.5 10V6Z" fill={colors.accent.default} />
    </svg>
  );
}

function P2PIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="8" r="2.5" stroke={colors.accent.default} strokeWidth="1.3" />
      <circle cx="12" cy="8" r="2.5" stroke={colors.accent.default} strokeWidth="1.3" />
      <path d="M6.5 8H9.5" stroke={colors.accent.default} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function GPUIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="4" width="14" height="8" rx="1.5" stroke={colors.accent.default} strokeWidth="1.3" />
      <rect x="3" y="6" width="3" height="4" rx="0.5" fill={colors.accent.default} opacity="0.5" />
      <rect x="7" y="6" width="3" height="4" rx="0.5" fill={colors.accent.default} opacity="0.5" />
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
    overflow: 'hidden',
  },
  bgGlow: {
    position: 'absolute',
    top: '-30%',
    left: '50%',
    width: 600,
    height: 600,
    borderRadius: '50%',
    background: `radial-gradient(circle, rgba(118, 185, 0, 0.06) 0%, transparent 70%)`,
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    padding: spacing['2xl'],
    backgroundColor: colors.bg.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.xl,
    boxShadow: `${shadows.lg}, 0 0 80px rgba(118, 185, 0, 0.04)`,
    animation: 'slideUp 400ms ease',
    zIndex: 1,
  },
  logoSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoContainer: {
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 28,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
    textAlign: 'center',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    margin: 0,
    textAlign: 'center',
    lineHeight: 1.5,
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
    gap: spacing.sm,
    width: '100%',
  },
  signInHint: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    margin: 0,
    textAlign: 'center',
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTop: `1px solid ${colors.border.default}`,
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  featureIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: radius.md,
    backgroundColor: colors.accent.muted,
    flexShrink: 0,
  },
  featureText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  progressSteps: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  version: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.lg,
    fontSize: 12,
    color: colors.text.disabled,
    zIndex: 1,
    transition: 'opacity 200ms ease',
    cursor: 'default',
  },
};
