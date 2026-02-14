'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Zap,
  Shield,
  Monitor,
  Settings2,
  Terminal,
  Cloud,
  Download,
  ArrowRight,
  Github,
  Server,
  Smartphone,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Animation helpers                                                          */
/* -------------------------------------------------------------------------- */

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
};

/* -------------------------------------------------------------------------- */
/*  Hero Stat                                                                  */
/* -------------------------------------------------------------------------- */

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 sm:px-6">
      <span className="text-xl sm:text-2xl font-bold text-white font-mono tracking-tight">
        {value}
      </span>
      <span className="text-[10px] sm:text-xs text-cs-gray-400 uppercase tracking-wider font-medium">
        {label}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Feature Card (inline for this page)                                        */
/* -------------------------------------------------------------------------- */

interface FeatureItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}

function FeatureItem({ icon, title, description, delay = 0 }: FeatureItemProps) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="gradient-border gradient-border-hover group relative overflow-hidden p-6 sm:p-8 transition-all duration-500 hover:-translate-y-1 hover:shadow-card-hover"
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cs-green/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Subtle gradient hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-cs-green/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10">
        {/* Icon container */}
        <div className="relative w-14 h-14 rounded-xl bg-cs-green/10 border border-cs-green/20 flex items-center justify-center mb-6 group-hover:border-cs-green/40 group-hover:bg-cs-green/15 transition-all duration-300">
          <div className="text-cs-green">{icon}</div>
          <div className="absolute inset-0 rounded-xl bg-cs-green/0 group-hover:bg-cs-green/10 blur-xl transition-all duration-500" />
        </div>

        <h3 className="text-lg font-bold text-white mb-3 tracking-tight">
          {title}
        </h3>
        <p className="text-sm text-cs-gray-300 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Architecture Node                                                          */
/* -------------------------------------------------------------------------- */

