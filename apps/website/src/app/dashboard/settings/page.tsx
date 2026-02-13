'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  User,
  LogOut,
  Eye,
  EyeOff,
  RefreshCw,
  Shield,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const [defaultQuality, setDefaultQuality] = useState('balanced');
  const [defaultTransport, setDefaultTransport] = useState('udp');
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [environment, setEnvironment] = useState('development');

  const apiKey = 'csk_live_a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ';

  const inputClass =
    'w-full bg-cs-surface border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white placeholder:text-cs-gray-400 focus:border-cs-green/50 focus:ring-1 focus:ring-cs-green/20 focus:outline-none transition-colors';
  const selectClass =
    'w-full bg-cs-surface border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white focus:border-cs-green/50 focus:ring-1 focus:ring-cs-green/20 focus:outline-none transition-colors appearance-none';

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setApiKeyCopied(true);
    setTimeout(() => setApiKeyCopied(false), 2000);
  };

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
        enabled ? 'bg-cs-green' : 'bg-cs-gray-600'
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

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-2xl sm:text-3xl font-bold text-white tracking-tight"
        >
          Settings
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-sm text-cs-gray-400 mt-1"
        >
          Configure your account and streaming preferences
        </motion.p>
      </div>

      {/* Account section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="gradient-border p-5 sm:p-6"
      >
        <h2 className="text-base font-semibold text-white mb-5">Account</h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0">
            <span className="text-lg font-bold text-cs-green">CC</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">ccooper</p>
            <p className="text-xs text-cs-gray-400 mt-0.5">
              ccooper@crazystream.dev
            </p>
          </div>
          <button className="shrink-0 inline-flex items-center gap-2 px-4 py-2 border border-white/[0.08] text-cs-gray-300 text-sm font-medium rounded-lg hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/5 transition-all duration-300">
            <LogOut className="w-4 h-4" />
            Sign Out
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
        <h2 className="text-base font-semibold text-white mb-5">
          Streaming Preferences
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-cs-gray-300 mb-1.5">
              Default Quality Preset
            </label>
            <select
              value={defaultQuality}
              onChange={(e) => setDefaultQuality(e.target.value)}
              className={selectClass}
            >
              <option value="competitive">Competitive (1080p/240fps)</option>
              <option value="balanced">Balanced (1440p/144fps)</option>
              <option value="cinematic">Cinematic (4K/60fps)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-cs-gray-300 mb-1.5">
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
        <h2 className="text-base font-semibold text-white mb-5">
          Notifications
        </h2>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                Email Notifications
              </p>
              <p className="text-xs text-cs-gray-400 mt-0.5">
                Receive session alerts and updates via email
              </p>
            </div>
            <Toggle enabled={emailNotifs} onChange={setEmailNotifs} />
          </div>
          <div className="border-t border-white/[0.04]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                Push Notifications
              </p>
              <p className="text-xs text-cs-gray-400 mt-0.5">
                Get real-time alerts on your devices
              </p>
            </div>
            <Toggle enabled={pushNotifs} onChange={setPushNotifs} />
          </div>
        </div>
      </motion.div>

      {/* Advanced */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="gradient-border p-5 sm:p-6"
      >
        <h2 className="text-base font-semibold text-white mb-5">Advanced</h2>
        <div className="space-y-5">
          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-cs-gray-300 mb-1.5">
              API Key
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-cs-surface border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm font-mono text-cs-gray-300 truncate">
                {showApiKey
                  ? apiKey
                  : 'csk_live_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
              </div>
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="shrink-0 p-2.5 rounded-lg border border-white/[0.08] hover:border-cs-green/30 hover:bg-cs-green/5 text-cs-gray-300 hover:text-cs-green transition-all"
              >
                {showApiKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={handleCopyApiKey}
                className="shrink-0 p-2.5 rounded-lg border border-white/[0.08] hover:border-cs-green/30 hover:bg-cs-green/5 text-cs-gray-300 hover:text-cs-green transition-all"
              >
                {apiKeyCopied ? (
                  <CheckCircle2 className="w-4 h-4 text-cs-green" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <button className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-cs-gray-500 hover:text-amber-400 transition-colors">
              <RefreshCw className="w-3 h-3" />
              Regenerate Key
            </button>
          </div>

          <div className="border-t border-white/[0.04]" />

          {/* Environment selector */}
          <div>
            <label className="block text-xs font-medium text-cs-gray-300 mb-1.5">
              Environment
            </label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className={selectClass}
            >
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Security note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="flex items-start gap-3 px-4 py-3 rounded-lg bg-cs-green/[0.03] border border-cs-green/10"
      >
        <Shield className="w-4 h-4 text-cs-green shrink-0 mt-0.5" />
        <p className="text-xs text-cs-gray-400 leading-relaxed">
          Your API key and session tokens are encrypted at rest and in transit.
          Never share your API key publicly. Regenerate immediately if
          compromised.
        </p>
      </motion.div>
    </div>
  );
}
