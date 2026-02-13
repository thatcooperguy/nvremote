'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/downloads/', label: 'Downloads' },
  { href: '/docs/', label: 'Docs' },
];

const GITHUB_URL = 'https://github.com/crazystream/crazystream';

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 group">
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
      <span className="text-xl font-bold tracking-tight">
        Crazy<span className="text-cs-green">Stream</span>
      </span>
    </Link>
  );
}

function GitHubIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function MobileMenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {open ? (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      ) : (
        <>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </>
      )}
    </svg>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <nav className="glass border-b border-white/[0.06]">
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
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                      isActive
                        ? 'text-cs-green bg-cs-green/10'
                        : 'text-cs-gray-200 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 p-2 rounded-lg text-cs-gray-300 hover:text-white hover:bg-white/5 transition-colors duration-200"
                aria-label="GitHub"
              >
                <GitHubIcon />
              </a>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 rounded-lg text-cs-gray-300 hover:text-white hover:bg-white/5 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <MobileMenuIcon open={mobileOpen} />
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/[0.06] bg-cs-gray-900/95 backdrop-blur-xl">
            <div className="section-padding py-4 flex flex-col gap-1">
              {navLinks.map((link) => {
                const isActive =
                  link.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-200 ${
                      isActive
                        ? 'text-cs-green bg-cs-green/10'
                        : 'text-cs-gray-200 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 rounded-lg text-sm font-medium text-cs-gray-200 hover:text-white hover:bg-white/5 transition-colors duration-200 flex items-center gap-2"
              >
                <GitHubIcon />
                GitHub
              </a>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
