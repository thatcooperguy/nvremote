'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Monitor,
  Smartphone,
  Download,
  Loader2,
  Clock,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const VERSION = 'v0.5.1-beta';
const GCS_BUCKET = 'https://storage.googleapis.com/nvremote-downloads';
const BASE_URL = `${GCS_BUCKET}/${VERSION}`;
const DOWNLOAD_API = '/api/download';
const GITHUB_RELEASES =
  'https://github.com/thatcooperguy/nvremote/releases';

/* -------------------------------------------------------------------------- */
/*  Platform Icons (SVG)                                                       */
/* -------------------------------------------------------------------------- */

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type DownloadAvailability = 'available' | 'unavailable' | 'checking';

interface PlatformDownload {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  fileName: string;
  directUrl: string;
  apiUrl: string;
  label: string;
  comingSoon?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Platform download definitions                                              */
/* -------------------------------------------------------------------------- */

const platformDownloads: PlatformDownload[] = [
  {
    id: 'windows-client',
    name: 'Windows (Client + Host)',
    description: 'Unified app — stream to or from this machine',
    icon: <Monitor className="w-5 h-5" />,
    fileName: `NVRemote-${VERSION.replace('v', '')}-Setup.exe`,
    directUrl: `${BASE_URL}/NVRemote-${VERSION.replace('v', '')}-Setup.exe`,
    apiUrl: `${DOWNLOAD_API}/windows-client`,
    label: 'Windows 10/11 (x64) — Client, Host, or Both',
  },
  {
    id: 'linux-client',
    name: 'Linux Desktop Client',
    description: 'Stream receiver for Linux (x86_64)',
    icon: <Monitor className="w-5 h-5" />,
    fileName: `NVRemote-${VERSION.replace('v', '')}-x86_64.AppImage`,
    directUrl: `${BASE_URL}/NVRemote-${VERSION.replace('v', '')}-x86_64.AppImage`,
    apiUrl: `${DOWNLOAD_API}/linux-client`,
    label: 'Linux x86_64 (AppImage)',
  },
  {
    id: 'linux-host',
    name: 'Linux Host Agent',
    description: 'Host agent for Linux (amd64)',
    icon: <Monitor className="w-5 h-5" />,
    fileName: `NVRemoteHost-${VERSION}-linux-amd64.tar.gz`,
    directUrl: `${BASE_URL}/NVRemoteHost-${VERSION}-linux-amd64.tar.gz`,
    apiUrl: `${DOWNLOAD_API}/linux-host`,
    label: 'Linux x86_64 — Requires NVIDIA GPU',
  },
  {
    id: 'linux-host-arm64',
    name: 'Linux Host Agent (ARM64)',
    description: 'Host agent for Jetson, Orin, DGX Spark',
    icon: <Monitor className="w-5 h-5" />,
    fileName: `NVRemoteHost-${VERSION}-linux-arm64.tar.gz`,
    directUrl: `${BASE_URL}/NVRemoteHost-${VERSION}-linux-arm64.tar.gz`,
    apiUrl: `${DOWNLOAD_API}/linux-host-arm64`,
    label: 'Linux ARM64 — Jetson / DGX Spark',
  },
  {
    id: 'android-client',
    name: 'Android Client',
    description: 'Stream receiver for Android devices',
    icon: <Smartphone className="w-5 h-5" />,
    fileName: `NVRemote-${VERSION}.apk`,
    directUrl: `${BASE_URL}/NVRemote-${VERSION}.apk`,
    apiUrl: `${DOWNLOAD_API}/android-client`,
    label: 'Android 8.0+ (APK sideload)',
  },
  {
    id: 'macos-client',
    name: 'macOS Client',
    description: 'Stream receiver for macOS',
    icon: <AppleIcon className="w-5 h-5" />,
    fileName: `NVRemote-${VERSION.replace('v', '')}-universal.dmg`,
    directUrl: `${BASE_URL}/NVRemote-${VERSION.replace('v', '')}-universal.dmg`,
    apiUrl: `${DOWNLOAD_API}/macos-client`,
    label: 'macOS 13+ (Universal)',
    comingSoon: true,
  },
];

/* -------------------------------------------------------------------------- */
/*  Helper: check if a GCS file exists via HEAD request                        */
/* -------------------------------------------------------------------------- */

async function checkFileAvailability(
  url: string
): Promise<DownloadAvailability> {
  try {
    const res = await fetch(url, { method: 'HEAD', mode: 'cors' });
    return res.ok ? 'available' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/* -------------------------------------------------------------------------- */
/*  Download Card Component                                                    */
/* -------------------------------------------------------------------------- */

function DownloadCard({
  platform,
  availability,
  index,
}: {
  platform: PlatformDownload;
  availability: DownloadAvailability;
  index: number;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    if (platform.comingSoon) return;
    navigator.clipboard.writeText(platform.directUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isAvailable = availability === 'available' && !platform.comingSoon;
  const isChecking = availability === 'checking';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className={cn(
        'gradient-border p-5 flex flex-col transition-all duration-300',
        platform.comingSoon
          ? 'opacity-60'
          : 'gradient-border-hover hover:shadow-card-hover'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-nv-green/10 border border-nv-green/20 flex items-center justify-center shrink-0 text-nv-green">
          {platform.icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {platform.name}
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">{platform.label}</p>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 mb-3">{platform.description}</p>

      {/* Version + Status */}
      <div className="flex items-center gap-2 mb-4">
        <span className="px-2 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-xs font-mono text-gray-600">
          {VERSION}
        </span>
        {platform.comingSoon && (
          <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-600 uppercase tracking-wider">
            Coming Soon
          </span>
        )}
        {!platform.comingSoon && isAvailable && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-nv-green/10 border border-nv-green/20 text-[10px] font-semibold text-nv-green">
            <CheckCircle2 className="w-3 h-3" />
            Available
          </span>
        )}
        {!platform.comingSoon && availability === 'unavailable' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-[10px] font-semibold text-gray-400">
            <AlertCircle className="w-3 h-3" />
            Not uploaded yet
          </span>
        )}
        {isChecking && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-[10px] font-semibold text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Checking
          </span>
        )}
      </div>

      {/* File name */}
      {!platform.comingSoon && (
        <div className="flex items-center gap-1.5 mb-4 text-[11px] text-gray-400 font-mono truncate">
          <FileText className="w-3 h-3 shrink-0" />
          <span className="truncate">{platform.fileName}</span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Download button */}
      {platform.comingSoon ? (
        <button
          disabled
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed"
        >
          <Clock className="w-3.5 h-3.5" />
          Coming Soon
        </button>
      ) : (
        <div className="space-y-2">
          <a
            href={isAvailable ? platform.apiUrl : undefined}
            onClick={(e) => {
              if (!isAvailable) e.preventDefault();
            }}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300',
              isAvailable
                ? 'bg-nv-green text-white hover:bg-nv-green-300 shadow-glow hover:shadow-glow-lg'
                : 'border border-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            <Download className="w-3.5 h-3.5" />
            {isAvailable ? 'Download' : 'Unavailable'}
          </a>

          {/* Copy link */}
          {isAvailable && (
            <button
              onClick={handleCopyLink}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-nv-green/30 hover:bg-nv-green/5 transition-all duration-200"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-nv-green" />
                  <span className="text-nv-green">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy Direct Link
                </>
              )}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Loading Skeleton                                                           */
/* -------------------------------------------------------------------------- */

function DownloadCardSkeleton() {
  return (
    <div className="gradient-border p-5 flex flex-col animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-gray-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-50 rounded w-1/2" />
        </div>
      </div>
      <div className="h-3 bg-gray-50 rounded w-full mb-3" />
      <div className="flex gap-2 mb-4">
        <div className="h-5 w-20 bg-gray-100 rounded" />
        <div className="h-5 w-16 bg-gray-100 rounded" />
      </div>
      <div className="flex-1" />
      <div className="h-9 bg-gray-100 rounded-lg" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty State                                                                */
/* -------------------------------------------------------------------------- */

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="gradient-border p-8 text-center"
    >
      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <Download className="w-6 h-6 text-gray-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">
        No downloads available
      </h3>
      <p className="text-xs text-gray-500 max-w-sm mx-auto">
        Release binaries have not been uploaded yet. Check back soon or visit
        the GitHub releases page for the latest builds.
      </p>
      <a
        href={GITHUB_RELEASES}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 mt-4 text-xs font-medium text-nv-green hover:text-nv-green-300 transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
        View GitHub Releases
      </a>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page Component                                                             */
/* -------------------------------------------------------------------------- */

export default function DashboardDownloadsPage() {
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<
    Record<string, DownloadAvailability>
  >({});

  // Check availability of each platform binary in GCS
  const checkAvailability = useCallback(async () => {
    setLoading(true);

    // Initialize all as 'checking'
    const checking: Record<string, DownloadAvailability> = {};
    for (const p of platformDownloads) {
      checking[p.id] = p.comingSoon ? 'unavailable' : 'checking';
    }
    setAvailability(checking);

    // Check each non-coming-soon platform in parallel
    const results: Record<string, DownloadAvailability> = {};
    await Promise.all(
      platformDownloads.map(async (p) => {
        if (p.comingSoon) {
          results[p.id] = 'unavailable';
          return;
        }
        results[p.id] = await checkFileAvailability(p.directUrl);
      })
    );

    setAvailability(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  const availableCount = Object.values(availability).filter(
    (v) => v === 'available'
  ).length;
  const totalNonComingSoon = platformDownloads.filter(
    (p) => !p.comingSoon
  ).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight"
          >
            Downloads
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-sm text-gray-500 mt-1"
          >
            Download NVRemote clients for your devices
          </motion.p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="flex items-center gap-3"
        >
          <a
            href={GITHUB_RELEASES}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:border-nv-green/30 hover:text-nv-green hover:bg-nv-green/5 transition-all duration-300"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            GitHub Releases
          </a>
        </motion.div>
      </div>

      {/* Current Version Banner */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="flex items-center justify-between px-4 py-3 rounded-lg bg-nv-green/[0.04] border border-nv-green/15"
      >
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 rounded-md bg-nv-green/10 border border-nv-green/20 text-xs font-mono font-semibold text-nv-green">
            {VERSION}
          </span>
          <span className="text-sm text-gray-600">
            Latest release
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-600 uppercase tracking-wider">
            Alpha
          </span>
        </div>
        {!loading && (
          <span className="text-xs text-gray-400">
            {availableCount} of {totalNonComingSoon} binaries available
          </span>
        )}
      </motion.div>

      {/* Platform Downloads */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Available Platforms
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <DownloadCardSkeleton key={i} />
            ))}
          </div>
        ) : availableCount === 0 && totalNonComingSoon > 0 ? (
          <>
            <EmptyState />
            {/* Still show cards in a muted state so users can see what platforms exist */}
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-500 mb-3">
                Planned platforms
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {platformDownloads.map((platform, i) => (
                  <DownloadCard
                    key={platform.id}
                    platform={platform}
                    availability={availability[platform.id] || 'unavailable'}
                    index={i}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {platformDownloads.map((platform, i) => (
              <DownloadCard
                key={platform.id}
                platform={platform}
                availability={availability[platform.id] || 'unavailable'}
                index={i}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* Platform summary table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Platform Support
        </h2>
        <div className="gradient-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200/60 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Platform
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  File
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/60">
              {platformDownloads.map((p) => {
                const status = availability[p.id] || 'checking';
                return (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-nv-green">{p.icon}</span>
                        <span className="font-medium text-gray-900 text-sm">
                          {p.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {p.id.includes('host') ? 'Host' : 'Client'}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-400 truncate max-w-[200px]">
                      {p.comingSoon ? '--' : p.fileName}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {p.comingSoon ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-600 uppercase">
                          Coming Soon
                        </span>
                      ) : status === 'available' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-nv-green/10 border border-nv-green/20 text-[10px] font-semibold text-nv-green">
                          <CheckCircle2 className="w-3 h-3" />
                          Available
                        </span>
                      ) : status === 'checking' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 mx-auto" />
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-[10px] font-semibold text-gray-400">
                          <AlertCircle className="w-3 h-3" />
                          Not uploaded
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Quick Links */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <div className="gradient-border p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Resources
          </h3>
          <div className="flex flex-wrap gap-4">
            <a
              href={GITHUB_RELEASES}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-nv-green transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Release Notes
            </a>
            <a
              href="https://github.com/thatcooperguy/nvremote/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-nv-green transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Report an Issue
            </a>
            <a
              href="/downloads"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-nv-green transition-colors"
            >
              <Download className="w-3 h-3" />
              Public Downloads Page
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
