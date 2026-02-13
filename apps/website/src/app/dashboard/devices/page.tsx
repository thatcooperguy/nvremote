'use client';

import { motion } from 'framer-motion';
import {
  Monitor,
  Laptop,
  Smartphone,
  Server,
  Globe,
  ShieldCheck,
  Key,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Device {
  name: string;
  platform: string;
  icon: typeof Monitor;
  lastSeen: string;
  ip: string;
  auth: string;
  status: 'Online' | 'Idle' | 'Offline' | 'Coming Soon';
  comingSoon?: boolean;
}

const devices: Device[] = [
  {
    name: 'DESKTOP-GAMING',
    platform: 'Windows Desktop',
    icon: Monitor,
    lastSeen: '2 minutes ago',
    ip: '192.168.1.***',
    auth: 'Google OAuth',
    status: 'Online',
  },
  {
    name: 'LAPTOP-WORK',
    platform: 'Windows Laptop',
    icon: Laptop,
    lastSeen: '15 minutes ago',
    ip: '10.0.0.***',
    auth: 'Google OAuth',
    status: 'Online',
  },
  {
    name: 'MacBook-Pro',
    platform: 'macOS MacBook',
    icon: Laptop,
    lastSeen: '1 hour ago',
    ip: '192.168.1.***',
    auth: 'Google OAuth',
    status: 'Idle',
  },
  {
    name: 'ubuntu-streamer',
    platform: 'Linux Server',
    icon: Server,
    lastSeen: '3 hours ago',
    ip: '172.16.0.***',
    auth: 'API Key',
    status: 'Offline',
  },
  {
    name: 'Pixel 8 Pro',
    platform: 'Android Phone',
    icon: Smartphone,
    lastSeen: 'Yesterday',
    ip: '192.168.1.***',
    auth: 'Google OAuth',
    status: 'Offline',
  },
  {
    name: 'Chrome 121',
    platform: 'Web Browser',
    icon: Globe,
    lastSeen: '',
    ip: '',
    auth: '',
    status: 'Coming Soon',
    comingSoon: true,
  },
  {
    name: 'iPhone 15',
    platform: 'iOS Device',
    icon: Smartphone,
    lastSeen: '',
    ip: '',
    auth: '',
    status: 'Coming Soon',
    comingSoon: true,
  },
];

const statusStyles: Record<string, { dot: string; text: string }> = {
  Online: { dot: 'bg-cs-green', text: 'text-cs-green' },
  Idle: { dot: 'bg-amber-400', text: 'text-amber-400' },
  Offline: { dot: 'bg-cs-gray-400', text: 'text-cs-gray-400' },
  'Coming Soon': { dot: 'bg-cs-gray-500', text: 'text-cs-gray-500' },
};

export default function DevicesPage() {
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
          Connected Devices
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-sm text-cs-gray-400 mt-1"
        >
          Manage authorized clients across platforms
        </motion.p>
      </div>

      {/* Device cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {devices.map((device, i) => (
          <motion.div
            key={device.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.06 }}
            className={cn(
              'gradient-border gradient-border-hover p-5 transition-all duration-300 hover:shadow-card-hover',
              device.comingSoon && 'opacity-50 pointer-events-none'
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center border',
                    device.comingSoon
                      ? 'bg-cs-gray-700/50 border-cs-gray-600/30'
                      : 'bg-cs-green/10 border-cs-green/20'
                  )}
                >
                  <device.icon
                    className={cn(
                      'w-5 h-5',
                      device.comingSoon
                        ? 'text-cs-gray-500'
                        : 'text-cs-green'
                    )}
                  />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {device.name}
                  </h3>
                  <p className="text-xs text-cs-gray-400">{device.platform}</p>
                </div>
              </div>
              {device.comingSoon ? (
                <span className="px-2 py-0.5 rounded-md bg-cs-gray-600/30 border border-cs-gray-500/20 text-[10px] font-bold text-cs-gray-400 tracking-wider uppercase">
                  Soon
                </span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      statusStyles[device.status].dot,
                      device.status === 'Online' && 'animate-pulse'
                    )}
                  />
                  <span
                    className={cn(
                      'text-xs font-medium',
                      statusStyles[device.status].text
                    )}
                  >
                    {device.status}
                  </span>
                </div>
              )}
            </div>

            {!device.comingSoon && (
              <>
                <div className="space-y-2.5 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-cs-gray-500">Last seen</span>
                    <span className="text-xs text-cs-gray-300">
                      {device.lastSeen}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-cs-gray-500">IP Address</span>
                    <span className="text-xs font-mono text-cs-gray-300">
                      {device.ip}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-cs-gray-500">Auth Method</span>
                    <span className="inline-flex items-center gap-1 text-xs text-cs-gray-300">
                      {device.auth === 'API Key' ? (
                        <Key className="w-3 h-3 text-amber-400" />
                      ) : (
                        <ShieldCheck className="w-3 h-3 text-cs-green" />
                      )}
                      {device.auth}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/[0.04]">
                  <button className="text-xs font-medium text-cs-gray-500 hover:text-red-400 transition-colors">
                    Revoke Access
                  </button>
                </div>
              </>
            )}

            {device.comingSoon && (
              <p className="text-xs text-cs-gray-500 mt-2">
                Support for this platform is under development.
              </p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
