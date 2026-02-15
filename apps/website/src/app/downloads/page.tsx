'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Monitor,
  Laptop,
  Smartphone,
  Globe,
  Copy,
  Shield,
  FileText,
  HelpCircle,
  AlertTriangle,
  ExternalLink,
  Check,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import Button from '@/components/Button';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const VERSION = 'v0.3.0-alpha';
const GCS_BUCKET = 'https://storage.googleapis.com/nvremote-downloads';
const BASE_URL = `${GCS_BUCKET}/${VERSION}`;
const GITHUB_RELEASES = 'https://github.com/thatcooperguy/nvstreamer/releases';

/* -------------------------------------------------------------------------- */
/*  Platform Icons                                                             */
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

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

function PlayStoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302a1 1 0 0 1 0 1.38l-2.302 2.302L15.092 12l2.606-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302L5.864 2.658z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Animation Variants                                                         */
/* -------------------------------------------------------------------------- */

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08 },
  }),
};

const sectionFade = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6 },
  },
};

/* -------------------------------------------------------------------------- */
/*  Data Types                                                                 */
/* -------------------------------------------------------------------------- */

interface DownloadItem {
  platform: string;
  ext: string;
  icon: React.ReactNode;
  version: string;
  size: string;
  sha256: string;
  href: string;
  disabled?: boolean;
  comingSoon?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Host Downloads                                                             */
/* -------------------------------------------------------------------------- */

const hostDownloads: DownloadItem[] = [
  {
    platform: 'Windows Host',
    ext: '.zip',
    icon: <Monitor className="w-6 h-6" />,
    version: VERSION,
    size: '~48 MB',
    sha256: '',
    href: `${BASE_URL}/NVRemoteHost-${VERSION}-win64.zip`,
  },
  {
    platform: 'Linux Host',
    ext: '.tar.gz',
    icon: <Laptop className="w-6 h-6" />,
    version: VERSION,
    size: '~12 MB',
    sha256: '',
    href: `${BASE_URL}/NVRemoteHost-${VERSION}-linux-amd64.tar.gz`,
  },
  {
    platform: 'macOS Host',
    ext: '.pkg',
    icon: <AppleIcon className="w-6 h-6" />,
    version: VERSION,
    size: '~45 MB',
    sha256: '',
    href: `${BASE_URL}/NVRemoteHost-${VERSION}-universal.pkg`,
    disabled: true,
    comingSoon: true,
  },
];

/* -------------------------------------------------------------------------- */
/*  Client Downloads                                                           */
/* -------------------------------------------------------------------------- */

const clientDownloads: DownloadItem[] = [
  {
    platform: 'Windows Client',
    ext: '.exe',
    icon: <Monitor className="w-6 h-6" />,
    version: VERSION,
    size: '~35 MB',
    sha256: '',
    href: `${BASE_URL}/NVRemote-${VERSION.replace('v', '')}-Setup.exe`,
  },
  {
    platform: 'macOS Client',
    ext: '.dmg',
    icon: <AppleIcon className="w-6 h-6" />,
    version: VERSION,
    size: '~38 MB',
    sha256: '',
    href: `${BASE_URL}/NVRemote-${VERSION.replace('v', '')}-universal.dmg`,
  },
  {
    platform: 'Linux Client',
    ext: '.AppImage',
    icon: <Laptop className="w-6 h-6" />,
    version: VERSION,
    size: '~40 MB',
    sha256: '',
    href: `${BASE_URL}/NVRemote-${VERSION.replace('v', '')}-x86_64.AppImage`,
  },
  {
    platform: 'Android Client',
    ext: '.apk',
    icon: <Smartphone className="w-6 h-6" />,
    version: VERSION,
    size: '~25 MB',
    sha256: '',
    href: `${BASE_URL}/NVRemote-${VERSION}.apk`,
  },
  {
    platform: 'Web Client',
    ext: '',
    icon: <Globe className="w-6 h-6" />,
    version: VERSION,
    size: '',
    sha256: '',
    href: '#',
    disabled: true,
    comingSoon: true,
  },
];

/* -------------------------------------------------------------------------- */
/*  Download Card Component                                                    */
/* -------------------------------------------------------------------------- */

function DownloadCardFull({
  item,
  index,
}: {
  item: DownloadItem;
  index: number;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    if (item.disabled) return;
    navigator.clipboard.writeText(item.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <motion.div
      custom={index}
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      className={cn(
        'gradient-border gradient-border-hover group relative overflow-hidden p-6 flex flex-col h-full transition-all duration-500',
        item.disabled
          ? 'opacity-50 pointer-events-none'
          : 'hover:-translate-y-1 hover:shadow-card-hover'
      )}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cs-green/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Coming Soon badge */}
      {item.comingSoon && (
        <div className="absolute top-4 right-4 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-300">
          <span className="text-[10px] font-bold text-amber-600 tracking-widest uppercase">
            Coming Soon
          </span>
        </div>
      )}

      {/* Header: Icon + Platform */}
      <div className="flex items-start gap-4 mb-5">
        <div className="relative w-12 h-12 rounded-xl bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0 text-cs-green group-hover:border-cs-green/40 transition-all duration-300">
          {item.icon}
          <div className="absolute inset-0 rounded-xl bg-cs-green/0 group-hover:bg-cs-green/10 blur-xl transition-all duration-500" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900 tracking-tight">
            {item.platform}
          </h3>
          {item.ext && (
            <p className="text-sm text-gray-500 font-mono mt-0.5">
              {item.ext}
            </p>
          )}
        </div>
      </div>

      {/* Version + Alpha badges */}
      <div className="flex items-center gap-2 mb-5">
        <span className="px-2.5 py-1 rounded-md bg-cs-green/[0.08] border border-cs-green/15 text-xs font-mono font-medium text-cs-green">
          {item.version}
        </span>
        <span className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-xs font-medium text-amber-600">
          Alpha
        </span>
      </div>

      {/* File size */}
      {item.size && (
        <div className="flex items-center gap-2 mb-5 text-sm text-gray-600">
          <FileText className="w-4 h-4 text-gray-400" />
          <span>{item.size}</span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Download button */}
      <div className="mb-3">
        {item.comingSoon ? (
          <button
            disabled
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl bg-gray-50 border border-gray-200 text-gray-400 cursor-not-allowed"
          >
            <Globe className="w-4 h-4" />
            Coming Soon
          </button>
        ) : (
          <Button
            href={item.href}
            variant="primary"
            size="md"
            className="w-full"
          >
            <FileText className="w-4 h-4" />
            Download
          </Button>
        )}
      </div>

      {/* Copy Link button */}
      {!item.comingSoon && (
        <button
          onClick={handleCopyLink}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-cs-green/30 hover:bg-cs-green/5 transition-all duration-200"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-cs-green" />
              <span className="text-cs-green">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy Link
            </>
          )}
        </button>
      )}

      {/* SHA256 hash */}
      {item.sha256 && (
        <div className="mt-4 pt-4 border-t border-gray-200/60">
          <p className="text-[10px] font-mono text-gray-400 break-all leading-relaxed">
            <span className="text-gray-500">SHA256:</span>{' '}
            {item.sha256}
          </p>
        </div>
      )}

      {/* Release Notes link */}
      {!item.comingSoon && (
        <a
          href="https://github.com/thatcooperguy/nvstreamer/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-cs-green transition-colors duration-200"
        >
          <ExternalLink className="w-3 h-3" />
          Release Notes
        </a>
      )}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page Component                                                             */
/* -------------------------------------------------------------------------- */

export default function DownloadsPage() {
  return (
    <>
      {/* ================================================================ */}
      {/*  HERO HEADER                                                     */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-glow-intense" />
        <div className="absolute inset-0 grid-overlay opacity-30 mask-fade-b" />
        <div className="orb orb-green w-[500px] h-[500px] top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-glow" />

        <div className="relative section-padding pt-24 sm:pt-32 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto text-center"
          >
            <p className="text-xs text-cs-green uppercase tracking-[0.2em] font-semibold mb-4">
              Get Started
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-5">
              Download{' '}
              <span className="text-gradient">NVREMOTE</span>
            </h1>
            <p className="text-lg text-gray-700 max-w-xl mx-auto leading-relaxed">
              Install the Host on your gaming PC and the Client on the
              device you want to stream to. Available for all major
              platforms.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  HOST DOWNLOADS                                                  */}
      {/* ================================================================ */}
      <section className="section-padding py-16 sm:py-20 relative">
        <div className="absolute inset-0 dot-overlay opacity-20 mask-fade-y pointer-events-none" />

        <div className="relative max-w-6xl mx-auto">
          <motion.div
            variants={sectionFade}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-cs-green/20 mb-6">
              <Monitor className="w-4 h-4 text-cs-green" />
              <span className="text-xs font-semibold text-cs-green tracking-wide uppercase">
                Server Side
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Host Application
            </h2>
            <p className="text-gray-600 max-w-lg mx-auto">
              Install on the machine streaming your games. Requires an
              NVIDIA GPU with NvFBC / NVENC support.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {hostDownloads.map((item, i) => (
              <DownloadCardFull key={item.platform} item={item} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  HOST / CLIENT NOTE                                              */}
      {/* ================================================================ */}
      <motion.div
        variants={sectionFade}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="section-padding"
      >
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-4 px-6 py-4 rounded-xl glass border border-gray-200">
            <div className="w-2 h-2 rounded-full bg-cs-green shrink-0" />
            <p className="text-sm text-gray-600">
              <span className="text-gray-900 font-medium">Host</span> runs on
              the machine streaming the game.{' '}
              <span className="text-gray-900 font-medium">Client</span>{' '}
              connects remotely to receive the stream.
            </p>
          </div>
        </div>
      </motion.div>

      {/* ================================================================ */}
      {/*  CLIENT DOWNLOADS                                                */}
      {/* ================================================================ */}
      <section className="section-padding py-16 sm:py-20 relative">
        <div className="absolute inset-0 grid-overlay opacity-20 mask-fade-y pointer-events-none" />

        <div className="relative max-w-6xl mx-auto">
          <motion.div
            variants={sectionFade}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-cs-green/20 mb-6">
              <Smartphone className="w-4 h-4 text-cs-green" />
              <span className="text-xs font-semibold text-cs-green tracking-wide uppercase">
                Client Side
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Client Applications
            </h2>
            <p className="text-gray-600 max-w-lg mx-auto">
              Install on the device you want to stream TO. Supports
              desktop, mobile, and web.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {clientDownloads.map((item, i) => (
              <DownloadCardFull key={item.platform} item={item} index={i} />
            ))}
          </div>

          {/* ============================================================ */}
          {/*  ANDROID SPECIFIC SECTION                                    */}
          {/* ============================================================ */}
          <motion.div
            variants={sectionFade}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mt-10"
          >
            {/* Android Warning Banner */}
            <div className="info-box info-box-warning flex items-start gap-3 mb-8">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700">
                <span className="font-semibold text-amber-600">
                  Android Sideloading:
                </span>{' '}
                Install from trusted sources only. Verify the SHA256 hash
                before installing to ensure the APK has not been tampered
                with.
              </p>
            </div>

            {/* QR Code + Google Play */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
              {/* QR Code Card */}
              <div className="gradient-border p-6 flex flex-col items-center text-center">
                <h4 className="text-sm font-semibold text-gray-900 mb-4 tracking-tight">
                  Scan to Download APK
                </h4>
                <div className="bg-white rounded-xl p-3 mb-4">
                  <QRCodeSVG
                    value={`${BASE_URL}/NVRemote-${VERSION}.apk`}
                    size={140}
                    level="M"
                    bgColor="#FFFFFF"
                    fgColor="#0A0A0A"
                  />
                </div>
                <p className="text-[11px] text-gray-400 font-mono break-all">
                  NVRemote-{VERSION}.apk
                </p>
              </div>

              {/* Google Play Card */}
              <div className="gradient-border p-6 flex flex-col items-center justify-center text-center">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 tracking-tight">
                  Prefer the Play Store?
                </h4>
                <p className="text-xs text-gray-500 mb-6">
                  Automatic updates and verified installs.
                </p>
                <a
                  href="https://play.google.com/store/apps/details?id=com.nvremote.client"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gray-100 border border-gray-300 hover:border-cs-green/30 hover:bg-cs-green/5 transition-all duration-300"
                >
                  <PlayStoreIcon />
                  <div className="text-left">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider leading-none">
                      Get it on
                    </span>
                    <span className="block text-sm font-semibold text-gray-900 leading-tight">
                      Google Play
                    </span>
                  </div>
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  SECURITY NOTE                                                   */}
      {/* ================================================================ */}
      <motion.section
        variants={sectionFade}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="section-padding pb-12"
      >
        <div className="max-w-4xl mx-auto">
          <div className="info-box info-box-warning flex items-start gap-4">
            <Shield className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-amber-600 mb-1">
                Security Notice
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Never expose private hosts directly to the internet. Use
                the NVRemote relay service or secure tunnel
                configurations for remote connections. All traffic is
                encrypted with DTLS 1.2 by default.
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ================================================================ */}
      {/*  VERIFY YOUR DOWNLOAD                                            */}
      {/* ================================================================ */}
      <section className="section-padding py-16 sm:py-20">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Verify Section */}
            <motion.div
              variants={sectionFade}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="gradient-border p-6 sm:p-8"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2.5 tracking-tight">
                <Shield className="w-5 h-5 text-cs-green" />
                Verify Your Download
              </h3>
              <p className="text-sm text-gray-600 mb-5 leading-relaxed">
                Always verify the SHA-256 checksum to ensure file integrity
                and authenticity.
              </p>

              {/* PowerShell */}
              <div className="code-block mb-4">
                <div className="code-block-header">PowerShell (Windows)</div>
                <pre>
                  <code className="text-sm font-mono text-gray-700">
{`Get-FileHash .\\NVRemoteHost-${VERSION}-win64.exe -Algorithm SHA256`}
                  </code>
                </pre>
              </div>

              {/* Bash */}
              <div className="code-block">
                <div className="code-block-header">bash (macOS / Linux)</div>
                <pre>
                  <code className="text-sm font-mono text-gray-700">
{`sha256sum NVRemoteHost-${VERSION}-amd64.deb`}
                  </code>
                </pre>
              </div>
            </motion.div>

            {/* Need Help */}
            <motion.div
              variants={sectionFade}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="gradient-border p-6 sm:p-8"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2.5 tracking-tight">
                <HelpCircle className="w-5 h-5 text-cs-green" />
                Need Help?
              </h3>
              <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                Check out the documentation for setup instructions,
                troubleshooting guides, and configuration references.
              </p>
              <div className="flex flex-col gap-3">
                <Button href="/docs/" variant="ghost" size="sm" showArrow>
                  Setup Documentation
                </Button>
                <Button
                  href="https://github.com/thatcooperguy/nvstreamer/issues"
                  variant="ghost"
                  size="sm"
                  external
                >
                  Report an Issue on GitHub
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
}
