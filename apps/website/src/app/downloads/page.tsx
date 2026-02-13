import type { Metadata } from 'next';
import DownloadCard from '@/components/DownloadCard';

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
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClientIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

const BASE_URL =
  'https://storage.googleapis.com/crazystream-releases/v0.1.0';

export default function DownloadsPage() {
  return (
    <>
      {/* Header */}
      <section className="section-padding pt-24 sm:pt-32 pb-12">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Download <span className="text-gradient">CrazyStream</span>
          </h1>
          <p className="text-lg text-cs-gray-200 max-w-xl mx-auto">
            Get the Host for your gaming PC and the Client for the device you
            want to stream to.
          </p>
        </div>
      </section>

      {/* Platform detection note */}
      <section className="section-padding pb-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-3 px-5 py-3 rounded-xl glass border border-white/[0.06] w-fit mx-auto">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-blue-400"
            >
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
            </svg>
            <span className="text-sm text-cs-gray-200">
              Available for <span className="text-white font-medium">Windows 10/11 (x64)</span>
            </span>
            <span className="text-cs-gray-500 mx-1">|</span>
            <span className="text-sm text-cs-gray-400">
              macOS &amp; Linux coming soon
            </span>
          </div>
        </div>
      </section>

      {/* Download cards */}
      <section className="section-padding pb-20 sm:pb-28">
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

      {/* Additional info */}
      <section className="section-padding pb-20 sm:pb-28">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Verify downloads */}
            <div className="card-base">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-cs-green"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Verify Your Download
              </h3>
              <p className="text-sm text-cs-gray-300 mb-4">
                Always verify the SHA-256 checksum of your download to ensure
                file integrity.
              </p>
              <div className="bg-cs-dark rounded-lg p-4 font-mono text-xs text-cs-gray-300 overflow-x-auto">
                <div className="text-cs-gray-500 mb-1">
                  # PowerShell
                </div>
                <div>
                  Get-FileHash .\CrazyStreamHost-v0.1.0-win64.exe
                </div>
              </div>
            </div>

            {/* Need help */}
            <div className="card-base">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-cs-green"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Need Help?
              </h3>
              <p className="text-sm text-cs-gray-300 mb-4">
                Check out the documentation for setup instructions,
                troubleshooting, and configuration guides.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href="/docs/"
                  className="inline-flex items-center gap-2 text-sm font-medium text-cs-green hover:text-cs-green-300 transition-colors"
                >
                  Quick Start Guide
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </a>
                <a
                  href="https://github.com/crazystream/crazystream/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-cs-gray-300 hover:text-white transition-colors"
                >
                  Report an Issue
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
