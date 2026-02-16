'use client';

import { motion } from 'framer-motion';
import {
  Activity,
  Gauge,
  Radio,
  Wifi,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const metrics = [
  { label: 'Ping', icon: Activity, placeholder: '—' },
  { label: 'Jitter', icon: Radio, placeholder: '—' },
  { label: 'Packet Loss', icon: Gauge, placeholder: '—' },
  { label: 'Bandwidth', icon: Wifi, placeholder: '—' },
];

export default function NetworkPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Network Diagnostics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Monitor connection quality and run diagnostics between your client and host.
        </p>
      </div>

      {/* No host connected notice */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-4 px-6 py-5 rounded-xl bg-amber-50/80 border border-amber-200"
      >
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-amber-700 mb-1">
            No Active Connection
          </h3>
          <p className="text-sm text-amber-700/80 leading-relaxed">
            Network diagnostics require an active connection to a host machine
            running the NVRemote Host Agent. Connect to a host to measure real-time
            latency, jitter, packet loss, and available bandwidth.
          </p>
        </div>
      </motion.div>

      {/* Metric cards — empty state */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              'rounded-xl border border-gray-200 bg-white p-5',
              'flex flex-col items-start gap-3'
            )}
          >
            <div className="flex items-center gap-2 text-gray-400">
              <m.icon className="w-4 h-4" />
              <span className="text-xs font-semibold tracking-wide uppercase">
                {m.label}
              </span>
            </div>
            <span className="text-3xl font-bold text-gray-300">
              {m.placeholder}
            </span>
            <span className="text-xs text-gray-300">Awaiting connection</span>
          </motion.div>
        ))}
      </div>

      {/* Diagnostics button — disabled without connection */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Run Diagnostics</h2>
        <p className="text-sm text-gray-500 mb-4">
          Tests NAT type, STUN response time, MTU size, route hops, and end-to-end
          link quality between your client and the connected host.
        </p>
        <button
          disabled
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed"
        >
          <Activity className="w-4 h-4" />
          Run Diagnostics
        </button>
        <p className="text-xs text-gray-400 mt-2">
          Connect to a host to enable diagnostics.
        </p>
      </div>
    </div>
  );
}
