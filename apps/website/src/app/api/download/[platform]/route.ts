import { NextRequest, NextResponse } from 'next/server';

const VERSION = 'v0.4.0-alpha';
const GCS_BUCKET = 'https://storage.googleapis.com/nvremote-downloads';

interface PlatformInfo {
  /** The exact filename in the GCS bucket */
  assetFilename: string;
  /** Content type for the download */
  contentType: string;
  description: string;
}

/**
 * Maps platform slugs to the expected asset filenames in GCS.
 * Files are stored at: gs://nvremote-downloads/{VERSION}/{filename}
 */
const platforms: Record<string, PlatformInfo> = {
  'windows-host': {
    assetFilename: `NVRemoteHost-${VERSION}-win64.zip`,
    contentType: 'application/zip',
    description: 'NVRemote Host for Windows (x64)',
  },
  'windows-client': {
    assetFilename: `NVRemote-${VERSION.replace('v', '')}-Setup.exe`,
    contentType: 'application/vnd.microsoft.portable-executable',
    description: 'NVRemote Client for Windows (x64)',
  },
  'android-client': {
    assetFilename: `NVRemote-${VERSION}.apk`,
    contentType: 'application/vnd.android.package-archive',
    description: 'NVRemote Client for Android',
  },
  'linux-host': {
    assetFilename: `NVRemoteHost-${VERSION}-linux-amd64.tar.gz`,
    contentType: 'application/gzip',
    description: 'NVRemote Host Agent for Linux (amd64)',
  },
  'linux-host-arm64': {
    assetFilename: `NVRemoteHost-${VERSION}-linux-arm64.tar.gz`,
    contentType: 'application/gzip',
    description: 'NVRemote Host Agent for Linux (ARM64)',
  },
  'macos-client': {
    assetFilename: `NVRemote-${VERSION.replace('v', '')}-universal.dmg`,
    contentType: 'application/x-apple-diskimage',
    description: 'NVRemote Client for macOS (Universal)',
  },
  'linux-client': {
    assetFilename: `NVRemote-${VERSION.replace('v', '')}-x86_64.AppImage`,
    contentType: 'application/x-executable',
    description: 'NVRemote Client for Linux (x86_64)',
  },
  'linux-client-arm64': {
    assetFilename: `NVRemote-${VERSION.replace('v', '')}-arm64.AppImage`,
    contentType: 'application/x-executable',
    description: 'NVRemote Client for Linux (ARM64)',
  },
};

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

  // Redirect to GCS public URL for the download
  const gcsUrl = `${GCS_BUCKET}/${VERSION}/${info.assetFilename}`;

  // Check if the file exists before redirecting
  try {
    const headRes = await fetch(gcsUrl, {
      method: 'HEAD',
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (headRes.ok) {
      return NextResponse.redirect(gcsUrl, 302);
    }
  } catch {
    // GCS check failed, fall through to downloads page
  }

  // Fallback: redirect to downloads page
  return NextResponse.redirect(
    new URL('/downloads', request.url).toString(),
    302
  );
}
