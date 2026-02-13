import React, { useState, useCallback } from 'react';
import { colors, radius, spacing, typography, shadows, transitions } from '../styles/theme';
import type { GamingMode } from '../store/connectionStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GamingModeOption {
  mode: GamingMode;
  label: string;
  icon: string;
  description: string;
  specs: string;
}

interface GamingModeSelectorProps {
  value: GamingMode;
  onChange: (mode: GamingMode) => void;
  /** Compact mode for use inside StreamControls */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------

const MODES: GamingModeOption[] = [
  {
    mode: 'competitive',
    label: 'Competitive',
    icon: '\u26A1', // lightning bolt
    description: 'Max FPS, lowest latency',
    specs: 'Up to 240fps',
  },
  {
    mode: 'balanced',
    label: 'Balanced',
    icon: '\u2696\uFE0F', // balance scale
    description: 'Best of both',
    specs: '1440p @ 120fps',
  },
  {
    mode: 'cinematic',
    label: 'Cinematic',
    icon: '\uD83C\uDFAC', // clapper board
    description: 'Max quality',
    specs: 'Up to 4K @ 60fps',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GamingModeSelector({
  value,
  onChange,
  compact = false,
}: GamingModeSelectorProps): React.ReactElement {
  const [hoveredMode, setHoveredMode] = useState<GamingMode | null>(null);

  const handleSelect = useCallback(
    (mode: GamingMode) => {
      onChange(mode);
    },
    [onChange]
  );

  if (compact) {
    return (
      <div style={compactStyles.container}>
        {MODES.map((m) => {
          const isSelected = value === m.mode;
          const isHovered = hoveredMode === m.mode;

          return (
            <button
              key={m.mode}
              onClick={() => handleSelect(m.mode)}
              onMouseEnter={() => setHoveredMode(m.mode)}
              onMouseLeave={() => setHoveredMode(null)}
              style={{
                ...compactStyles.button,
                ...(isSelected ? compactStyles.buttonSelected : {}),
                ...(isHovered && !isSelected ? compactStyles.buttonHover : {}),
              }}
              title={`${m.label}: ${m.description} -- ${m.specs}`}
            >
              <span style={compactStyles.icon}>{m.icon}</span>
              <span style={compactStyles.label}>{m.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={cardStyles.container}>
      {MODES.map((m) => {
        const isSelected = value === m.mode;
        const isHovered = hoveredMode === m.mode;

        return (
          <button
            key={m.mode}
            onClick={() => handleSelect(m.mode)}
            onMouseEnter={() => setHoveredMode(m.mode)}
            onMouseLeave={() => setHoveredMode(null)}
            style={{
              ...cardStyles.card,
              ...(isSelected ? cardStyles.cardSelected : {}),
              ...(isHovered && !isSelected ? cardStyles.cardHover : {}),
            }}
          >
            <span style={cardStyles.icon}>{m.icon}</span>
            <div style={cardStyles.textGroup}>
              <span
                style={{
                  ...cardStyles.label,
                  color: isSelected ? colors.accent.default : colors.text.primary,
                }}
              >
                {m.label}
              </span>
              <span style={cardStyles.description}>{m.description}</span>
              <span style={cardStyles.specs}>{m.specs}</span>
            </div>
            {isSelected && (
              <div style={cardStyles.checkmark}>
                <CheckIcon />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Check icon for selected state
// ---------------------------------------------------------------------------

function CheckIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8L6.5 11.5L13 5"
        stroke={colors.accent.default}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Card-style styles (full mode)
// ---------------------------------------------------------------------------

const cardStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    gap: spacing.md,
    width: '100%',
  },
  card: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.bg.surface,
    border: `2px solid ${colors.border.default}`,
    borderRadius: radius.lg,
    cursor: 'pointer',
    transition: `all ${transitions.normal}`,
    outline: 'none',
    position: 'relative',
    fontFamily: typography.fontFamily,
  },
  cardSelected: {
    borderColor: colors.accent.default,
    backgroundColor: colors.accent.muted,
    boxShadow: shadows.glow,
  },
  cardHover: {
    borderColor: colors.border.hover,
    backgroundColor: colors.bg.elevated,
    transform: 'translateY(-2px)',
    boxShadow: shadows.md,
  },
  icon: {
    fontSize: 28,
    lineHeight: 1,
  },
  textGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    transition: `color ${transitions.fast}`,
  },
  description: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  specs: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    fontFamily: typography.fontMono,
    marginTop: 4,
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
};

// ---------------------------------------------------------------------------
// Compact styles (for StreamControls HUD)
// ---------------------------------------------------------------------------

const compactStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: radius.md,
    padding: 3,
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: radius.sm,
    cursor: 'pointer',
    transition: `all ${transitions.fast}`,
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily,
    fontWeight: typography.fontWeight.medium,
    outline: 'none',
    whiteSpace: 'nowrap',
  },
  buttonSelected: {
    backgroundColor: colors.accent.default,
    color: '#FFFFFF',
  },
  buttonHover: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: colors.text.primary,
  },
  icon: {
    fontSize: 12,
    lineHeight: 1,
  },
  label: {
    lineHeight: 1,
  },
};
