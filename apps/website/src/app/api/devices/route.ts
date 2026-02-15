import { NextResponse } from 'next/server';

const mockDevices = [
  {
    id: 'dev_01',
    name: 'DESKTOP-GAMING',
    platform: 'windows',
    type: 'Desktop',
    status: 'online',
    lastSeen: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    lastSeenLabel: '2 minutes ago',
    ip: '192.168.1.***',
    ipFull: '192.168.1.105',
    authMethod: 'Google OAuth',
    os: 'Windows 11 Pro',
    agent: 'NVRemote Host v0.2.1',
    gpu: 'NVIDIA RTX 4080',
    capabilities: ['nvfbc', 'nvenc', 'h265', 'av1'],
  },
  {
    id: 'dev_02',
    name: 'LAPTOP-WORK',
    platform: 'windows',
    type: 'Laptop',
    status: 'online',
    lastSeen: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    lastSeenLabel: '15 minutes ago',
    ip: '10.0.0.***',
    ipFull: '10.0.0.42',
    authMethod: 'Google OAuth',
    os: 'Windows 11 Home',
    agent: 'NVRemote Client v0.2.1',
    gpu: 'NVIDIA RTX 3060 Mobile',
    capabilities: ['nvdec', 'h265'],
  },
  {
    id: 'dev_03',
    name: 'MacBook-Pro',
    platform: 'macos',
    type: 'Laptop',
    status: 'idle',
    lastSeen: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    lastSeenLabel: '1 hour ago',
    ip: '192.168.1.***',
    ipFull: '192.168.1.110',
    authMethod: 'Google OAuth',
    os: 'macOS 14.3 Sonoma',
    agent: 'NVRemote Client v0.2.1',
    gpu: 'Apple M3 Pro',
    capabilities: ['videotoolbox', 'metal', 'h265'],
  },
  {
    id: 'dev_04',
    name: 'ubuntu-streamer',
    platform: 'linux',
    type: 'Server',
    status: 'offline',
    lastSeen: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    lastSeenLabel: '3 hours ago',
    ip: '172.16.0.***',
    ipFull: '172.16.0.10',
    authMethod: 'API Key',
    os: 'Ubuntu 22.04 LTS',
    agent: 'NVRemote Host v0.2.0',
    gpu: 'NVIDIA RTX A4000',
    capabilities: ['nvfbc', 'nvenc', 'h265', 'av1'],
  },
  {
    id: 'dev_05',
    name: 'Pixel 8 Pro',
    platform: 'android',
    type: 'Phone',
    status: 'offline',
    lastSeen: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    lastSeenLabel: 'Yesterday',
    ip: '192.168.1.***',
    ipFull: '192.168.1.201',
    authMethod: 'Google OAuth',
    os: 'Android 14',
    agent: 'NVRemote Client v0.2.1',
    gpu: 'Adreno 750',
    capabilities: ['mediacodec', 'h265'],
  },
  {
    id: 'dev_06',
    name: 'Chrome 121',
    platform: 'web',
    type: 'Browser',
    status: 'coming_soon',
    lastSeen: null,
    lastSeenLabel: 'Coming Soon',
    ip: null,
    ipFull: null,
    authMethod: null,
    os: 'Web Browser',
    agent: null,
    gpu: null,
    capabilities: [],
  },
  {
    id: 'dev_07',
    name: 'iPhone 15',
    platform: 'ios',
    type: 'Phone',
    status: 'coming_soon',
    lastSeen: null,
    lastSeenLabel: 'Coming Soon',
    ip: null,
    ipFull: null,
    authMethod: null,
    os: 'iOS 17',
    agent: null,
    gpu: null,
    capabilities: [],
  },
];

export async function GET() {
  return NextResponse.json({
    devices: mockDevices,
    total: mockDevices.length,
    online: mockDevices.filter((d) => d.status === 'online').length,
    platforms: [...new Set(mockDevices.map((d) => d.platform))],
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('id');

  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message: `Device ${deviceId} access revoked`,
    revokedAt: new Date().toISOString(),
  });
}
