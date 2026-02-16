'use client';

import { useEffect, useState } from 'react';
import { getStoredUser, type AuthUser } from '@/lib/auth';
import { Monitor, Activity, Wifi, Clock } from 'lucide-react';

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-gray-500 mt-1">Here is an overview of your NVRemote setup.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Monitor size={20} />}
          label="Connected Hosts"
          value="0"
          detail="No hosts registered yet"
          color="green"
        />
        <StatCard
          icon={<Activity size={20} />}
          label="Active Sessions"
          value="0"
          detail="No sessions running"
          color="blue"
        />
        <StatCard
          icon={<Wifi size={20} />}
          label="Network Status"
          value="Ready"
          detail="P2P connectivity available"
          color="emerald"
        />
        <StatCard
          icon={<Clock size={20} />}
          label="Uptime"
          value="--"
          detail="No streaming data yet"
          color="purple"
        />
      </div>

      {/* Getting Started */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Getting Started</h2>
        <div className="space-y-4">
          <StepItem
            step={1}
            title="Install the Host Agent"
            description="Download and install NVRemote Host on your gaming PC with an NVIDIA GPU."
            action={{ label: 'Download Host', href: '/downloads' }}
          />
          <StepItem
            step={2}
            title="Install the Client"
            description="Download NVRemote Client on the device you want to stream to."
            action={{ label: 'Download Client', href: '/downloads' }}
          />
          <StepItem
            step={3}
            title="Start Streaming"
            description="Open the client, sign in, and connect to your host. Your desktop will appear instantly."
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.green}`}>
          {icon}
        </div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{detail}</p>
    </div>
  );
}

function StepItem({
  step,
  title,
  description,
  action,
}: {
  step: number;
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cs-green/10 text-cs-green flex items-center justify-center text-sm font-bold">
        {step}
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        {action && (
          <a
            href={action.href}
            className="inline-flex items-center text-sm text-cs-green hover:text-cs-green-700 font-medium mt-2"
          >
            {action.label} &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
