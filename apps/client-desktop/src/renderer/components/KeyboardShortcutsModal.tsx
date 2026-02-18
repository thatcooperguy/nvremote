import React, { useEffect, useCallback } from 'react';
import { colors, radius, shadows, spacing, typography, zIndex } from '../styles/theme';

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{ keys: string[]; description: string }>;
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Ctrl', 'D'], description: 'Go to Dashboard' },
      { keys: ['Ctrl', 'S'], description: 'Go to Sessions' },
      { keys: ['Ctrl', ','], description: 'Open Settings' },
      { keys: ['?'], description: 'Show this help' },
    ],
  },
  {
    title: 'Streaming',
    shortcuts: [
      { keys: ['F11'], description: 'Toggle fullscreen' },
      { keys: ['F'], description: 'Toggle fullscreen (alt)' },
      { keys: ['Tab'], description: 'Toggle stats overlay' },
      { keys: ['Esc'], description: 'Show controls / Disconnect' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['Ctrl', 'R'], description: 'Refresh host list' },
      { keys: ['Esc'], description: 'Close dialog / Go back' },
    ],
  },
];

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps): React.ReactElement | null {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      style={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <KeyboardIcon />
            <h2 style={styles.title}>Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            style={styles.closeButton}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M1 1L13 13M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} style={styles.group}>
              <h3 style={styles.groupTitle}>{group.title}</h3>
              <div style={styles.shortcutList}>
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.description} style={styles.shortcutRow}>
                    <div style={styles.keys}>
                      {shortcut.keys.map((key, i) => (
                        <React.Fragment key={key}>
                          {i > 0 && <span style={styles.keySeparator}>+</span>}
                          <kbd style={styles.kbd}>{key}</kbd>
                        </React.Fragment>
                      ))}
                    </div>
                    <span style={styles.description}>{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.footerText}>
            Press <kbd style={styles.kbdSmall}>?</kbd> or <kbd style={styles.kbdSmall}>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}

function KeyboardIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect
        x="1"
        y="4"
        width="18"
        height="12"
        rx="2"
        stroke={colors.accent.default}
        strokeWidth="1.5"
      />
      <rect x="4" y="7" width="2" height="2" rx="0.5" fill={colors.accent.default} opacity="0.6" />
      <rect x="8" y="7" width="2" height="2" rx="0.5" fill={colors.accent.default} opacity="0.6" />
      <rect x="12" y="7" width="2" height="2" rx="0.5" fill={colors.accent.default} opacity="0.6" />
      <rect x="5" y="11" width="8" height="2" rx="0.5" fill={colors.accent.default} opacity="0.4" />
      <rect x="15" y="7" width="2" height="2" rx="0.5" fill={colors.accent.default} opacity="0.6" />
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
  modal: {
    width: '90%',
    maxWidth: 520,
    backgroundColor: colors.bg.elevated,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.xl,
    boxShadow: shadows.lg,
    animation: 'scaleIn 200ms ease',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${spacing.lg}px ${spacing.lg}px ${spacing.md}px`,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm + 2,
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
    outline: 'none',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    padding: `0 ${spacing.lg}px ${spacing.lg}px`,
    maxHeight: 420,
    overflowY: 'auto',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  groupTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.disabled,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: 0,
  },
  shortcutList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  shortcutRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${spacing.xs + 2}px ${spacing.sm}px`,
    borderRadius: radius.sm,
    transition: 'background-color 150ms ease',
  },
  keys: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  keySeparator: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
  },
  kbd: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 26,
    height: 24,
    padding: '0 6px',
    backgroundColor: colors.bg.surface,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.sm,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontMono,
    color: colors.text.primary,
    boxShadow: `0 1px 0 ${colors.border.default}`,
  },
  kbdSmall: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
    height: 20,
    padding: '0 4px',
    backgroundColor: colors.bg.surface,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.sm,
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontMono,
    color: colors.text.primary,
  },
  description: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    padding: `${spacing.sm + 4}px ${spacing.lg}px`,
    borderTop: `1px solid ${colors.border.default}`,
    backgroundColor: colors.bg.card,
  },
  footerText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
};
