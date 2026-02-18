import React, { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { colors, spacing, typography, radius, transitions } from '../styles/theme';
import { useHostAgentStore } from '../store/hostAgentStore';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  /** Keyboard shortcut hint text (e.g., "Ctrl+D") */
  shortcut?: string;
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: <DashboardIcon />,
    shortcut: 'Ctrl+D',
  },
  {
    label: 'Host',
    path: '/host',
    icon: <HostNavIcon />,
  },
  {
    label: 'Client',
    path: '/client',
    icon: <ClientIcon />,
  },
  {
    label: 'Devices',
    path: '/devices',
    icon: <DevicesIcon />,
  },
  {
    label: 'Sessions',
    path: '/sessions',
    icon: <SessionsIcon />,
    shortcut: 'Ctrl+S',
  },
  {
    label: 'Diagnostics',
    path: '/diagnostics',
    icon: <DiagnosticsIcon />,
    shortcut: 'Ctrl+E',
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: <SettingsIcon />,
    shortcut: 'Ctrl+,',
  },
];

export function Sidebar(): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const config = useHostAgentStore((s) => s.config);

  const handleNavClick = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate]
  );

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const sidebarWidth = collapsed ? 64 : 240;

  // Derive mode label for the badge
  const modeLabel = config?.mode === 'host'
    ? 'Host'
    : config?.mode === 'both'
      ? 'Host + Client'
      : 'Client';

  return (
    <aside
      style={{
        ...styles.sidebar,
        width: sidebarWidth,
      }}
    >
      {/* Mode badge */}
      {!collapsed && (
        <div style={styles.modeBadgeSection}>
          <span style={styles.modeBadge}>{modeLabel}</span>
        </div>
      )}

      {collapsed && (
        <div style={styles.collapsedBadge}>
          <span style={styles.collapsedBadgeText}>
            {config?.mode === 'host' ? 'H' : config?.mode === 'both' ? 'H+C' : 'C'}
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav style={styles.nav}>
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          const isHovered = hoveredItem === item.path;

          return (
            <div key={item.path} style={{ position: 'relative' }}>
              <button
                onClick={() => handleNavClick(item.path)}
                onMouseEnter={() => setHoveredItem(item.path)}
                onMouseLeave={() => setHoveredItem(null)}
                style={{
                  ...styles.navItem,
                  ...(isActive ? styles.navItemActive : {}),
                  ...(isHovered && !isActive ? styles.navItemHover : {}),
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  paddingLeft: collapsed ? 0 : 16,
                }}
                aria-label={item.label}
              >
                {isActive && <div style={styles.activeIndicator} />}
                <span style={styles.navIcon}>{item.icon}</span>
                {!collapsed && (
                  <>
                    <span style={styles.navLabel}>{item.label}</span>
                    {item.shortcut && (
                      <span style={styles.shortcutHint}>{item.shortcut}</span>
                    )}
                  </>
                )}
              </button>
              {/* Tooltip for collapsed sidebar */}
              {collapsed && isHovered && (
                <span style={styles.collapsedTooltip}>
                  {item.label}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div style={styles.footer}>
        <button
          onClick={toggleCollapse}
          style={styles.collapseButton}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <CollapseIcon collapsed={collapsed} />
        </button>
      </div>
    </aside>
  );
}

/* ---------- SVG Icons ---------- */

function DashboardIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="1" width="7" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="10" width="7" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="7" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function HostNavIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="9" y1="13" x2="9" y2="16" stroke="currentColor" strokeWidth="1.5" />
      <line x1="6" y1="16" x2="12" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ClientIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="4" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 6h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 8l2 1-2 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DevicesIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="2" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="7" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="4" y1="14" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="14" x2="15" y2="14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function SessionsIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 15L9 12L12 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DiagnosticsIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 5v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 1.5V3.5M9 14.5V16.5M1.5 9H3.5M14.5 9H16.5M3.4 3.4L4.8 4.8M13.2 13.2L14.6 14.6M14.6 3.4L13.2 4.8M4.8 13.2L3.4 14.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{
        transform: collapsed ? 'rotate(180deg)' : 'none',
        transition: `transform ${transitions.normal}`,
      }}
    >
      <path
        d="M10 12L6 8L10 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------- Styles ---------- */

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.bg.surface,
    borderRight: `1px solid ${colors.border.default}`,
    transition: `width ${transitions.normal}`,
    overflow: 'hidden',
    flexShrink: 0,
  },
  modeBadgeSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${spacing.md}px ${spacing.md}px ${spacing.sm}px`,
  },
  modeBadge: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: '3px 10px',
    borderRadius: radius.full,
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
  },
  collapsedBadge: {
    display: 'flex',
    justifyContent: 'center',
    padding: `${spacing.md}px 0 ${spacing.sm}px`,
  },
  collapsedBadgeText: {
    fontSize: 9,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.secondary,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: '2px 6px',
    borderRadius: radius.full,
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
  },
  nav: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: `${spacing.sm}px ${spacing.sm}px`,
  },
  navItem: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm + 4,
    height: 38,
    paddingRight: spacing.md,
    border: 'none',
    background: 'transparent',
    color: colors.text.secondary,
    borderRadius: radius.md,
    cursor: 'pointer',
    transition: `background-color ${transitions.fast}, color ${transitions.fast}`,
    outline: 'none',
    fontSize: typography.fontSize.md,
    fontFamily: typography.fontFamily,
    whiteSpace: 'nowrap',
  },
  navItemActive: {
    backgroundColor: colors.accent.muted,
    color: colors.accent.default,
  },
  navItemHover: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    color: colors.text.primary,
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: '0 3px 3px 0',
    backgroundColor: colors.accent.default,
    boxShadow: `0 0 8px ${colors.accent.default}`,
  },
  navIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    flexShrink: 0,
  },
  navLabel: {
    fontWeight: typography.fontWeight.medium,
    flex: 1,
  },
  shortcutHint: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
    opacity: 0.6,
    fontFamily: typography.fontMono,
    fontWeight: typography.fontWeight.normal,
    marginLeft: 'auto',
  },
  footer: {
    padding: spacing.sm,
    borderTop: `1px solid ${colors.border.default}`,
  },
  collapseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 36,
    border: 'none',
    background: 'transparent',
    color: colors.text.secondary,
    borderRadius: radius.md,
    cursor: 'pointer',
    transition: `background-color ${transitions.fast}, color ${transitions.fast}`,
    outline: 'none',
  },
  collapsedTooltip: {
    position: 'absolute',
    left: '100%',
    top: '50%',
    transform: 'translateY(-50%)',
    marginLeft: 8,
    padding: '4px 10px',
    backgroundColor: colors.bg.elevated,
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    borderRadius: radius.sm,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 700,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
  },
};
