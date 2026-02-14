# Plan: Add Linux Host, Linux Client, and macOS Client Builds

## Scope

Add 3 new build targets to the CI/CD pipeline:
1. **Linux Host** — `CrazyStreamHost-{version}-linux-amd64.tar.gz`
2. **Linux Client** — `CrazyStreamClient-{version}-x86_64.AppImage` (Electron)
3. **macOS Client** — `CrazyStreamClient-{version}-universal.dmg` (Electron)

**NOT in scope**: macOS host, Linux/macOS capture/encode rewrites (those are massive
multi-month efforts). This plan only covers what can ship NOW with the existing codebase.

## What Can Ship Today vs What Needs New Code

### Linux Host — Go agent + C++ streamer
- **Go host-agent**: Needs `ipc_unix.go` (Unix domain sockets instead of named pipes) — ~80 LOC
- **C++ crazystream-host.exe**: Windows-only (DXGI/NvFBC/WASAPI/NVENC). **Cannot compile on Linux today.**
- **Strategy**: Ship the Go agent only. The C++ streamer binary will be a future addition
  once Linux capture/encode backends are written. The agent can register with the
  signaling server, discover STUN candidates, and handle session setup. The actual
  streaming will fail gracefully with "Linux streaming not yet supported" until the
  C++ host is ported.

Actually, rethinking: the user asked for "linux host client" — which means the host
**package** that gets downloaded. We should ship the Go agent bundled as a tar.gz so
the infrastructure (registration, signaling, P2P setup) works on Linux even if actual
streaming doesn't work yet. This lets early adopters test connectivity.

### Linux Client (Electron viewer)
- **Electron app**: The renderer (React/TypeScript) is fully cross-platform
- **crazystream-viewer.node**: Windows-only N-API addon (D3D11, WASAPI, NVDEC)
  - **Cannot compile on Linux** without new decode/render/audio backends
- **Strategy**: Build the Electron AppImage WITHOUT the native addon. The app will
  load, authenticate, create sessions, exchange ICE candidates — but actual video
  playback won't work until Linux decode/render backends are written. Ship with a
  graceful "Native streaming not available on this platform" message.

### macOS Client (Electron viewer)
- Same situation as Linux client — Electron shell works, native addon doesn't
- **Strategy**: Same as Linux — ship the Electron app as .dmg, graceful fallback
  for the missing native addon

## Implementation Steps

### Step 1: Go Host Agent — Add Unix IPC support

**New file**: `apps/host-agent/internal/streamer/ipc_unix.go`
```go
//go:build linux || darwin

package streamer

import (
    "fmt"
    "net"
    "time"
)

const defaultSocketPath = "/tmp/crazystream-host.sock"

func dialPipe(pipeName string, timeout time.Duration) (net.Conn, error) {
    // On Unix, the "pipe name" is actually a Unix socket path
    socketPath := pipeName
    if socketPath == defaultPipeName {
        socketPath = defaultSocketPath
    }
    conn, err := net.DialTimeout("unix", socketPath, timeout)
    if err != nil {
        return nil, fmt.Errorf("connecting to unix socket %s: %w", socketPath, err)
    }
    return conn, nil
}
```

**Modify**: `apps/host-agent/internal/streamer/ipc.go`
- Make `defaultPipeName` platform-conditional, or just let the unix build use
  `defaultSocketPath` from the unix file

### Step 2: CI — Add Linux Host Agent build job

**New job in release.yml**: `build-host-agent-linux`
```yaml
build-host-agent-linux:
  name: Build Host Agent (Linux)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v5
      with:
        go-version: ${{ env.GO_VERSION }}
    - run: |
        cd apps/host-agent
        GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build \
          -ldflags="-s -w -X main.version=${GITHUB_REF_NAME}" \
          -o CrazyStreamAgent ./cmd/agent
    - uses: actions/upload-artifact@v4
      with:
        name: host-agent-linux
        path: apps/host-agent/CrazyStreamAgent
```

**New job**: `build-host-bundle-linux`
```yaml
build-host-bundle-linux:
  name: Bundle Host Package (Linux)
  runs-on: ubuntu-latest
  needs: [build-host-agent-linux]
  steps:
    - Download host-agent-linux artifact
    - Create tar.gz: CrazyStreamHost-{version}-linux-amd64.tar.gz
    - Upload as host-bundle-linux artifact
```

