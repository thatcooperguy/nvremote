import Link from 'next/link';

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

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/[0.06] bg-cs-dark">
      <div className="section-padding py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <svg
                width="24"
                height="24"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  width="32"
                  height="32"
                  rx="8"
                  fill="url(#footer-logo)"
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
                    id="footer-logo"
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
              <span className="text-lg font-bold tracking-tight">
                Crazy<span className="text-cs-green">Stream</span>
              </span>
            </div>
            <p className="text-sm text-cs-gray-300 max-w-sm leading-relaxed">
              Ultra low latency game streaming powered by NVIDIA hardware
              acceleration. Stream your games anywhere with near-zero lag.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/downloads/"
                  className="text-sm text-cs-gray-300 hover:text-cs-green transition-colors"
                >
                  Downloads
                </Link>
              </li>
              <li>
                <Link
                  href="/docs/"
                  className="text-sm text-cs-gray-300 hover:text-cs-green transition-colors"
                >
                  Documentation
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/crazystream/crazystream/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cs-gray-300 hover:text-cs-green transition-colors"
                >
                  Changelog
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Community</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://github.com/crazystream/crazystream"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cs-gray-300 hover:text-cs-green transition-colors flex items-center gap-2"
                >
                  <GitHubIcon />
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/crazystream/crazystream/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cs-gray-300 hover:text-cs-green transition-colors"
                >
                  Report a Bug
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/crazystream/crazystream/discussions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cs-gray-300 hover:text-cs-green transition-colors"
                >
                  Discussions
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-cs-gray-400">
            &copy; {currentYear} CrazyStream. All rights reserved.
          </p>
          <p className="text-xs text-cs-gray-400">
            Built with{' '}
            <span className="text-red-400" aria-label="love">
              &#9829;
            </span>{' '}
            by the CrazyStream team
          </p>
        </div>
      </div>
    </footer>
  );
}
