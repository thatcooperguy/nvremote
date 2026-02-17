import React, { useEffect, useCallback, useRef } from 'react';
import { colors, radius, shadows, spacing, typography, zIndex } from '../styles/theme';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  width?: number;
  closeOnOverlayClick?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  width = 480,
  closeOnOverlayClick = true,
}: DialogProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      // Focus the dialog when opened
      dialogRef.current?.focus();
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      style={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        ref={dialogRef}
        style={{ ...styles.dialog, maxWidth: width }}
        tabIndex={-1}
      >
        {/* Header */}
        <div style={styles.header}>
          <h2 id="dialog-title" style={styles.title}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={styles.closeButton}
            aria-label="Close dialog"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>{children}</div>

        {/* Actions */}
        {actions && <div style={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
}: ConfirmDialogProps): React.ReactElement {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={styles.message}>{message}</p>
    </Dialog>
  );
}

function CloseIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M1 1L13 13M13 1L1 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: zIndex.modal,
    animation: 'fadeIn 150ms ease',
    backdropFilter: 'blur(4px)',
  },
  dialog: {
    width: '90%',
    backgroundColor: colors.bg.elevated,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.xl,
    boxShadow: shadows.lg,
    animation: 'scaleIn 200ms ease',
    outline: 'none',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${spacing.lg}px ${spacing.lg}px ${spacing.md}px`,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    border: 'none',
    background: 'transparent',
    color: colors.text.secondary,
    borderRadius: radius.sm,
    cursor: 'pointer',
    transition: 'background-color 150ms ease, color 150ms ease',
    outline: 'none',
  },
  body: {
    padding: `0 ${spacing.lg}px ${spacing.lg}px`,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    padding: `${spacing.md}px ${spacing.lg}px`,
    borderTop: `1px solid ${colors.border.default}`,
    backgroundColor: colors.bg.card,
  },
  message: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    lineHeight: 1.6,
    margin: 0,
  },
};
