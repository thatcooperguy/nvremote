import React, { useState } from 'react';
import { colors, radius, shadows, spacing } from '../styles/theme';

interface CardProps {
  children: React.ReactNode;
  padding?: number | string;
  hoverable?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export function Card({
  children,
  padding = spacing.lg,
  hoverable = false,
  onClick,
  style: externalStyle,
  className,
}: CardProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  const isClickable = hoverable || !!onClick;

  const cardStyle: React.CSSProperties = {
    backgroundColor: colors.bg.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.lg,
    padding: typeof padding === 'number' ? `${padding}px` : padding,
    transition: 'border-color 250ms ease, box-shadow 250ms ease, transform 250ms ease',
    ...(isClickable ? { cursor: 'pointer' } : {}),
    ...(isHovered && isClickable
      ? {
          borderColor: colors.border.hover,
          boxShadow: shadows.md,
          transform: 'translateY(-1px)',
        }
      : {}),
    ...externalStyle,
  };

  return (
    <div
      style={cardStyle}
      className={className}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
