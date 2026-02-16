'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Gamepad2,
  Shield,
  Settings2,
  Activity,
  Palette,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type AppStatus = 'In Development' | 'Beta' | 'Experimental';

interface AppEntry {
  name: string;
  status: AppStatus;
  description: string;
  icon: React.ReactNode;
}

/* -------------------------------------------------------------------------- */
/*  Status Config                                                              */
/* -------------------------------------------------------------------------- */

const statusConfig: Record<
  AppStatus,
  {
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
    iconBg: string;
    iconBorder: string;
    iconColor: string;
  }
> = {
  'In Development': {
    badgeBg: 'bg-cs-green/[0.08]',
    badgeBorder: 'border-cs-green/20',
    badgeText: 'text-cs-green',
    iconBg: 'bg-cs-green/10',
    iconBorder: 'border-cs-green/20',
    iconColor: 'text-cs-green',
  },
  Beta: {
    badgeBg: 'bg-amber-50',
    badgeBorder: 'border-amber-200',
    badgeText: 'text-amber-600',
    iconBg: 'bg-amber-50',
    iconBorder: 'border-amber-200',
    iconColor: 'text-amber-600',
  },
  Experimental: {
    badgeBg: 'bg-purple-500/[0.08]',
    badgeBorder: 'border-purple-500/20',
    badgeText: 'text-purple-400',
    iconBg: 'bg-purple-500/10',
    iconBorder: 'border-purple-500/20',
    iconColor: 'text-purple-400',
  },
};

/* -------------------------------------------------------------------------- */
/*  App Data                                                                   */
/* -------------------------------------------------------------------------- */

const apps: AppEntry[] = [
  {
    name: 'Remote Play',
    status: 'In Development',
    description:
      'Stream your GPU-powered desktop to any device with adaptive-quality P2P connections.',
    icon: <Gamepad2 className="w-6 h-6" />,
  },
  {
    name: 'Secure Relay',
    status: 'In Development',
    description:
      'DTLS-encrypted relay service for NAT traversal and secure connections.',
    icon: <Shield className="w-6 h-6" />,
  },
  {
    name: 'Session Manager',
    status: 'In Development',
    description:
      'Create, manage, and share streaming sessions with token-based auth.',
    icon: <Settings2 className="w-6 h-6" />,
  },
  {
    name: 'Network Doctor',
    status: 'Beta',
    description:
      'Real-time network diagnostics, jitter analysis, and route optimization.',
    icon: <Activity className="w-6 h-6" />,
  },
  {
    name: 'Creator Mode',
    status: 'Experimental',
    description:
      'Stream your creative workflow with color-accurate encoding for artists.',
    icon: <Palette className="w-6 h-6" />,
  },
  {
    name: 'Localization Studio',
    status: 'Experimental',
    description:
      'Localization and translation tools for multi-region deployments.',
    icon: <Globe className="w-6 h-6" />,
  },
];

const filterOptions: Array<'All' | AppStatus> = [
  'All',
  'In Development',
  'Beta',
  'Experimental',
];

/* -------------------------------------------------------------------------- */
/*  Animation Variants                                                         */
/* -------------------------------------------------------------------------- */

const sectionFade = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6 },
  },
};

const cardVariant = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.4 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -10,
    transition: { duration: 0.25 },
  },
} as const;

/* -------------------------------------------------------------------------- */
/*  App Card Component                                                         */
/* -------------------------------------------------------------------------- */

function AppCard({ app }: { app: AppEntry }) {
  const config = statusConfig[app.status];

  return (
    <motion.div
      layout
      variants={cardVariant}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn(
        'gradient-border gradient-border-hover group relative overflow-hidden p-6 sm:p-8 flex flex-col h-full transition-all duration-500',
        'hover:-translate-y-1 hover:shadow-card-hover'
      )}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cs-green/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-cs-green/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Icon + Status row */}
        <div className="flex items-start justify-between mb-5">
          <div
            className={cn(
              'relative w-14 h-14 rounded-xl border flex items-center justify-center shrink-0 transition-all duration-300',
              config.iconBg,
              config.iconBorder,
              config.iconColor,
              'group-hover:scale-105'
            )}
          >
            {app.icon}
            <div
              className={cn(
                'absolute inset-0 rounded-xl blur-xl transition-all duration-500 opacity-0 group-hover:opacity-100',
                app.status === 'In Development'
                  ? 'bg-cs-green/10'
                  : app.status === 'Beta'
                  ? 'bg-amber-500/10'
                  : 'bg-purple-500/10'
              )}
            />
          </div>

          {/* Status Badge */}
          <span
            className={cn(
              'px-2.5 py-1 rounded-md border text-[10px] font-bold tracking-widest uppercase',
              config.badgeBg,
              config.badgeBorder,
              config.badgeText
            )}
          >
            {app.status}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-gray-900 mb-3 tracking-tight">
          {app.name}
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-600 leading-relaxed mb-6 flex-1">
          {app.description}
        </p>

        {/* Coming Soon indicator */}
        <button disabled className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium rounded-xl border border-gray-300 text-gray-500 cursor-not-allowed">
          Coming Soon
        </button>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page Component                                                             */
/* -------------------------------------------------------------------------- */

export default function AppsPage() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'All' | AppStatus>('All');

  const filtered = useMemo(() => {
    return apps.filter((app) => {
      const matchesFilter =
        activeFilter === 'All' || app.status === activeFilter;
      const query = search.toLowerCase().trim();
      const matchesSearch =
        !query ||
        app.name.toLowerCase().includes(query) ||
        app.description.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [search, activeFilter]);

  return (
    <>
      {/* ================================================================ */}
      {/*  HERO HEADER                                                     */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-glow-intense" />
        <div className="absolute inset-0 grid-overlay opacity-30 mask-fade-b" />
        <div className="orb orb-green w-[500px] h-[500px] top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-glow" />

        <div className="relative section-padding pt-24 sm:pt-32 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto text-center"
          >
            <p className="text-xs text-cs-green uppercase tracking-[0.2em] font-semibold mb-4">
              Platform
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-5">
              App <span className="text-gradient">Directory</span>
            </h1>
            <p className="text-lg text-gray-700 max-w-xl mx-auto leading-relaxed">
              Explore NVRemote&apos;s suite of tools and applications.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  SEARCH + FILTER                                                 */}
      {/* ================================================================ */}
      <section className="section-padding -mt-4 mb-8">
        <motion.div
          variants={sectionFade}
          initial="hidden"
          animate="visible"
          className="max-w-4xl mx-auto"
        >
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search apps..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-cs-green/40 focus:ring-1 focus:ring-cs-green/20 transition-all duration-200"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-gray-200">
              {filterOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setActiveFilter(option)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200',
                    activeFilter === option
                      ? 'bg-cs-green/15 text-cs-green border border-cs-green/25'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 border border-transparent'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ================================================================ */}
      {/*  APPS GRID                                                       */}
      {/* ================================================================ */}
      <section className="section-padding pb-24 sm:pb-32 relative">
        <div className="absolute inset-0 dot-overlay opacity-20 mask-fade-y pointer-events-none" />

        <div className="relative max-w-6xl mx-auto">
          <AnimatePresence mode="popLayout">
            {filtered.length > 0 ? (
              <motion.div
                layout
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                <AnimatePresence mode="popLayout">
                  {filtered.map((app) => (
                    <AppCard key={app.name} app={app} />
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-20"
              >
                <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center mx-auto mb-6">
                  <Search className="w-6 h-6 text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  No apps found
                </h3>
                <p className="text-sm text-gray-500">
                  Try adjusting your search or filter criteria.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </>
  );
}
