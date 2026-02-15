# NVREMOTE — Cloud Gaming, Unlocked.

One hub. Multiple apps. Secure, low-latency cloud gaming anywhere.

A premium, GPU-inspired cloud gaming platform for remote streaming, relay services, session management, and multi-platform client downloads.

> **Note:** This is not an official NVIDIA product. It uses an NVIDIA-inspired design language.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 14** | App Router, SSR, API routes |
| **TypeScript** | Type safety |
| **TailwindCSS** | Utility-first styling |
| **Framer Motion** | Page transitions, scroll animations |
| **Radix UI** | Accessible UI primitives |
| **Lucide React** | Icon system |
| **Recharts** | Network diagnostics charts |
| **Zod** | Schema validation |
| **qrcode.react** | Android download QR code |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
cd apps/website
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Production Build

```bash
npm run build
npm start
```

---

## Environment Variables

Create a `.env.local` file:

```env
# Authentication (NextAuth)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

# Google OAuth (optional - stub works without these)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_RELEASE_BASE_URL=https://releases.nvremote.dev

# Feature Flags
NEXT_PUBLIC_ENABLE_WEB_CLIENT=false
NEXT_PUBLIC_ENABLE_IOS_CLIENT=false
```

---

## Project Structure

```
apps/website/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with MarketingShell
│   │   ├── page.tsx                # Landing page (hero, features, architecture)
│   │   ├── not-found.tsx           # 404 page
│   │   ├── globals.css             # Design system CSS
│   │   │
│   │   ├── downloads/
│   │   │   └── page.tsx            # Download center (host + client)
│   │   ├── apps/
│   │   │   └── page.tsx            # App directory with search + filter
│   │   ├── docs/
│   │   │   └── page.tsx            # Documentation
│   │   │
│   │   ├── dashboard/
│   │   │   ├── layout.tsx          # Dashboard shell (sidebar + topbar)
│   │   │   ├── page.tsx            # Overview with metrics
│   │   │   ├── sessions/
│   │   │   │   └── page.tsx        # Session management + creation
│   │   │   ├── devices/
│   │   │   │   └── page.tsx        # Connected device management
│   │   │   ├── network/
│   │   │   │   └── page.tsx        # Network diagnostics + charts
│   │   │   ├── downloads/
│   │   │   │   └── page.tsx        # Download management + updates
│   │   │   └── settings/
│   │   │       └── page.tsx        # User settings
│   │   │
│   │   └── api/
│   │       ├── sessions/route.ts   # GET/POST sessions
│   │       ├── devices/route.ts    # GET/DELETE devices
│   │       ├── network/route.ts    # GET/POST diagnostics
│   │       └── downloads/route.ts  # GET release info
│   │
│   ├── components/
│   │   ├── MarketingShell.tsx      # Conditional Navbar/Footer wrapper
│   │   ├── Navbar.tsx              # Global navigation
│   │   ├── Footer.tsx              # Global footer with credits
│   │   ├── Button.tsx              # Reusable button component
│   │   ├── FeatureCard.tsx         # Feature highlight card
│   │   ├── GamingModes.tsx         # Gaming mode comparison
│   │   └── DownloadCard.tsx        # Download card component
│   │
│   └── lib/
│       └── utils.ts                # cn(), formatBytes, maskIP, etc.
│
├── tailwind.config.ts              # Custom NVIDIA-inspired theme
├── next.config.js                  # Next.js configuration
├── tsconfig.json                   # TypeScript config
└── package.json
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    NVREMOTE WEBSITE                              │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Landing    │  │   Download   │  │     App      │      │
│  │    Page      │  │   Center     │  │  Directory   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │                  DASHBOARD                        │      │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │      │
│  │  │ Overview  │ │ Sessions │ │ Devices  │         │      │
│  │  └──────────┘ └──────────┘ └──────────┘         │      │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │      │
│  │  │ Network  │ │Downloads │ │ Settings │         │      │
│  │  └──────────┘ └──────────┘ └──────────┘         │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │               API ROUTES (Mock)                   │      │
│  │  /api/sessions  /api/devices  /api/network        │      │
│  │  /api/downloads                                   │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌──────────────────────┐
              │  NVRemote Backend    │
              │  (server-api)        │
              │  NestJS + Prisma     │
              └──────────────────────┘
```

---

## Design System

### Colors
- **Primary:** NVIDIA Green `#76B900` (cs-green)
- **Background:** Deep Black `#050505` (cs-dark)
- **Surface:** `#0A0A0A` (cs-surface)
- **Card:** `#0F0F0F` (cs-card)
- **Gray Scale:** 50-900 custom neutrals

### Visual Effects
- Glassmorphism panels with backdrop-blur
- Gradient borders with animated hover states
- Floating orb particles with green glow
- Grid/dot pattern overlays
- Noise texture background
- Scan-line and shimmer animations

### Typography
- **Font:** Inter (via next/font/google)
- **Mono:** JetBrains Mono / Fira Code

---

## Deployment

### Vercel (Recommended)

```bash
npx vercel
```

### GCP Cloud Run

```bash
docker build -t nvremote-website .
gcloud run deploy nvremote-website --image=nvremote-website
```

### Static Export (for GCS)

Update `next.config.js`:
```js
const nextConfig = {
  output: 'export',
  // ... note: API routes won't work in static export mode
};
```

---

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/sessions` | GET | List all sessions |
| `/api/sessions` | POST | Create new session |
| `/api/devices` | GET | List connected devices |
| `/api/devices` | DELETE | Revoke device access |
| `/api/network` | GET | Get network metrics |
| `/api/network` | POST | Run diagnostics |
| `/api/downloads` | GET | Get release info |

All routes return realistic mock JSON data.

---

## Future Roadmap

- [ ] Real relay provisioning with coturn
- [ ] NAT traversal with ICE/STUN integration
- [ ] TURN fallback for symmetric NAT
- [ ] Edge node deployment (GCP, AWS, Cloudflare)
- [ ] Real-time metrics backend (Prometheus + Grafana)
- [ ] Android distribution strategy (Play Store + managed APK)
- [ ] iOS client (VideoToolbox + Metal)
- [ ] Web client (WebCodecs API + WebTransport)
- [ ] NextAuth Google OAuth integration
- [ ] Multi-tenant organization support
- [ ] Session recording and playback
- [ ] Custom relay node marketplace

---

## Credits

**Concept & Product Design:** CCooper

Built with AI-assisted engineering.

---

## License

MIT License. See [LICENSE](../../LICENSE) for details.