### Step 3: Electron Client — Handle missing native addon gracefully

**Modify**: `apps/client-desktop/src/main/main.ts`
- Wrap the native addon require in a try/catch
- If loading fails, set a flag `nativeAddonAvailable = false`
- Pass this to renderer via preload

**Modify**: `apps/client-desktop/src/main/preload.ts`
- Expose `platform` and `nativeStreamingAvailable` to renderer

**Modify**: Renderer components that use the native addon
- Show "Native streaming not yet available on [platform]" when addon missing
- All non-streaming features (auth, session management, settings) work normally

### Step 4: Electron Builder — Add Linux and macOS targets

**Modify**: `apps/client-desktop/electron-builder.yml`
```yaml
# Add alongside existing win section:
linux:
  target:
    - target: AppImage
      arch:
        - x64
  artifactName: "CrazyStreamClient-${version}-x86_64.AppImage"

mac:
  target:
    - target: dmg
      arch:
        - universal
  artifactName: "CrazyStreamClient-${version}-universal.dmg"
```

### Step 5: CI — Add Linux Client build job

**New job in release.yml**: `build-client-linux`
```yaml
build-client-linux:
  name: Build Desktop Client (Linux)
  runs-on: ubuntu-latest
  steps:
    - Checkout
    - Setup Node.js
    - npm install (from workspace root)
    - npm run build (in apps/client-desktop)
    - npx electron-builder --linux --config electron-builder.yml
    - Upload AppImage artifact
```

Note: NO native-libs dependency — the Linux client ships without the N-API addon.

### Step 6: CI — Add macOS Client build job

**New job in release.yml**: `build-client-mac`
```yaml
build-client-mac:
  name: Build Desktop Client (macOS)
  runs-on: macos-latest
  steps:
    - Checkout
    - Setup Node.js
    - npm install
    - npm run build (in apps/client-desktop)
    - npx electron-builder --mac --config electron-builder.yml
    - Upload .dmg artifact
```

### Step 7: Update create-release job

**Modify**: `create-release` job
- Add `build-host-bundle-linux`, `build-client-linux`, `build-client-mac` to `needs`
- Collect new artifacts into `release-files/`
- Update release body table with new platforms

### Step 8: Update website download routes

**Modify**: `apps/website/src/app/api/download/[platform]/route.ts`
- Update `linux-host` asset filename to match: `CrazyStreamHost-{version}-linux-amd64.tar.gz`
- Update `linux-client` asset filename to match: `CrazyStreamClient-{version}-x86_64.AppImage`
- Update `macos-client` asset filename to match: `CrazyStreamClient-{version}-universal.dmg`

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/host-agent/internal/streamer/ipc_unix.go` | CREATE | Unix socket IPC for Linux/macOS |
| `apps/host-agent/internal/streamer/ipc.go` | MODIFY | Make default pipe path platform-aware |
| `apps/client-desktop/src/main/main.ts` | MODIFY | Graceful native addon loading |
| `apps/client-desktop/src/main/preload.ts` | MODIFY | Expose platform info to renderer |
| `apps/client-desktop/electron-builder.yml` | MODIFY | Add linux + mac targets |
| `.github/workflows/release.yml` | MODIFY | Add 4 new jobs (linux agent, linux bundle, linux client, mac client) |
| `apps/website/src/app/api/download/[platform]/route.ts` | MODIFY | Update asset filenames |

## Expected Artifacts After Implementation

| Platform | Artifact | Contents |
|----------|----------|----------|
| Windows Host | `CrazyStreamHost-{ver}-win64.zip` | crazystream-host.exe + CrazyStreamAgent.exe + DLLs |
| **Linux Host** | `CrazyStreamHost-{ver}-linux-amd64.tar.gz` | CrazyStreamAgent (Go binary only, no streaming yet) |
| Windows Client | `CrazyStream-0.1.0-Setup.exe` | Full Electron + native addon |
| **Linux Client** | `CrazyStreamClient-{ver}-x86_64.AppImage` | Electron shell (no native streaming) |
| **macOS Client** | `CrazyStreamClient-{ver}-universal.dmg` | Electron shell (no native streaming) |
| Android Client | `CrazyStream-{ver}.apk` | Full Kotlin/Compose client |
