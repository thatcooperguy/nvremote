'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Github } from 'lucide-react';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/downloads', label: 'Downloads' },
  { href: '/apps', label: 'Apps' },
  { href: '/docs', label: 'Docs' },
  { href: '/dashboard', label: 'Dashboard' },
];

const GITHUB_URL = 'https://github.com/crazystream/crazystream';

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      <div className="relative">
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="transition-transform duration-300 group-hover:scale-110"
        >
          <rect
            width="32"
            height="32"
            rx="8"
            fill="url(#logo-gradient)"
          />
          <path
            d="M18.5 6L11 17.5H15.5L13.5 26L21 14.5H16.5L18.5 6Z"
            fill="#0A0A0A"
            stroke="#0A0A0A"
            strokeWidth="0.5"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient
              id="logo-gradient"
              x1="0"
              y1="0"
              x2="32"
              y2="32"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#76B900" />
              <stop offset="1" stopColor="#9AD411" />
            </linearGradient>
          </defs>
        </svg>
        {/* Glow effect on hover */}
        <div className="absolute inset-0 rounded-lg bg-cs-green/0 group-hover:bg-cs-green/20 blur-xl transition-all duration-500 group-hover:scale-150" />
      </div>
      <span className="text-xl font-bold tracking-tight">
        CRAZY<span className="text-cs-green">STREAM</span>
      </span>
    </Link>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <nav
        className={cn(
          'transition-all duration-500 border-b',
          scrolled
            ? 'glass-strong shadow-lg shadow-black/20 border-white/[0.06]'
            : 'bg-transparent border-transparent'
        )}
      >
        <div className="section-padding">
          <div className="flex items-center justify-between h-16">
            <Logo />

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive =
                  link.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'text-cs-green'
                        : 'text-cs-gray-200 hover:text-white hover:bg-white/5'
                    )}
                  >
                    {link.label}
                    {/* Active indicator -- green dot */}
                    {isActive && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cs-green shadow-[0_0_8px_rgba(118,185,0,0.6)]" />
                    )}
                  </Link>
                );
              })}

              {/* Divider */}
              <div className="w-px h-5 bg-white/[0.08] mx-2" />

              {/* Star on GitHub button */}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-sm font-medium text-cs-gray-200 hover:text-white hover:border-cs-green/30 hover:bg-cs-green/5 transition-all duration-200"
              >
                <Github size={18} />
                <span className="hidden lg:inline">Star on GitHub</span>
                <span className="lg:hidden">GitHub</span>
              </a>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 rounded-lg text-cs-gray-300 hover:text-white hover:bg-white/5 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile nav with AnimatePresence */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="md:hidden overflow-hidden"
            >
              <div className="border-t border-white/[0.06] bg-cs-dark/95 backdrop-blur-2xl">
                <div className="section-padding py-4 flex flex-col gap-1">
                  {navLinks.map((link, i) => {
                    const isActive =
                      link.href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(link.href);
                    return (
                      <motion.div
                        key={link.href}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.2 }}
                      >
                        <Link
                          href={link.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-200',
                            isActive
                              ? 'text-cs-green bg-cs-green/10'
                              : 'text-cs-gray-200 hover:text-white hover:bg-white/5'
                          )}
                        >
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-cs-green shadow-[0_0_6px_rgba(118,185,0,0.5)]" />
                          )}
                          {link.label}
                        </Link>
                      </motion.div>
                    );
                  })}
                  <motion.div
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: navLinks.length * 0.05,
                      duration: 0.2,
                    }}
                  >
                    <div className="h-px bg-white/[0.06] my-2" />
                    <a
                      href={GITHUB_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 rounded-lg text-sm font-medium text-cs-gray-200 hover:text-white hover:bg-white/5 transition-colors duration-200 flex items-center gap-2"
                    >
                      <Github size={18} />
                      Star on GitHub
                    </a>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
  );
}
