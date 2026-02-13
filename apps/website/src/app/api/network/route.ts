import { NextResponse } from 'next/server';

function generateJitterData(points: number = 20) {
  return Array.from({ length: points }, (_, i) => ({
    time: `${points - i}s`,
    jitter: Math.round((0.5 + Math.random() * 2.5) * 100) / 100,
    latency: Math.round((5 + Math.random() * 10) * 100) / 100,
  }));
}

function generatePacketLossData(points: number = 12) {
  return Array.from({ length: points }, (_, i) => ({
    interval: `T-${points - i}`,
    loss: i === 3 || i === 7 ? Math.round(Math.random() * 0.05 * 1000) / 1000 : 0,
  }));
}

function generateBandwidthData(points: number = 15) {
  return Array.from({ length: points }, (_, i) => ({
    time: `${points - i}m`,
    upload: Math.round((20 + Math.random() * 15) * 100) / 100,
    download: Math.round((180 + Math.random() * 80) * 100) / 100,
  }));
}

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    metrics: {
      ping: {
        value: Math.round(5 + Math.random() * 8),
        unit: 'ms',
        status: 'excellent',
      },
      jitter: {
        value: Math.round((0.8 + Math.random() * 1.5) * 100) / 100,
        unit: 'ms',
        status: 'low',
      },
      packetLoss: {
        value: Math.round(Math.random() * 0.05 * 1000) / 1000,
        unit: '%',
        status: 'nominal',
      },
      bandwidth: {
        download: Math.round(200 + Math.random() * 100),
        upload: Math.round(25 + Math.random() * 15),
        unit: 'Mbps',
        status: 'good',
      },
    },
    charts: {
      jitter: generateJitterData(),
      packetLoss: generatePacketLossData(),
      bandwidth: generateBandwidthData(),
    },
    diagnostics: {
      natType: 'Full Cone (Open)',
      stunResponse: `${Math.round(3 + Math.random() * 5)}ms`,
      routeHops: Math.round(3 + Math.random() * 4),
      optimalMTU: 1400,
      publicIP: '203.0.113.***',
      localIP: '192.168.1.***',
      upnp: true,
      ipv6: true,
      turnFallback: false,
    },
  });
}

export async function POST() {
  // Simulate diagnostic run
  return NextResponse.json({
    status: 'complete',
    runAt: new Date().toISOString(),
    duration: `${Math.round(1500 + Math.random() * 1000)}ms`,
    results: {
      natType: 'Full Cone (Open)',
      stunResponseTime: `${Math.round(3 + Math.random() * 5)}ms`,
      routeHops: Math.round(3 + Math.random() * 4),
      optimalMTU: 1400,
      publicEndpoint: '203.0.113.42:49152',
      symmetricNAT: false,
      hairpinning: true,
      uplinkCapacity: `${Math.round(30 + Math.random() * 10)} Mbps`,
      downlinkCapacity: `${Math.round(250 + Math.random() * 100)} Mbps`,
      recommendations: [
        'Network conditions are optimal for streaming.',
        'Direct P2P connection should succeed without relay.',
        'Consider enabling QoS on your router for best results.',
      ],
    },
  });
}
