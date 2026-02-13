import type { Metadata } from 'next';
import GamingModes from '@/components/GamingModes';
import Button from '@/components/Button';

export const metadata: Metadata = {
  title: 'Documentation — CrazyStream',
  description:
    'Get started with CrazyStream. Learn how to install, configure, and optimize your game streaming setup.',
};

/* -------------------------------------------------------------------------- */
/*  Helper components                                                         */
/* -------------------------------------------------------------------------- */

function SectionAnchor({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-2xl sm:text-3xl font-bold tracking-tight mb-6 scroll-mt-24">
      <a href={`#${id}`} className="group">
        {children}
        <span className="ml-2 text-cs-green opacity-0 group-hover:opacity-100 transition-opacity">
          #
        </span>
      </a>
    </h2>
  );
}

function SubSection({ id, children }: { id: string; children: string }) {
  return (
    <h3 id={id} className="text-xl font-semibold text-white mb-4 mt-10 scroll-mt-24">
      <a href={`#${id}`} className="group">
        {children}
        <span className="ml-2 text-cs-green/60 opacity-0 group-hover:opacity-100 transition-opacity text-sm">
          #
        </span>
      </a>
    </h3>
  );
}

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.06] mb-6">
      {title && (
        <div className="px-4 py-2 bg-white/[0.03] border-b border-white/[0.06] text-xs font-mono text-cs-gray-300">
          {title}
        </div>
      )}
      <pre className="p-4 bg-cs-dark overflow-x-auto">
        <code className="text-sm font-mono text-cs-gray-200 leading-relaxed whitespace-pre">
          {children}
        </code>
      </pre>
    </div>
  );
}

