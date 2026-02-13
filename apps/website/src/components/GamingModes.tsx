interface ModeSpec {
  label: string;
  value: string;
}

interface GamingMode {
  name: string;
  tagline: string;
  color: string;
  borderColor: string;
  bgColor: string;
  icon: React.ReactNode;
  specs: ModeSpec[];
  ideal: string;
}

const modes: GamingMode[] = [
  {
    name: 'Competitive',
    tagline: 'Maximum performance, minimum latency',
    color: 'text-red-400',
    borderColor: 'border-red-500/20 hover:border-red-500/40',
    bgColor: 'bg-red-500/10',
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
      { label: 'Max FPS', value: '240 fps' },
      { label: 'Resolution', value: 'Dynamic (1080p base)' },
      { label: 'Jitter Buffer', value: '1 ms' },
      { label: 'Bitrate', value: 'Up to 50 Mbps' },
      { label: 'Priority', value: 'Framerate > Quality' },
    ],
    ideal: 'FPS, MOBA, Fighting games',
  },
  {
    name: 'Balanced',
    tagline: 'Best of both worlds',
    color: 'text-cs-green',
    borderColor: 'border-cs-green/20 hover:border-cs-green/40',
    bgColor: 'bg-cs-green/10',
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
      { label: 'Target FPS', value: '120 fps' },
      { label: 'Resolution', value: '1440p target' },
      { label: 'Jitter Buffer', value: '4 ms' },
      { label: 'Bitrate', value: 'Up to 80 Mbps' },
      { label: 'Priority', value: 'Adaptive' },
    ],
    ideal: 'RPG, Action-Adventure, Racing',
  },
  {
    name: 'Cinematic',
    tagline: 'Maximum visual fidelity',
    color: 'text-purple-400',
    borderColor: 'border-purple-500/20 hover:border-purple-500/40',
    bgColor: 'bg-purple-500/10',
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
      { label: 'Max FPS', value: '60 fps' },
      { label: 'Resolution', value: 'Up to 4K' },
      { label: 'Jitter Buffer', value: '8 ms' },
      { label: 'Bitrate', value: 'Up to 150 Mbps' },
      { label: 'Priority', value: 'Quality > Framerate' },
    ],
    ideal: 'Single-player, Story-driven, Simulation',
  },
];

export default function GamingModes() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {modes.map((mode) => (
        <div
          key={mode.name}
          className={`relative rounded-2xl border ${mode.borderColor} bg-white/[0.02] p-6 transition-all duration-300 hover:bg-white/[0.04]`}
        >
          {/* Mode header */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`w-10 h-10 rounded-xl ${mode.bgColor} flex items-center justify-center ${mode.color}`}
            >
              {mode.icon}
            </div>
            <div>
              <h3 className={`text-lg font-bold ${mode.color}`}>{mode.name}</h3>
              <p className="text-xs text-cs-gray-300">{mode.tagline}</p>
            </div>
          </div>

          {/* Specs */}
          <div className="space-y-3 mb-5">
            {mode.specs.map((spec) => (
              <div
                key={spec.label}
                className="flex items-center justify-between"
              >
                <span className="text-xs text-cs-gray-400">{spec.label}</span>
                <span className="text-sm font-medium text-white">
                  {spec.value}
                </span>
              </div>
            ))}
          </div>

          {/* Ideal for */}
          <div className="pt-4 border-t border-white/[0.06]">
            <p className="text-xs text-cs-gray-400">
              <span className="font-medium text-cs-gray-200">Ideal for:</span>{' '}
              {mode.ideal}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
