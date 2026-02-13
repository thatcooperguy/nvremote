'use client';

import { motion } from 'framer-motion';
import {
  Zap,
  Clock,
  Activity,
  Smartphone,
  DollarSign,
  Plus,
  Stethoscope,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const metrics = [
  {
    label: 'Active Sessions',
    value: '3',
    change: '+1 from yesterday',
    icon: Zap,
    positive: true,
  },
  {
    label: 'Avg Latency',
    value: '12ms',
    change: '-2ms from last hour',
    icon: Clock,
    positive: true,
  },
  {
    label: 'Packet Loss',
    value: '0.02%',
    change: 'Nominal',
    icon: Activity,
    positive: true,
  },
  {
    label: 'Active Devices',
    value: '7',
    change: '2 new this week',
    icon: Smartphone,
    positive: true,
  },
  {
    label: 'Relay Cost',
    value: '$4.20/mo',
    change: 'Est. current usage',
    icon: DollarSign,
    positive: true,
  },
];

const sessions = [
  {
    name: 'Gaming Session #12',
    host: '192.168.1.100',
    status: 'Active' as const,
    latency: '11ms',
    duration: '2h 34m',
    created: 'Today, 3:45 PM',
  },
  {
    name: 'Dev Testing',
    host: '10.0.0.50',
    status: 'Active' as const,
    latency: '8ms',
    duration: '45m',
    created: 'Today, 2:10 PM',
  },
  {
    name: 'Movie Night',
    host: '192.168.1.100',
    status: 'Ended' as const,
    latency: '15ms',
    duration: '3h 12m',
    created: 'Yesterday',
  },
  {
    name: 'Remote Desktop',
    host: '172.16.0.10',
    status: 'Connecting' as const,
    latency: '--',
    duration: '0m',
    created: 'Today, 4:02 PM',
  },
  {
    name: 'LAN Party Stream',
    host: '192.168.1.105',
    status: 'Ended' as const,
    latency: '6ms',
    duration: '5h 48m',
    created: '2 days ago',
  },
];

const statusStyles: Record<string, string> = {
  Active: 'bg-cs-green/10 text-cs-green border-cs-green/20',
  Ended: 'bg-cs-gray-600/30 text-cs-gray-300 border-cs-gray-500/20',
  Connecting: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const statusDot: Record<string, string> = {
  Active: 'bg-cs-green',
  Ended: 'bg-cs-gray-400',
  Connecting: 'bg-amber-400 animate-pulse',
};

export default function DashboardPage() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-2xl sm:text-3xl font-bold text-white tracking-tight"
        >
          Welcome back
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1"
        >
          <p className="text-sm text-cs-gray-400">
            Here&apos;s what&apos;s happening with your streams.
          </p>
          <span className="text-xs text-cs-gray-500 font-mono">
            {dateStr} &middot; {timeStr}
          </span>
        </motion.div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {metrics.map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.06 }}
            className="gradient-border p-4 sm:p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-cs-green/10 border border-cs-green/20 flex items-center justify-center">
                <metric.icon className="w-4 h-4 text-cs-green" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {metric.value}
            </p>
            <p className="text-[11px] text-cs-gray-400 mt-1 leading-tight">
              {metric.change}
            </p>
            <p className="text-[10px] text-cs-gray-500 mt-0.5 uppercase tracking-wider font-medium">
              {metric.label}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Recent sessions table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="gradient-border p-5 sm:p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Recent Sessions</h2>
          <Link
            href="/dashboard/sessions"
            className="text-xs text-cs-green hover:text-cs-green-300 transition-colors font-medium"
          >
            View all
          </Link>
        </div>

        <div className="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-[11px] font-semibold text-cs-gray-400 uppercase tracking-wider pb-3 pr-4">
                  Session Name
                </th>
                <th className="text-left text-[11px] font-semibold text-cs-gray-400 uppercase tracking-wider pb-3 pr-4">
                  Host
                </th>
                <th className="text-left text-[11px] font-semibold text-cs-gray-400 uppercase tracking-wider pb-3 pr-4">
                  Status
                </th>
                <th className="text-left text-[11px] font-semibold text-cs-gray-400 uppercase tracking-wider pb-3 pr-4">
                  Latency
                </th>
                <th className="text-left text-[11px] font-semibold text-cs-gray-400 uppercase tracking-wider pb-3 pr-4">
                  Duration
                </th>
                <th className="text-left text-[11px] font-semibold text-cs-gray-400 uppercase tracking-wider pb-3">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {sessions.map((session, i) => (
                <tr
                  key={i}
                  className="hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-3.5 pr-4">
                    <span className="text-sm font-medium text-white">
                      {session.name}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4">
                    <span className="text-sm font-mono text-cs-gray-300">
                      {session.host}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border',
                        statusStyles[session.status]
                      )}
                    >
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          statusDot[session.status]
                        )}
                      />
                      {session.status}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4">
                    <span className="text-sm font-mono text-cs-gray-300">
                      {session.latency}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4">
                    <span className="text-sm text-cs-gray-300">
                      {session.duration}
                    </span>
                  </td>
                  <td className="py-3.5">
                    <span className="text-sm text-cs-gray-400">
                      {session.created}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        className="flex flex-wrap gap-3"
      >
        <Link
          href="/dashboard/sessions"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-cs-green text-cs-dark font-semibold text-sm rounded-lg hover:bg-cs-green-300 transition-all duration-300 shadow-glow hover:shadow-glow-lg"
        >
          <Plus className="w-4 h-4" />
          New Session
        </Link>
        <Link
          href="/dashboard/network"
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/[0.08] text-cs-gray-200 text-sm font-medium rounded-lg hover:border-cs-green/30 hover:text-cs-green hover:bg-cs-green/5 transition-all duration-300"
        >
          <Stethoscope className="w-4 h-4" />
          Run Diagnostics
        </Link>
        <Link
          href="/dashboard/downloads"
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/[0.08] text-cs-gray-200 text-sm font-medium rounded-lg hover:border-cs-green/30 hover:text-cs-green hover:bg-cs-green/5 transition-all duration-300"
        >
          <Download className="w-4 h-4" />
          View Downloads
        </Link>
      </motion.div>
    </div>
  );
}
