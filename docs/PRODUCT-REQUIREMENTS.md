# NVRemote — Consumer Readiness Requirements

Last updated: Feb 2026 — Audit of all platforms for public release.

---

## Status Key

- ✅ Done
- 🔧 Fixed this cycle
- ❌ Blocking — must fix before public release
- ⚠️ High priority — fix before beta exit
- 📋 Backlog — nice to have

---

## 1. Code Signing & Trust

Every platform has a "trust gate" where the OS warns users about unsigned software. Unsigned apps look like malware to consumers.

| Platform | Status | Issue | Fix |
|----------|--------|-------|-----|
| **Windows** | 🔧 | EXE unsigned → SmartScreen blocks install ("Windows protected your PC") | Add `CSC_LINK` + `CSC_KEY_PASSWORD` secrets. electron-builder auto-signs when present. Need EV cert (~$400/yr) for immediate SmartScreen trust, or standard cert + reputation building. |
| **macOS** | 🔧 | DMG unsigned + not notarized → Gatekeeper blocks ("can't be opened") | Add `CSC_LINK` (Developer ID cert), `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Add `afterSign` notarize hook. Need Apple Developer account ($99/yr). |
| **macOS** | 🔧 | No entitlements file → sandbox/network permissions undefined | Add `build/entitlements.mac.plist` with network-client, JIT, unsigned-executable-memory entitlements. Reference from electron-builder.yml. |
| **Android** | 🔧 | Ephemeral keystore generated per CI run → APK key changes every release, breaking sideload upgrades | Create persistent keystore, store as `ANDROID_KEYSTORE_BASE64` secret. Decode in CI. |
| **Android** | 🔧 | Keystore password `NvRemoteAlpha2026` hardcoded in public YAML | Move to `ANDROID_KEYSTORE_PASSWORD` secret. |
| **Linux** | ✅ | GPG signing works, conditional on secret | Done |

---

## 2. App Icons & Branding

| Asset | Status | Issue |
|-------|--------|-------|
| **Electron `build/icon.ico`** | ✅ | Generated multi-size ICO (16-256px) from SVG source |
| **Electron `build/icon.icns`** | ✅ | electron-builder auto-generates from icon.png |
| **Electron `build/icon.png`** | ✅ | Generated 1024x1024 PNG from SVG source |
| **Electron `build/tray-icon.png`** | ✅ | Generated 32px tray + macOS Template variants (22px, 44px @2x) |
| **Website `favicon.ico`** | ✅ | Generated with apple-touch-icon, favicon-16/32, web manifest |
| **Website `og-image.png`** | ✅ | Generated 1200x630 OG image with logo + tagline |
| **macOS Swift `AppIcon`** | ❌ | Contents.json defines 10 slots, all empty — no icon images |
| **Android icons** | ✅ | All density buckets present with NVRemote branding |

---

## 3. First-Run & Onboarding

| Area | Status | Notes |
|------|--------|-------|
| Login page | ✅ | Redesigned with branding, feature bullets, loading state |
| Dashboard empty state | ✅ | 3-step setup guide when no hosts registered |
| Sessions empty state | ✅ | Hint items explaining what sessions are |
| Host detail empty state | ✅ | Guidance to click Connect |
| **Welcome/tour overlay** | 📋 | No first-launch tutorial — acceptable for beta |

---

## 4. Auto-Update

| Platform | Status | Notes |
|----------|--------|-------|
| **Windows Electron** | ✅ | electron-updater configured → GitHub Releases (`publish.provider: github`) |
| **macOS Electron** | ✅ | Same electron-updater config |
| **Linux Electron** | ✅ | electron-updater publishes `latest-linux.yml` |
| **macOS Swift** | ❌ | No Sparkle or any auto-update mechanism |
| **Android** | ⚠️ | No in-app update — user must re-download APK. OK if on Play Store. |

---

## 5. Error Handling & Offline

| Area | Status | Notes |
|------|--------|-------|
| ErrorBoundary | ✅ | Catches React crashes, shows fallback UI |
| API error toasts | ✅ | Toast notifications for connection/fetch failures |
| **Offline detection** | ⚠️ | No explicit offline mode — API calls fail silently with generic "Failed to load hosts" |
| **Network retry** | ✅ | Auto-refresh hosts every 30s, token refresh with queue |
| **Crash reporting** | ❌ | No crash reporter on ANY platform (no Sentry, no Crashlytics). Flying blind on production stability. |

---

## 6. Website

| Item | Status | Issue |
|------|--------|-------|
| Downloads page | ✅ | All platforms listed with availability checking |
| **Platform auto-detect** | 🔧 | Should highlight the user's OS download first |
| **Favicon** | ✅ | Added favicon.ico, favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png |
| **OG image** | ✅ | Generated og-image.png (1200x630) with NVRemote branding |
| **sitemap.xml** | ✅ | Added dynamic sitemap.ts via Next.js App Router |
| **robots.txt** | ✅ | Added dynamic robots.ts — blocks /api/, /auth/, /dashboard/ |
| **Play Store link** | ✅ | Fixed to `com.nvremote.app` |
| **Home page "macOS soon"** | ✅ | Updated to show macOS/Linux as available platforms |
| Downloads page SEO | ⚠️ | No page-specific title/description metadata |

---

## 7. Android

| Item | Status | Issue |
|------|--------|-------|
| Signing | 🔧 | See Section 1 |
| **targetSdk** | ⚠️ | Currently 34, Play Store requires 35 (Android 15) as of Aug 2025 |
| **versionCode** | ⚠️ | Hardcoded to `1` — must auto-increment for Play Store |
| **FOREGROUND_SERVICE permission** | ⚠️ | Missing — needed for streaming notification on Android 9+ |
| **POST_NOTIFICATIONS permission** | ⚠️ | Missing — needed for ANY notification on Android 13+ |
| Crash reporting | ❌ | No Crashlytics/Sentry |
| ProGuard/R8 | ✅ | Comprehensive rules |
| App icons | ✅ | All densities present |
| Deep links | ✅ | `nvremote://` scheme registered |
| **Play Store metadata** | 📋 | No fastlane dir, screenshots, descriptions — needed before store submission |

