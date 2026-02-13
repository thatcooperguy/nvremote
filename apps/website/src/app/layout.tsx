import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import './globals.css';

export const metadata: Metadata = {
  title: 'CrazyStream — Ultra Low Latency Game Streaming',
  description:
    'Stream games with near-zero latency using NVIDIA hardware acceleration. P2P direct connection, adaptive QoS, NvFBC + NVENC pipeline. Supports 4K@60, 1440p@144, 1080p@240.',
  keywords: [
    'game streaming',
    'low latency',
    'NVIDIA',
    'NvFBC',
    'NVENC',
    'remote gaming',
    'P2P streaming',
    'cloud gaming',
  ],
  authors: [{ name: 'CrazyStream Team' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://crazystream.gg',
    siteName: 'CrazyStream',
    title: 'CrazyStream — Ultra Low Latency Game Streaming',
    description:
      'Stream games with near-zero latency. P2P direct connection with adaptive quality. 4K@60, 1440p@144, 1080p@240 supported.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CrazyStream - Ultra Low Latency Game Streaming',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CrazyStream — Ultra Low Latency Game Streaming',
    description:
      'Stream games with near-zero latency. P2P direct connection with adaptive quality.',
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
    <html lang="en" className="dark">
      <body className="min-h-screen bg-cs-dark text-white antialiased">
        <Navbar />
        <main className="pt-16">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
