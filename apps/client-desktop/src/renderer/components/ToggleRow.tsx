import React from 'react';
import { colors, spacing, typography } from '../styles/theme';

export interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleRow({ label, description, checked, onChange, disabled }: ToggleRowProps): React.ReactElement {
  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <span style={{
          ...styles.settingLabel,
          ...(disabled ? { color: colors.text.disabled } : {}),
        }}>{label}</span>
        <span style={styles.settingDescription}>{description}</span>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          ...styles.toggle,
          backgroundColor: checked ? colors.accent.default : colors.bg.elevated,
          ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        }}
      >
        <div
          style={{
            ...styles.toggleKnob,
            transform: checked ? 'translateX(18px)' : 'translateX(2px)',
          }}
        />
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${spacing.sm}px 0`,
  },
  settingInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    marginRight: spacing.md,
  },
  settingLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  settingDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'background-color 200ms ease',
    position: 'relative',
    flexShrink: 0,
    outline: 'none',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    top: 2,
    transition: 'transform 200ms ease',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
};
