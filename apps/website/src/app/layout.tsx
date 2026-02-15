import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import MarketingShell from '@/components/MarketingShell';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'NVREMOTE — Cloud Gaming, Unlocked.',
  description:
    'One hub. Multiple apps. Secure, low-latency cloud gaming anywhere. Stream with sub-15ms latency, 4K@60 HDR, and P2P encrypted connections powered by NvFBC + NVENC.',
  keywords: [
    'cloud gaming',
    'game streaming',
    'low latency',
    'NVIDIA',
    'NvFBC',
    'NVENC',
    'remote gaming',
    'P2P streaming',
    'DTLS',
    '4K HDR',
  ],
  authors: [{ name: 'NVRemote Team' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://nvremote.com',
    siteName: 'NVRemote',
    title: 'NVREMOTE — Cloud Gaming, Unlocked.',
    description:
      'One hub. Multiple apps. Secure, low-latency cloud gaming anywhere. Sub-15ms latency, 4K@60 HDR, 240 FPS, P2P encrypted.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'NVRemote — Cloud Gaming, Unlocked.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NVREMOTE — Cloud Gaming, Unlocked.',
    description:
      'One hub. Multiple apps. Secure, low-latency cloud gaming anywhere.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body
        className={`${inter.variable} font-sans bg-white text-gray-900 antialiased`}
      >
        {/* Main content */}
        <div className="relative">
          <MarketingShell>{children}</MarketingShell>
        </div>
      </body>
    </html>
  );
}
