import React, { useState, useCallback } from 'react';
import { colors, radius, spacing, typography } from '../styles/theme';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useAuthStore } from '../store/authStore';
import { toast } from '../components/Toast';

const APP_VERSION = '0.1.0';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function SettingsSection({ title, description, children }: SettingsSectionProps): React.ReactElement {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>{title}</h2>
        {description && <p style={styles.sectionDescription}>{description}</p>}
      </div>
      <Card>{children}</Card>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps): React.ReactElement {
  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <span style={styles.settingLabel}>{label}</span>
        <span style={styles.settingDescription}>{description}</span>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          ...styles.toggle,
          backgroundColor: checked ? colors.accent.default : colors.bg.elevated,
        }}
      >
        <div
          style={{
            ...styles.toggleKnob,
            transform: checked ? 'translateX(18px)' : 'translateX(2px)',
          }}
        />
      </button>
    </div>
  );
}

export function SettingsPage(): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [autoConnect, setAutoConnect] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [hardwareDecode, setHardwareDecode] = useState(true);
  const [vsync, setVsync] = useState(true);
  const [autoReconnect, setAutoReconnect] = useState(true);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      toast.info('Signed out successfully');
    } catch {
      toast.error('Failed to sign out');
    }
  }, [logout]);

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>Settings</h1>

      {/* Profile */}
      <SettingsSection title="Profile" description="Your account information">
        <div style={styles.profileRow}>
          <div style={styles.avatar}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} style={styles.avatarImage} />
            ) : (
              <span style={styles.avatarInitial}>
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            )}
          </div>
          <div style={styles.profileInfo}>
            <span style={styles.profileName}>{user?.name || 'User'}</span>
            <span style={styles.profileEmail}>{user?.email || 'user@example.com'}</span>
            <span style={styles.profileOrg}>{user?.org || 'Organization'}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={handleLogout}>
            Sign Out
          </Button>
        </div>
      </SettingsSection>

      {/* Connection Preferences */}
      <SettingsSection
        title="Connection"
        description="Configure streaming and connection preferences"
      >
        <div style={styles.settingsList}>
          <ToggleRow
            label="Hardware Decoding"
            description="Use GPU-accelerated video decoding for better performance"
            checked={hardwareDecode}
            onChange={setHardwareDecode}
          />
          <div style={styles.settingDivider} />
          <ToggleRow
            label="VSync"
            description="Synchronize frame rendering to prevent tearing"
            checked={vsync}
            onChange={setVsync}
          />
          <div style={styles.settingDivider} />
          <ToggleRow
            label="Auto-Reconnect"
            description="Automatically reconnect when the connection is interrupted"
            checked={autoReconnect}
            onChange={setAutoReconnect}
          />
          <div style={styles.settingDivider} />
          <ToggleRow
            label="Auto-Connect on Launch"
            description="Automatically connect to the last used host on startup"
            checked={autoConnect}
            onChange={setAutoConnect}
          />
          <div style={styles.settingDivider} />
          <ToggleRow
            label="Minimize to System Tray"
            description="Keep the app running in the background when the window is closed"
            checked={minimizeToTray}
            onChange={setMinimizeToTray}
          />
        </div>
      </SettingsSection>

      {/* About */}
      <SettingsSection title="About">
        <div style={styles.aboutContent}>
          <div style={styles.aboutRow}>
            <span style={styles.aboutLabel}>Application</span>
            <span style={styles.aboutValue}>GridStreamer</span>
          </div>
          <div style={styles.settingDivider} />
          <div style={styles.aboutRow}>
            <span style={styles.aboutLabel}>Version</span>
            <span style={styles.aboutValue}>v{APP_VERSION}</span>
          </div>
          <div style={styles.settingDivider} />
          <div style={styles.aboutRow}>
            <span style={styles.aboutLabel}>Electron</span>
            <span style={styles.aboutValue}>{process.versions?.electron || 'N/A'}</span>
          </div>
          <div style={styles.settingDivider} />
          <div style={styles.aboutRow}>
            <span style={styles.aboutLabel}>Chrome</span>
            <span style={styles.aboutValue}>{process.versions?.chrome || 'N/A'}</span>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
    maxWidth: 700,
    animation: 'fadeIn 300ms ease',
  },
  pageTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  sectionHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  sectionDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    margin: 0,
  },
  profileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
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
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
  },
  profileInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  profileName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  profileEmail: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  profileOrg: {
    fontSize: typography.fontSize.xs,
    color: colors.text.disabled,
  },
  settingsList: {
    display: 'flex',
    flexDirection: 'column',
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${spacing.sm}px 0`,
  },
  settingInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    marginRight: spacing.md,
  },
  settingLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  settingDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  settingDivider: {
    height: 1,
    backgroundColor: colors.border.default,
    margin: `${spacing.xs}px 0`,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'background-color 200ms ease',
    position: 'relative',
    flexShrink: 0,
    outline: 'none',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    top: 2,
    transition: 'transform 200ms ease',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
  aboutContent: {
    display: 'flex',
    flexDirection: 'column',
  },
  aboutRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${spacing.sm}px 0`,
  },
  aboutLabel: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
  },
  aboutValue: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
  },
};
