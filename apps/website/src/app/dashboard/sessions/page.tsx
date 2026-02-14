'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Unplug,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const activeSessions = [
  {
    name: 'Gaming Session #12',
    host: '192.168.1.100',
    status: 'Active' as const,
    latency: '11ms',
  },
  {
    name: 'Dev Testing',
    host: '10.0.0.50',
    status: 'Active' as const,
    latency: '8ms',
  },
  {
    name: 'Remote Desktop',
    host: '172.16.0.10',
    status: 'Connecting' as const,
    latency: '--',
  },
  {
    name: 'Movie Night',
    host: '192.168.1.100',
    status: 'Idle' as const,
    latency: '15ms',
  },
];

const statusColors: Record<string, string> = {
  Active: 'bg-cs-green/10 text-cs-green border-cs-green/20',
  Connecting: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Idle: 'bg-cs-gray-600/30 text-cs-gray-300 border-cs-gray-500/20',
};

const statusDots: Record<string, string> = {
  Active: 'bg-cs-green',
  Connecting: 'bg-amber-400 animate-pulse',
  Idle: 'bg-cs-gray-400',
};

export default function SessionsPage() {
  const [sessionName, setSessionName] = useState('');
  const [targetHost, setTargetHost] = useState('');
  const [transport, setTransport] = useState('udp');
  const [quality, setQuality] = useState('balanced');
  const [relayEnabled, setRelayEnabled] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sessionCreated, setSessionCreated] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const sessionLink = 'https://gridstreamer.com/s/abc123xYz789QwErTy';
  const sessionToken = 'cs_Kx9mP2vL8nQwRtFgHjDk4aBcEfUiOp7sXyZ';

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setSessionCreated(true);
    }, 1500);
  };

  const handleCopy = (text: string, type: 'link' | 'token') => {
    navigator.clipboard.writeText(text);
    if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const inputClass =
    'w-full bg-cs-surface border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white placeholder:text-cs-gray-400 focus:border-cs-green/50 focus:ring-1 focus:ring-cs-green/20 focus:outline-none transition-colors';
  const selectClass =
    'w-full bg-cs-surface border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white focus:border-cs-green/50 focus:ring-1 focus:ring-cs-green/20 focus:outline-none transition-colors appearance-none';

  const qualityLabels: Record<string, string> = {
    competitive: '1080p / 240 FPS',
    balanced: '1440p / 144 FPS',
    cinematic: '4K / 60 FPS',
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-2xl sm:text-3xl font-bold text-white tracking-tight"
        >
          Session Management
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-sm text-cs-gray-400 mt-1"
        >
          Create and manage streaming sessions
        </motion.p>
      </div>

      {/* Create session form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="gradient-border p-5 sm:p-6 relative overflow-hidden"
      >
        <h2 className="text-lg font-semibold text-white mb-5">
          Generate Secure Session
        </h2>

        <AnimatePresence mode="wait">
          {!sessionCreated ? (
            <motion.div
              key="form"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-cs-gray-300 mb-1.5">
                    Session Name
                  </label>
                  <input
                    type="text"
                    placeholder="My Gaming Session"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-cs-gray-300 mb-1.5">
                    Target Host
                  </label>
                  <input
                    type="text"
                    placeholder="192.168.1.100 or hostname"
                    value={targetHost}
                    onChange={(e) => setTargetHost(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-cs-gray-300 mb-1.5">
                    Transport
                  </label>
                  <select
                    value={transport}
                    onChange={(e) => setTransport(e.target.value)}
                    className={selectClass}
                  >
                    <option value="udp">UDP</option>
                    <option value="tcp">TCP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-cs-gray-300 mb-1.5">
                    Quality Preset
                  </label>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    className={selectClass}
                  >
                    <option value="competitive">
                      Competitive (1080p/240fps)
                    </option>
                    <option value="balanced">Balanced (1440p/144fps)</option>
                    <option value="cinematic">Cinematic (4K/60fps)</option>
                  </select>
                </div>
              </div>

              {/* Relay toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-white">
                    Enable Secure Relay
                  </p>
                  <p className="text-xs text-cs-gray-400 mt-0.5">
                    Route traffic through an encrypted relay server
                  </p>
                </div>
                <button
                  onClick={() => setRelayEnabled(!relayEnabled)}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cs-green/30',
                    relayEnabled ? 'bg-cs-green' : 'bg-cs-gray-600'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200',
                      relayEnabled ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={generating}
                className={cn(
                  'w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-cs-green text-cs-dark font-semibold text-sm rounded-lg hover:bg-cs-green-300 transition-all duration-300 shadow-glow hover:shadow-glow-lg',
                  generating && 'opacity-80 cursor-wait'
                )}
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Secure Session'
                )}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, type: 'spring', bounce: 0.3 }}
              className="relative"
            >
              {/* Portal ring animation */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <motion.div
                  initial={{ width: 0, height: 0, opacity: 0.8 }}
                  animate={{ width: '150%', height: '150%', opacity: 0 }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                  className="absolute rounded-full border-2 border-cs-green/40"
                />
                <motion.div
                  initial={{ width: 0, height: 0, opacity: 0.5 }}
                  animate={{ width: '120%', height: '120%', opacity: 0 }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.15 }}
                  className="absolute rounded-full border border-cs-green/30"
                />
              </div>

              <div className="space-y-5">
                {/* Success header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-cs-green/10 border border-cs-green/30 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-cs-green" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Session Created
                    </h3>
                    <p className="text-xs text-cs-gray-400">
                      Share the link below to start streaming
                    </p>
                  </div>
                </div>

                {/* Session link */}
                <div>
                  <label className="block text-xs font-medium text-cs-gray-400 mb-1.5">
                    Session Link
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-cs-surface border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm font-mono text-cs-green truncate">
                      {sessionLink}
                    </div>
                    <button
                      onClick={() => handleCopy(sessionLink, 'link')}
                      className="shrink-0 p-2.5 rounded-lg border border-white/[0.08] hover:border-cs-green/30 hover:bg-cs-green/5 text-cs-gray-300 hover:text-cs-green transition-all"
                    >
                      {copiedLink ? (
                        <CheckCircle2 className="w-4 h-4 text-cs-green" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Session token */}
                <div>
                  <label className="block text-xs font-medium text-cs-gray-400 mb-1.5">
                    Session Token
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-cs-surface border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm font-mono text-cs-gray-300 truncate">
                      {showToken
                        ? sessionToken
                        : 'cs_Kx9\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                    </div>
                    <button
                      onClick={() => setShowToken(!showToken)}
                      className="shrink-0 p-2.5 rounded-lg border border-white/[0.08] hover:border-cs-green/30 hover:bg-cs-green/5 text-cs-gray-300 hover:text-cs-green transition-all"
                    >
                      {showToken ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleCopy(sessionToken, 'token')}
                      className="shrink-0 p-2.5 rounded-lg border border-white/[0.08] hover:border-cs-green/30 hover:bg-cs-green/5 text-cs-gray-300 hover:text-cs-green transition-all"
                    >
                      {copiedToken ? (
                        <CheckCircle2 className="w-4 h-4 text-cs-green" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2.5 py-3 px-4 rounded-lg bg-cs-green/[0.04] border border-cs-green/10">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cs-green opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cs-green" />
                  </span>
                  <span className="text-sm text-cs-green font-medium">
                    Waiting for connection...
                  </span>
                </div>

                {/* QoS summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Transport', value: transport.toUpperCase() },
                    {
                      label: 'Quality',
                      value:
                        quality.charAt(0).toUpperCase() + quality.slice(1),
                    },
                    {
                      label: 'Resolution',
                      value: qualityLabels[quality],
                    },
                    {
                      label: 'Relay',
                      value: relayEnabled ? 'Enabled' : 'Direct',
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="bg-cs-surface rounded-lg px-3 py-2.5 border border-white/[0.04]"
                    >
                      <p className="text-[10px] text-cs-gray-500 uppercase tracking-wider font-medium">
                        {item.label}
                      </p>
                      <p className="text-sm font-medium text-white mt-0.5">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* New session button */}
                <button
                  onClick={() => {
                    setSessionCreated(false);
                    setSessionName('');
                    setTargetHost('');
                  }}
                  className="text-sm text-cs-gray-400 hover:text-cs-green transition-colors font-medium"
                >
                  Create another session
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Active sessions list */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          Active Sessions
        </h2>
        <div className="space-y-3">
          {activeSessions.map((session, i) => (
            <div
              key={i}
              className="gradient-border p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-semibold text-white truncate">
                    {session.name}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border shrink-0',
                      statusColors[session.status]
                    )}
                  >
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        statusDots[session.status]
                      )}
                    />
                    {session.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs font-mono text-cs-gray-400">
                    {session.host}
                  </span>
                  <span className="text-xs text-cs-gray-500">
                    Latency: {session.latency}
                  </span>
                </div>
              </div>
              <button className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cs-gray-400 hover:text-red-400 border border-white/[0.06] hover:border-red-500/30 rounded-lg transition-all">
                <Unplug className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
