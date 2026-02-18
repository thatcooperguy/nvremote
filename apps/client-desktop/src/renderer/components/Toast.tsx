import React, { useState, useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { colors, radius, shadows, spacing, typography, zIndex } from '../styles/theme';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

let toastIdCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (type, message, duration = 5000) => {
    const id = `toast-${++toastIdCounter}`;
    set((state) => ({
      toasts: [...state.toasts, { id, type, message, duration }],
    }));
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

/** Convenience functions for showing toasts from anywhere */
export const toast = {
  success: (message: string, duration?: number): void =>
    useToastStore.getState().addToast('success', message, duration),
  error: (message: string, duration?: number): void =>
    useToastStore.getState().addToast('error', message, duration),
  warning: (message: string, duration?: number): void =>
    useToastStore.getState().addToast('warning', message, duration),
  info: (message: string, duration?: number): void =>
    useToastStore.getState().addToast('info', message, duration),
};

export function Toast(): React.ReactElement {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  // Escape key dismisses the most recent toast
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && toasts.length > 0) {
        removeToast(toasts[toasts.length - 1].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toasts, removeToast]);

  return (
    <div style={styles.container}>
      {toasts.map((item, index) => (
        <ToastItem key={item.id} item={item} index={index} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  item: ToastItem;
  index: number;
}

function ToastItem({ item, index }: ToastItemProps): React.ReactElement {
  const removeToast = useToastStore((s) => s.removeToast);
  const [dismissHovered, setDismissHovered] = useState(false);

  const handleDismiss = useCallback(() => {
    removeToast(item.id);
  }, [item.id, removeToast]);

  useEffect(() => {
    if (item.duration > 0) {
      const timer = setTimeout(handleDismiss, item.duration);
      return () => clearTimeout(timer);
    }
  }, [item.duration, handleDismiss]);

  const iconColor = getIconColor(item.type);
  const accentBorder = `3px solid ${iconColor}`;

  return (
    <div
      style={{
        ...styles.toast,
        borderLeft: accentBorder,
        animationDelay: `${index * 50}ms`,
      }}
      role="alert"
      aria-live="polite"
    >
      <div style={styles.toastIcon}>{getIcon(item.type)}</div>
      <span style={styles.toastMessage}>{item.message}</span>
      <button
        onClick={handleDismiss}
        onMouseEnter={() => setDismissHovered(true)}
        onMouseLeave={() => setDismissHovered(false)}
        style={{
          ...styles.dismissButton,
          ...(dismissHovered ? styles.dismissButtonHovered : {}),
        }}
        aria-label="Dismiss notification"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function getIconColor(type: ToastType): string {
  switch (type) {
    case 'success':
      return colors.semantic.success;
    case 'error':
      return colors.semantic.error;
    case 'warning':
      return colors.semantic.warning;
    case 'info':
      return colors.semantic.info;
  }
}

function getIcon(type: ToastType): React.ReactElement {
  const color = getIconColor(type);

  switch (type) {
    case 'success':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <path d="M5 8L7 10L11 6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'error':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'warning':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5L14.5 13.5H1.5L8 1.5Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8 6V9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11" r="0.75" fill={color} />
        </svg>
      );
    case 'info':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <path d="M8 7V11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="5" r="0.75" fill={color} />
        </svg>
      );
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: spacing.lg,
    right: spacing.lg,
    display: 'flex',
    flexDirection: 'column-reverse',
    gap: spacing.sm,
    zIndex: zIndex.toast,
    pointerEvents: 'none',
    maxHeight: '50vh',
    overflow: 'hidden',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: `${spacing.sm + 4}px ${spacing.md}px`,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    boxShadow: shadows.lg,
    animation: 'slideInRight 300ms ease forwards',
    pointerEvents: 'all',
    maxWidth: 400,
    minWidth: 280,
  },
  toastIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  toastMessage: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    lineHeight: 1.4,
  },
  dismissButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    border: 'none',
    background: 'transparent',
    color: colors.text.disabled,
    cursor: 'pointer',
    borderRadius: radius.sm,
    flexShrink: 0,
    transition: 'color 150ms ease, background-color 150ms ease',
    outline: 'none',
  },
  dismissButtonHovered: {
    color: colors.text.primary,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
};
