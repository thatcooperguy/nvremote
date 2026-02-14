import { NextRequest, NextResponse } from 'next/server';

const VERSION = 'v0.3.0-alpha';
const GITHUB_REPO = 'thatcooperguy/nvstreamer';

interface PlatformInfo {
  /** The exact filename uploaded to the GitHub Release */
  assetFilename: string;
  /** Fallback content type if GitHub doesn't provide one */
  contentType: string;
  description: string;
}

/**
 * Maps platform slugs to the expected GitHub Release asset filenames.
 * These must match what the CI release workflow uploads.
 */
const platforms: Record<string, PlatformInfo> = {
  'windows-host': {
    assetFilename: `CrazyStreamHost-${VERSION}-win64.zip`,
    contentType: 'application/zip',
    description: 'CrazyStream Host for Windows (x64)',
  },
  'windows-client': {
    assetFilename: `CrazyStream-${VERSION.replace('v', '')}-Setup.exe`,
    contentType: 'application/vnd.microsoft.portable-executable',
    description: 'CrazyStream Client for Windows (x64)',
  },
  'android-client': {
    assetFilename: `CrazyStream-${VERSION}.apk`,
    contentType: 'application/vnd.android.package-archive',
    description: 'CrazyStream Client for Android',
  },
  'linux-host': {
    assetFilename: `CrazyStreamHost-${VERSION}-linux-amd64.tar.gz`,
    contentType: 'application/gzip',
    description: 'CrazyStream Host Agent for Linux (amd64)',
  },
  'macos-client': {
    assetFilename: `CrazyStream-${VERSION.replace('v', '')}-universal.dmg`,
    contentType: 'application/x-apple-diskimage',
    description: 'CrazyStream Client for macOS (Universal)',
  },
  'linux-client': {
    assetFilename: `CrazyStream-${VERSION.replace('v', '')}-x86_64.AppImage`,
    contentType: 'application/x-executable',
    description: 'CrazyStream Client for Linux (x86_64)',
  },
};

/**
 * Fetches the download URL for a specific asset from the GitHub Release.
 * For private repos, uses the GitHub API with a token to get the asset
 * and proxies it through to the user.
 */
async function getGitHubAssetUrl(
  assetFilename: string
): Promise<{ url: string; size: number } | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'CrazyStream-Website',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    // Get release by tag
    const releaseRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${VERSION}`,
      { headers, next: { revalidate: 300 } } // Cache for 5 minutes
    );

    if (!releaseRes.ok) {
      console.error(
        `GitHub API error: ${releaseRes.status} ${releaseRes.statusText}`
      );
      return null;
    }

    const release = await releaseRes.json();
    const assets = release.assets || [];

    // Find the matching asset
    const asset = assets.find(
      (a: { name: string }) => a.name === assetFilename
    );

    if (!asset) {
      console.error(
        `Asset "${assetFilename}" not found in release ${VERSION}. Available: ${assets.map((a: { name: string }) => a.name).join(', ')}`
      );
      return null;
    }

    // For private repos, we need the API URL with Accept header to get the binary
    // For public repos, we can use the browser_download_url directly
    return {
      url: token ? asset.url : asset.browser_download_url,
      size: asset.size,
    };
  } catch (err) {
    console.error('Failed to fetch GitHub release:', err);
    return null;
  }
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

  // Try to fetch real binary from GitHub Release
  const asset = await getGitHubAssetUrl(info.assetFilename);

  if (asset) {
    const token = process.env.GITHUB_TOKEN;

    if (token) {
      // Private repo: proxy the download through our server
      // GitHub API requires Accept: application/octet-stream to get the binary
      const binaryRes = await fetch(asset.url, {
        headers: {
          Accept: 'application/octet-stream',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'CrazyStream-Website',
        },
        redirect: 'follow',
      });

      if (binaryRes.ok && binaryRes.body) {
        return new NextResponse(binaryRes.body as unknown as BodyInit, {
          status: 200,
          headers: {
            'Content-Type': info.contentType,
            'Content-Disposition': `attachment; filename="${info.assetFilename}"`,
            'Content-Length': asset.size.toString(),
            'Cache-Control': 'public, max-age=3600',
            'X-CrazyStream-Version': VERSION,
          },
        });
      }
    } else {
      // Public repo: redirect directly to GitHub's CDN
      return NextResponse.redirect(asset.url, 302);
    }
  }

  // Fallback: serve a placeholder if the release asset doesn't exist yet
  const placeholder = buildPlaceholder(info);

  return new NextResponse(placeholder as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': info.contentType,
      'Content-Disposition': `attachment; filename="${info.assetFilename}"`,
      'Content-Length': placeholder.byteLength.toString(),
      'Cache-Control': 'no-cache',
      'X-CrazyStream-Version': VERSION,
      'X-CrazyStream-Placeholder': 'true',
    },
  });
}

function buildPlaceholder(info: PlatformInfo): Uint8Array {
  const header = [
    `CRAZYSTREAM ${VERSION}`,
    `File: ${info.assetFilename}`,
    `Description: ${info.description}`,
    ``,
    `This is a placeholder installer for the CrazyStream alpha.`,
    `The CI build for this platform has not completed yet.`,
    ``,
    `Once the GitHub Actions release workflow finishes, real binaries`,
    `will be served automatically from this same URL.`,
    ``,
    `Visit https://github.com/thatcooperguy/nvstreamer for source code.`,
    ``,
  ].join('\n');

  return new TextEncoder().encode(header);
}