function ArchNode({
  label,
  sublabel,
  icon,
}: {
  label: string;
  sublabel: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="glass gradient-border w-24 h-24 sm:w-28 sm:h-28 flex flex-col items-center justify-center gap-2 rounded-2xl">
        <div className="text-cs-green">{icon}</div>
        <span className="text-xs font-bold text-white tracking-tight">
          {label}
        </span>
      </div>
      <span className="text-[10px] text-cs-gray-400 uppercase tracking-widest font-medium">
        {sublabel}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step Card                                                                  */
/* -------------------------------------------------------------------------- */

function StepCard({
  number,
  title,
  description,
  delay = 0,
}: {
  number: number;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="relative flex flex-col items-center text-center"
    >
      <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-cs-green text-cs-dark text-xs font-bold flex items-center justify-center z-20 shadow-glow-sm">
        {number}
      </div>
      <div className="w-16 h-16 rounded-2xl bg-cs-green/10 border border-cs-green/20 flex items-center justify-center mb-6 text-cs-green">
        {number === 1 && <Server size={24} />}
        {number === 2 && <Zap size={24} />}
        {number === 3 && <Monitor size={24} />}
      </div>
      <h3 className="text-lg font-bold text-white mb-3 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-cs-gray-300 leading-relaxed max-w-xs">
        {description}
      </p>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Windows Icon (inline SVG)                                                  */
/* -------------------------------------------------------------------------- */

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function HomePage() {
  return (
    <>
      {/* ================================================================== */}
      {/*  HERO SECTION                                                      */}
      {/* ================================================================== */}
      <section className="relative overflow-hidden min-h-[90vh] flex items-center">
        {/* Background layers */}
        <div className="absolute inset-0 bg-hero-glow-intense" />
        <div className="absolute inset-0 grid-overlay opacity-40 mask-fade-b" />

        {/* Floating orbs */}
        <div className="orb orb-green w-[600px] h-[600px] top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-glow" />
        <div className="orb orb-green-dim w-[400px] h-[400px] top-3/4 left-[15%] animate-float-slow animation-delay-200" />
        <div className="orb orb-green-dim w-[300px] h-[300px] top-1/3 right-[10%] animate-float-slower animation-delay-600" />

        <div className="relative section-padding w-full pt-20 sm:pt-28 lg:pt-32 pb-16 sm:pb-24">
          <div className="max-w-5xl mx-auto text-center">
            {/* Main headline */}
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-extrabold tracking-tighter leading-[0.95] mb-6"
            >
              <span className="text-gradient">GRIDSTREAMER</span>
            </motion.h1>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight mb-4"
            >
              Cloud Gaming, Unlocked.
            </motion.p>

            {/* Subheading */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-base sm:text-lg text-cs-gray-200 max-w-2xl mx-auto mb-12 leading-relaxed"
            >
              One hub. Multiple apps. Secure, low-latency, anywhere.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
            >
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold rounded-xl bg-cs-green text-cs-dark hover:bg-cs-green-300 active:bg-cs-green-500 shadow-glow hover:shadow-glow-lg transition-all duration-300 group/btn relative overflow-hidden"
              >
                <span className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                  <span className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </span>
                <span className="relative z-10 flex items-center gap-2">
                  <Zap size={18} />
                  Launch Dashboard
                  <ArrowRight size={16} className="transition-transform duration-300 group-hover/btn:translate-x-1" />
                </span>
              </Link>
              <Link
                href="/downloads"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-medium rounded-xl bg-transparent text-white border border-white/[0.12] hover:border-cs-green/40 hover:text-cs-green hover:bg-cs-green/5 hover:shadow-glow-sm transition-all duration-300"
              >
                <Download size={18} />
                Download Host
              </Link>
              <Link
                href="/downloads"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-medium rounded-xl bg-transparent text-white border border-white/[0.12] hover:border-cs-green/40 hover:text-cs-green hover:bg-cs-green/5 hover:shadow-glow-sm transition-all duration-300"
              >
                <Monitor size={18} />
                Download Client
              </Link>
            </motion.div>

            {/* Stats bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              <div className="inline-flex items-center glass rounded-2xl px-2 sm:px-4 py-4 sm:py-5">
                <div className="flex items-center divide-x divide-white/[0.06]">
                  <HeroStat value="< 15ms" label="Latency" />
                  <HeroStat value="4K@60" label="HDR" />
                  <HeroStat value="240" label="FPS" />
                  <HeroStat value="P2P" label="Encrypted" />
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-cs-dark to-transparent" />
      </section>

      {/* ================================================================== */}
      {/*  FEATURE HIGHLIGHTS                                                */}
      {/* ================================================================== */}
      <section className="section-padding py-24 sm:py-32 relative">
        {/* Background accent */}
        <div className="absolute inset-0 dot-overlay opacity-20 mask-fade-y pointer-events-none" />

        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <p className="text-xs text-cs-green uppercase tracking-[0.2em] font-semibold mb-4">
              Core Features
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-5">
              Built for <span className="text-gradient">Performance</span>
            </h2>
            <p className="text-cs-gray-300 max-w-lg mx-auto leading-relaxed">
              Every millisecond matters. GridStreamer is engineered from the ground
              up for the lowest possible latency without compromising quality.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureItem
              icon={<Zap size={24} />}
              title="Low Latency"
              description="Sub-15ms end-to-end with NvFBC capture and NVENC hardware encoding"
              delay={0}
            />
            <FeatureItem
              icon={<Shield size={24} />}
              title="Secure Relay"
              description="DTLS 1.3 encrypted P2P tunnels with TURN fallback"
              delay={0.1}
            />
            <FeatureItem
              icon={<Monitor size={24} />}
              title="Multi-Platform"
              description="Windows, macOS, Linux, and Android clients"
              delay={0.2}
            />
            <FeatureItem
              icon={<Settings2 size={24} />}
              title="Session Control"
              description="Granular session management with token-based auth"
              delay={0.3}
            />
            <FeatureItem
              icon={<Terminal size={24} />}
              title="Dev Tools"
              description="Network diagnostics, jitter analysis, and performance profiling"
              delay={0.4}
            />
            <FeatureItem
              icon={<Cloud size={24} />}
              title="Cloud Native"
              description="Deploy anywhere: bare metal, cloud VMs, or edge nodes"
              delay={0.5}
            />
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  ARCHITECTURE DIAGRAM                                              */}
      {/* ================================================================== */}
      <section className="section-padding py-24 sm:py-32 relative overflow-hidden">
        <div className="orb orb-green-dim w-[500px] h-[500px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <p className="text-xs text-cs-green uppercase tracking-[0.2em] font-semibold mb-4">
              Architecture
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-5">
              How It <span className="text-gradient">Works</span>
            </h2>
            <p className="text-cs-gray-300 max-w-lg mx-auto leading-relaxed">
              Peer-to-peer streaming with intelligent signaling and encrypted
              direct connections.
            </p>
          </motion.div>

          {/* Diagram */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="gradient-border p-8 sm:p-12 mb-16"
          >
            {/* Top row: Client -> Signaling -> Host */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-0 mb-12">
              {/* Client */}
              <ArchNode
                label="Client"
                sublabel="Your Device"
                icon={<Monitor size={24} />}
              />

              {/* Connection line: Client -> Signaling */}
              <div className="hidden md:flex items-center flex-1 max-w-[160px] px-4">
                <div className="w-full relative">
                  <div className="h-px bg-gradient-to-r from-cs-green/40 via-cs-green/60 to-cs-green/40" />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[6px] border-l-cs-green/60 border-y-[3px] border-y-transparent" />
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-cs-gray-400 whitespace-nowrap font-mono">
                    WebSocket
                  </span>
                </div>
              </div>

              {/* Mobile arrow */}
              <div className="md:hidden text-cs-green/40">
                <ArrowRight size={20} className="rotate-90" />
              </div>

              {/* Signaling Server */}
              <ArchNode
                label="Signaling"
                sublabel="Coordination"
                icon={<Server size={24} />}
              />

              {/* Connection line: Signaling -> Host */}
              <div className="hidden md:flex items-center flex-1 max-w-[160px] px-4">
                <div className="w-full relative">
                  <div className="h-px bg-gradient-to-r from-cs-green/40 via-cs-green/60 to-cs-green/40" />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[6px] border-l-cs-green/60 border-y-[3px] border-y-transparent" />
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-cs-gray-400 whitespace-nowrap font-mono">
                    WebSocket
                  </span>
                </div>
              </div>

              {/* Mobile arrow */}
              <div className="md:hidden text-cs-green/40">
                <ArrowRight size={20} className="rotate-90" />
              </div>

              {/* Host */}
              <ArchNode
                label="Host"
                sublabel="Gaming PC"
                icon={<Zap size={24} />}
              />
            </div>

            {/* P2P Direct Connection line */}
            <div className="hidden md:block relative max-w-xl mx-auto mb-8">
              <div className="relative">
                {/* Curved line representation using a bordered div */}
                <div className="h-12 border-b-2 border-l-2 border-r-2 border-dashed border-cs-green/30 rounded-b-3xl" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 px-4 py-1.5 rounded-full bg-cs-card border border-cs-green/30">
                  <span className="text-xs font-mono font-bold text-cs-green">
                    P2P Direct (DTLS)
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile P2P label */}
            <div className="md:hidden flex items-center justify-center mb-8">
              <div className="px-4 py-2 rounded-full bg-cs-card border border-cs-green/30">
                <span className="text-xs font-mono font-bold text-cs-green">
                  P2P Direct (DTLS)
                </span>
              </div>
            </div>
          </motion.div>

          {/* 3 step cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16 max-w-4xl mx-auto">
            <StepCard
              number={1}
              title="Connect"
              description="Client and host register with the signaling server. ICE candidates are exchanged to find the best path."
              delay={0}
            />
            <StepCard
              number={2}
              title="Stream"
              description="NvFBC captures the screen, NVENC encodes at hardware speed, and frames are sent over the P2P tunnel."
              delay={0.15}
            />
            <StepCard
              number={3}
              title="Play"
              description="The client decodes, renders, and feeds your input back to the host in real-time. Zero compromise."
              delay={0.3}
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
      {/*  DOWNLOAD PREVIEW                                                  */}
      {/* ================================================================== */}
      <section className="section-padding py-24 sm:py-32 relative">
        <div className="absolute inset-0 grid-overlay opacity-20 mask-fade-y pointer-events-none" />

        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <p className="text-xs text-cs-green uppercase tracking-[0.2em] font-semibold mb-4">
              Downloads
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-5">
              Get Started in <span className="text-gradient">Seconds</span>
            </h2>
            <p className="text-cs-gray-300 max-w-lg mx-auto leading-relaxed">
              Download the Host for your gaming PC and the Client for any device
              you want to stream to.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
            {/* Host Download Card */}
            <motion.div
              variants={fadeInUp}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0 }}
              className="gradient-border gradient-border-hover group relative overflow-hidden p-8 transition-all duration-500 hover:shadow-card-hover"
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cs-green/50 to-transparent" />

              <div className="relative z-10">
                <div className="relative w-14 h-14 rounded-2xl bg-cs-green/10 border border-cs-green/20 flex items-center justify-center mb-6 group-hover:border-cs-green/40 transition-all duration-300">
                  <Server size={24} className="text-cs-green" />
                  <div className="absolute inset-0 rounded-2xl bg-cs-green/0 group-hover:bg-cs-green/10 blur-xl transition-all duration-500" />
                </div>

                <h3 className="text-xl font-bold text-white mb-2 tracking-tight">
                  GridStreamer Host
                </h3>
                <p className="text-sm text-cs-gray-300 leading-relaxed mb-6">
                  Install on the PC with your NVIDIA GPU. Captures your screen and
                  streams to connected clients.
                </p>

                {/* Platform icons */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <WindowsIcon className="text-blue-400" />
                    <span className="text-xs font-medium text-blue-300">
                      Windows
                    </span>
                  </div>
                  <span className="text-[10px] text-cs-gray-500 uppercase tracking-wider">
                    macOS / Linux coming soon
                  </span>
                </div>

                <Link
                  href="/downloads"
                  className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 text-sm font-semibold rounded-xl bg-cs-green text-cs-dark hover:bg-cs-green-300 shadow-glow hover:shadow-glow-lg transition-all duration-300"
                >
                  <Download size={16} />
                  Download Host
                </Link>
              </div>
            </motion.div>

            {/* Client Download Card */}
            <motion.div
              variants={fadeInUp}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="gradient-border gradient-border-hover group relative overflow-hidden p-8 transition-all duration-500 hover:shadow-card-hover"
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cs-green/50 to-transparent" />

              <div className="relative z-10">
                <div className="relative w-14 h-14 rounded-2xl bg-cs-green/10 border border-cs-green/20 flex items-center justify-center mb-6 group-hover:border-cs-green/40 transition-all duration-300">
                  <Monitor size={24} className="text-cs-green" />
                  <div className="absolute inset-0 rounded-2xl bg-cs-green/0 group-hover:bg-cs-green/10 blur-xl transition-all duration-500" />
                </div>

                <h3 className="text-xl font-bold text-white mb-2 tracking-tight">
                  GridStreamer Client
                </h3>
                <p className="text-sm text-cs-gray-300 leading-relaxed mb-6">
                  Install on any device you want to stream to. Connects to your
                  host for a seamless gaming experience.
                </p>

                {/* Platform icons */}
                <div className="flex items-center gap-3 mb-6 flex-wrap">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <WindowsIcon className="text-blue-400" />
                    <span className="text-xs font-medium text-blue-300">
                      Windows
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <Smartphone size={14} className="text-cs-gray-400" />
                    <span className="text-xs text-cs-gray-400">Android</span>
                  </div>
                  <span className="text-[10px] text-cs-gray-500 uppercase tracking-wider">
                    macOS soon
                  </span>
                </div>

                <Link
                  href="/downloads"
                  className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 text-sm font-semibold rounded-xl bg-cs-green text-cs-dark hover:bg-cs-green-300 shadow-glow hover:shadow-glow-lg transition-all duration-300"
                >
                  <Download size={16} />
                  Download Client
                </Link>
              </div>
            </motion.div>
          </div>

          {/* Link to full download center */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-center"
          >
            <Link
              href="/downloads"
              className="inline-flex items-center gap-2 text-sm font-medium text-cs-green hover:text-cs-green-200 transition-colors duration-200 group"
            >
              View all downloads
              <ArrowRight
                size={16}
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </Link>
          </motion.div>
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
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-5">
                Ready to{' '}
                <span className="text-gradient">Stream?</span>
              </h2>
              <p className="text-cs-gray-200 max-w-md mx-auto mb-10 leading-relaxed">
                Start streaming your games with zero compromise.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold rounded-xl bg-cs-green text-cs-dark hover:bg-cs-green-300 active:bg-cs-green-500 shadow-glow hover:shadow-glow-lg transition-all duration-300 group/btn relative overflow-hidden"
                >
                  <span className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                    <span className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  </span>
                  <span className="relative z-10 flex items-center gap-2">
                    <Zap size={18} />
                    Launch Dashboard
                    <ArrowRight size={16} className="transition-transform duration-300 group-hover/btn:translate-x-1" />
                  </span>
                </Link>
                <a
                  href="https://github.com/thatcooperguy/nvstreamer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-medium rounded-xl bg-transparent text-white border border-white/[0.12] hover:border-cs-green/40 hover:text-cs-green hover:bg-cs-green/5 hover:shadow-glow-sm transition-all duration-300"
                >
                  <Github size={18} />
                  Star on GitHub
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
}
