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
    <div className="card-base flex flex-col h-full relative overflow-hidden">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cs-green/50 to-transparent" />

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0">
          <div className="text-cs-green">{icon}</div>
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <p className="text-sm text-cs-gray-300 mt-1">{subtitle}</p>
        </div>
      </div>

      {/* Version */}
      <div className="flex items-center gap-2 mb-6">
        <span className="px-2.5 py-1 rounded-md bg-cs-green/10 text-xs font-mono font-medium text-cs-green">
          {version}
        </span>
        <span className="px-2.5 py-1 rounded-md bg-amber-500/10 text-xs font-medium text-amber-400">
          Alpha
        </span>
      </div>

      {/* Download button */}
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

      {/* Platform badge */}
      <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-blue-400"
        >
          <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
        </svg>
        <span className="text-xs text-cs-gray-200">Windows 10/11 (x64)</span>
      </div>

      {/* System requirements */}
      <div className="flex-1">
        <h4 className="text-xs font-semibold text-cs-gray-300 uppercase tracking-wider mb-3">
          System Requirements
        </h4>
        <ul className="space-y-2">
          {requirements.map((req, i) => (
            <li key={i} className="flex items-start gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-cs-green shrink-0 mt-0.5"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-xs text-cs-gray-300">
                <span className="text-cs-gray-200 font-medium">
                  {req.label}:
                </span>{' '}
                {req.value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Checksum */}
      {checksum && (
        <div className="mt-6 pt-4 border-t border-white/[0.04]">
          <p className="text-[10px] font-mono text-cs-gray-400 break-all">
            <span className="text-cs-gray-300">SHA-256:</span> {checksum}
          </p>
        </div>
      )}
    </div>
  );
}
