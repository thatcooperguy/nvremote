import Link from 'next/link';
import { Github } from 'lucide-react';

const GITHUB_URL = 'https://github.com/crazystream/crazystream';

const productLinks = [
  { label: 'Downloads', href: '/downloads' },
  { label: 'Documentation', href: '/docs' },
  { label: 'Apps', href: '/apps' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Gaming Modes', href: '/docs#gaming-modes' },
];

const communityLinks = [
  { label: 'GitHub', href: GITHUB_URL, external: true },
  {
    label: 'Report a Bug',
    href: `${GITHUB_URL}/issues`,
    external: true,
  },
  {
    label: 'Discussions',
    href: `${GITHUB_URL}/discussions`,
    external: true,
  },
  {
    label: 'Contributing',
    href: `${GITHUB_URL}/blob/main/CONTRIBUTING.md`,
    external: true,
  },
];

const technologyItems = [
  'NVENC',
  'NvFBC',
  'DTLS',
  'Opus',
  'ICE/STUN',
];

function FooterLogo() {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <svg
        width="28"
        height="28"
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
        CRAZY<span className="text-cs-green">STREAM</span>
      </span>
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="relative border-t border-white/[0.04] bg-cs-dark overflow-hidden">
      {/* Grid pattern background */}
      <div className="absolute inset-0 grid-overlay opacity-30 pointer-events-none" />

      {/* Gradient divider line at top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cs-green/30 to-transparent" />

      <div className="relative section-padding pt-16 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <FooterLogo />
            <p className="text-sm text-cs-gray-300 max-w-xs leading-relaxed mb-6">
              Cloud gaming, unlocked. Stream your games with sub-15ms latency,
              4K HDR support, and P2P encrypted connections powered by NVIDIA
              hardware acceleration.
            </p>

            {/* Star on GitHub link */}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-sm text-cs-gray-200 hover:text-white hover:border-cs-green/30 hover:bg-cs-green/5 transition-all duration-200"
            >
              <Github size={18} />
              <span>Star on GitHub</span>
            </a>
          </div>

          {/* Product links */}
          <div>
            <h4 className="text-xs font-semibold text-white uppercase tracking-widest mb-5">
              Product
            </h4>
            <ul className="space-y-3">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-cs-gray-300 hover:text-cs-green transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community links */}
          <div>
            <h4 className="text-xs font-semibold text-white uppercase tracking-widest mb-5">
              Community
            </h4>
            <ul className="space-y-3">
              {communityLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-cs-gray-300 hover:text-cs-green transition-colors duration-200"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Technology */}
          <div>
            <h4 className="text-xs font-semibold text-white uppercase tracking-widest mb-5">
              Technology
            </h4>
            <ul className="space-y-3">
              {technologyItems.map((item) => (
                <li key={item}>
                  <span className="text-sm text-cs-gray-400">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="section-divider mb-8" />

        {/* Bottom bar */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-cs-gray-500">
              &copy; 2025 CrazyStream. Open source under MIT License.
            </p>
            <div className="flex items-center gap-6">
              <a
                href={`${GITHUB_URL}/blob/main/LICENSE`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-cs-gray-500 hover:text-cs-gray-300 transition-colors"
              >
                License
              </a>
              <a
                href={`${GITHUB_URL}/blob/main/SECURITY.md`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-cs-gray-500 hover:text-cs-gray-300 transition-colors"
              >
                Security
              </a>
            </div>
          </div>

          {/* Credits */}
          <p className="text-xs text-cs-gray-500 text-center sm:text-left">
            Concept &amp; Product Design: CCooper &mdash; Built with AI-assisted engineering.
          </p>
        </div>
      </div>
    </footer>
  );
}
