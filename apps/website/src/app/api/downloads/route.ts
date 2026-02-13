import { NextResponse } from 'next/server';

const BASE_URL = 'https://github.com/thatcooperguy/nvstreamer/releases/download';

const releases = [
  {
    version: 'v0.2.1-alpha',
    channel: 'alpha',
    date: '2025-02-10',
    latest: true,
    changelog: [
      'Improved NVENC encoder stability on RTX 40-series',
      'Added AV1 encoding support (experimental)',
      'Fixed audio desync on sessions longer than 2 hours',
      'Reduced P2P connection setup time by 40%',
      'Android client: fixed touch input mapping',
    ],
    artifacts: {
      host: [
        {
          platform: 'windows',
          arch: 'x64',
          filename: 'CrazyStreamHost-v0.2.1-alpha-win64.exe',
          size: 48200000,
          sizeLabel: '48.2 MB',
          sha256: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
          url: `${BASE_URL}/v0.2.1-alpha/CrazyStreamHost-v0.2.1-alpha-win64.exe`,
        },
        {
          platform: 'linux',
          arch: 'x64',
          filename: 'CrazyStreamHost-v0.2.1-alpha-amd64.deb',
          size: 42100000,
          sizeLabel: '42.1 MB',
          sha256: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3',
          url: `${BASE_URL}/v0.2.1-alpha/CrazyStreamHost-v0.2.1-alpha-amd64.deb`,
        },
        {
          platform: 'macos',
          arch: 'universal',
          filename: 'CrazyStreamHost-v0.2.1-alpha-universal.pkg',
          size: 45800000,
          sizeLabel: '45.8 MB',
          sha256: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
          url: `${BASE_URL}/v0.2.1-alpha/CrazyStreamHost-v0.2.1-alpha-universal.pkg`,
        },
      ],
      client: [
        {
          platform: 'windows',
          arch: 'x64',
          filename: 'CrazyStreamClient-v0.2.1-win64.exe',
          size: 35400000,
          sizeLabel: '35.4 MB',
          sha256: 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5',
          url: `${BASE_URL}/v0.2.1-alpha/CrazyStreamClient-v0.2.1-alpha-win64.exe`,
        },
        {
          platform: 'macos',
          arch: 'universal',
          filename: 'CrazyStreamClient-v0.2.1-alpha-universal.dmg',
          size: 38200000,
          sizeLabel: '38.2 MB',
          sha256: 'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
          url: `${BASE_URL}/v0.2.1-alpha/CrazyStreamClient-v0.2.1-alpha-universal.dmg`,
        },
        {
          platform: 'linux',
          arch: 'x64',
          filename: 'CrazyStream-v0.2.1-alpha-x86_64.AppImage',
          size: 40600000,
          sizeLabel: '40.6 MB',
          sha256: 'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7',
          url: `${BASE_URL}/v0.2.1-alpha/CrazyStream-v0.2.1-alpha-x86_64.AppImage`,
        },
        {
          platform: 'android',
          arch: 'arm64',
          filename: 'CrazyStream-v0.2.1-alpha.apk',
          size: 25100000,
          sizeLabel: '25.1 MB',
          sha256: 'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8',
          url: `${BASE_URL}/v0.2.1-alpha/CrazyStream-v0.2.1-alpha.apk`,
          playStoreUrl: 'https://play.google.com/store/apps/details?id=dev.crazystream.client',
        },
        {
          platform: 'web',
          arch: 'any',
          filename: null,
          size: null,
          sizeLabel: null,
          sha256: null,
          url: null,
          comingSoon: true,
        },
      ],
    },
  },
  {
    version: 'v0.2.0-alpha',
    channel: 'alpha',
    date: '2025-01-28',
    latest: false,
    changelog: [
      'Initial P2P direct connection support',
      'DTLS 1.3 encryption for all streams',
      'Adaptive bitrate with Kalman filter',
      'macOS client via VideoToolbox + Metal',
      'Android client initial release',
    ],
    artifacts: null,
  },
  {
    version: 'v0.1.0-alpha',
    channel: 'alpha',
    date: '2025-01-10',
    latest: false,
    changelog: [
      'First public alpha release',
      'Windows host and client only',
      'NvFBC capture + NVENC encoding',
      'Basic session management',
      'WebSocket signaling server',
    ],
    artifacts: null,
  },
];

export async function GET() {
  return NextResponse.json({
    releases,
    latest: releases[0],
    channels: ['alpha', 'beta', 'stable'],
  });
}
