import Button from '@/components/Button';
import FeatureCard from '@/components/FeatureCard';
import GamingModes from '@/components/GamingModes';

/* -------------------------------------------------------------------------- */
/*  Inline SVG Icons                                                          */
/* -------------------------------------------------------------------------- */

function LatencyIcon() {
  return (
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
  );
}

function AdaptiveIcon() {
  return (
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
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function GamepadIcon() {
  return (
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
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="15" y1="13" x2="15.01" y2="13" />
      <line x1="18" y1="11" x2="18.01" y2="11" />
      <rect x="2" y="6" width="20" height="12" rx="2" />
    </svg>
  );
}

function CodecIcon() {
  return (
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
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="16"
      height="16"
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
  );
}

/* -------------------------------------------------------------------------- */
/*  Resolution Cards                                                          */
/* -------------------------------------------------------------------------- */

interface ResolutionCardProps {
  resolution: string;
  fps: string;
  codec: string;
  highlight?: boolean;
}

function ResolutionCard({
  resolution,
  fps,
  codec,
  highlight = false,
}: ResolutionCardProps) {
  return (
    <div
      className={`relative rounded-2xl border p-6 text-center transition-all duration-300 ${
        highlight
          ? 'border-cs-green/30 bg-cs-green/[0.05] glow-green-sm'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
      }`}
    >
      <div
        className={`text-3xl sm:text-4xl font-bold mb-1 ${
          highlight ? 'text-cs-green' : 'text-white'
        }`}
      >
        {resolution}
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-white mb-3">
        @{fps}
      </div>
      <div className="inline-block px-3 py-1 rounded-full bg-white/[0.06] text-xs font-medium text-cs-gray-200">
        {codec}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step Cards                                                                */
/* -------------------------------------------------------------------------- */

interface StepCardProps {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

function StepCard({ number, title, description, icon }: StepCardProps) {
  return (
    <div className="relative flex flex-col items-center text-center">
      {/* Step number */}
      <div className="w-14 h-14 rounded-2xl bg-cs-green/10 border border-cs-green/20 flex items-center justify-center mb-5 text-cs-green">
        {icon}
      </div>
      <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-cs-green text-cs-dark text-xs font-bold flex items-center justify-center">
        {number}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-cs-gray-300 leading-relaxed max-w-xs">
        {description}
      </p>
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
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-hero-glow" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cs-green/[0.04] rounded-full blur-3xl" />

        <div className="relative section-padding pt-24 sm:pt-32 lg:pt-40 pb-20 sm:pb-28">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-cs-green/20 mb-8">
              <div className="w-2 h-2 rounded-full bg-cs-green animate-pulse" />
              <span className="text-xs font-medium text-cs-green">
                v0.1.0-alpha &mdash; Now Available
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
              Stream Games.
              <br />
              <span className="text-gradient">Zero Lag.</span>
            </h1>

            {/* Subtext */}
            <p className="text-lg sm:text-xl text-cs-gray-200 max-w-2xl mx-auto mb-4 leading-relaxed">
              Ultra low latency game streaming powered by{' '}
              <span className="text-white font-medium">
                NvFBC + NVENC hardware pipeline
              </span>
              . P2P direct connection with AI-powered adaptive quality.
            </p>
            <p className="text-sm text-cs-gray-400 max-w-lg mx-auto mb-10">
              9&ndash;45ms glass-to-glass latency &bull; 4K HDR support &bull;
              H.264 / H.265 / AV1
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/downloads/" size="lg">
                Download Now
                <ArrowRightIcon />
              </Button>
              <Button
                href="/docs/"
                variant="secondary"
                size="lg"
              >
                Read the Docs
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-cs-dark to-transparent" />
      </section>

      {/* ================================================================== */}
      {/*  FEATURES                                                          */}
      {/* ================================================================== */}
      <section className="section-padding py-20 sm:py-28">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Built for <span className="text-gradient">Performance</span>
          </h2>
          <p className="text-cs-gray-300 max-w-lg mx-auto">
            Every millisecond matters. CrazyStream is engineered from the ground
            up for the lowest possible latency without compromising quality.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard
            icon={<LatencyIcon />}
            title="Ultra Low Latency"
            description="P2P direct connection bypasses relay servers entirely. Combined with NvFBC capture and NVENC encoding, you get glass-to-glass latency as low as 9ms."
            stats="9-45ms glass-to-glass"
          />
          <FeatureCard
            icon={<AdaptiveIcon />}
            title="Adaptive Quality"
            description="AI-powered QoS engine continuously monitors network conditions and adjusts bitrate, framerate, and resolution in real-time to maintain the smoothest experience."
            stats="Real-time QoS"
          />
          <FeatureCard
            icon={<GamepadIcon />}
            title="Gaming Modes"
            description="Choose Competitive mode for maximum FPS and minimal latency, Cinematic mode for stunning 4K HDR visuals, or Balanced for the best of both worlds."
            stats="3 preset modes"
          />
          <FeatureCard
            icon={<CodecIcon />}
            title="Multi-Codec"
            description="Full hardware-accelerated encoding and decoding with H.264, H.265, and AV1. Automatic codec selection based on your GPU capabilities and network."
            stats="H.264 / H.265 / AV1"
          />
        </div>
      </section>

      {/* ================================================================== */}
      {/*  RESOLUTION / FPS SHOWCASE                                         */}
      {/* ================================================================== */}
      <section className="section-padding py-20 sm:py-28">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Your Resolution. <span className="text-gradient">Your Rules.</span>
          </h2>
          <p className="text-cs-gray-300 max-w-lg mx-auto">
            From competitive 1080p@240 to cinematic 4K@60, CrazyStream adapts to
            your display and preferences.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
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
          />
          <ResolutionCard
            resolution="1080p"
            fps="240"
            codec="H.264 / H.265"
          />
        </div>

        <p className="text-center text-xs text-cs-gray-400 mt-8">
          Actual performance depends on host GPU, network conditions, and client
          hardware. HDR supported on compatible displays.
        </p>
      </section>

      {/* ================================================================== */}
      {/*  GAMING MODES                                                      */}
      {/* ================================================================== */}
      <section className="section-padding py-20 sm:py-28">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Modes for Every{' '}
            <span className="text-gradient">Play Style</span>
          </h2>
          <p className="text-cs-gray-300 max-w-lg mx-auto">
            One size doesn&apos;t fit all. Choose a streaming mode that matches
            the game you&apos;re playing.
          </p>
        </div>

        <GamingModes />
      </section>

      {/* ================================================================== */}
      {/*  HOW IT WORKS                                                      */}
      {/* ================================================================== */}
      <section className="section-padding py-20 sm:py-28">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Up and Running in{' '}
            <span className="text-gradient">3 Steps</span>
          </h2>
          <p className="text-cs-gray-300 max-w-lg mx-auto">
            No complex configuration. Install, connect, and start streaming in
            minutes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-4xl mx-auto">
          <StepCard
            number={1}
            title="Install Host"
            description="Download and install CrazyStream Host on the PC with your NVIDIA GPU. It runs quietly in the background."
            icon={
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
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            }
          />
          <StepCard
            number={2}
            title="Connect Client"
            description="Install CrazyStream Client on the device you want to stream to. Sign in and your host will appear automatically."
            icon={
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
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            }
          />
          <StepCard
            number={3}
            title="Start Streaming"
            description="Click play and start gaming. CrazyStream handles codec selection, quality tuning, and network optimization automatically."
            icon={
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
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            }
          />
        </div>

        {/* Connecting lines (desktop only) */}
        <div className="hidden md:flex items-center justify-center max-w-4xl mx-auto -mt-[170px] mb-[170px] px-24">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cs-green/30 to-cs-green/30" />
          <div className="w-2 h-2 rounded-full bg-cs-green/40 mx-2" />
          <div className="flex-1 h-px bg-gradient-to-r from-cs-green/30 via-cs-green/30 to-transparent" />
        </div>
      </section>

      {/* ================================================================== */}
      {/*  BOTTOM CTA                                                        */}
      {/* ================================================================== */}
      <section className="section-padding py-20 sm:py-28">
        <div className="relative rounded-3xl overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-cs-green/10 via-cs-dark to-cs-dark" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-cs-green/[0.06] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative px-8 sm:px-12 lg:px-16 py-16 sm:py-20 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Ready to Stream?
            </h2>
            <p className="text-cs-gray-200 max-w-md mx-auto mb-8">
              Download CrazyStream and experience game streaming the way it
              should be &mdash; fast, sharp, and reliable.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/downloads/" size="lg">
                Download for Windows
                <svg
                  width="16"
                  height="16"
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
              </Button>
              <Button
                href="https://github.com/crazystream/crazystream"
                variant="secondary"
                size="lg"
                external
              >
                View on GitHub
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
