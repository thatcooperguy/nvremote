/**
 * CollapsiblePanel.tsx — Reusable collapsible section with chevron animation.
 *
 * Used in HostPage for the various config panels.
 */

import React, { useState, useCallback } from 'react';
import { colors, spacing, typography, radius, transitions } from '../styles/theme';

interface CollapsiblePanelProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  badge?: string;
  badgeColor?: string;
  danger?: boolean;
  children: React.ReactNode;
}

export function CollapsiblePanel({
  title,
  subtitle,
  defaultOpen = true,
  badge,
  badgeColor,
  danger = false,
  children,
}: CollapsiblePanelProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isHovered, setIsHovered] = useState(false);

  const toggle = useCallback(() => setIsOpen((o) => !o), []);

  const borderColor = danger
    ? `${colors.semantic.error}4D`
    : colors.border.default;
  const hoverBorderColor = danger
    ? `${colors.semantic.error}80`
    : colors.border.hover;

  return (
    <div
      style={{
        ...styles.panel,
        borderColor: isHovered ? hoverBorderColor : borderColor,
      }}
    >
      <button
        onClick={toggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={styles.header}
        aria-expanded={isOpen}
      >
        <div style={styles.headerLeft}>
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            style={{
              ...styles.chevron,
              transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            <path
              d="M6 4L10 8L6 12"
              stroke={colors.text.secondary}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div style={styles.titleGroup}>
            <span
              style={{
                ...styles.title,
                color: danger ? colors.semantic.error : colors.text.primary,
              }}
            >
              {title}
            </span>
            {subtitle && <span style={styles.subtitle}>{subtitle}</span>}
          </div>
        </div>
        {badge && (
          <span
            style={{
              ...styles.badge,
              backgroundColor: `${badgeColor || colors.accent.default}20`,
              color: badgeColor || colors.accent.default,
            }}
          >
            {badge}
          </span>
        )}
      </button>
      {isOpen && <div style={styles.content}>{children}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    backgroundColor: colors.bg.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.lg,
    overflow: 'hidden',
    transition: `border-color ${transitions.fast}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: `${spacing.md}px ${spacing.lg}px`,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    outline: 'none',
    fontFamily: typography.fontFamily,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chevron: {
    flexShrink: 0,
    transition: `transform ${transitions.fast}`,
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: 2,
  },
  title: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  badge: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    padding: `2px ${spacing.sm}px`,
    borderRadius: radius.full,
  },
  content: {
    padding: `0 ${spacing.lg}px ${spacing.lg}px`,
  },
};
