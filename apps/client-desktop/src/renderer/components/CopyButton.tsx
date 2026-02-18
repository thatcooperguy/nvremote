import React, { useState, useCallback, useRef, useEffect } from 'react';
import { colors, radius } from '../styles/theme';

interface CopyButtonProps {
  text: string;
  size?: number;
}

export function CopyButton({ text, size = 14 }: CopyButtonProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      style={styles.copyButton}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
          <path d="M3 7L6 10L11 4" stroke={colors.accent.default} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
          <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M10 4V3C10 2.44772 9.55228 2 9 2H3C2.44772 2 2 2.44772 2 3V9C2 9.55228 2.44772 10 3 10H4" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  copyButton: {
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
    transition: 'color 150ms ease, background-color 150ms ease',
    padding: 0,
    outline: 'none',
  },
};
