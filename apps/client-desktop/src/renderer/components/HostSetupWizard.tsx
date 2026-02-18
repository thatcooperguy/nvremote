/**
 * HostSetupWizard.tsx — First-Run Setup Modal for Host Mode
 *
 * Three steps:
 *   1. Enter bootstrap token (with link to nvremote.com/dashboard/devices)
 *   2. Confirm hostname
 *   3. Register → show success or error
 */

import React, { useState, useCallback } from 'react';
import { colors, spacing, typography, radius } from '../styles/theme';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useHostAgentStore } from '../store/hostAgentStore';
import { toast } from '../components/Toast';

interface Props {
  onComplete: () => void;
  onCancel: () => void;
}

export function HostSetupWizard({ onComplete, onCancel }: Props): React.ReactElement {
  const [step, setStep] = useState(1);
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [hostName, setHostName] = useState('');
  const isRegistering = useHostAgentStore((s) => s.isRegistering);
  const register = useHostAgentStore((s) => s.register);
  const status = useHostAgentStore((s) => s.status);

  // Auto-detect hostname on mount.
  React.useEffect(() => {
    window.nvrs.host.getConfig().then((cfg) => {
      if (cfg.hostName) setHostName(cfg.hostName);
    }).catch(() => {});
  }, []);

  const handleNext = useCallback(() => {
    if (step === 1) {
      if (!bootstrapToken.trim()) {
        toast.error('Please enter a bootstrap token');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!hostName.trim()) {
        toast.error('Please enter a hostname');
        return;
      }
      setStep(3);
      // Trigger registration.
      register(bootstrapToken.trim(), hostName.trim())
        .then(() => {
          toast.success('Host registered successfully!');
        })
        .catch((err) => {
          toast.error((err as Error).message);
        });
    }
  }, [step, bootstrapToken, hostName, register]);

  const handleBack = useCallback(() => {
    if (step > 1) setStep(step - 1);
  }, [step]);

  return (
    <Card>
      <div style={styles.wizard}>
        {/* Progress dots */}
        <div style={styles.progress}>
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                ...styles.dot,
                backgroundColor: s <= step ? colors.accent.default : colors.bg.elevated,
              }}
            />
          ))}
        </div>

        {/* Step 1: Bootstrap Token */}
        {step === 1 && (
          <div style={styles.stepContent}>
            <h2 style={styles.stepTitle}>Enter Bootstrap Token</h2>
            <p style={styles.stepDescription}>
              Get your bootstrap token from{' '}
              <a
                href="https://nvremote.com/dashboard/devices"
                target="_blank"
                rel="noopener noreferrer"
                style={styles.link}
              >
                nvremote.com/dashboard/devices
              </a>
              . Click "Add Device" and copy the token.
            </p>
            <input
              type="text"
              value={bootstrapToken}
              onChange={(e) => setBootstrapToken(e.target.value)}
              placeholder="Paste your bootstrap token..."
              style={styles.input}
              autoFocus
            />
          </div>
        )}

        {/* Step 2: Confirm Hostname */}
        {step === 2 && (
          <div style={styles.stepContent}>
            <h2 style={styles.stepTitle}>Confirm Hostname</h2>
            <p style={styles.stepDescription}>
              This name identifies your host in the NVRemote dashboard. It's auto-detected from your system.
            </p>
            <input
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="e.g., Gaming-PC"
              style={styles.input}
              autoFocus
            />
          </div>
        )}

        {/* Step 3: Registering / Result */}
        {step === 3 && (
          <div style={styles.stepContent}>
            {isRegistering ? (
              <>
                <h2 style={styles.stepTitle}>Registering...</h2>
                <p style={styles.stepDescription}>
                  Connecting to the NVRemote control plane and registering your host.
                </p>
                <div style={styles.spinner} />
              </>
            ) : status.hostId ? (
              <>
                <h2 style={styles.stepTitle}>Registration Complete!</h2>
                <p style={styles.stepDescription}>
                  Your host has been registered and is ready to accept connections.
                </p>
                <div style={styles.resultGrid}>
                  <ResultItem label="Host ID" value={status.hostId} />
                  <ResultItem label="GPU" value={status.gpuModel || 'Detecting...'} />
                </div>
              </>
            ) : (
              <>
                <h2 style={styles.stepTitle}>Registration Failed</h2>
                <p style={{ ...styles.stepDescription, color: '#EF4444' }}>
                  {status.error || 'An error occurred. Please check your token and try again.'}
                </p>
              </>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div style={styles.actions}>
          {step < 3 ? (
            <>
              <Button variant="secondary" size="sm" onClick={step === 1 ? onCancel : handleBack}>
                {step === 1 ? 'Cancel' : 'Back'}
              </Button>
              <Button size="sm" onClick={handleNext}>
                {step === 2 ? 'Register' : 'Next'}
              </Button>
            </>
          ) : (
            <>
              {!isRegistering && !status.hostId && (
                <Button variant="secondary" size="sm" onClick={() => setStep(1)}>
                  Try Again
                </Button>
              )}
              {!isRegistering && status.hostId && (
                <Button size="sm" onClick={onComplete}>
                  Done
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function ResultItem({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={styles.resultItem}>
      <span style={styles.resultLabel}>{label}</span>
      <span style={styles.resultValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wizard: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    padding: spacing.md,
  },
  progress: {
    display: 'flex',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    transition: 'background-color 200ms ease',
  },
  stepContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.md,
    textAlign: 'center',
    minHeight: 180,
  },
  stepTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  stepDescription: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    margin: 0,
    maxWidth: 450,
    lineHeight: 1.5,
  },
  link: {
    color: colors.accent.default,
    textDecoration: 'none',
  },
  input: {
    width: '100%',
    maxWidth: 400,
    height: 40,
    padding: `0 ${spacing.md}px`,
    backgroundColor: colors.bg.elevated,
    color: colors.text.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    fontSize: typography.fontSize.md,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    outline: 'none',
  },
  spinner: {
    width: 32,
    height: 32,
    border: `3px solid ${colors.border.default}`,
    borderTopColor: colors.accent.default,
    borderRadius: '50%',
    animation: 'spin 800ms linear infinite',
  },
  resultGrid: {
    display: 'flex',
    gap: spacing.xl,
  },
  resultItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  resultValue: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTop: `1px solid ${colors.border.default}`,
  },
};
