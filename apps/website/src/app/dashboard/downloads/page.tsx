'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Monitor,
  Laptop,
  Server,
  Smartphone,
  CheckCircle2,
  Download,
  RefreshCw,
  Loader2,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const installedApps = [
  {
    name: 'GridStreamer Host',
    version: 'v0.2.1-alpha',
    description: 'Stream capture and encoding service',
    upToDate: true,
  },
  {
    name: 'GridStreamer Client',
    version: 'v0.2.1-alpha',
    description: 'Stream receiver and decoder',
    upToDate: true,
  },
];

const availableDownloads = [
  {
    platform: 'Windows',
    icon: Monitor,
    version: 'v0.2.1-alpha',
    size: '45 MB',
    label: 'Windows 10/11 (x64)',
  },
  {
    platform: 'macOS',
    icon: Laptop,
    version: 'v0.2.1-alpha',
    size: '52 MB',
    label: 'macOS 13+ (ARM/Intel)',
  },
  {
    platform: 'Linux',
    icon: Server,
    version: 'v0.2.1-alpha',
    size: '38 MB',
    label: 'Ubuntu 22.04+ / Fedora 38+',
  },
  {
    platform: 'Android',
    icon: Smartphone,
    version: 'v0.2.1-alpha',
    size: '28 MB',
    label: 'Android 12+ (APK)',
  },
];

const versionHistory = [
  {
    version: 'v0.2.1-alpha',
    date: 'Feb 10, 2026',
    current: true,
    notes: 'Stability improvements, reduced jitter on high-latency connections, fixed relay handshake timeout.',
  },
  {
    version: 'v0.2.0-alpha',
    date: 'Jan 28, 2026',
    current: false,
    notes: 'Added secure relay support, improved NVENC encoding pipeline, new session management UI.',
  },
  {
    version: 'v0.1.0-alpha',
    date: 'Jan 10, 2026',
    current: false,
    notes: 'Initial alpha release with NvFBC capture, DTLS transport, and basic P2P connectivity.',
  },
];

export default function DashboardDownloadsPage() {
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateChecked, setUpdateChecked] = useState(false);

  const handleCheckUpdates = () => {
    setCheckingUpdates(true);
    setUpdateChecked(false);
    setTimeout(() => {
      setCheckingUpdates(false);
      setUpdateChecked(true);
    }, 1500);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-2xl sm:text-3xl font-bold text-white tracking-tight"
          >
            Downloads &amp; Updates
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-sm text-cs-gray-400 mt-1"
          >
            Manage your GridStreamer installations
          </motion.p>
        </div>
        <motion.button
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          onClick={handleCheckUpdates}
          disabled={checkingUpdates}
          className={cn(
            'shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-cs-green text-cs-dark font-semibold text-sm rounded-lg hover:bg-cs-green-300 transition-all duration-300 shadow-glow hover:shadow-glow-lg',
            checkingUpdates && 'opacity-80 cursor-wait'
          )}
        >
          {checkingUpdates ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Check for Updates
            </>
          )}
        </motion.button>
      </div>

      {updateChecked && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cs-green/[0.06] border border-cs-green/15"
        >
          <CheckCircle2 className="w-4 h-4 text-cs-green" />
          <span className="text-sm text-cs-green font-medium">
            All applications are up to date.
          </span>
        </motion.div>
      )}

      {/* Installed apps */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          Installed Applications
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {installedApps.map((app) => (
            <div
              key={app.name}
              className="gradient-border p-5 flex flex-col"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {app.name}
                  </h3>
                  <p className="text-xs text-cs-gray-400 mt-0.5">
                    {app.description}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cs-green/10 border border-cs-green/20 text-[10px] font-semibold text-cs-green">
                  <CheckCircle2 className="w-3 h-3" />
                  Up to date
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2 py-0.5 rounded-md bg-cs-surface border border-white/[0.06] text-xs font-mono text-cs-gray-300">
                  {app.version}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/[0.04]">
                <button className="text-xs font-medium text-cs-gray-400 hover:text-cs-green transition-colors">
                  Check
                </button>
                <span className="w-px h-3 bg-white/[0.06]" />
                <button className="text-xs font-medium text-cs-gray-500 hover:text-cs-gray-300 transition-colors">
                  Reinstall
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Available downloads */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25 }}
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          Available Downloads
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {availableDownloads.map((dl) => (
            <div
              key={dl.platform}
              className="gradient-border gradient-border-hover p-5 transition-all duration-300 hover:shadow-card-hover"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-cs-green/10 border border-cs-green/20 flex items-center justify-center">
                  <dl.icon className="w-4 h-4 text-cs-green" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {dl.platform}
                  </h3>
                  <p className="text-[11px] text-cs-gray-500">{dl.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-mono text-cs-gray-400">
                  {dl.version}
                </span>
                <span className="text-xs text-cs-gray-600">&middot;</span>
                <span className="text-xs text-cs-gray-400">{dl.size}</span>
              </div>
              <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-white/[0.08] text-cs-gray-200 text-sm font-medium rounded-lg hover:border-cs-green/30 hover:text-cs-green hover:bg-cs-green/5 transition-all duration-300">
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Version history */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          Version History
        </h2>
        <div className="gradient-border p-5 sm:p-6">
          <div className="space-y-0">
            {versionHistory.map((entry, i) => (
              <div
                key={entry.version}
                className={cn(
                  'relative pl-6 pb-5',
                  i < versionHistory.length - 1 &&
                    'border-l border-white/[0.06] ml-[5px]'
                )}
              >
                {/* Timeline dot */}
                <div
                  className={cn(
                    'absolute -left-[5px] top-0.5 w-[10px] h-[10px] rounded-full border-2',
                    entry.current
                      ? 'bg-cs-green border-cs-green/40'
                      : 'bg-cs-gray-600 border-cs-gray-500'
                  )}
                />

                <div className="flex flex-col sm:flex-row sm:items-start sm:gap-3">
                  <div className="flex items-center gap-2 mb-1 sm:mb-0">
                    <span className="text-sm font-mono font-semibold text-white">
                      {entry.version}
                    </span>
                    {entry.current && (
                      <span className="px-1.5 py-0.5 rounded bg-cs-green/10 border border-cs-green/20 text-[9px] font-bold text-cs-green uppercase tracking-wider">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-cs-gray-500">
                    <Clock className="w-3 h-3" />
                    {entry.date}
                  </div>
                </div>
                <p className="text-xs text-cs-gray-400 mt-1.5 leading-relaxed">
                  {entry.notes}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