function InfoBox({
  type = 'info',
  children,
}: {
  type?: 'info' | 'warning' | 'tip';
  children: React.ReactNode;
}) {
  const styles = {
    info: {
      border: 'border-blue-500/20',
      bg: 'bg-blue-500/5',
      icon: 'text-blue-400',
      label: 'Note',
    },
    warning: {
      border: 'border-amber-500/20',
      bg: 'bg-amber-500/5',
      icon: 'text-amber-400',
      label: 'Warning',
    },
    tip: {
      border: 'border-cs-green/20',
      bg: 'bg-cs-green/5',
      icon: 'text-cs-green',
      label: 'Tip',
    },
  };

  const s = styles[type];

  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-4 mb-6`}>
      <div className={`text-xs font-semibold ${s.icon} uppercase tracking-wider mb-2`}>
        {s.label}
      </div>
      <div className="text-sm text-cs-gray-200 leading-relaxed">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sidebar TOC                                                               */
/* -------------------------------------------------------------------------- */

const tocItems = [
  { href: '#prerequisites', label: 'Prerequisites' },
  { href: '#install-host', label: 'Install Host' },
  { href: '#install-client', label: 'Install Client' },
  { href: '#connect', label: 'Connect' },
  { href: '#gaming-modes', label: 'Gaming Modes' },
  { href: '#configuration', label: 'Configuration' },
  { href: '#troubleshooting', label: 'Troubleshooting' },
];

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function DocsPage() {
  return (
    <>
      {/* Header */}
      <section className="section-padding pt-24 sm:pt-32 pb-12">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            <span className="text-gradient">Documentation</span>
          </h1>
          <p className="text-lg text-cs-gray-200 max-w-xl mx-auto">
            Everything you need to get CrazyStream up and running. From
            installation to advanced configuration.
          </p>
        </div>
      </section>

      {/* Content with sidebar */}
      <section className="section-padding pb-20 sm:pb-28">
        <div className="max-w-6xl mx-auto flex gap-12">
          {/* Sidebar TOC — desktop only */}
          <aside className="hidden lg:block w-56 shrink-0">
            <nav className="sticky top-24">
              <h4 className="text-xs font-semibold text-cs-gray-400 uppercase tracking-wider mb-4">
                On this page
              </h4>
              <ul className="space-y-1">
                {tocItems.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className="block px-3 py-1.5 text-sm text-cs-gray-300 hover:text-cs-green rounded-lg hover:bg-cs-green/5 transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>

              <div className="mt-8 pt-6 border-t border-white/[0.06]">
                <a
                  href="https://github.com/crazystream/crazystream"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-cs-gray-300 hover:text-cs-green transition-colors"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                  </svg>
                  Full docs on GitHub
                </a>
              </div>
            </nav>
          </aside>

          {/* Main content */}
          <article className="flex-1 min-w-0">
            <div className="prose prose-invert max-w-none">
              {/* ---- Prerequisites ---- */}
              <SectionAnchor id="prerequisites">Prerequisites</SectionAnchor>

              <p className="text-cs-gray-200 mb-6 leading-relaxed">
                Before you begin, make sure both your host (streaming) PC and
                client (receiving) device meet the following requirements.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                <div className="card-base">
                  <h4 className="text-sm font-semibold text-white mb-3">
                    Host Machine (Stream FROM)
                  </h4>
                  <ul className="space-y-2 text-sm text-cs-gray-300">
                    <li className="flex items-start gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cs-green shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12" /></svg>
                      Windows 10 or 11 (x64)
                    </li>
                    <li className="flex items-start gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cs-green shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12" /></svg>
                      NVIDIA GPU (GTX 900 series or newer)
                    </li>
                    <li className="flex items-start gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cs-green shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12" /></svg>
                      NVIDIA Driver 535 or newer
                    </li>
                    <li className="flex items-start gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cs-green shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12" /></svg>
                      8 GB RAM minimum
                    </li>
                    <li className="flex items-start gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cs-green shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12" /></svg>
                      20 Mbps upload speed
                    </li>
                  </ul>
                </div>

                <div className="card-base">
                  <h4 className="text-sm font-semibold text-white mb-3">
                    Client Machine (Stream TO)
                  </h4>
                  <ul className="space-y-2 text-sm text-cs-gray-300">
                    <li className="flex items-start gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cs-green shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12" /></svg>
                      Windows 10 or 11 (x64)
                    </li>
                    <li className="flex items-start gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cs-green shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12" /></svg>
                      Any GPU with hardware video decode
                    </li>
                    <li className="flex items-start gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cs-green shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12" /></svg>
                      4 GB RAM minimum
                    </li>
                    <li className="flex items-start gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cs-green shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12" /></svg>
                      20 Mbps download speed
                    </li>
                    <li className="flex items-start gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cs-green shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12" /></svg>
                      Controller or keyboard/mouse
                    </li>
                  </ul>
                </div>
              </div>

              <InfoBox type="tip">
                For the best experience, connect both machines to your router via
                Ethernet. Wi-Fi 6 or newer is acceptable but wired connections
                will always give the lowest and most consistent latency.
              </InfoBox>

              {/* ---- Install Host ---- */}
              <SectionAnchor id="install-host">Install Host</SectionAnchor>

              <p className="text-cs-gray-200 mb-6 leading-relaxed">
                The CrazyStream Host runs on the PC with your NVIDIA GPU and
                games installed. It captures your screen using NvFBC, encodes
                with NVENC, and streams directly to connected clients.
              </p>

              <div className="space-y-4 mb-6">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-cs-green">1</span>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium mb-1">
                      Download the installer
                    </p>
                    <p className="text-sm text-cs-gray-300">
                      Get the latest <code className="text-cs-green bg-cs-green/10 px-1.5 py-0.5 rounded text-xs">CrazyStreamHost-v0.1.0-win64.exe</code> from the{' '}
                      <a href="/downloads/" className="text-cs-green hover:underline">
                        Downloads page
                      </a>
                      .
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-cs-green">2</span>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium mb-1">
                      Run the installer
                    </p>
                    <p className="text-sm text-cs-gray-300">
                      Double-click the .exe and follow the prompts. The installer
                      will set up the CrazyStream Host service which runs
                      automatically on startup.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-cs-green">3</span>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium mb-1">
                      Sign in
                    </p>
                    <p className="text-sm text-cs-gray-300">
                      Open the CrazyStream Host app from the system tray and sign
                      in with your account. Your machine will register
                      automatically.
                    </p>
                  </div>
                </div>
              </div>

              <InfoBox type="info">
                The host requires administrative privileges during installation
                to set up the screen capture driver. After installation, it runs
                as a standard Windows service.
              </InfoBox>

              {/* ---- Install Client ---- */}
              <SectionAnchor id="install-client">Install Client</SectionAnchor>

              <p className="text-cs-gray-200 mb-6 leading-relaxed">
                The CrazyStream Client connects to your host and renders the
                stream. It handles input capture, hardware video decode, and
                display.
              </p>

              <div className="space-y-4 mb-6">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-cs-green">1</span>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium mb-1">
                      Download the client
                    </p>
                    <p className="text-sm text-cs-gray-300">
                      Get <code className="text-cs-green bg-cs-green/10 px-1.5 py-0.5 rounded text-xs">CrazyStreamClient-v0.1.0-win64.exe</code> from the{' '}
                      <a href="/downloads/" className="text-cs-green hover:underline">
                        Downloads page
                      </a>
                      .
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-cs-green">2</span>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium mb-1">
                      Install and launch
                    </p>
                    <p className="text-sm text-cs-gray-300">
                      Run the installer and launch CrazyStream Client. Sign in
                      with the same account you used on the host.
                    </p>
                  </div>
                </div>
              </div>

              {/* ---- Connect ---- */}
              <SectionAnchor id="connect">Connect</SectionAnchor>

              <p className="text-cs-gray-200 mb-6 leading-relaxed">
                Once both the host and client are installed and signed in with
                the same account, connecting is straightforward.
              </p>

              <div className="space-y-4 mb-6">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-cs-green">1</span>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium mb-1">
                      Your host appears automatically
                    </p>
                    <p className="text-sm text-cs-gray-300">
                      Open the CrazyStream Client. Your host machine will show up
                      in the dashboard with its online status, GPU info, and
                      current load.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-cs-green">2</span>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium mb-1">
                      Select a gaming mode
                    </p>
                    <p className="text-sm text-cs-gray-300">
                      Choose Competitive, Balanced, or Cinematic depending on what
                      you&apos;re playing. You can switch modes mid-session.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-cs-green/10 border border-cs-green/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-cs-green">3</span>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium mb-1">
                      Click Connect
                    </p>
                    <p className="text-sm text-cs-gray-300">
                      CrazyStream establishes a P2P connection, negotiates the
                      optimal codec and settings, and starts streaming. The
                      overlay shows real-time latency and quality metrics.
                    </p>
                  </div>
                </div>
              </div>

              <CodeBlock title="Connection negotiation (simplified)">
{`Client -> Signaling Server -> Host
  1. Client requests session
  2. Server brokers P2P connection via ICE/STUN
  3. Direct P2P tunnel established (no relay)
  4. Codec negotiation (H.264 / H.265 / AV1)
  5. Streaming begins`}
              </CodeBlock>

              {/* ---- Gaming Modes ---- */}
              <SectionAnchor id="gaming-modes">Gaming Modes</SectionAnchor>

              <p className="text-cs-gray-200 mb-8 leading-relaxed">
                CrazyStream offers three streaming modes, each optimized for
                different types of games and network conditions. You can switch
                between modes at any time during a session.
              </p>

              <GamingModes />

              <div className="mt-8">
                <InfoBox type="tip">
                  Start with <strong>Balanced</strong> mode and switch to
                  Competitive only for fast-paced multiplayer games where input
                  latency is critical. Use Cinematic for story-driven games where
                  you want the best visuals.
                </InfoBox>
              </div>

              {/* ---- Configuration ---- */}
              <SectionAnchor id="configuration">Configuration</SectionAnchor>

              <p className="text-cs-gray-200 mb-6 leading-relaxed">
                CrazyStream works out of the box with sensible defaults, but you
                can fine-tune settings for your specific setup.
              </p>

              <SubSection id="config-host">Host Configuration</SubSection>

              <p className="text-sm text-cs-gray-300 mb-4">
                The host configuration file is located at:
              </p>

              <CodeBlock title="Config location">
{`%APPDATA%\\CrazyStream\\host-config.yaml`}
              </CodeBlock>

              <CodeBlock title="host-config.yaml (example)">
{`# CrazyStream Host Configuration
capture:
  method: nvfbc          # nvfbc (recommended) or dxgi
  monitor: 0             # Monitor index (0 = primary)

encoder:
  codec: auto            # auto, h264, h265, or av1
  preset: p4             # NVENC preset (p1=fastest, p7=highest quality)
  max_bitrate: 100000    # Max bitrate in kbps
  rate_control: vbr      # cbr or vbr

network:
  port: 42587            # UDP port for streaming
  stun_server: stun:stun.crazystream.gg:3478

qos:
  mode: balanced         # competitive, balanced, or cinematic
  adaptive: true         # Enable adaptive quality`}
              </CodeBlock>

              <SubSection id="config-client">Client Configuration</SubSection>

              <CodeBlock title="client-config.yaml (example)">
{`# CrazyStream Client Configuration
display:
  vsync: false           # Disable for lowest latency
  fullscreen: true
  resolution: native     # native, 1080p, 1440p, or 4k

decoder:
  method: hardware       # hardware (recommended) or software
  low_latency: true      # Minimize decode buffer

input:
  mouse_mode: relative   # relative or absolute
  controller: auto       # auto-detect connected controllers

overlay:
  show_stats: true       # Show latency/FPS overlay
  position: top-left     # Overlay position`}
              </CodeBlock>

              {/* ---- Troubleshooting ---- */}
              <SectionAnchor id="troubleshooting">Troubleshooting</SectionAnchor>

              <div className="space-y-6">
                <div className="card-base">
                  <h4 className="text-sm font-semibold text-white mb-2">
                    Host not appearing in client
                  </h4>
                  <ul className="space-y-1.5 text-sm text-cs-gray-300">
                    <li>- Ensure both devices are signed in with the same account</li>
                    <li>- Check that the host service is running (system tray icon should be green)</li>
                    <li>- Verify your firewall allows UDP port 42587</li>
                    <li>- Try restarting the host service from the system tray</li>
                  </ul>
                </div>

                <div className="card-base">
                  <h4 className="text-sm font-semibold text-white mb-2">
                    High latency or stuttering
                  </h4>
                  <ul className="space-y-1.5 text-sm text-cs-gray-300">
                    <li>- Switch to a wired Ethernet connection if on Wi-Fi</li>
                    <li>- Try Competitive mode to reduce quality overhead</li>
                    <li>- Lower the max bitrate in host configuration</li>
                    <li>- Ensure no other bandwidth-heavy applications are running</li>
                    <li>- Check that hardware decode is enabled on the client</li>
                  </ul>
                </div>

                <div className="card-base">
                  <h4 className="text-sm font-semibold text-white mb-2">
                    Black screen or no video
                  </h4>
                  <ul className="space-y-1.5 text-sm text-cs-gray-300">
                    <li>- Update your NVIDIA driver to version 535 or newer</li>
                    <li>- Ensure NvFBC is supported (desktop GPUs; most laptops use dGPU passthrough)</li>
                    <li>- Try switching capture method to DXGI in host config</li>
                    <li>- Check if another screen capture application is running</li>
                  </ul>
                </div>

                <div className="card-base">
                  <h4 className="text-sm font-semibold text-white mb-2">
                    Audio not streaming
                  </h4>
                  <ul className="space-y-1.5 text-sm text-cs-gray-300">
                    <li>- CrazyStream captures system audio by default; check volume levels</li>
                    <li>- Ensure the correct audio output device is selected on the host</li>
                    <li>- Check client audio settings are not muted</li>
                  </ul>
                </div>
              </div>

              <InfoBox type="info">
                For issues not covered here, check the{' '}
                <a
                  href="https://github.com/crazystream/crazystream/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cs-green hover:underline"
                >
                  GitHub Issues
                </a>{' '}
                page or start a{' '}
                <a
                  href="https://github.com/crazystream/crazystream/discussions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cs-green hover:underline"
                >
                  Discussion
                </a>
                .
              </InfoBox>

              {/* GitHub CTA */}
              <div className="mt-16 pt-8 border-t border-white/[0.06] text-center">
                <p className="text-cs-gray-300 mb-6">
                  Full source code and extended documentation available on GitHub.
                </p>
                <Button
                  href="https://github.com/crazystream/crazystream"
                  variant="secondary"
                  size="lg"
                  external
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                  </svg>
                  View on GitHub
                </Button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
