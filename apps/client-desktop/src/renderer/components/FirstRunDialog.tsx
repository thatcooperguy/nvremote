/**
 * FirstRunDialog.tsx — Guided first-run mode selection dialog.
 *
 * Shown after first sign-in when mode is unset. Lets user choose:
 * - "Stream FROM this PC" → Host mode
 * - "Stream TO this PC" → Client mode
 * - "Both (Advanced)" → Both mode
 */

import React, { useState, useCallback } from 'react';
import { colors, spacing, typography, radius, shadows, transitions, zIndex } from '../styles/theme';
import { Button } from './Button';
import { useHostAgentStore } from '../store/hostAgentStore';
import { toast } from './Toast';

interface FirstRunDialogProps {
  open: boolean;
  onComplete: () => void;
}

type ModeChoice = 'host' | 'client' | 'both' | null;

export function FirstRunDialog({ open, onComplete }: FirstRunDialogProps): React.ReactElement | null {
  const setMode = useHostAgentStore((s) => s.setMode);
  const [selected, setSelected] = useState<ModeChoice>(null);
  const [saving, setSaving] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await setMode(selected);
      toast.success(`Mode set to ${selected}`);
      onComplete();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [selected, setMode, onComplete]);

  if (!open) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.dialog}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="10" fill={colors.accent.default} />
              <text
                x="20"
                y="27"
                textAnchor="middle"
                fill="white"
                fontSize="18"
                fontWeight="bold"
                fontFamily={typography.fontFamily}
              >
                NV
              </text>
            </svg>
          </div>
          <h2 style={styles.title}>Welcome to NVRemote</h2>
          <p style={styles.subtitle}>
            How will you use this PC? You can change this later in Settings.
          </p>
        </div>

        {/* Mode Choices */}
        <div style={styles.choices}>
          <ModeCard
            mode="host"
            title="Stream FROM this PC"
            description="Share your GPU and desktop with remote devices"
            icon={<HostModeIcon />}
            selected={selected === 'host'}
            onClick={() => setSelected('host')}
          />
          <ModeCard
            mode="client"
            title="Stream TO this PC"
            description="Connect to a remote host and view its desktop"
            icon={<ClientModeIcon />}
            selected={selected === 'client'}
            onClick={() => setSelected('client')}
          />
          <ModeCard
            mode="both"
            title="Both (Advanced)"
            description="This PC can host and connect to other hosts"
            icon={<BothModeIcon />}
            selected={selected === 'both'}
            onClick={() => setSelected('both')}
          />
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <Button
            onClick={handleConfirm}
            disabled={!selected}
            loading={saving}
            fullWidth
            size="lg"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModeCard({
  mode,
  title,
  description,
  icon,
  selected,
  onClick,
}: {
  mode: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...styles.modeCard,
        borderColor: selected ? colors.accent.default : isHovered ? colors.border.hover : colors.border.default,
        backgroundColor: selected ? `${colors.accent.default}10` : isHovered ? `${colors.text.primary}05` : 'transparent',
        boxShadow: selected ? `0 0 16px ${colors.accent.default}15` : 'none',
      }}
    >
      <div style={styles.modeIcon}>{icon}</div>
      <div style={styles.modeInfo}>
        <span style={{ ...styles.modeTitle, color: selected ? colors.accent.default : colors.text.primary }}>
          {title}
        </span>
        <span style={styles.modeDescription}>{description}</span>
      </div>
      <div
        style={{
          ...styles.radio,
          borderColor: selected ? colors.accent.default : colors.border.default,
          backgroundColor: selected ? colors.accent.default : 'transparent',
        }}
      >
        {selected && (
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </button>
  );
}

function HostModeIcon(): React.ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="12" rx="2" stroke={colors.accent.default} strokeWidth="1.5" />
      <path d="M12 16V20M8 20H16" stroke={colors.accent.default} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 8V12M12 12L9 10M12 12L15 10" stroke={colors.accent.default} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClientModeIcon(): React.ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="2" width="14" height="20" rx="3" stroke={colors.accent.default} strokeWidth="1.5" />
      <circle cx="12" cy="18" r="1" fill={colors.accent.default} />
      <path d="M9 10L12 7L15 10" stroke={colors.accent.default} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7V13" stroke={colors.accent.default} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function BothModeIcon(): React.ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="5" width="10" height="7" rx="1.5" stroke={colors.accent.default} strokeWidth="1.3" />
      <rect x="12" y="12" width="10" height="7" rx="1.5" stroke={colors.accent.default} strokeWidth="1.3" />
      <path d="M12 8.5H15L13 6.5M12 15.5H9L11 17.5" stroke={colors.accent.default} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: zIndex.modal,
    animation: 'fadeIn 200ms ease',
    backdropFilter: 'blur(4px)',
  },
  dialog: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: colors.bg.elevated,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.xl,
    boxShadow: shadows.lg,
    animation: 'scaleIn 250ms ease',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xl}px ${spacing.lg}px ${spacing.md}px`,
    textAlign: 'center',
  },
  logo: {
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    margin: 0,
  },
  choices: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: `0 ${spacing.lg}px`,
  },
  modeCard: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.md}px`,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.lg,
    background: 'transparent',
    cursor: 'pointer',
    outline: 'none',
    fontFamily: typography.fontFamily,
    transition: `all ${transitions.fast}`,
    textAlign: 'left',
    width: '100%',
  },
  modeIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accent.muted,
    flexShrink: 0,
  },
  modeInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
  },
  modeTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  modeDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: `2px solid ${colors.border.default}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: `all ${transitions.fast}`,
  },
  actions: {
    padding: `${spacing.lg}px`,
  },
};
