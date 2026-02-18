/**
 * PresetSelector.tsx — Streaming preset buttons (Competitive / Balanced / Cinematic / Custom).
 *
 * Used in HostPage to select streaming quality profiles.
 */

import React, { useState } from 'react';
import { colors, spacing, typography, radius, transitions } from '../styles/theme';

export type StreamingPreset = 'competitive' | 'balanced' | 'cinematic' | 'custom';

interface PresetSelectorProps {
  value: StreamingPreset;
  onChange: (preset: StreamingPreset) => void;
}

const presets: { value: StreamingPreset; label: string; description: string; icon: string }[] = [
  { value: 'competitive', label: 'Competitive', description: 'Lowest latency, 120+ FPS', icon: '⚡' },
  { value: 'balanced', label: 'Balanced', description: 'Quality + latency tradeoff', icon: '⚖️' },
  { value: 'cinematic', label: 'Cinematic', description: 'Max quality, 60 FPS', icon: '🎬' },
  { value: 'custom', label: 'Custom', description: 'Manual configuration', icon: '🔧' },
];

export function PresetSelector({ value, onChange }: PresetSelectorProps): React.ReactElement {
  return (
    <div style={styles.container}>
      {presets.map((p) => (
        <PresetButton
          key={p.value}
          preset={p}
          selected={value === p.value}
          onClick={() => onChange(p.value)}
        />
      ))}
    </div>
  );
}

function PresetButton({
  preset,
  selected,
  onClick,
}: {
  preset: (typeof presets)[number];
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
        ...styles.button,
        backgroundColor: selected
          ? `${colors.accent.default}15`
          : isHovered
          ? `${colors.text.primary}08`
          : 'transparent',
        borderColor: selected ? colors.accent.default : colors.border.default,
        ...(selected ? { boxShadow: `0 0 12px ${colors.accent.default}20` } : {}),
      }}
    >
      <span style={styles.icon}>{preset.icon}</span>
      <span
        style={{
          ...styles.label,
          color: selected ? colors.accent.default : colors.text.primary,
        }}
      >
        {preset.label}
      </span>
      <span style={styles.description}>{preset.description}</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.sm,
  },
  button: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: `${spacing.md}px ${spacing.sm}px`,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    background: 'transparent',
    cursor: 'pointer',
    outline: 'none',
    fontFamily: typography.fontFamily,
    transition: `all ${transitions.fast}`,
  },
  icon: {
    fontSize: 20,
    lineHeight: 1,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  description: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center' as const,
  },
};
