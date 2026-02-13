interface ModeSpec {
  label: string;
  value: string;
}

interface GamingMode {
  name: string;
  tagline: string;
  color: string;
  glowColor: string;
  borderClass: string;
  bgAccent: string;
  icon: React.ReactNode;
  specs: ModeSpec[];
  ideal: string;
  recommended?: boolean;
}

const modes: GamingMode[] = [
  {
    name: 'Competitive',
    tagline: 'Maximum performance, minimum latency',
    color: 'text-red-400',
    glowColor: 'shadow-red-glow',
    borderClass: 'gradient-border-red',
    bgAccent: 'bg-red-500',
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    specs: [
      { label: 'MAX FPS', value: '240' },
      { label: 'RESOLUTION', value: '1080p' },
      { label: 'JITTER', value: '1 ms' },
      { label: 'BITRATE', value: '50 Mbps' },
      { label: 'PRIORITY', value: 'FPS > Quality' },
    ],
    ideal: 'FPS, MOBA, Fighting games',
  },
  {
    name: 'Balanced',
    tagline: 'Best of both worlds',
    color: 'text-cs-green',
    glowColor: 'shadow-glow',
    borderClass: '',
    bgAccent: 'bg-cs-green',
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    ),
    specs: [
      { label: 'TARGET FPS', value: '120' },
      { label: 'RESOLUTION', value: '1440p' },
      { label: 'JITTER', value: '4 ms' },
      { label: 'BITRATE', value: '80 Mbps' },
      { label: 'PRIORITY', value: 'Adaptive' },
    ],
    ideal: 'RPG, Action-Adventure, Racing',
    recommended: true,
  },
  {
    name: 'Cinematic',
    tagline: 'Maximum visual fidelity',
    color: 'text-purple-400',
    glowColor: 'shadow-purple-glow',
    borderClass: 'gradient-border-purple',
    bgAccent: 'bg-purple-500',
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
        <line x1="17" y1="17" x2="22" y2="17" />
      </svg>
    ),
    specs: [
      { label: 'MAX FPS', value: '60' },
      { label: 'RESOLUTION', value: '4K' },
      { label: 'JITTER', value: '8 ms' },
      { label: 'BITRATE', value: '150 Mbps' },
      { label: 'PRIORITY', value: 'Quality > FPS' },
    ],
    ideal: 'Single-player, Story-driven, Simulation',
  },
];

export default function GamingModes() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
      {modes.map((mode) => (
        <div
          key={mode.name}
          className={`gradient-border ${mode.borderClass} group relative overflow-hidden p-6 lg:p-8 transition-all duration-500 hover:-translate-y-1 hover:${mode.glowColor} scan-line-effect`}
        >
          {/* Top glowing border line */}
          <div
            className={`absolute top-0 left-0 right-0 h-[2px] ${mode.bgAccent} opacity-40 group-hover:opacity-80 transition-opacity duration-500`}
          />

          {/* RECOMMENDED badge */}
          {mode.recommended && (
            <div className="absolute top-4 right-4 px-2.5 py-1 rounded-md bg-cs-green/10 border border-cs-green/30">
              <span className="text-[10px] font-bold text-cs-green tracking-widest uppercase">
                Recommended
              </span>
            </div>
          )}

          {/* Mode header */}
          <div className="flex items-center gap-3.5 mb-6 relative z-10">
            <div
              className={`w-12 h-12 rounded-xl ${
                mode.name === 'Competitive'
                  ? 'bg-red-500/10 border-red-500/20'
                  : mode.name === 'Balanced'
                  ? 'bg-cs-green/10 border-cs-green/20'
                  : 'bg-purple-500/10 border-purple-500/20'
              } border flex items-center justify-center ${mode.color} transition-all duration-300`}
            >
              {mode.icon}
            </div>
            <div>
              <h3 className={`text-xl font-bold ${mode.color} tracking-tight`}>
                {mode.name}
              </h3>
              <p className="text-xs text-cs-gray-400 mt-0.5">{mode.tagline}</p>
            </div>
          </div>

          {/* Specs in tech-readout style */}
          <div className="space-y-0 mb-6 relative z-10">
            {mode.specs.map((spec) => (
              <div
                key={spec.label}
                className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0"
              >
                <span className="text-[11px] font-medium text-cs-gray-500 tracking-wider uppercase">
                  {spec.label}
                </span>
                <span className="text-sm font-mono font-semibold text-white">
                  {spec.value}
                </span>
              </div>
            ))}
          </div>

          {/* Ideal for */}
          <div className="relative z-10 pt-4 border-t border-white/[0.06]">
            <p className="text-xs text-cs-gray-400">
              <span className="font-semibold text-cs-gray-200 uppercase tracking-wide text-[11px]">
                Ideal for:
              </span>{' '}
              {mode.ideal}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
