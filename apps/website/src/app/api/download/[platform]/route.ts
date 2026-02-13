import { NextRequest, NextResponse } from 'next/server';

const VERSION = 'v0.2.1-alpha';

interface PlatformInfo {
  filename: string;
  contentType: string;
  description: string;
}

const platforms: Record<string, PlatformInfo> = {
  'windows-host': {
    filename: `CrazyStreamHost-${VERSION}-win64.exe`,
    contentType: 'application/vnd.microsoft.portable-executable',
    description: 'CrazyStream Host for Windows (x64)',
  },
  'linux-host': {
    filename: `CrazyStreamHost-${VERSION}-amd64.deb`,
    contentType: 'application/vnd.debian.binary-package',
    description: 'CrazyStream Host for Linux (amd64)',
  },
  'macos-host': {
    filename: `CrazyStreamHost-${VERSION}-universal.pkg`,
    contentType: 'application/x-newton-compatible-pkg',
    description: 'CrazyStream Host for macOS (Universal)',
  },
  'windows-client': {
    filename: `CrazyStreamClient-${VERSION}-win64.exe`,
    contentType: 'application/vnd.microsoft.portable-executable',
    description: 'CrazyStream Client for Windows (x64)',
  },
  'macos-client': {
    filename: `CrazyStreamClient-${VERSION}-universal.dmg`,
    contentType: 'application/x-apple-diskimage',
    description: 'CrazyStream Client for macOS (Universal)',
  },
  'linux-client': {
    filename: `CrazyStreamClient-${VERSION}-x86_64.AppImage`,
    contentType: 'application/x-executable',
    description: 'CrazyStream Client for Linux (x86_64)',
  },
  'android-client': {
    filename: `CrazyStream-${VERSION}.apk`,
    contentType: 'application/vnd.android.package-archive',
    description: 'CrazyStream Client for Android',
  },
};

function buildPlaceholderBinary(info: PlatformInfo): Uint8Array {
  // Build a small placeholder binary with metadata header
  const header = [
    `CRAZYSTREAM ${VERSION}`,
    `File: ${info.filename}`,
    `Description: ${info.description}`,
    ``,
    `This is a placeholder installer for the CrazyStream alpha.`,
    `Full binaries will be available in upcoming releases.`,
    ``,
    `Visit https://github.com/thatcooperguy/nvstreamer for source code.`,
    ``,
  ].join('\n');

  return new TextEncoder().encode(header);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { platform: string } }
) {
  const platform = params.platform;
  const info = platforms[platform];

  if (!info) {
    return NextResponse.json(
      {
        error: 'Unknown platform',
        available: Object.keys(platforms),
      },
      { status: 404 }
    );
  }

  const binary = buildPlaceholderBinary(info);

  return new NextResponse(binary as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': info.contentType,
      'Content-Disposition': `attachment; filename="${info.filename}"`,
      'Content-Length': binary.byteLength.toString(),
      'Cache-Control': 'public, max-age=3600',
      'X-CrazyStream-Version': VERSION,
    },
  });
}
