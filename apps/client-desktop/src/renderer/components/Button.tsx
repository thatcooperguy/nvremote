import React, { useState, useCallback } from 'react';
import { colors, radius, typography, spacing } from '../styles/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  style?: React.CSSProperties;
  className?: string;
  'aria-label'?: string;
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    height: 32,
    padding: `0 ${spacing.sm + 4}px`,
    fontSize: typography.fontSize.sm,
    borderRadius: radius.sm,
    gap: 6,
  },
  md: {
    height: 40,
    padding: `0 ${spacing.md}px`,
    fontSize: typography.fontSize.md,
    borderRadius: radius.md,
    gap: 8,
  },
  lg: {
    height: 48,
    padding: `0 ${spacing.lg}px`,
    fontSize: typography.fontSize.lg,
    borderRadius: radius.md,
    gap: 10,
  },
};

function getVariantStyles(
  variant: ButtonVariant,
  isHovered: boolean,
  isPressed: boolean,
  isDisabled: boolean
): React.CSSProperties {
  if (isDisabled) {
    return {
      backgroundColor:
        variant === 'ghost' || variant === 'secondary' ? 'transparent' : colors.bg.elevated,
      color: colors.text.disabled,
      border:
        variant === 'secondary'
          ? `1px solid ${colors.border.default}`
          : '1px solid transparent',
      cursor: 'not-allowed',
      opacity: 0.5,
    };
  }

  switch (variant) {
    case 'primary':
      return {
        backgroundColor: isPressed
          ? colors.accent.pressed
          : isHovered
          ? colors.accent.hover
          : colors.accent.default,
        color: colors.text.onPrimary,
        border: '1px solid transparent',
        boxShadow: isHovered ? '0 0 16px rgba(118, 185, 0, 0.3)' : 'none',
      };
    case 'secondary':
      return {
        backgroundColor: isPressed
          ? 'rgba(255, 255, 255, 0.08)'
          : isHovered
          ? 'rgba(255, 255, 255, 0.05)'
          : 'transparent',
        color: colors.text.primary,
        border: `1px solid ${isHovered ? colors.border.hover : colors.border.default}`,
      };
    case 'danger':
      return {
        backgroundColor: isPressed
          ? colors.semantic.errorPressed
          : isHovered
          ? colors.semantic.errorHover
          : colors.semantic.error,
        color: colors.text.primary,
        border: '1px solid transparent',
      };
    case 'ghost':
      return {
        backgroundColor: isPressed
          ? 'rgba(255, 255, 255, 0.12)'
          : isHovered
          ? 'rgba(255, 255, 255, 0.08)'
          : 'transparent',
        color: isHovered ? colors.text.primary : colors.text.secondary,
        border: '1px solid transparent',
      };
  }
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  onClick,
  type = 'button',
  style: externalStyle,
  className,
  'aria-label': ariaLabel,
}: ButtonProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isFocusVisible, setIsFocusVisible] = useState(false);

  const isDisabled = disabled || loading;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!isDisabled && onClick) {
        onClick(event);
      }
    },
    [isDisabled, onClick]
  );

  const variantStyle = getVariantStyles(variant, isHovered, isPressed, isDisabled);
  const sizeStyle = sizeStyles[size];

  const focusRing: React.CSSProperties = isFocusVisible
    ? {
        outline: `2px solid ${colors.accent.default}`,
        outlineOffset: 2,
      }
    : {};

  const buttonStyle: React.CSSProperties = {
    ...baseStyle,
    ...sizeStyle,
    ...variantStyle,
    ...focusRing,
    ...(fullWidth ? { width: '100%' } : {}),
    ...externalStyle,
  };

  return (
    <button
      type={type}
      style={buttonStyle}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onFocus={(e) => {
        // Only show focus ring for keyboard navigation (not mouse clicks)
        if (e.target.matches(':focus-visible')) {
          setIsFocusVisible(true);
        }
      }}
      onBlur={() => setIsFocusVisible(false)}
      disabled={isDisabled}
      className={className}
      aria-label={ariaLabel}
      aria-busy={loading}
    >
      {loading && <Spinner size={size} />}
      {children}
    </button>
  );
}

function Spinner({ size }: { size: ButtonSize }): React.ReactElement {
  const dim = size === 'sm' ? 14 : size === 'md' ? 16 : 18;

  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 16 16"
      fill="none"
      style={{ animation: 'spin 1s linear infinite' }}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path
        d="M14 8a6 6 0 00-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const baseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: typography.fontFamily,
  fontWeight: typography.fontWeight.semibold,
  cursor: 'pointer',
  transition: 'all 150ms ease',
  outline: 'none',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  textDecoration: 'none',
  lineHeight: 1,
};
