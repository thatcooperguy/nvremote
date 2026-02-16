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
  title: 'NVREMOTE — GPU Streaming, Unleashed.',
  description:
    'One hub. Multiple apps. Stream your NVIDIA-powered desktop to any device with adaptive quality, up to 4K resolution, up to 240 FPS, and P2P encrypted connections powered by NvFBC + NVENC.',
  keywords: [
    'GPU streaming',
    'game streaming',
    'remote desktop',
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
    title: 'NVREMOTE — GPU Streaming, Unleashed.',
    description:
      'One hub. Multiple apps. Stream your NVIDIA-powered desktop to any device. Up to 4K, up to 240 FPS, P2P encrypted.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'NVRemote — GPU Streaming, Unleashed.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NVREMOTE — GPU Streaming, Unleashed.',
    description:
      'One hub. Multiple apps. Stream your NVIDIA-powered desktop to any device.',
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
