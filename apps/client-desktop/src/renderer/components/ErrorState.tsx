/**
 * ErrorState.tsx — Standardized actionable error component.
 *
 * Shows error with causes, fixes, retry, and diagnostics buttons.
 * Used across all pages that need to display recoverable errors.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors, spacing, typography, radius, transitions } from '../styles/theme';
import { Button } from './Button';

interface ErrorStateProps {
  title: string;
  description?: string;
  causes?: string[];
  fixes?: string[];
  errorDetails?: string;
  onRetry?: () => void;
  onOpenDiagnostics?: boolean;
  compact?: boolean;
}

export function ErrorState({
  title,
  description,
  causes,
  fixes,
  errorDetails,
  onRetry,
  onOpenDiagnostics = true,
  compact = false,
}: ErrorStateProps): React.ReactElement {
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyError = useCallback(() => {
    const text = [
      `Error: ${title}`,
      description ? `Description: ${description}` : '',
      errorDetails ? `Details: ${errorDetails}` : '',
      causes?.length ? `Possible causes:\n${causes.map((c) => `  - ${c}`).join('\n')}` : '',
      fixes?.length ? `Suggested fixes:\n${fixes.map((f) => `  - ${f}`).join('\n')}` : '',
      `Timestamp: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [title, description, errorDetails, causes, fixes]);

  return (
    <div style={compact ? styles.containerCompact : styles.container}>
      {/* Icon */}
      <div style={styles.iconWrap}>
        <svg width={compact ? 24 : 32} height={compact ? 24 : 32} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke={colors.semantic.error} strokeWidth="1.5" />
          <line x1="12" y1="8" x2="12" y2="13" stroke={colors.semantic.error} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="12" cy="16.5" r="0.75" fill={colors.semantic.error} />
        </svg>
      </div>

      {/* Title & Description */}
      <h3 style={compact ? styles.titleCompact : styles.title}>{title}</h3>
      {description && <p style={styles.description}>{description}</p>}

      {/* Causes */}
      {causes && causes.length > 0 && (
        <div style={styles.listSection}>
          <span style={styles.listLabel}>Possible Causes</span>
          <ul style={styles.list}>
            {causes.map((c, i) => (
              <li key={i} style={styles.listItem}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Fixes */}
      {fixes && fixes.length > 0 && (
        <div style={styles.listSection}>
          <span style={styles.listLabel}>Suggested Fixes</span>
          <ul style={styles.list}>
            {fixes.map((f, i) => (
              <li key={i} style={styles.listItem}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Error Details (expandable) */}
      {errorDetails && (
        <div style={styles.detailsSection}>
          <button
            onClick={() => setShowDetails((v) => !v)}
            style={styles.detailsToggle}
          >
            <svg
              width={12}
              height={12}
              viewBox="0 0 12 12"
              fill="none"
              style={{
                transform: showDetails ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: `transform ${transitions.fast}`,
              }}
            >
              <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Technical Details
          </button>
          {showDetails && (
            <pre style={styles.errorDetails}>{errorDetails}</pre>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={styles.actions}>
        {onRetry && (
          <Button size={compact ? 'sm' : 'md'} onClick={onRetry}>
            Retry
          </Button>
        )}
        {onOpenDiagnostics && (
          <Button
            variant="secondary"
            size={compact ? 'sm' : 'md'}
            onClick={() => navigate('/diagnostics')}
          >
            Open Diagnostics
          </Button>
        )}
        <Button variant="ghost" size={compact ? 'sm' : 'md'} onClick={handleCopyError}>
          {copied ? 'Copied!' : 'Copy Error'}
        </Button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: `${colors.semantic.error}08`,
    border: `1px solid ${colors.semantic.error}30`,
    borderRadius: radius.lg,
    textAlign: 'center',
  },
  containerCompact: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: `${colors.semantic.error}08`,
    border: `1px solid ${colors.semantic.error}30`,
    borderRadius: radius.md,
    textAlign: 'center',
  },
  iconWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  titleCompact: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  description: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    margin: 0,
    maxWidth: 500,
    lineHeight: 1.5,
  },
  listSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    width: '100%',
    maxWidth: 500,
  },
  listLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  list: {
    margin: 0,
    paddingLeft: spacing.lg,
    listStyle: 'disc',
  },
  listItem: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 1.6,
  },
  detailsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    width: '100%',
    maxWidth: 500,
  },
  detailsToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'none',
    border: 'none',
    color: colors.text.disabled,
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily,
    cursor: 'pointer',
    padding: 0,
    outline: 'none',
  },
  errorDetails: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontMono,
    color: colors.text.disabled,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: spacing.sm,
    borderRadius: radius.sm,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 120,
    overflow: 'auto',
    textAlign: 'left',
    margin: 0,
  },
  actions: {
    display: 'flex',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
};
