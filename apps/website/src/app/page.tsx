import Button from '@/components/Button';
import FeatureCard from '@/components/FeatureCard';
import GamingModes from '@/components/GamingModes';

/* -------------------------------------------------------------------------- */
/*  SVG Icons                                                                  */
/* -------------------------------------------------------------------------- */

function BoltIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function GamepadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="15" y1="13" x2="15.01" y2="13" />
      <line x1="18" y1="11" x2="18.01" y2="11" />
      <rect x="2" y="6" width="20" height="12" rx="2" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stat Item for Hero                                                        */
/* -------------------------------------------------------------------------- */

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-2xl sm:text-3xl font-bold text-white font-mono tracking-tight">
        {value}
      </span>
      <span className="text-[11px] sm:text-xs text-cs-gray-400 uppercase tracking-wider font-medium">
        {label}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Resolution Card                                                           */
/* -------------------------------------------------------------------------- */

interface ResolutionCardProps {
  resolution: string;
  fps: string;
  codec: string;
  highlight?: boolean;
  badge?: string;
}

function ResolutionCard({ resolution, fps, codec, highlight = false, badge }: ResolutionCardProps) {
  return (
    <div className={`gradient-border ${highlight ? '' : 'gradient-border-hover'} group relative overflow-hidden p-8 text-center transition-all duration-500 ${highlight ? 'glow-green-intense scale-105 z-10' : 'hover:-translate-y-1 hover:shadow-card-hover'}`}>
      {/* Scan line effect */}
      {highlight && <div className="absolute inset-0 scan-line-effect pointer-events-none" />}

      {/* Badge */}
      {badge && (
        <div className="absolute top-4 right-4 px-2.5 py-1 rounded-md bg-cs-green/10 border border-cs-green/30">
          <span className="text-[10px] font-bold text-cs-green tracking-widest uppercase">{badge}</span>
        </div>
      )}

      {/* Top glow line */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent ${highlight ? 'via-cs-green' : 'via-cs-green/40'} to-transparent ${highlight ? 'opacity-80' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-500`} />

      <div className="relative z-10">
        <div className={`text-4xl sm:text-5xl font-extrabold mb-2 tracking-tight ${highlight ? 'text-gradient' : 'text-white'}`}>
          {resolution}
        </div>
        <div className="text-3xl sm:text-4xl font-bold text-white mb-4 font-mono">
          @{fps}
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          <div className={`w-1.5 h-1.5 rounded-full ${highlight ? 'bg-cs-green animate-pulse-slow' : 'bg-cs-gray-400'}`} />
          <span className="text-xs font-mono font-medium text-cs-gray-200">{codec}</span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pipeline Step                                                             */
/* -------------------------------------------------------------------------- */

function PipelineStep({ label, time, icon, isLast = false }: { label: string; time: string; icon: string; isLast?: boolean }) {
  return (
    <div className="flex items-center gap-0 flex-1">
      <div className="flex flex-col items-center text-center gap-2 flex-1">
        <div className="w-12 h-12 rounded-xl bg-cs-green/10 border border-cs-green/20 flex items-center justify-center text-xl">
          {icon}
        </div>
        <span className="text-xs font-medium text-cs-gray-200">{label}</span>
        <span className="text-[11px] font-mono text-cs-green font-semibold">{time}</span>
      </div>
      {!isLast && (
        <div className="flex-shrink-0 w-8 sm:w-12 flex items-center justify-center -mt-8">
          <div className="w-full h-px bg-gradient-to-r from-cs-green/40 to-cs-green/40 relative">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[6px] border-l-cs-green/40 border-y-[3px] border-y-transparent" />
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step Card (How It Works)                                                  */
/* -------------------------------------------------------------------------- */

function StepCard({ number, title, description, icon }: { number: number; title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="relative flex flex-col items-center text-center group">
      {/* Number badge */}
      <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-cs-green text-cs-dark text-xs font-bold flex items-center justify-center z-20 shadow-glow-sm">
        {number}
      </div>
      {/* Icon */}
      <div className="relative w-16 h-16 rounded-2xl bg-cs-green/10 border border-cs-green/20 flex items-center justify-center mb-6 text-cs-green group-hover:border-cs-green/40 transition-all duration-300">
        {icon}
        <div className="absolute inset-0 rounded-2xl bg-cs-green/0 group-hover:bg-cs-green/10 blur-xl transition-all duration-500" />
      </div>
      <h3 className="text-lg font-bold text-white mb-3 tracking-tight">{title}</h3>
      <p className="text-sm text-cs-gray-300 leading-relaxed max-w-xs">{description}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tech Badge                                                                */
/* -------------------------------------------------------------------------- */

function TechBadge({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-4">
      <span className="text-sm font-bold text-white tracking-tight">{label}</span>
      <span className="text-[10px] text-cs-gray-400 uppercase tracking-widest">{sublabel}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function HomePage() {
  return (
    <>
      {/* ================================================================== */}
      {/*  HERO                                                              */}
      {/* ================================================================== */}
      <section className="relative overflow-hidden min-h-[90vh] flex items-center">
        {/* Background layers */}
        <div className="absolute inset-0 bg-hero-glow-intense" />
        <div className="absolute inset-0 grid-overlay opacity-40 mask-fade-b" />

        {/* Floating orbs */}
        <div className="orb orb-green w-[600px] h-[600px] top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-glow" />
        <div className="orb orb-green-dim w-[400px] h-[400px] top-3/4 left-1/4 animate-float-slow animation-delay-200" />
        <div className="orb orb-green-dim w-[300px] h-[300px] top-1/3 right-[10%] animate-float-slower animation-delay-600" />

        <div className="relative section-padding w-full pt-20 sm:pt-28 lg:pt-32 pb-16 sm:pb-24">
          <div className="max-w-5xl mx-auto text-center">
            {/* Version badge */}
            <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full glass border border-cs-green/20 mb-10 animate-fade-in">
              <div className="relative w-2 h-2">
                <div className="absolute inset-0 rounded-full bg-cs-green animate-pulse-slow" />
                <div className="absolute inset-0 rounded-full bg-cs-green/40 animate-ping" style={{ animationDuration: '3s' }} />
              </div>
              <span className="text-xs font-semibold text-cs-green tracking-wide">
                v0.1.0-alpha &mdash; Now Available
              </span>
            </div>

            {/* Main headline */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight leading-[1.05] mb-8 animate-fade-in-up">
              Stream Games.
              <br />
              <span className="text-gradient">Zero Lag.</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-cs-gray-200 max-w-2xl mx-auto mb-5 leading-relaxed animate-fade-in-up animation-delay-200">
              Ultra low latency game streaming powered by{' '}
              <span className="text-white font-semibold">NvFBC + NVENC</span>{' '}
              hardware pipeline. P2P direct connection with AI-powered adaptive quality.
            </p>

            <p className="text-sm text-cs-gray-400 max-w-lg mx-auto mb-12 animate-fade-in-up animation-delay-300">
              Glass-to-glass in under 15ms &bull; 4K HDR support &bull;
              H.264 / H.265 / AV1
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 animate-fade-in-up animation-delay-400">
              <Button href="/downloads/" size="lg" showArrow>
                <DownloadIcon />
                Download Now
              </Button>
              <Button href="/docs/" variant="secondary" size="lg">
                Read the Docs
              </Button>
            </div>

            {/* Stats bar */}
            <div className="animate-fade-in-up animation-delay-600">
              <div className="inline-flex items-center glass rounded-2xl px-2 sm:px-4 py-4 sm:py-5">
                <div className="flex items-center divide-x divide-white/[0.06]">
                  <HeroStat value="9ms" label="Latency" />
                  <HeroStat value="4K" label="Max Resolution" />
                  <HeroStat value="240" label="Max FPS" />
                  <HeroStat value="P2P" label="Connection" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-cs-dark to-transparent" />
      </section>

      {/* ================================================================== */}
      {/*  TRUSTED TECH STACK                                                */}
      {/* ================================================================== */}
      <section className="relative py-12 sm:py-16 overflow-hidden">
        <div className="section-divider mb-12" />
        <div className="section-padding">
          <p className="text-center text-xs text-cs-gray-500 uppercase tracking-[0.2em] font-semibold mb-8">
            Powered by Industry-Leading Technology
          </p>
          <div className="flex flex-wrap items-center justify-center gap-0 divide-x divide-white/[0.06] rounded-2xl glass">
            <TechBadge label="NVENC" sublabel="Hardware Encode" />
            <TechBadge label="NvFBC" sublabel="GPU Capture" />
            <TechBadge label="DTLS 1.2" sublabel="Encryption" />
            <TechBadge label="Opus" sublabel="Audio Codec" />
            <TechBadge label="ICE/STUN" sublabel="P2P Direct" />
            <TechBadge label="Reed-Solomon" sublabel="FEC Protection" />
          </div>
        </div>
        <div className="section-divider mt-12" />
      </section>

      {/* ================================================================== */}
      {/*  FEATURES GRID                                                     */}
      {/* ================================================================== */}
      <section className="section-padding py-24 sm:py-32 relative">
        {/* Background accent */}
        <div className="absolute inset-0 dot-overlay opacity-20 mask-fade-y pointer-events-none" />

        <div className="relative">
          <div className="text-center mb-16">
            <p className="text-xs text-cs-green uppercase tracking-[0.2em] font-semibold mb-4">
              Core Features
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-5">
              Built for <span className="text-gradient">Performance</span>
            </h2>
            <p className="text-cs-gray-300 max-w-lg mx-auto leading-relaxed">
              Every millisecond matters. CrazyStream is engineered from the ground
              up for the lowest possible latency without compromising quality.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<BoltIcon />}
              title="Ultra Low Latency"
              description="P2P direct connection bypasses relay servers. NvFBC capture + NVENC encoding delivers glass-to-glass latency as low as 9ms on LAN."
              stats="9-15ms glass-to-glass"
            />
            <FeatureCard
              icon={<WaveIcon />}
              title="Adaptive QoS"
              description="Kalman filter-based quality engine continuously monitors network conditions. Adjusts bitrate, framerate, and resolution in real-time."
              stats="Real-time adaptation"
            />
            <FeatureCard
              icon={<GamepadIcon />}
              title="Gaming Modes"
              description="Choose Competitive for max FPS, Cinematic for 4K HDR, or Balanced for the best of both. Switch mid-session instantly."
              stats="3 preset modes"
            />
            <FeatureCard
              icon={<MonitorIcon />}
              title="Multi-Codec"
              description="Full hardware-accelerated H.264, H.265, and AV1 encoding and decoding. Automatic codec selection based on GPU and network."
              stats="H.264 / H.265 / AV1"
            />
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  LATENCY PIPELINE                                                  */}
      {/* ================================================================== */}
      <section className="section-padding py-20 sm:py-28 relative overflow-hidden">
        <div className="orb orb-green-dim w-[500px] h-[500px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

        <div className="relative">
          <div className="text-center mb-16">
            <p className="text-xs text-cs-green uppercase tracking-[0.2em] font-semibold mb-4">
              The Pipeline
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-5">
              Every Frame,{' '}
              <span className="text-gradient">Under 15ms</span>
            </h2>
            <p className="text-cs-gray-300 max-w-lg mx-auto">
              From screen capture to pixel display &mdash; the entire pipeline is
              hardware-accelerated and optimized for minimal latency.
            </p>
          </div>

          <div className="gradient-border p-8 sm:p-12">
            <div className="flex items-start justify-between overflow-x-auto">
              <PipelineStep icon="🖥️" label="NvFBC Capture" time="~0.1ms" />
              <PipelineStep icon="⚡" label="NVENC Encode" time="~2ms" />
              <PipelineStep icon="🌐" label="P2P Network" time="~5-10ms" />
              <PipelineStep icon="🎮" label="HW Decode" time="~1ms" />
              <PipelineStep icon="✨" label="Render" time="~0.5ms" isLast />
            </div>
            <div className="mt-8 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ShieldIcon />
                <span className="text-sm text-cs-gray-300">End-to-end DTLS 1.2 encrypted</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono font-bold text-cs-green">Total: ~9-15ms</span>
                <span className="text-xs text-cs-gray-500">(LAN conditions)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  RESOLUTION / FPS SHOWCASE                                         */}
      {/* ================================================================== */}
      <section className="section-padding py-24 sm:py-32 relative">
        <div className="absolute inset-0 grid-overlay opacity-30 mask-fade-y pointer-events-none" />

        <div className="relative">
          <div className="text-center mb-16">
            <p className="text-xs text-cs-green uppercase tracking-[0.2em] font-semibold mb-4">
              Resolution & Performance
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-5">
              Your Display.{' '}
              <span className="text-gradient">Your Rules.</span>
            </h2>
            <p className="text-cs-gray-300 max-w-lg mx-auto">
              From competitive 1080p@240 to cinematic 4K@60 — CrazyStream
              adapts to your display and play style.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-8 max-w-4xl mx-auto items-center">
            <ResolutionCard
              resolution="4K"
              fps="60"
              codec="H.265 / AV1"
            />
            <ResolutionCard
              resolution="1440p"
              fps="144"
              codec="H.265"
              highlight
              badge="Popular"
            />
            <ResolutionCard
              resolution="1080p"
              fps="240"
              codec="H.264 / H.265"
            />
          </div>

          <p className="text-center text-[11px] text-cs-gray-500 mt-10 max-w-xl mx-auto">
            Also supports 1440p Ultrawide, 900p, and 720p. Actual performance depends on
            host GPU, network conditions, and client hardware. HDR supported on compatible displays.
          </p>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  GAMING MODES                                                      */}
      {/* ================================================================== */}
      <section className="section-padding py-24 sm:py-32 relative">
        <div className="orb orb-green-dim w-[600px] h-[600px] -bottom-64 -right-64" />

        <div className="relative">
          <div className="text-center mb-16">
            <p className="text-xs text-cs-green uppercase tracking-[0.2em] font-semibold mb-4">
              Streaming Profiles
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-5">
              Modes for Every{' '}
              <span className="text-gradient">Play Style</span>
            </h2>
            <p className="text-cs-gray-300 max-w-lg mx-auto">
              One size doesn&apos;t fit all. Choose a streaming mode that matches
              the game you&apos;re playing. Switch anytime, even mid-session.
            </p>
          </div>

          <GamingModes />
        </div>
      </section>

      {/* ================================================================== */}
      {/*  HOW IT WORKS                                                      */}
      {/* ================================================================== */}
      <section className="section-padding py-24 sm:py-32 relative">
        <div className="absolute inset-0 dot-overlay opacity-20 mask-fade-y pointer-events-none" />

        <div className="relative">
          <div className="text-center mb-16">
            <p className="text-xs text-cs-green uppercase tracking-[0.2em] font-semibold mb-4">
              Getting Started
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-5">
              Up and Running in{' '}
              <span className="text-gradient">3 Steps</span>
            </h2>
            <p className="text-cs-gray-300 max-w-lg mx-auto">
              No complex configuration. Install, connect, and start streaming in
              minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16 max-w-4xl mx-auto">
            <StepCard
              number={1}
              title="Install Host"
              description="Download and install CrazyStream Host on the PC with your NVIDIA GPU. It runs quietly in the background."
              icon={<MonitorIcon />}
            />
            <StepCard
              number={2}
              title="Connect Client"
              description="Install the Client on the device you want to stream to. Sign in and your host appears automatically."
              icon={<LinkIcon />}
            />
            <StepCard
              number={3}
              title="Start Streaming"
              description="Click play. CrazyStream handles codec selection, quality tuning, and network optimization automatically."
              icon={<PlayIcon />}
            />
          </div>

          {/* Connecting lines (desktop only) */}
          <div className="hidden md:flex items-center justify-center max-w-4xl mx-auto -mt-[180px] mb-[180px] px-28">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cs-green/30 to-cs-green/30" />
            <div className="w-2 h-2 rounded-full bg-cs-green/40 mx-2" />
            <div className="flex-1 h-px bg-gradient-to-r from-cs-green/30 via-cs-green/30 to-transparent" />
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  OPEN SOURCE                                                       */}
      {/* ================================================================== */}
      <section className="section-padding py-20 sm:py-28">
        <div className="gradient-border p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute inset-0 grid-overlay opacity-20 pointer-events-none" />
          <div className="orb orb-green-dim w-[400px] h-[400px] -top-32 -right-32" />

          <div className="relative flex flex-col lg:flex-row items-center gap-10">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-cs-gray-200">
                  <GitHubIcon />
                </div>
                <span className="text-xs font-semibold text-cs-green uppercase tracking-widest">
                  Open Source
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4 text-white">
                Built in the Open
              </h2>
              <p className="text-sm text-cs-gray-300 leading-relaxed max-w-lg">
                CrazyStream is fully open source under the MIT license. Browse the
                code, submit PRs, report bugs, or fork it for your own use. We
                believe great streaming software should be accessible to everyone.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                href="https://github.com/crazystream/crazystream"
                variant="secondary"
                size="lg"
                external
                showArrow
              >
                <GitHubIcon />
                View on GitHub
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  BOTTOM CTA                                                        */}
      {/* ================================================================== */}
      <section className="section-padding py-24 sm:py-32 relative">
        <div className="relative rounded-3xl overflow-hidden">
          {/* Background layers */}
          <div className="absolute inset-0 bg-gradient-to-br from-cs-green/[0.08] via-cs-dark to-cs-dark" />
          <div className="absolute inset-0 grid-overlay opacity-30" />
          <div className="orb orb-green w-[500px] h-[500px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-glow" />

          <div className="relative px-8 sm:px-16 lg:px-24 py-20 sm:py-28 text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-5">
              Ready to{' '}
              <span className="text-gradient">Stream?</span>
            </h2>
            <p className="text-cs-gray-200 max-w-md mx-auto mb-10 leading-relaxed">
              Download CrazyStream and experience game streaming the way it
              should be &mdash; fast, sharp, and reliable.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/downloads/" size="lg" showArrow>
                <DownloadIcon />
                Download for Windows
              </Button>
              <Button
                href="https://github.com/crazystream/crazystream"
                variant="secondary"
                size="lg"
                external
              >
                View Source Code
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
