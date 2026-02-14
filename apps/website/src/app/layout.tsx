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
  title: 'GRIDSTREAMER — Cloud Gaming, Unlocked.',
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
  authors: [{ name: 'GridStreamer Team' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://gridstreamer.com',
    siteName: 'GridStreamer',
    title: 'GRIDSTREAMER — Cloud Gaming, Unlocked.',
    description:
      'One hub. Multiple apps. Secure, low-latency cloud gaming anywhere. Sub-15ms latency, 4K@60 HDR, 240 FPS, P2P encrypted.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'GridStreamer — Cloud Gaming, Unlocked.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GRIDSTREAMER — Cloud Gaming, Unlocked.',
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
    <html lang="en" className={`dark ${inter.variable}`}>
      <body
        className={`${inter.variable} font-sans bg-cs-dark text-white antialiased`}
      >
        {/* Noise texture overlay */}
        <div className="fixed inset-0 bg-noise pointer-events-none z-[1] opacity-50" />

        {/* Main content */}
        <div className="relative z-[2]">
          <MarketingShell>{children}</MarketingShell>
        </div>
      </body>
    </html>
  );
}
