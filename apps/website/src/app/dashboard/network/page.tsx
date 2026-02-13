'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Gauge,
  Radio,
  Wifi,
  Loader2,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const networkMetrics = [
  {
    label: 'Ping',
    value: '8ms',
    status: 'Excellent',
    statusColor: 'text-cs-green',
    icon: Activity,
  },
  {
    label: 'Jitter',
    value: '1.2ms',
    status: 'Low',
    statusColor: 'text-cs-green',
    icon: Radio,
  },
  {
    label: 'Packet Loss',
    value: '0.01%',
    status: 'Nominal',
    statusColor: 'text-cs-green',
    icon: Gauge,
  },
  {
    label: 'Bandwidth',
    value: '245 Mbps',
    status: 'Good',
    statusColor: 'text-cs-green',
    icon: Wifi,
  },
];

// Generate jitter chart data (last 20 seconds)
const jitterData = Array.from({ length: 20 }, (_, i) => ({
  time: `${20 - i}s`,
  jitter: +(Math.random() * 2.5 + 0.5).toFixed(2),
})).reverse();

// Generate packet loss chart data (12 intervals)
const packetLossData = Array.from({ length: 12 }, (_, i) => ({
  interval: `${12 - i}`,
  loss: i === 4 ? 0.03 : i === 9 ? 0.05 : i === 2 ? 0.01 : 0,
})).reverse();

interface DiagnosticResult {
  routeHops: number;
  optimalMTU: number;
  natType: string;
  stunResponse: string;
}

export default function NetworkPage() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DiagnosticResult | null>(null);

  const handleRunDiagnostics = () => {
    setRunning(true);
    setResults(null);
    setTimeout(() => {
      setRunning(false);
      setResults({
        routeHops: 4,
        optimalMTU: 1400,
        natType: 'Full Cone (NAT Type 1)',
        stunResponse: '12ms',
      });
    }, 2000);
  };

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value: number }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-cs-card border border-white/[0.08] rounded-lg px-3 py-2 shadow-xl">
          <p className="text-[11px] text-cs-gray-400">{label}</p>
          <p className="text-sm font-semibold text-cs-green">
            {payload[0].value}ms
          </p>
        </div>
      );
    }
    return null;
  };

  const PacketLossTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value: number }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-cs-card border border-white/[0.08] rounded-lg px-3 py-2 shadow-xl">
          <p className="text-[11px] text-cs-gray-400">Interval {label}</p>
          <p className="text-sm font-semibold text-cs-green">
            {payload[0].value}%
          </p>
        </div>
      );
    }
    return null;
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
          Network Diagnostics
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-sm text-cs-gray-400 mt-1"
        >
          Monitor connection quality and troubleshoot issues
        </motion.p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {networkMetrics.map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.06 }}
            className="gradient-border p-4 sm:p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-cs-green/10 border border-cs-green/20 flex items-center justify-center">
                <metric.icon className="w-4 h-4 text-cs-green" />
              </div>
              <span className="text-xs font-medium text-cs-gray-400 uppercase tracking-wider">
                {metric.label}
              </span>
            </div>
            <p className="text-2xl font-bold text-white tracking-tight">
              {metric.value}
            </p>
            <p className={cn('text-xs font-medium mt-0.5', metric.statusColor)}>
              {metric.status}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Jitter chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="gradient-border p-5 sm:p-6"
        >
          <h3 className="text-sm font-semibold text-white mb-1">
            Jitter Over Time
          </h3>
          <p className="text-xs text-cs-gray-500 mb-4">Last 20 seconds</p>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={jitterData}>
                <defs>
                  <linearGradient id="jitterGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="#76B900"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor="#76B900"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#606060' }}
                  interval={3}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#606060' }}
                  domain={[0, 4]}
                  tickFormatter={(v: number) => `${v}ms`}
                  width={45}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="jitter"
                  stroke="#76B900"
                  strokeWidth={2}
                  fill="url(#jitterGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Packet loss chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="gradient-border p-5 sm:p-6"
        >
          <h3 className="text-sm font-semibold text-white mb-1">
            Packet Loss
          </h3>
          <p className="text-xs text-cs-gray-500 mb-4">Last 12 intervals</p>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={packetLossData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="interval"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#606060' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#606060' }}
                  domain={[0, 0.06]}
                  tickFormatter={(v: number) => `${v}%`}
                  width={45}
                />
                <Tooltip content={<PacketLossTooltip />} />
                <Bar
                  dataKey="loss"
                  fill="#76B900"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Run diagnostics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="gradient-border p-5 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Run Diagnostics
            </h3>
            <p className="text-xs text-cs-gray-400 mt-0.5">
              Analyze route quality, MTU, and NAT configuration
            </p>
          </div>
          <button
            onClick={handleRunDiagnostics}
            disabled={running}
            className={cn(
              'shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-cs-green text-cs-dark font-semibold text-sm rounded-lg hover:bg-cs-green-300 transition-all duration-300 shadow-glow hover:shadow-glow-lg',
              running && 'opacity-80 cursor-wait'
            )}
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running...
              </>
            ) : (
              'Run Diagnostics'
            )}
          </button>
        </div>

        <AnimatePresence>
          {running && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-cs-green" />
                  <span className="text-sm text-cs-gray-300">
                    Analyzing network path...
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {results && !running && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-cs-green" />
                <span className="text-sm font-medium text-cs-green">
                  Diagnostics Complete
                </span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    label: 'Route Hops',
                    value: `${results.routeHops} hops`,
                  },
                  {
                    label: 'Optimal MTU',
                    value: `${results.optimalMTU} bytes`,
                  },
                  { label: 'NAT Type', value: results.natType },
                  {
                    label: 'STUN Response',
                    value: results.stunResponse,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="bg-cs-surface rounded-lg px-4 py-3 border border-white/[0.04]"
                  >
                    <p className="text-[10px] text-cs-gray-500 uppercase tracking-wider font-medium">
                      {item.label}
                    </p>
                    <p className="text-sm font-medium text-white mt-1">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Security note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="flex items-start gap-3 px-4 py-3 rounded-lg bg-cs-green/[0.03] border border-cs-green/10"
      >
        <Shield className="w-4 h-4 text-cs-green shrink-0 mt-0.5" />
        <p className="text-xs text-cs-gray-400 leading-relaxed">
          All diagnostic data is processed locally. No network information is
          sent to external servers.
        </p>
      </motion.div>
    </div>
  );
}
