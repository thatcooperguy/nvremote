'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Github, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isAuthenticated } from '@/lib/auth';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/downloads', label: 'Downloads' },
  { href: '/apps', label: 'Apps' },
  { href: '/docs', label: 'Docs' },
];

const GITHUB_URL = 'https://github.com/thatcooperguy/nvremote';

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
            fill="#FFFFFF"
            stroke="#FFFFFF"
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
      </div>
      <span className="text-xl font-bold tracking-tight text-gray-900">
        NV<span className="text-nv-green">REMOTE</span>
      </span>
    </Link>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(isAuthenticated());
  }, [pathname]);

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
            ? 'glass-strong shadow-sm border-gray-200/60'
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
                        ? 'text-nv-green-600'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'
                    )}
                  >
                    {link.label}
                    {/* Active indicator -- green dot */}
                    {isActive && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-nv-green" />
                    )}
                  </Link>
                );
              })}

              {/* Divider */}
              <div className="w-px h-5 bg-gray-200 mx-2" />

              {/* Star on GitHub button */}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-all duration-200"
              >
                <Github size={18} />
                <span className="hidden lg:inline">Star on GitHub</span>
                <span className="lg:hidden">GitHub</span>
              </a>

              {/* Sign In / Dashboard button */}
              <Link
                href={loggedIn ? '/dashboard' : '/login'}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-nv-green text-white text-sm font-medium hover:bg-nv-green-600 transition-all duration-200 shadow-sm"
              >
                <User size={16} />
                {loggedIn ? 'Dashboard' : 'Sign In'}
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
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
              <div className="border-t border-gray-200 bg-white/95 backdrop-blur-2xl">
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
                              ? 'text-nv-green-600 bg-nv-green/5'
                              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                          )}
                        >
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-nv-green" />
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
                    <div className="h-px bg-gray-200 my-2" />
                    <a
                      href={GITHUB_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors duration-200 flex items-center gap-2"
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
