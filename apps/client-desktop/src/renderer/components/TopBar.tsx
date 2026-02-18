import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusPill } from './StatusPill';
import { useAuthStore } from '../store/authStore';
import { colors, layout, typography, radius, spacing, transitions } from '../styles/theme';

export function TopBar(): React.ReactElement {
  const [isMaximized, setIsMaximized] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    window.nvrs.window.isMaximized().then(setIsMaximized);
    const cleanup = window.nvrs.window.onMaximizeChange(setIsMaximized);
    return cleanup;
  }, []);

  const handleMinimize = useCallback(() => window.nvrs.window.minimize(), []);
  const handleMaximize = useCallback(() => window.nvrs.window.maximize(), []);
  const handleClose = useCallback(() => window.nvrs.window.close(), []);

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClick = () => setShowUserMenu(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showUserMenu]);

  return (
    <div style={styles.topBar}>
      <div style={styles.accentLine} />
      <div style={styles.content} className="drag-region">
        {/* Left: Logo + branding */}
        <div style={styles.logoSection} className="no-drag">
          <NVRemoteLogo />
          <span style={styles.title}>NVRemote</span>
        </div>

        {/* Center: Status pill */}
        {isAuthenticated && (
          <div style={styles.centerSection} className="no-drag">
            <StatusPill />
          </div>
        )}

        {/* Right: User + window controls */}
        <div style={styles.rightSection} className="no-drag">
          {isAuthenticated && (
            <>
              <button
                style={{
                  ...styles.iconButton,
                  ...(hoveredButton === 'settings' ? styles.iconButtonHover : {}),
                }}
                onClick={() => navigate('/settings')}
                onMouseEnter={() => setHoveredButton('settings')}
                onMouseLeave={() => setHoveredButton(null)}
                title="Settings"
                aria-label="Settings"
              >
                <SettingsGearIcon />
              </button>
              <button
                style={{
                  ...styles.iconButton,
                  ...(hoveredButton === 'help' ? styles.iconButtonHover : {}),
                }}
                onClick={() => navigate('/diagnostics')}
                onMouseEnter={() => setHoveredButton('help')}
                onMouseLeave={() => setHoveredButton(null)}
                title="Diagnostics"
                aria-label="Diagnostics"
              >
                <HelpIcon />
              </button>

              {/* User avatar dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  style={{
                    ...styles.avatarButton,
                    ...(hoveredButton === 'avatar' ? styles.avatarButtonHover : {}),
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowUserMenu((prev) => !prev);
                  }}
                  onMouseEnter={() => setHoveredButton('avatar')}
                  onMouseLeave={() => setHoveredButton(null)}
                  title={user?.name || 'User'}
                  aria-label="User menu"
                >
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      style={styles.avatarImg}
                    />
                  ) : (
                    <span style={styles.avatarInitial}>
                      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </span>
                  )}
                </button>

                {showUserMenu && (
                  <div style={styles.userMenu}>
                    <div style={styles.menuHeader}>
                      <span style={styles.menuName}>{user?.name || 'User'}</span>
                      <span style={styles.menuEmail}>{user?.email || ''}</span>
                    </div>
                    <div style={styles.menuDivider} />
                    <button
                      style={{
                        ...styles.menuItem,
                        ...(hoveredButton === 'menu-settings' ? styles.menuItemHover : {}),
                      }}
                      onClick={() => navigate('/settings')}
                      onMouseEnter={() => setHoveredButton('menu-settings')}
                      onMouseLeave={() => setHoveredButton(null)}
                    >
                      Settings
                    </button>
                    <button
                      style={{
                        ...styles.menuItem,
                        color: colors.semantic.error,
                        ...(hoveredButton === 'menu-logout' ? styles.menuItemHover : {}),
                      }}
                      onClick={() => useAuthStore.getState().logout()}
                      onMouseEnter={() => setHoveredButton('menu-logout')}
                      onMouseLeave={() => setHoveredButton(null)}
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Divider between user actions and window controls */}
          {isAuthenticated && <div style={styles.controlsDivider} />}

          {/* Window controls */}
          <div style={styles.windowControls}>
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
    </div>
  );
}

/* ---------- SVG Icons ---------- */

function NVRemoteLogo(): React.ReactElement {
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
        NV
      </text>
    </svg>
  );
}

function SettingsGearIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.3 3.3l1 1M11.7 11.7l1 1M12.7 3.3l-1 1M4.3 11.7l-1 1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HelpIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6 6.5a2 2 0 1 1 2.5 1.94V10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="12" r="0.5" fill="currentColor" />
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

/* ---------- Styles ---------- */

const styles: Record<string, React.CSSProperties> = {
  topBar: {
    position: 'relative',
    height: layout.topBarHeight,
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
    flexShrink: 0,
  },
  title: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    letterSpacing: '0.5px',
  },
  centerSection: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    height: '100%',
    gap: 2,
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    border: 'none',
    background: 'transparent',
    color: colors.text.secondary,
    borderRadius: radius.md,
    cursor: 'pointer',
    transition: `all ${transitions.fast}`,
    outline: 'none',
  },
  iconButtonHover: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    color: colors.text.primary,
  },
  avatarButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: radius.full,
    border: '1.5px solid transparent',
    background: colors.accent.muted,
    cursor: 'pointer',
    overflow: 'hidden',
    transition: `border-color ${transitions.fast}`,
    outline: 'none',
    padding: 0,
  },
  avatarButtonHover: {
    borderColor: colors.accent.default,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  avatarInitial: {
    color: colors.accent.default,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: 1,
  },
  controlsDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border.default,
    margin: `0 ${spacing.xs}px`,
    flexShrink: 0,
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
    transition: `background-color ${transitions.fast}, color ${transitions.fast}`,
    outline: 'none',
  },
  controlButtonHover: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    color: colors.text.primary,
  },
  closeButtonHover: {
    backgroundColor: '#E81123',
    color: '#FFFFFF',
  },
  // User dropdown menu
  userMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 8,
    minWidth: 200,
    backgroundColor: colors.bg.elevated,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.lg,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
    padding: `${spacing.xs}px 0`,
    zIndex: 700,
  },
  menuHeader: {
    display: 'flex',
    flexDirection: 'column',
    padding: `${spacing.sm}px ${spacing.md}px`,
  },
  menuName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  menuEmail: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border.default,
    margin: `${spacing.xs}px 0`,
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: `${spacing.sm}px ${spacing.md}px`,
    border: 'none',
    background: 'transparent',
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily,
    cursor: 'pointer',
    transition: `background-color ${transitions.fast}`,
    outline: 'none',
    textAlign: 'left',
  },
  menuItemHover: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    color: colors.text.primary,
  },
};
