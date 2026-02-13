import type { Metadata } from 'next';
import DownloadCard from '@/components/DownloadCard';
import Button from '@/components/Button';

export const metadata: Metadata = {
  title: 'Downloads — CrazyStream',
  description:
    'Download CrazyStream Host and Client for Windows. Stream games with ultra low latency using NVIDIA hardware acceleration.',
};

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function HostIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClientIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

function MacIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 5-4 5-6s-1.5-2-2-2c-1 0-1.5.5-3 .5s-2-.5-3-.5-2 0-3 .5-2-.5-3-.5c-.5 0-2 0-2 2s2 6 5 6c1.25 0 2.5-1.06 4-1.06z" />
      <path d="M10 2c1 .5 2 2 2 5" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 2l2 4" />
      <path d="M16 2l-2 4" />
      <path d="M5 6h14" />
      <circle cx="9" cy="8" r="0.5" fill="currentColor" />
      <circle cx="15" cy="8" r="0.5" fill="currentColor" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

const BASE_URL = 'https://storage.googleapis.com/crazystream-releases/v0.1.0';

export default function DownloadsPage() {
  return (
    <>
      {/* Header */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-glow" />
        <div className="absolute inset-0 grid-overlay opacity-30 mask-fade-b" />

        <div className="relative section-padding pt-24 sm:pt-32 pb-16">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-xs text-cs-green uppercase tracking-[0.2em] font-semibold mb-4">
              Get Started
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-5">
              Download <span className="text-gradient">CrazyStream</span>
            </h1>
            <p className="text-lg text-cs-gray-200 max-w-xl mx-auto leading-relaxed">
              Get the Host for your gaming PC and the Client for the device you
              want to stream to.
            </p>
          </div>
        </div>
      </section>

      {/* Platform detection */}
      <section className="section-padding pb-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl glass border border-white/[0.06] w-fit mx-auto">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-blue-400">
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
            </svg>
            <span className="text-sm text-cs-gray-200">
              Available for <span className="text-white font-semibold">Windows 10/11 (x64)</span>
            </span>
            <span className="text-cs-gray-600 mx-1">|</span>
            <span className="text-sm text-cs-gray-400">
              macOS, Linux &amp; Android coming soon
            </span>
          </div>
        </div>
      </section>

      {/* Download cards */}
      <section className="section-padding pb-16 sm:pb-20">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          <DownloadCard
            title="CrazyStream Host"
            subtitle="Install on the machine you want to stream FROM"
            version="v0.1.0-alpha"
            downloadUrl={`${BASE_URL}/CrazyStreamHost-v0.1.0-win64.exe`}
            downloadLabel="Download Host (.exe)"
            icon={<HostIcon />}
            requirements={[
              { label: 'OS', value: 'Windows 10/11 (x64)' },
              { label: 'GPU', value: 'NVIDIA GTX 900 series or newer' },
              { label: 'RAM', value: '8 GB minimum' },
              { label: 'Driver', value: 'NVIDIA 535+ recommended' },
              { label: 'Network', value: '20 Mbps upload minimum' },
            ]}
            checksum="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
          />
          <DownloadCard
            title="CrazyStream Client"
            subtitle="Install on the machine you want to stream TO"
            version="v0.1.0-alpha"
            downloadUrl={`${BASE_URL}/CrazyStreamClient-v0.1.0-win64.exe`}
            downloadLabel="Download Client (.exe)"
            icon={<ClientIcon />}
            requirements={[
              { label: 'OS', value: 'Windows 10/11 (x64)' },
              { label: 'GPU', value: 'Any GPU with hardware decode' },
              { label: 'RAM', value: '4 GB minimum' },
              { label: 'Display', value: 'Up to 4K@60 or 1080p@240' },
              { label: 'Network', value: '20 Mbps download minimum' },
            ]}
            checksum="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
          />
        </div>
      </section>

      {/* Coming Soon Platforms */}
      <section className="section-padding pb-16 sm:pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="section-divider mb-12" />
          <h2 className="text-center text-xl font-bold text-white mb-8 tracking-tight">
            Coming Soon
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* macOS Client */}
            <div className="gradient-border p-6 flex items-center gap-5 opacity-60">
              <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 text-cs-gray-400">
                <MacIcon />
              </div>
              <div>
                <h3 className="text-base font-semibold text-cs-gray-200">macOS Client</h3>
                <p className="text-xs text-cs-gray-500 mt-0.5">Native Metal rendering &bull; VideoToolbox decode</p>
              </div>
              <div className="ml-auto px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[10px] font-semibold text-cs-gray-400 uppercase tracking-widest">Soon</span>
              </div>
            </div>

            {/* Android Client */}
            <div className="gradient-border p-6 flex items-center gap-5 opacity-60">
              <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 text-cs-gray-400">
                <AndroidIcon />
              </div>
              <div>
                <h3 className="text-base font-semibold text-cs-gray-200">Android App</h3>
                <p className="text-xs text-cs-gray-500 mt-0.5">Touch controls &bull; Xbox gamepad overlay</p>
              </div>
              <div className="ml-auto px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[10px] font-semibold text-cs-gray-400 uppercase tracking-widest">Soon</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Additional info */}
      <section className="section-padding pb-24 sm:pb-32">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Verify downloads */}
            <div className="gradient-border p-6 sm:p-8">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2.5 tracking-tight">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cs-green">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Verify Your Download
              </h3>
              <p className="text-sm text-cs-gray-300 mb-5 leading-relaxed">
                Always verify the SHA-256 checksum of your download to ensure file integrity.
              </p>
              <div className="code-block">
                <div className="code-block-header">PowerShell</div>
                <pre className="p-4">
                  <code className="text-sm font-mono text-cs-gray-200">
                    Get-FileHash .\CrazyStreamHost-v0.1.0-win64.exe
                  </code>
                </pre>
              </div>
            </div>

            {/* Need help */}
            <div className="gradient-border p-6 sm:p-8">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2.5 tracking-tight">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cs-green">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Need Help?
              </h3>
              <p className="text-sm text-cs-gray-300 mb-5 leading-relaxed">
                Check out the documentation for setup instructions, troubleshooting, and configuration guides.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button href="/docs/" variant="ghost" size="sm" showArrow>
                  Quick Start Guide
                </Button>
                <Button href="https://github.com/crazystream/crazystream/issues" variant="ghost" size="sm" external>
                  Report an Issue
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
