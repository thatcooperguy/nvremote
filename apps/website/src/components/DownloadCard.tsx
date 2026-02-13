import Button from './Button';

interface SystemRequirement {
  label: string;
  value: string;
}

interface DownloadCardProps {
  title: string;
  subtitle: string;
  version: string;
  downloadUrl: string;
  downloadLabel: string;
  icon: React.ReactNode;
  requirements: SystemRequirement[];
  checksum?: string;
  comingSoon?: boolean;
}

export default function DownloadCard({
  title,
  subtitle,
  version,
  downloadUrl,
  downloadLabel,
  icon,
  requirements,
  checksum,
  comingSoon = false,
}: DownloadCardProps) {
  return (
    <div className="gradient-border gradient-border-hover group relative overflow-hidden p-6 sm:p-8 flex flex-col h-full transition-all duration-500 hover:shadow-card-hover">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cs-green/50 to-transparent" />

      {/* LATEST badge */}
      {!comingSoon && (
        <div className="absolute top-4 right-4 px-2.5 py-1 rounded-md bg-cs-green/10 border border-cs-green/30">
          <span className="text-[10px] font-bold text-cs-green tracking-widest uppercase">
            Latest
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="relative w-14 h-14 rounded-2xl bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0 group-hover:border-cs-green/40 transition-all duration-300">
          <div className="text-cs-green">{icon}</div>
          <div className="absolute inset-0 rounded-2xl bg-cs-green/0 group-hover:bg-cs-green/10 blur-xl transition-all duration-500" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight">{title}</h3>
          <p className="text-sm text-cs-gray-400 mt-1">{subtitle}</p>
        </div>
      </div>

      {/* Version + Alpha badge */}
      <div className="flex items-center gap-2 mb-6">
        <span className="px-2.5 py-1 rounded-md bg-cs-green/[0.08] border border-cs-green/15 text-xs font-mono font-medium text-cs-green">
          {version}
        </span>
        <span className="px-2.5 py-1 rounded-md bg-amber-500/[0.08] border border-amber-500/15 text-xs font-medium text-amber-400">
          Alpha
        </span>
      </div>

      {/* Download button with glow */}
      <div className="mb-6">
        <Button
          href={comingSoon ? undefined : downloadUrl}
          variant="primary"
          size="lg"
          disabled={comingSoon}
          className="w-full"
          external
        >
          {comingSoon ? (
            <>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Coming Soon
            </>
          ) : (
            <>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloadLabel}
            </>
          )}
        </Button>
      </div>

      {/* Platform icon section */}
      <div className="flex items-center gap-2 mb-6 px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-blue-400"
        >
          <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
        </svg>
        <span className="text-xs text-cs-gray-200 font-medium">Windows 10/11 (x64)</span>
      </div>

      {/* System requirements in clean grid */}
      <div className="flex-1">
        <h4 className="text-[11px] font-semibold text-cs-gray-400 uppercase tracking-widest mb-4">
          System Requirements
        </h4>
        <ul className="space-y-2.5">
          {requirements.map((req, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-cs-green shrink-0 mt-0.5"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-xs text-cs-gray-300">
                <span className="text-cs-gray-100 font-medium">
                  {req.label}:
                </span>{' '}
                {req.value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* File size display */}
      {!comingSoon && (
        <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center justify-between">
          <span className="text-[11px] text-cs-gray-500 uppercase tracking-wide">
            Installer
          </span>
          <span className="text-xs font-mono text-cs-gray-400">~45 MB</span>
        </div>
      )}

      {/* Checksum */}
      {checksum && (
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <p className="text-[10px] font-mono text-cs-gray-500 break-all">
            <span className="text-cs-gray-400">SHA-256:</span> {checksum}
          </p>
        </div>
      )}
    </div>
  );
}
