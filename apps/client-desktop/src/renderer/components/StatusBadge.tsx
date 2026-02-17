import React from 'react';
import { colors, radius, typography } from '../styles/theme';

export type HostStatus = 'online' | 'offline' | 'maintenance';

interface StatusBadgeProps {
  status: HostStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

const statusConfig: Record<
  HostStatus,
  { color: string; label: string; dotShadow: string }
> = {
  online: {
    color: colors.semantic.success,
    label: 'Online',
    dotShadow: `0 0 6px ${colors.semantic.success}`,
  },
  offline: {
    color: colors.semantic.error,
    label: 'Offline',
    dotShadow: 'none',
  },
  maintenance: {
    color: colors.semantic.warning,
    label: 'Maintenance',
    dotShadow: `0 0 6px ${colors.semantic.warning}`,
  },
};

export function StatusBadge({
  status,
  showLabel = true,
  size = 'sm',
}: StatusBadgeProps): React.ReactElement {
  const config = statusConfig[status];
  const dotSize = size === 'sm' ? 8 : 10;
  const fontSize = size === 'sm' ? typography.fontSize.xs : typography.fontSize.sm;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: showLabel ? '3px 10px 3px 8px' : '4px',
        backgroundColor: `${config.color}15`,
        borderRadius: radius.full,
      }}
    >
      <div
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          backgroundColor: config.color,
          boxShadow: config.dotShadow,
          flexShrink: 0,
          ...(status === 'online'
            ? { animation: 'pulse 2s ease-in-out infinite' }
            : {}),
        }}
      />
      {showLabel && (
        <span
          style={{
            fontSize,
            fontWeight: typography.fontWeight.medium,
            color: config.color,
            lineHeight: 1,
          }}
        >
          {config.label}
        </span>
      )}
    </div>
  );
}
