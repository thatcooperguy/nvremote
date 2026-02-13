'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Grid3X3,
  Radio,
  Smartphone,
  Wifi,
  Download,
  Settings,
  Bell,
  Menu,
  X,
  Zap,
  ChevronRight,
} from 'lucide-react';

const navItems = [
  { label: 'Overview', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Apps', icon: Grid3X3, href: '/apps' },
  { label: 'Sessions', icon: Radio, href: '/dashboard/sessions' },
  { label: 'Devices', icon: Smartphone, href: '/dashboard/devices' },
  { label: 'Network', icon: Wifi, href: '/dashboard/network' },
  { label: 'Downloads', icon: Download, href: '/dashboard/downloads' },
  { label: 'Settings', icon: Settings, href: '/dashboard/settings' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const breadcrumbSegment = (() => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length <= 1) return 'Overview';
    return segments[segments.length - 1].charAt(0).toUpperCase() + segments[segments.length - 1].slice(1);
  })();

  return (
    <div className="min-h-screen bg-cs-dark">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-[260px] bg-cs-surface border-r border-white/[0.06] flex flex-col transition-transform duration-300 ease-in-out',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-6 h-16 border-b border-white/[0.06] shrink-0">
          <div className="w-8 h-8 rounded-lg bg-cs-green/10 border border-cs-green/30 flex items-center justify-center">
            <Zap className="w-4 h-4 text-cs-green" />
          </div>
          <span className="text-sm font-bold tracking-widest text-white">
            CRAZYSTREAM
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden p-1 rounded-md hover:bg-white/5 text-cs-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          <div className="space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative',
                    active
                      ? 'text-cs-green bg-cs-green/[0.08]'
                      : 'text-cs-gray-300 hover:text-white hover:bg-white/[0.04]'
                  )}
                >
                  {/* Active indicator bar */}
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-cs-green" />
                  )}
                  <item.icon
                    className={cn(
                      'w-[18px] h-[18px] shrink-0',
                      active ? 'text-cs-green' : 'text-cs-gray-400 group-hover:text-cs-gray-200'
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Sidebar footer */}
        <div className="px-4 py-4 border-t border-white/[0.06] space-y-3 shrink-0">
          <div className="flex items-center gap-2 px-2">
            <div className="px-2 py-1 rounded-md bg-amber-500/[0.08] border border-amber-500/20">
              <span className="text-[10px] font-semibold text-amber-400 tracking-wider uppercase">
                Development
              </span>
            </div>
            <span className="text-[11px] text-cs-gray-500">Environment</span>
          </div>
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-cs-green/10 border border-cs-green/20 flex items-center justify-center">
              <span className="text-xs font-bold text-cs-green">CC</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-cs-gray-100 truncate">
                ccooper
              </p>
              <p className="text-[11px] text-cs-gray-500 truncate">
                Admin
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="lg:pl-[260px] min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-cs-dark/80 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-4 sm:px-6 shrink-0">
          {/* Left: hamburger + breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-white/5 text-cs-gray-400 hover:text-white transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <nav className="flex items-center gap-1.5 text-sm">
              <Link
                href="/dashboard"
                className="text-cs-gray-400 hover:text-white transition-colors"
              >
                Dashboard
              </Link>
              {breadcrumbSegment !== 'Overview' && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-cs-gray-600" />
                  <span className="text-cs-gray-200 font-medium">
                    {breadcrumbSegment}
                  </span>
                </>
              )}
            </nav>
          </div>

          {/* Right: notification + avatar */}
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-lg hover:bg-white/5 text-cs-gray-400 hover:text-white transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cs-green" />
            </button>
            <div className="w-8 h-8 rounded-full bg-cs-green/10 border border-cs-green/20 flex items-center justify-center">
              <span className="text-xs font-bold text-cs-green">CC</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 relative">
          <div className="absolute inset-0 grid-overlay pointer-events-none opacity-30" />
          <div className="relative p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
