import { NextResponse } from 'next/server';

const GCS_BUCKET = 'https://storage.googleapis.com/nvremote-downloads';

const releases = [
  {
    version: 'v0.4.0-alpha',
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
          filename: 'NVRemoteHost-v0.4.0-alpha-win64.zip',
          sizeLabel: '~48 MB',
          url: `${GCS_BUCKET}/v0.4.0-alpha/NVRemoteHost-v0.4.0-alpha-win64.zip`,
        },
        {
          platform: 'linux',
          arch: 'x64',
          filename: 'NVRemoteHost-v0.4.0-alpha-linux-amd64.tar.gz',
          sizeLabel: '~12 MB',
          url: `${GCS_BUCKET}/v0.4.0-alpha/NVRemoteHost-v0.4.0-alpha-linux-amd64.tar.gz`,
        },
        {
          platform: 'macos',
          arch: 'universal',
          filename: 'NVRemoteHost-v0.4.0-alpha-universal.pkg',
          sizeLabel: '~45 MB',
          url: `${GCS_BUCKET}/v0.4.0-alpha/NVRemoteHost-v0.4.0-alpha-universal.pkg`,
          comingSoon: true,
        },
      ],
      client: [
        {
          platform: 'windows',
          arch: 'x64',
          filename: 'NVRemote-0.4.0-alpha-Setup.exe',
          sizeLabel: '~35 MB',
          url: `${GCS_BUCKET}/v0.4.0-alpha/NVRemote-0.4.0-alpha-Setup.exe`,
        },
        {
          platform: 'macos',
          arch: 'universal',
          filename: 'NVRemote-0.4.0-alpha-universal.dmg',
          sizeLabel: '~38 MB',
          url: `${GCS_BUCKET}/v0.4.0-alpha/NVRemote-0.4.0-alpha-universal.dmg`,
        },
        {
          platform: 'linux',
          arch: 'x64',
          filename: 'NVRemote-0.4.0-alpha-x86_64.AppImage',
          sizeLabel: '~40 MB',
          url: `${GCS_BUCKET}/v0.4.0-alpha/NVRemote-0.4.0-alpha-x86_64.AppImage`,
        },
        {
          platform: 'android',
          arch: 'arm64',
          filename: 'NVRemote-v0.4.0-alpha.apk',
          sizeLabel: '~25 MB',
          url: `${GCS_BUCKET}/v0.4.0-alpha/NVRemote-v0.4.0-alpha.apk`,
          playStoreUrl:
            'https://play.google.com/store/apps/details?id=com.nvremote.client',
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
