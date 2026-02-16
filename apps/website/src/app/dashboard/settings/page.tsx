'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LogOut,
  RefreshCw,
  Shield,
  AlertCircle,
  Save,
  CheckCircle2,
  Loader2,
  Building2,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch, getStoredUser, logout, type AuthUser } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter();

  // User & org data
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);

  // Streaming preferences (local state — no backend endpoint yet)
  const [defaultQuality, setDefaultQuality] = useState('balanced');
  const [defaultTransport, setDefaultTransport] = useState('udp');

  // Notifications (local state — no backend endpoint yet)
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(false);

  // Loading & errors
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      // Load user from localStorage immediately
      const storedUser = getStoredUser();
      setUser(storedUser);

      // Fetch fresh profile and orgs from API in parallel
      const [profileRes, orgsRes] = await Promise.all([
        authFetch('/api/v1/auth/me'),
        authFetch('/api/v1/orgs'),
      ]);

      if (!profileRes.ok) {
        throw new Error(`Failed to load profile (${profileRes.status})`);
      }

      const profileData: UserProfile = await profileRes.json();
      setProfile(profileData);

      if (orgsRes.ok) {
        const orgsData: OrgInfo[] = await orgsRes.json();
        setOrgs(orgsData);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load settings';
      // Don't show error if it's an auth redirect
      if (!message.includes('Session expired')) {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      router.replace('/');
    } catch {
      // Best-effort — clearAuth already happened in logout()
      router.replace('/');
    }
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      // Persist to localStorage for now (streaming prefs have no backend endpoint yet)
      localStorage.setItem(
        'nvremote_preferences',
        JSON.stringify({
          defaultQuality,
          defaultTransport,
          emailNotifs,
          pushNotifs,
        }),
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch {
      setError('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  // Load saved preferences from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('nvremote_preferences');
      if (raw) {
        const prefs = JSON.parse(raw);
        if (prefs.defaultQuality) setDefaultQuality(prefs.defaultQuality);
        if (prefs.defaultTransport) setDefaultTransport(prefs.defaultTransport);
        if (typeof prefs.emailNotifs === 'boolean') setEmailNotifs(prefs.emailNotifs);
        if (typeof prefs.pushNotifs === 'boolean') setPushNotifs(prefs.pushNotifs);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  const displayName = profile?.name || user?.name || 'User';
  const displayEmail = profile?.email || user?.email || '';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl = profile?.avatarUrl || user?.avatarUrl;
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : null;

  // -----------------------------------------------------------------------
  // Shared styles
  // -----------------------------------------------------------------------

  const selectClass =
    'w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 focus:border-cs-green/50 focus:ring-1 focus:ring-cs-green/20 focus:outline-none transition-colors appearance-none';

  const Toggle = ({
    enabled,
    onChange,
  }: {
    enabled: boolean;
    onChange: (val: boolean) => void;
  }) => (
    <button
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cs-green/30',
        enabled ? 'bg-cs-green' : 'bg-gray-300'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200',
          enabled ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  );

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-8 max-w-3xl">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight"
          >
            Settings
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-sm text-gray-500 mt-1"
          >
            Configure your account and streaming preferences
          </motion.p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-cs-green animate-spin" />
          <span className="ml-3 text-sm text-gray-500">Loading settings...</span>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight"
        >
          Settings
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-sm text-gray-500 mt-1"
        >
          Configure your account and streaming preferences
        </motion.p>
      </div>

      {/* Error banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 border border-red-200"
        >
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button
            onClick={fetchData}
            className="text-xs font-medium text-red-600 hover:text-red-800 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </motion.div>
      )}

      {/* Account section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="gradient-border p-5 sm:p-6"
      >
        <h2 className="text-base font-semibold text-gray-900 mb-5">Account</h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-14 h-14 rounded-full border border-gray-200 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-cs-green">{initials}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{displayName}</p>
            <p className="text-xs text-gray-500 mt-0.5">{displayEmail}</p>
            {memberSince && (
              <p className="text-xs text-gray-400 mt-0.5">
                Member since {memberSince}
              </p>
            )}
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/5 transition-all duration-300 disabled:opacity-50"
          >
            {signingOut ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            {signingOut ? 'Signing Out...' : 'Sign Out'}
          </button>
        </div>
      </motion.div>

      {/* Organisation section */}
      {orgs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18 }}
          className="gradient-border p-5 sm:p-6"
        >
          <h2 className="text-base font-semibold text-gray-900 mb-5">
            Organisation
          </h2>
          <div className="space-y-3">
            {orgs.map((org) => (
              <div
                key={org.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
              >
                <div className="w-10 h-10 rounded-lg bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-cs-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{org.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {org.slug}
                    {org.createdAt && (
                      <span className="ml-2 text-gray-400">
                        Created{' '}
                        {new Date(org.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Security */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.19 }}
        className="gradient-border p-5 sm:p-6"
      >
        <h2 className="text-base font-semibold text-gray-900 mb-5">Security</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">
                  Two-Factor Authentication
                </p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
                  Not enabled
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Add an extra layer of security with TOTP-based two-factor
                authentication
              </p>
            </div>
          </div>
          <button
            disabled
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed opacity-60"
          >
            <Shield className="w-4 h-4" />
            Enable 2FA (Coming Soon)
          </button>
        </div>
      </motion.div>

      {/* Streaming preferences */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="gradient-border p-5 sm:p-6"
      >
        <h2 className="text-base font-semibold text-gray-900 mb-5">
          Streaming Preferences
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Default Quality Preset
            </label>
            <select
              value={defaultQuality}
              onChange={(e) => setDefaultQuality(e.target.value)}
              className={selectClass}
            >
              <option value="competitive">Competitive (1080p/240fps)</option>
              <option value="balanced">Balanced (1440p/144fps)</option>
              <option value="cinematic">Cinematic (Up to 8K/60fps)</option>
              <option value="creative">Creative (Native/60fps, 4:4:4)</option>
              <option value="cad">CAD/Engineering (Native/60fps, AV1)</option>
              <option value="lan">LAN (Native/240fps, Max Quality)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Default Transport
            </label>
            <select
              value={defaultTransport}
              onChange={(e) => setDefaultTransport(e.target.value)}
              className={selectClass}
            >
              <option value="udp">UDP</option>
              <option value="tcp">TCP</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25 }}
        className="gradient-border p-5 sm:p-6"
      >
        <h2 className="text-base font-semibold text-gray-900 mb-5">
          Notifications
        </h2>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Email Notifications
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Receive session alerts and updates via email
              </p>
            </div>
            <Toggle enabled={emailNotifs} onChange={setEmailNotifs} />
          </div>
          <div className="border-t border-gray-200/60" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Push Notifications
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Get real-time alerts on your devices
              </p>
            </div>
            <Toggle enabled={pushNotifs} onChange={setPushNotifs} />
          </div>
        </div>
      </motion.div>

      {/* Save button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex items-center gap-3"
      >
        <button
          onClick={handleSavePreferences}
          disabled={saving}
          className={cn(
            'inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300',
            saveSuccess
              ? 'bg-cs-green text-white'
              : 'bg-gray-900 text-white hover:bg-gray-800',
            saving && 'opacity-70 cursor-not-allowed'
          )}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saveSuccess ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Preferences'}
        </button>
        {saveSuccess && (
          <span className="text-xs text-cs-green font-medium">
            Preferences saved successfully
          </span>
        )}
      </motion.div>

      {/* Security note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="flex items-start gap-3 px-4 py-3 rounded-lg bg-cs-green/[0.03] border border-cs-green/10"
      >
        <Shield className="w-4 h-4 text-cs-green shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500 leading-relaxed">
          Your session tokens are encrypted at rest and in transit. Streaming
          preferences are stored locally in your browser. Sign out on shared
          devices when you are done.
        </p>
      </motion.div>
    </div>
  );
}
