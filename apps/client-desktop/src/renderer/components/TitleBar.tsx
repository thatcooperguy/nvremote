import React, { useCallback, useEffect, useState } from 'react';
import { colors, layout, typography } from '../styles/theme';

// Window type augmentation is in types/nvrs.d.ts

export function TitleBar(): React.ReactElement {
  const [isMaximized, setIsMaximized] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  useEffect(() => {
    window.nvrs.window.isMaximized().then(setIsMaximized);
    const cleanup = window.nvrs.window.onMaximizeChange(setIsMaximized);
    return cleanup;
  }, []);

  const handleMinimize = useCallback(() => window.nvrs.window.minimize(), []);
  const handleMaximize = useCallback(() => window.nvrs.window.maximize(), []);
  const handleClose = useCallback(() => window.nvrs.window.close(), []);

  return (
    <div style={styles.titleBar}>
      <div style={styles.accentLine} />
      <div style={styles.content} className="drag-region">
        <div style={styles.logoSection} className="no-drag">
          <CrazyStreamLogo />
          <span style={styles.title}>CrazyStream</span>
        </div>

        <div style={styles.windowControls} className="no-drag">
          <button
            style={{
              ...styles.controlButton,
              ...(hoveredButton === 'minimize' ? styles.controlButtonHover : {}),
            }}
            onClick={handleMinimize}
            onMouseEnter={() => setHoveredButton('minimize')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="Minimize"
          >
            <MinimizeIcon />
          </button>
          <button
            style={{
              ...styles.controlButton,
              ...(hoveredButton === 'maximize' ? styles.controlButtonHover : {}),
            }}
            onClick={handleMaximize}
            onMouseEnter={() => setHoveredButton('maximize')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button
            style={{
              ...styles.controlButton,
              ...(hoveredButton === 'close' ? styles.closeButtonHover : {}),
            }}
            onClick={handleClose}
            onMouseEnter={() => setHoveredButton('close')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function CrazyStreamLogo(): React.ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill={colors.accent.default} />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fill="white"
        fontSize="12"
        fontWeight="bold"
        fontFamily={typography.fontFamily}
      >
        CS
      </text>
    </svg>
  );
}

function MinimizeIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function MaximizeIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}

function RestoreIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect x="2.5" y="0.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="none" />
      <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill={colors.bg.primary} />
    </svg>
  );
}

function CloseIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
      <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  titleBar: {
    position: 'relative',
    height: layout.titlebarHeight,
    backgroundColor: colors.bg.primary,
    zIndex: 600,
    flexShrink: 0,
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    background: `linear-gradient(90deg, ${colors.accent.default}, ${colors.accent.hover})`,
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '100%',
    paddingLeft: 12,
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    letterSpacing: '0.5px',
  },
  windowControls: {
    display: 'flex',
    alignItems: 'stretch',
    height: '100%',
  },
  controlButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: '100%',
    border: 'none',
    background: 'transparent',
    color: colors.text.secondary,
    cursor: 'pointer',
    transition: 'background-color 150ms ease, color 150ms ease',
    outline: 'none',
  },
  controlButtonHover: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: colors.text.primary,
  },
  closeButtonHover: {
    backgroundColor: '#E81123',
    color: '#FFFFFF',
  },
};
