<h1 align="center">
  <br>
  NVRemote
  <br>
</h1>

<h3 align="center">Stream your GPU-powered desktop to anything, anywhere.</h3>

<p align="center">
  <a href="https://nvremote.com">Website</a> &middot;
  <a href="https://nvremote.com/downloads">Downloads</a> &middot;
  <a href="https://nvremote.com/docs">Docs</a> &middot;
  <a href="https://api.nvremote.com/api/v1/health">API Status</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v0.5.1--beta-76B900?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/NVIDIA-NVENC%20%7C%20NvFBC-76B900?style=for-the-badge&logo=nvidia&logoColor=white" alt="NVIDIA" />
  <img src="https://img.shields.io/badge/WebRTC-P2P-blue?style=for-the-badge" alt="WebRTC" />
  <img src="https://img.shields.io/badge/built%20with-Claude%20AI-cc785c?style=for-the-badge" alt="Built with Claude" />
</p>

---

> **This is a personal passion project** built collaboratively by a human developer and AI (Claude by Anthropic). Every line of code across 7 languages, 6 platforms, and a production cloud backend was pair-programmed in iterative sessions. **This project is not created, sponsored, endorsed, or affiliated with NVIDIA Corporation.** See [Legal Disclaimer](#legal-disclaimer) below.

---

## Downloads

Grab the latest release for your platform. No account required — just download and run.

### 🖥️ Windows — One App, Client + Host

| Download | Notes |
|----------|-------|
| [**NVRemote-0.5.1-beta-Setup.exe**](https://github.com/thatcooperguy/nvremote/releases/download/v0.5.1-beta/NVRemote-0.5.1-beta-Setup.exe) | **Includes client AND host.** Stream to or from this machine. Auto-updates. |

> On Windows, NVRemote is one unified app. Go to Settings to switch between **Client**, **Host**, or **Both** mode. No separate host agent needed.

### 📱 Other Client Platforms

| Platform | Download | Notes |
|----------|----------|-------|
| **macOS** | [NVRemote-0.5.1-beta-universal.dmg](https://github.com/thatcooperguy/nvremote/releases/download/v0.5.1-beta/NVRemote-0.5.1-beta-universal.dmg) | Universal binary (Intel + Apple Silicon) |
| **Linux x86_64** | [NVRemote-0.5.1-beta-x86_64.AppImage](https://github.com/thatcooperguy/nvremote/releases/download/v0.5.1-beta/NVRemote-0.5.1-beta-x86_64.AppImage) | AppImage — `chmod +x` and run |
| **Linux ARM64** | [NVRemote-0.5.1-beta-arm64.AppImage](https://github.com/thatcooperguy/nvremote/releases/download/v0.5.1-beta/NVRemote-0.5.1-beta-arm64.AppImage) | Jetson / Pi / ARM64 Linux |
| **Android** | [NVRemote-v0.5.1-beta.apk](https://github.com/thatcooperguy/nvremote/releases/download/v0.5.1-beta/NVRemote-v0.5.1-beta.apk) | Android 7.0+, sideload APK |

### 🖧 Linux Host Agent (headless servers)

For headless Linux servers (Jetson, DGX, Docker) where Electron doesn't make sense, use the standalone Go agent:

| Platform | Download | Notes |
|----------|----------|-------|
| **Linux x86_64** | [NVRemoteHost-v0.5.1-beta-linux-amd64.tar.gz](https://github.com/thatcooperguy/nvremote/releases/download/v0.5.1-beta/NVRemoteHost-v0.5.1-beta-linux-amd64.tar.gz) | GPG signed ([.asc](https://github.com/thatcooperguy/nvremote/releases/download/v0.5.1-beta/NVRemoteHost-v0.5.1-beta-linux-amd64.tar.gz.asc)) |
| **Linux ARM64** | [NVRemoteHost-v0.5.1-beta-linux-arm64.tar.gz](https://github.com/thatcooperguy/nvremote/releases/download/v0.5.1-beta/NVRemoteHost-v0.5.1-beta-linux-arm64.tar.gz) | Jetson / DGX Spark — GPG signed ([.asc](https://github.com/thatcooperguy/nvremote/releases/download/v0.5.1-beta/NVRemoteHost-v0.5.1-beta-linux-arm64.tar.gz.asc)) |

> 📋 [SHA256 checksums](https://github.com/thatcooperguy/nvremote/releases/download/v0.5.1-beta/SHA256SUMS.txt) &middot; [All releases](https://github.com/thatcooperguy/nvremote/releases)

---

## The Pitch

You have a beefy NVIDIA GPU sitting in your device. You want to use it from your couch, your phone, or a browser tab halfway across the world.

**NVRemote** installs a tiny agent on your GPU machine and streams the entire desktop &mdash; with hardware-accelerated encoding &mdash; to any device over a peer-to-peer WebRTC connection. Low latency. Adaptive quality. 

```
Your RTX 3090 at home  ----WebRTC P2P---->  Your laptop at a coffee shop
Your Jetson Orin       ----WebRTC P2P---->  Your phone on the train
Your DGX Spark at work ----WebRTC P2P---->  A Chrome tab anywhere
```

---

## What Makes It Different

| Problem | NVRemote |
|---------|----------|
| VPN + RDP looks terrible | P2P WebRTC with NVIDIA hardware encode at up to 240fps |
| Existing solutions are one-size-fits-all | 7 streaming profiles: Competitive gaming to CAD precision |
| Limited to desktops | Native apps for Win, Mac, Android, Linux ARM + Chrome browser |
| No edge GPU support | First-class Jetson Orin and DGX Spark support |
| Complex setup | Install agent, sign in, click "Stream" |

---

## Platforms

### Stream FROM (Host)

- Windows 10/11 with any NVIDIA GPU (GeForce, Quadro, RTX)
- Linux x86_64 with NVIDIA GPU
- NVIDIA Jetson Nano / Xavier NX / Orin Nano / Orin NX / AGX Orin
- NVIDIA DGX Spark (Grace Blackwell GB10)

### Stream TO (Client)

- Windows (Electron)
- macOS (Electron + Swift/Metal)
- Linux x86_64 & ARM64 (Electron AppImage)
- Android 7.0+ (Kotlin/Compose)
- Chrome browser (zero-install WebRTC)

---

## Streaming Specs

The QoS engine runs a continuous control loop, adapting in real-time:

| What | Range |
|------|-------|
| Resolution | 720p &rarr; 8K (matches your display) |
| Frame Rate | 30 &rarr; 240 fps |
| Bitrate | 2 &rarr; 300 Mbps (adaptive) |
| Codecs | H.264, HEVC, AV1 (auto-selected) |
| Color | YUV 4:2:0 or 4:4:4 (for color-critical work) |
| Latency target | sub-frame on LAN, network-dependent on WAN |

### Profiles

| Profile | What It's For | Resolution | FPS |
|---------|--------------|-----------|-----|
| **Competitive** | Esports, fast shooters | 1080p | 240 |
| **Balanced** | General gaming & desktop | 1440p | 144 |
| **Cinematic** | Single-player, movies | up to 8K | 60 |
| **Creative** | Photo/video editing (4:4:4) | up to 8K | 60 |
| **CAD** | SolidWorks, Fusion 360 (4:4:4) | up to 8K | 60 |
| **Mobile Saver** | Phone on cellular | 720p | 60 |
| **LAN** | Same network, max everything | up to 8K | 240 |

---

## Architecture

```
                    Your Device                              Your GPU Machine
               ==================                      =======================

          [NVRemote Client]                        [nvremote-host]
           Electron / Android /                      NvFBC capture
           Chrome / Swift                            NVENC encode (H.264/HEVC/AV1)
           Hardware video decode                     Opus audio encode
                  |                                         |
                  |      WebRTC P2P (encrypted)             |
                  |  <-------- Video/Audio/Input -------->  |
                  |                                         |
                  +------- STUN/TURN fallback -------+      |
                                                     |      |
                                              [NVRemote API]
                                               NestJS on GCP Cloud Run
                                               OAuth + JWT auth
                                               Signaling relay
                                               Session management
                                                     |
                                              [PostgreSQL 15]
```

---

## Connection Modes

| Mode | How | Latency | When |
|------|-----|---------|------|
| **P2P Direct** | STUN NAT traversal | Lowest | Default for most networks |
| **TURN Relay** | NVRemote relay server | Low | Auto-fallback for strict NAT |
| **WireGuard VPN** | Encrypted tunnel | Medium | Corporate firewalls |
| **Zero-Trust** | Per-session auth proxy | Medium | Enterprise compliance |

---

## Repo Map

```
nvremote/
├── apps/
│   ├── server-api/          # NestJS API         (TypeScript)
│   ├── website/             # Next.js site        (TypeScript)
│   ├── client-desktop/      # Electron app — client + host (TypeScript + C++)
│   ├── android/             # Android client      (Kotlin)
│   ├── mac-client/          # macOS client        (Swift)
│   ├── host-agent/          # Host agent — Linux headless (Go)
│   └── gateway/             # TURN + VPN gateway  (Go)
├── libs/
│   ├── nvremote-host/       # GPU capture + encode (C++17)
│   ├── nvremote-viewer/     # Video decoder addon  (C++17)
│   └── nvremote-common/     # Shared networking    (C++17)
├── infra/
│   └── terraform/           # GCP IaC
└── .github/workflows/       # CI (6 jobs) + Release (13 jobs)
```

**7 languages:** TypeScript, C++17, Go, Kotlin, Swift, SQL, HCL

---

## Tech Stack

| | Technology |
|-|-----------|
| API | NestJS 10, Prisma 5, PostgreSQL 15, Socket.io |
| Website | Next.js 14, React 18, Tailwind CSS, Framer Motion |
| Desktop | Electron 31, React 18, Zustand, C++ N-API addon (unified client + host) |
| Android | Kotlin, Jetpack Compose, Hilt, WebRTC |
| macOS | Swift 5.9, Metal, VideoToolbox |
| Host Agent | Go 1.22 |
| Streaming | C++17, NvFBC, NVENC SDK, OpenSSL, Opus |
| Infra | GCP Cloud Run, Cloud SQL, Terraform |
| CI/CD | GitHub Actions (13-job release pipeline) |

---

## NVIDIA ARM Platform Support

| Platform | GPU | Encode | Host | Client |
|----------|-----|--------|------|--------|
| Jetson Nano | Maxwell 128-core | H.264 | Yes | Yes |
| Jetson Xavier NX | Volta 384-core | H.264, HEVC | Yes | Yes |
| Jetson Orin Nano | Ampere 1024-core | H.264, HEVC | Yes | Yes |
| Jetson AGX Orin | Ampere 2048-core | H.264, HEVC | Yes | Yes |
| DGX Spark | Blackwell | H.264, HEVC, AV1 | Yes | Yes |

---

## Security

- JWT auth on every endpoint (default-closed)
- Org-scoped data isolation
- Token rotation on refresh
- 30-min idle timeout, 24-hr max session
- Rate limiting, Helmet headers, strict CORS
- Non-root Docker containers
- GPG-signed Linux releases
- DTLS/SRTP encrypted streams

---

## Getting Started

Stream your GPU desktop in 3 steps. Your host and sessions are private to your account — no one else can see or connect to your machine.

### Windows (one app does everything)

1. Download [**NVRemote-0.5.1-beta-Setup.exe**](https://github.com/thatcooperguy/nvremote/releases/download/v0.5.1-beta/NVRemote-0.5.1-beta-Setup.exe) and install it
2. Sign in with Google
3. **To stream FROM this machine:** Go to Settings &rarr; switch to **Host** or **Both** mode &rarr; follow the setup wizard to register
4. **To stream TO this machine:** Your hosts appear in the Dashboard &mdash; click **Stream**

That's it. One app. Client, host, or both at the same time.

### Linux Host (headless / Jetson / DGX)

```bash
tar xzf NVRemoteHost-v0.5.1-beta-linux-amd64.tar.gz
cd NVRemoteHost-v0.5.1-beta-linux-amd64
sudo ./install.sh    # Installs as systemd service, prompts for token
```

Or run directly without installing: `./NVRemoteAgent` (interactive setup on first run)

### Other Clients (macOS, Android, Linux desktop)

Download from [Downloads](#downloads), sign in with the **same Google account**, and your hosts will appear.

> 🔒 **Privacy:** Your host is registered to your account and is only visible to you (or members of your organization if you create one). Sessions are encrypted end-to-end with DTLS/SRTP. No one — not even NVRemote servers — can see your stream content.

---

## Building from Source

```bash
git clone https://github.com/thatcooperguy/nvremote.git
cd nvremote && npm install

# API server
cd apps/server-api && npm run start:dev

# Website
cd apps/website && npm run dev

# Desktop client
cd apps/client-desktop && npm run dev

# Host agent (Go)
cd apps/host-agent && go build -o NVRemoteAgent ./cmd/agent
```

---

## Release Pipeline

Push a tag &rarr; 13 jobs build everything:

`C++ native libs` &rarr; `Go host agents (Win/Linux/ARM64)` &rarr; `Host bundles` &rarr; `Electron installers (Win/Mac/Linux/ARM64)` &rarr; `Android APK` &rarr; `GitHub Release + GCS upload + SHA256 checksums + GPG signatures`

---

## Current Status

| Component | Status |
|-----------|--------|
| API (NestJS) | **Live** on Cloud Run |
| Website (Next.js) | **Live** on Cloud Run |
| Desktop Client (Electron) | Builds in CI |
| Android Client (Kotlin) | Builds in CI |
| macOS Client (Swift) | Skeleton |
| Web Client (Chrome) | **Built** &mdash; WebRTC in browser |
| Host Agent (Go) | Builds in CI (Linux + ARM64 headless) |
| C++ Streaming Core | Builds in CI |
| Infrastructure | GCP, Terraform, CI/CD all live |

---

## How This Was Built

This entire project &mdash; from bare-metal C++ GPU capture to a production Kubernetes-free cloud backend &mdash; was built through **human-AI pair programming**.

**The human** brings product vision, hardware expertise, architecture decisions, and real-world testing on NVIDIA GPUs.

**The AI** (Claude by Anthropic) brings rapid multi-language implementation, consistent patterns across a massive codebase, and the ability to context-switch between C++ memory management and Kotlin Compose animations in the same session.

The result: a multi-platform GPU streaming system spanning **7 programming languages**, **6 target platforms**, **13 CI/CD jobs**, and **production infrastructure on GCP** &mdash; built iteratively, one feature at a time.

---

## Legal Disclaimer

**NVRemote is an independent, personal project.** It is **not** created, sponsored, endorsed, or affiliated with NVIDIA Corporation or any of its subsidiaries. The author is employed by NVIDIA but developed this project entirely on personal time, using personal equipment, personal cloud infrastructure, and personal funds. This project does not represent NVIDIA in any way, and no proprietary NVIDIA information, internal tools, or confidential resources were used in its development.

**Trademark Notice:** "NVIDIA," "GeForce," "Quadro," "RTX," "Jetson," "DGX," "NVENC," "NvFBC," and related marks are trademarks or registered trademarks of NVIDIA Corporation. "WebRTC" is a trademark of Google LLC. All other trademarks are property of their respective owners. Use of these names is for identification purposes only and does not imply endorsement.

**No Warranty:** This software is provided "as is," without warranty of any kind, express or implied. See the [MIT License](LICENSE) for full terms. Use at your own risk.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  <sub>Built with <a href="https://claude.ai">Claude</a> by Anthropic</sub>
</p>
