import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { colors, spacing, typography, radius } from '../styles/theme';
import { useAuthStore } from '../store/authStore';
import { useHostAgentStore } from '../store/hostAgentStore';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  /** If true, only show on Windows when host mode is available. */
  hostOnly?: boolean;
}

const allNavItems: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: <DashboardIcon />,
  },
  {
    label: 'Host',
    path: '/host',
    icon: <HostNavIcon />,
    hostOnly: true,
  },
  {
    label: 'Sessions',
    path: '/sessions',
    icon: <SessionsIcon />,
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: <SettingsIcon />,
  },
];

export function Sidebar(): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const isHostMode = useHostAgentStore((state) => state.isHostMode);

  // Filter nav items: show "Host" only on Windows when mode is host/both.
  const navItems = useMemo(() => {
    const hostModeSupported = window.nvrs?.platform?.hostModeSupported ?? false;
    return allNavItems.filter((item) => {
      if (item.hostOnly) {
        return hostModeSupported && isHostMode;
      }
      return true;
    });
  }, [isHostMode]);

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

  return (
    <aside
      style={{
        ...styles.sidebar,
        width: sidebarWidth,
      }}
    >
      {/* User Section */}
      {!collapsed && (
        <div style={styles.userSection}>
          <div style={styles.avatar}>
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                style={styles.avatarImage}
              />
            ) : (
              <span style={styles.avatarInitial}>
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            )}
          </div>
          <div style={styles.userInfo}>
            <span style={styles.userName}>{user?.name || 'User'}</span>
            <span style={styles.userOrg}>{user?.org || 'Organization'}</span>
          </div>
        </div>
      )}

      {collapsed && (
        <div style={styles.collapsedAvatar}>
          <div style={{ ...styles.avatar, width: 36, height: 36 }}>
            <span style={{ ...styles.avatarInitial, fontSize: 14 }}>
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav style={styles.nav}>
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          const isHovered = hoveredItem === item.path;

          return (
            <button
              key={item.path}
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
              title={collapsed ? item.label : undefined}
            >
              {isActive && <div style={styles.activeIndicator} />}
              <span style={styles.navIcon}>{item.icon}</span>
              {!collapsed && <span style={styles.navLabel}>{item.label}</span>}
            </button>
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

function SessionsIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 15L9 12L12 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function CollapseIcon({ collapsed }: { collapsed: boolean }): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{
        transform: collapsed ? 'rotate(180deg)' : 'none',
        transition: 'transform 250ms ease',
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

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.bg.surface,
    borderRight: `1px solid ${colors.border.default}`,
    transition: 'width 250ms ease',
    overflow: 'hidden',
    flexShrink: 0,
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.lg}px ${spacing.md}px ${spacing.md}px`,
    borderBottom: `1px solid ${colors.border.default}`,
  },
  collapsedAvatar: {
    display: 'flex',
    justifyContent: 'center',
    padding: `${spacing.lg}px 0 ${spacing.md}px`,
    borderBottom: `1px solid ${colors.border.default}`,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.accent.muted,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  avatarInitial: {
    color: colors.accent.default,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  userName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  userOrg: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  nav: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: `${spacing.md}px ${spacing.sm}px`,
  },
  navItem: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm + 4,
    height: 40,
    paddingRight: spacing.md,
    border: 'none',
    background: 'transparent',
    color: colors.text.secondary,
    borderRadius: radius.md,
    cursor: 'pointer',
    transition: 'background-color 150ms ease, color 150ms ease',
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
    transition: 'background-color 150ms ease, color 150ms ease',
    outline: 'none',
  },
};