---

## 8. macOS Swift Client

| Item | Status | Issue |
|------|--------|-------|
| **Not in CI pipeline** | ❌ | Mac Swift client is separate from Electron DMG — not built in release workflow |
| Code signing | ❌ | No configuration |
| Notarization | ❌ | No configuration |
| Entitlements | ❌ | Keys in Info.plist instead of separate `.entitlements` file |
| App icons | ❌ | All Contents.json slots empty |
| Auto-update | ❌ | No Sparkle framework |
| Deep links | ❌ | No `CFBundleURLTypes` in Info.plist |
| **Note** | — | Electron DMG is the shipping macOS artifact. Swift client is an early native experiment not yet consumer-ready. |

---

## 9. Keyboard Shortcuts & Accessibility

| Item | Status | Notes |
|------|--------|-------|
| Keyboard shortcuts | ✅ | `?` help modal, Ctrl+D/S/,, streaming shortcuts |
| Focus management | ✅ | Dialog focus trapping, keyboard-navigable rows |
| ARIA attributes | ⚠️ | Some components have `role`/`aria-*`, not comprehensive |
| Screen reader support | 📋 | Inline styles make screen reader testing harder — future work |
| High contrast mode | 📋 | Dark theme only — no high-contrast option |

---

## 10. Settings & Persistence

| Item | Status | Notes |
|------|--------|-------|
| Auth tokens | ✅ | Encrypted electron-store + in-memory Zustand |
| Host config | ✅ | electron-store with encryption |
| Connection mode | ✅ | Saved in connectionStore |
| Window state | ⚠️ | Window size not persisted between sessions |
| **Uninstall cleanup** | ⚠️ | `deleteAppDataOnUninstall: false` — user data preserved, but protocol handler not cleaned up |

---

## Priority Order for Implementation

### P0 — Blocking (this cycle) ✅ ALL DONE
1. ~~Windows code signing~~ → CI wired with `CSC_LINK` + `CSC_KEY_PASSWORD` secrets
2. ~~macOS code signing + notarization~~ → CI wired with Developer ID cert + Apple notarization secrets
3. ~~Android persistent keystore~~ → CI uses `ANDROID_KEYSTORE_BASE64` secret (falls back to ephemeral with warning)
4. ~~App icons for Electron~~ → Generated ICO/PNG/tray icons from SVG source + generate-icons.mjs script
5. ~~macOS entitlements~~ → `build/entitlements.mac.plist` + `build/notarize.cjs` afterSign hook
6. ~~Website favicon + OG image~~ → Full icon set: favicon, apple-touch-icon, OG image, web manifest
7. ~~Website sitemap + robots.txt~~ → Dynamic Next.js route handlers (sitemap.ts, robots.ts)
8. ~~Website Play Store link~~ → Fixed package ID to `com.nvremote.app`
9. ~~Website "macOS soon"~~ → Updated to show macOS/Linux as available

### P1 — Before Beta Exit
8. Crash reporting (Sentry or similar) — all platforms
9. Android targetSdk bump to 35
10. Android versionCode auto-increment from CI
11. Android FOREGROUND_SERVICE + POST_NOTIFICATIONS permissions
12. Offline detection with user-friendly banner
13. Window state persistence
14. Website platform auto-detection on downloads page

### P2 — Backlog
15. macOS Swift client → decide: invest in native or ship Electron?
16. Play Store metadata / fastlane
17. ARIA audit across all components
18. Welcome tour overlay
19. High contrast / accessibility theme
