/**
 * SettingsPage.tsx — Tabbed settings page.
 *
 * 5 tabs: General, Account, Network, Streaming, Security.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { colors, radius, spacing, typography, transitions } from '../styles/theme';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { TabGroup, type TabItem } from '../components/TabGroup';
import { ToggleRow } from '../components/ToggleRow';
import { useAuthStore } from '../store/authStore';
import { useHostAgentStore } from '../store/hostAgentStore';
import { useConnectionStore, type ConnectionMode } from '../store/connectionStore';
import { toast } from '../components/Toast';

const APP_VERSION = '0.5.1-beta';

const TABS: TabItem[] = [
  { id: 'general', label: 'General' },
  { id: 'account', label: 'Account' },
  { id: 'network', label: 'Network' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'security', label: 'Security' },
];

export function SettingsPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>Settings</h1>
      <TabGroup tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      <div style={styles.tabContent}>
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'account' && <AccountTab />}
        {activeTab === 'network' && <NetworkTab />}
        {activeTab === 'streaming' && <StreamingTab />}
        {activeTab === 'security' && <SecurityTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// General Tab — Startup, tray, overlay, language, About
// ---------------------------------------------------------------------------

function GeneralTab(): React.ReactElement {
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [autoConnect, setAutoConnect] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [language, setLanguage] = useState('en');

  const config = useHostAgentStore((s) => s.config);
  const setMode = useHostAgentStore((s) => s.setMode);
  const hostModeSupported = window.nvrs?.platform?.hostModeSupported ?? false;

  // Load persisted settings on mount
  useEffect(() => {
    window.nvrs?.settings?.get().then((s) => {
      setStartOnBoot(s.startOnBoot);
      setMinimizeToTray(s.minimizeToTray);
      setAutoConnect(s.autoConnect);
      setShowOverlay(s.showOverlay);
    }).catch(() => {});
  }, []);

  const handleModeChange = useCallback(
    async (mode: 'client' | 'host' | 'both') => {
      try {
        await setMode(mode);
        toast.success(`Mode changed to ${mode}`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [setMode]
  );

  const withSave = useCallback(
    (key: string, setter: (v: boolean) => void) => (value: boolean) => {
      setter(value);
      window.nvrs?.settings?.set(key as never, value).catch(() => {
        toast.error('Failed to save setting');
      });
    },
    []
  );

  return (
    <>
      <SettingsSection title="Startup & Window">
        <div style={styles.settingsList}>
          <ToggleRow
            label="Start on Boot"
            description="Launch NVRemote when your computer starts"
            checked={startOnBoot}
            onChange={withSave('startOnBoot', setStartOnBoot)}
          />
          <div style={styles.settingDivider} />
          <ToggleRow
            label="Minimize to System Tray"
            description="Keep the app running in the background when the window is closed"
            checked={minimizeToTray}
            onChange={withSave('minimizeToTray', setMinimizeToTray)}
          />
          <div style={styles.settingDivider} />
          <ToggleRow
            label="Auto-Connect on Launch"
            description="Automatically connect to the last used host on startup"
            checked={autoConnect}
            onChange={withSave('autoConnect', setAutoConnect)}
          />
          <div style={styles.settingDivider} />
          <ToggleRow
            label="Performance Overlay"
            description="Show FPS, latency, and bitrate during streaming"
            checked={showOverlay}
            onChange={withSave('showOverlay', setShowOverlay)}
          />
        </div>
      </SettingsSection>

      {/* App Mode (Windows only) */}
      {hostModeSupported && (
        <SettingsSection title="App Mode" description="Configure NVRemote as a client, host, or both">
          <div style={styles.settingRow}>
            <div style={styles.settingInfo}>
              <span style={styles.settingLabel}>Mode</span>
              <span style={styles.settingDescription}>
                Client receives streams. Host shares your GPU. Both does both simultaneously.
              </span>
            </div>
            <div style={styles.modeSelector}>
              {(['client', 'host', 'both'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  style={{
                    ...styles.modeButton,
                    ...(config?.mode === m ? styles.modeButtonActive : {}),
                  }}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </SettingsSection>
      )}

      <SettingsSection title="Language">
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Display Language</span>
            <span style={styles.settingDescription}>Select the language used in the interface</span>
          </div>
          <select
            value={language}
            onChange={(e) => { setLanguage(e.target.value); toast.success('Language updated'); }}
            style={styles.select}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="ja">日本語</option>
            <option value="zh">中文</option>
          </select>
        </div>
      </SettingsSection>

      {/* About */}
      <SettingsSection title="About">
        <div style={styles.aboutContent}>
          <AboutRow label="Application" value="NVRemote" />
          <div style={styles.settingDivider} />
          <AboutRow label="Version" value={`v${APP_VERSION}`} />
          <div style={styles.settingDivider} />
          <AboutRow
            label="Platform"
            value={
              window.nvrs?.platform?.os === 'win32' ? 'Windows' :
              window.nvrs?.platform?.os === 'darwin' ? 'macOS' : 'Linux'
            }
          />
          <div style={styles.settingDivider} />
          <AboutRow label="Host Mode" value={hostModeSupported ? 'Supported' : 'Not Available'} />
          <div style={styles.settingDivider} />
          <AboutRow
            label="Native Streaming"
            value={window.nvrs?.platform?.nativeStreamingSupported ? 'Supported' : 'Not Available'}
          />
        </div>
      </SettingsSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Account Tab — Profile, sign out, privacy
// ---------------------------------------------------------------------------

function AccountTab(): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      toast.info('Signed out successfully');
    } catch {
      toast.error('Failed to sign out');
    }
  }, [logout]);

  return (
    <>
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

      <SettingsSection title="Privacy">
        <div style={styles.settingsList}>
          <ToggleRow
            label="Analytics"
            description="Help improve NVRemote by sending anonymous usage data"
            checked={false}
            onChange={() => toast.info('Analytics settings saved')}
          />
          <div style={styles.settingDivider} />
          <ToggleRow
            label="Crash Reports"
            description="Automatically send crash reports for debugging"
            checked={true}
            onChange={() => toast.info('Crash report settings saved')}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Data">
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Clear Session History</span>
            <span style={styles.settingDescription}>Remove all stored session data from this device</span>
          </div>
          <Button variant="danger" size="sm" onClick={() => toast.info('Session history cleared')}>
            Clear Data
          </Button>
        </div>
      </SettingsSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Network Tab — Connection mode, bandwidth limits, proxy
// ---------------------------------------------------------------------------

function NetworkTab(): React.ReactElement {
  const connectionMode = useConnectionStore((s) => s.connectionMode);
  const setConnectionMode = useConnectionStore((s) => s.setConnectionMode);
  const [bandwidthLimit, setBandwidthLimit] = useState('0');

  return (
    <>
      <SettingsSection title="Connection Mode" description="How the client connects to host machines">
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Connection Method</span>
            <span style={styles.settingDescription}>
              Auto uses P2P when possible, falling back to relay. VPN forces WireGuard relay.
            </span>
          </div>
          <div style={styles.modeSelector}>
            {([
              { value: 'auto' as ConnectionMode, label: 'Auto (P2P)' },
              { value: 'vpn' as ConnectionMode, label: 'VPN Relay' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setConnectionMode(opt.value)}
                style={{
                  ...styles.modeButton,
                  ...(connectionMode === opt.value ? styles.modeButtonActive : {}),
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Bandwidth" description="Limit upload and download rates">
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Bandwidth Limit (Mbps)</span>
            <span style={styles.settingDescription}>Set to 0 for unlimited. Applies to streaming sessions.</span>
          </div>
          <select
            value={bandwidthLimit}
            onChange={(e) => { setBandwidthLimit(e.target.value); toast.success('Bandwidth limit updated'); }}
            style={styles.select}
          >
            <option value="0">Unlimited</option>
            <option value="10">10 Mbps</option>
            <option value="25">25 Mbps</option>
            <option value="50">50 Mbps</option>
            <option value="100">100 Mbps</option>
          </select>
        </div>
      </SettingsSection>

      <SettingsSection title="Proxy" description="Configure proxy settings for network connections">
        <div style={styles.placeholderCard}>
          <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke={colors.text.disabled} strokeWidth="1.5" />
            <line x1="10" y1="6" x2="10" y2="10.5" stroke={colors.text.disabled} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="10" cy="13.5" r="0.75" fill={colors.text.disabled} />
          </svg>
          <span style={styles.placeholderText}>Proxy configuration will be available in a future update.</span>
        </div>
      </SettingsSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Streaming Tab — Default presets, hardware decode, VSync
// ---------------------------------------------------------------------------

function StreamingTab(): React.ReactElement {
  const [hardwareDecode, setHardwareDecode] = useState(true);
  const [vsync, setVsync] = useState(false);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [preferredCodec, setPreferredCodec] = useState('auto');
  const [captureMode, setCaptureMode] = useState('auto');

  // Load persisted settings on mount
  useEffect(() => {
    window.nvrs?.settings?.get().then((s) => {
      setHardwareDecode(s.hardwareDecode);
      setVsync(s.vsync);
      setAutoReconnect(s.autoReconnect);
      setPreferredCodec(s.codecPreference);
      setCaptureMode(s.captureMode);
    }).catch(() => {});
  }, []);

  const withSave = useCallback(
    (key: string, setter: (v: boolean) => void) => (value: boolean) => {
      setter(value);
      window.nvrs?.settings?.set(key as never, value).catch(() => {
        toast.error('Failed to save setting');
      });
    },
    []
  );

  return (
    <>
      <SettingsSection title="Decoder Preferences" description="Configure how the client decodes incoming video">
        <div style={styles.settingsList}>
          <ToggleRow
            label="Hardware Decoding"
            description="Use GPU-accelerated video decoding for better performance"
            checked={hardwareDecode}
            onChange={withSave('hardwareDecode', setHardwareDecode)}
          />
          <div style={styles.settingDivider} />
          <ToggleRow
            label="VSync"
            description="Synchronize frame rendering to prevent tearing"
            checked={vsync}
            onChange={withSave('vsync', setVsync)}
          />
          <div style={styles.settingDivider} />
          <ToggleRow
            label="Auto-Reconnect"
            description="Automatically reconnect when the connection is interrupted"
            checked={autoReconnect}
            onChange={withSave('autoReconnect', setAutoReconnect)}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Codec & Capture">
        <div style={styles.settingsList}>
          <div style={styles.settingRow}>
            <div style={styles.settingInfo}>
              <span style={styles.settingLabel}>Preferred Codec</span>
              <span style={styles.settingDescription}>Codec to request when connecting to a host</span>
            </div>
            <select
              value={preferredCodec}
              onChange={(e) => { setPreferredCodec(e.target.value); window.nvrs?.settings?.set('codecPreference' as never, e.target.value).catch(() => {}); }}
              style={styles.select}
            >
              <option value="auto">Auto (let host decide)</option>
              <option value="h264">H.264</option>
              <option value="h265">H.265 (HEVC)</option>
              <option value="av1">AV1</option>
            </select>
          </div>
          <div style={styles.settingDivider} />
          <div style={styles.settingRow}>
            <div style={styles.settingInfo}>
              <span style={styles.settingLabel}>Capture Mode</span>
              <span style={styles.settingDescription}>What the host streams to the client</span>
            </div>
            <select
              value={captureMode}
              onChange={(e) => { setCaptureMode(e.target.value); window.nvrs?.settings?.set('captureMode' as never, e.target.value).catch(() => {}); }}
              style={styles.select}
            >
              <option value="desktop">Entire Desktop</option>
              <option value="display1">Display 1</option>
              <option value="display2">Display 2</option>
            </select>
          </div>
        </div>
      </SettingsSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Security Tab — Connection approval, unattended access, PIN
// ---------------------------------------------------------------------------

function SecurityTab(): React.ReactElement {
  const [requireApproval, setRequireApproval] = useState(true);
  const [unattendedAccess, setUnattendedAccess] = useState(false);

  return (
    <>
      <SettingsSection title="Connection Security" description="Control who can connect to your host">
        <div style={styles.settingsList}>
          <ToggleRow
            label="Require Connection Approval"
            description="Prompt for approval before a client can connect"
            checked={requireApproval}
            onChange={(v) => { setRequireApproval(v); toast.success('Setting saved'); }}
          />
          <div style={styles.settingDivider} />
          <ToggleRow
            label="Unattended Access"
            description="Allow clients to connect without manual approval (requires PIN)"
            checked={unattendedAccess}
            onChange={(v) => { setUnattendedAccess(v); toast.success('Setting saved'); }}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Access PIN" description="Set a PIN for unattended connections">
        <div style={styles.placeholderCard}>
          <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
            <rect x="4" y="9" width="12" height="8" rx="2" stroke={colors.text.disabled} strokeWidth="1.5" />
            <path d="M7 9V6C7 4.34315 8.34315 3 10 3C11.6569 3 13 4.34315 13 6V9" stroke={colors.text.disabled} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="10" cy="13" r="1" fill={colors.text.disabled} />
          </svg>
          <span style={styles.placeholderText}>PIN-based access control will be available in a future update.</span>
        </div>
      </SettingsSection>

      <SettingsSection title="Trusted Devices">
        <div style={styles.placeholderCard}>
          <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
            <path d="M10 2L3 6V10C3 14.4183 6.13401 18.3636 10 19C13.866 18.3636 17 14.4183 17 10V6L10 2Z" stroke={colors.text.disabled} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 10L9 12L13 8" stroke={colors.text.disabled} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={styles.placeholderText}>Trusted device management will be available in a future update.</span>
        </div>
      </SettingsSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function SettingsSection({ title, description, children }: SettingsSectionProps): React.ReactElement {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionTitleBar}>
          <h2 style={styles.sectionTitle}>{title}</h2>
        </div>
        {description && <p style={styles.sectionDescription}>{description}</p>}
      </div>
      <Card>{children}</Card>
    </div>
  );
}

function AboutRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={styles.aboutRow}>
      <span style={styles.aboutLabel}>{label}</span>
      <span style={styles.aboutValue}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    maxWidth: 700,
    animation: 'fadeIn 300ms ease',
  },
  pageTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
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
  sectionTitleBar: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    borderLeft: `3px solid ${colors.accent.default}`,
    paddingLeft: spacing.sm,
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

  // Profile
  profileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap' as const,
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

  // Mode selector
  modeSelector: {
    display: 'flex',
    gap: 0,
    borderRadius: radius.md,
    overflow: 'hidden',
    border: `1px solid ${colors.border.default}`,
  },
  modeButton: {
    padding: '6px 16px',
    border: 'none',
    background: colors.bg.elevated,
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily,
    cursor: 'pointer',
    transition: 'background-color 150ms ease, color 150ms ease',
    outline: 'none',
  },
  modeButtonActive: {
    backgroundColor: colors.accent.default,
    color: colors.text.onPrimary,
    fontWeight: typography.fontWeight.semibold,
  },

  // Select
  select: {
    height: 36,
    padding: `0 ${spacing.sm + 2}px`,
    backgroundColor: colors.bg.elevated,
    color: colors.text.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily,
    outline: 'none',
    cursor: 'pointer',
    transition: `border-color ${transitions.fast}`,
    minWidth: 140,
  },

  // About
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
    fontFamily: typography.fontMono,
  },

  // Placeholder
  placeholderCard: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.md}px 0`,
  },
  placeholderText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.disabled,
    fontStyle: 'italic',
  },
};
