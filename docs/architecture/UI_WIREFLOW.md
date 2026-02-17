# NVIDIA Remote Stream -- UI Wireflow Descriptions

**Version:** 1.0
**Last Updated:** 2026-02-13
**Status:** Living Document

---

## Table of Contents

1. [Design System](#design-system)
2. [Screen: Login](#screen-login)
3. [Screen: Dashboard (Host List)](#screen-dashboard-host-list)
4. [Screen: Host Detail / Connect Flow](#screen-host-detail--connect-flow)
5. [Screen: Session Active Overlay](#screen-session-active-overlay)
6. [Screen: Settings / Organization Management](#screen-settings--organization-management)
7. [Component Library](#component-library)
8. [Navigation Flow Diagram](#navigation-flow-diagram)
9. [Responsive Behavior](#responsive-behavior)
10. [Accessibility](#accessibility)

---

## Design System

### NVIDIA Theme

All screens use the official NVIDIA visual identity adapted for a desktop application
context.

#### Color Palette

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#1A1A1A` | Main application background |
| `--bg-secondary` | `#242424` | Card backgrounds, panels |
| `--bg-tertiary` | `#2E2E2E` | Elevated surfaces, modals |
| `--bg-hover` | `#363636` | Interactive element hover state |
| `--bg-input` | `#1E1E1E` | Input field backgrounds |
| `--accent-primary` | `#76B900` | Primary action buttons, active states, success indicators |
| `--accent-hover` | `#8AD400` | Accent hover state |
| `--accent-pressed` | `#5E9400` | Accent pressed/active state |
| `--text-primary` | `#FFFFFF` | Primary text |
| `--text-secondary` | `#A0A0A0` | Secondary text, labels, captions |
| `--text-tertiary` | `#6B6B6B` | Disabled text, subtle metadata |
| `--border-default` | `#333333` | Default borders |
| `--border-subtle` | `#2A2A2A` | Subtle dividers |
| `--status-online` | `#76B900` | Host online status (NVIDIA green) |
| `--status-offline` | `#666666` | Host offline status |
| `--status-busy` | `#F5A623` | Host busy status (amber) |
| `--status-error` | `#E74C3C` | Error states, destructive actions |
| `--status-maintenance` | `#3498DB` | Maintenance mode (blue) |

#### Typography

| Token | Font | Weight | Size | Usage |
|---|---|---|---|---|
| `--font-family` | `'NVIDIA Sans', 'Inter', system-ui, sans-serif` | -- | -- | All text |
| `--heading-xl` | -- | 700 (Bold) | 28px / 1.2 | Page titles |
| `--heading-lg` | -- | 600 (SemiBold) | 22px / 1.3 | Section headers |
| `--heading-md` | -- | 600 (SemiBold) | 18px / 1.3 | Card titles, dialog titles |
| `--body-lg` | -- | 400 (Regular) | 16px / 1.5 | Primary body text |
| `--body-md` | -- | 400 (Regular) | 14px / 1.5 | Standard body text, input text |
| `--body-sm` | -- | 400 (Regular) | 12px / 1.4 | Captions, metadata, timestamps |
| `--mono` | `'JetBrains Mono', 'Fira Code', monospace` | 400 | 13px / 1.4 | Code, IPs, keys, technical data |

#### Spacing and Layout

| Token | Value | Usage |
|---|---|---|
| `--spacing-xs` | 4px | Tight element spacing |
| `--spacing-sm` | 8px | Inner padding, icon gaps |
| `--spacing-md` | 16px | Standard padding, card internal spacing |
| `--spacing-lg` | 24px | Section spacing |
| `--spacing-xl` | 32px | Page margins, major section gaps |
| `--spacing-2xl` | 48px | Large section gaps |
| `--radius-sm` | 4px | Small elements (badges, chips) |
| `--radius-md` | 8px | Cards, inputs, buttons |
| `--radius-lg` | 12px | Modals, dialogs |
| `--shadow-card` | `0 1px 3px rgba(0,0,0,0.3)` | Card elevation |
| `--shadow-modal` | `0 8px 32px rgba(0,0,0,0.5)` | Modal elevation |

---

## Screen: Login

### Purpose

The entry point for unauthenticated users. Presents a simple, branded login screen
with Google OIDC as the sole authentication method.

### Layout Description

```
+----------------------------------------------------------------------+
|                                                                      |
|                        [Full-screen dark background]                 |
|                        Background: #1A1A1A                           |
|                        Subtle radial gradient from center:           |
|                        #1A1A1A -> #141414                            |
|                                                                      |
|                                                                      |
|                        +----------------------------+                |
|                        |                            |                |
|                        |    [NVIDIA Logo]           |                |
|                        |    (Full-color NVIDIA      |                |
|                        |     wordmark, centered)    |                |
|                        |                            |                |
|                        |    NVIDIA Remote Stream    |                |
|                        |    (heading-lg, #FFFFFF)   |                |
|                        |                            |                |
|                        |    Secure remote access    |                |
|                        |    to your GPU fleet       |                |
|                        |    (body-md, #A0A0A0)      |                |
|                        |                            |                |
|                        |    +--------------------+  |                |
|                        |    | [G] Sign in with   |  |                |
|                        |    |      Google         |  |                |
|                        |    +--------------------+  |                |
|                        |    (Button: white bg,      |                |
|                        |     #333 text, Google      |                |
|                        |     "G" logo on left,      |                |
|                        |     radius-md, 48px h,     |                |
|                        |     full width within card) |                |
|                        |                            |                |
|                        +----------------------------+                |
|                        (Card: #242424 bg, radius-lg,                 |
|                         shadow-modal, 400px width,                   |
|                         centered on screen,                          |
|                         padding: spacing-xl)                         |
|                                                                      |
|                                                                      |
|                        v1.0.0                                        |
|                        (body-sm, #6B6B6B, bottom center)             |
|                                                                      |
+----------------------------------------------------------------------+
```

### Interactions

| Element | Action | Result |
|---|---|---|
| "Sign in with Google" button | Click | Opens system browser to Google OAuth consent screen. Button shows spinner and text changes to "Signing in..." while waiting for callback. |
| "Sign in with Google" button | Hover | Background transitions from white to #F0F0F0. Cursor changes to pointer. |
| Google OAuth callback (success) | Automatic | Login card fades out. Dashboard screen fades in. Transition duration: 300ms ease-out. |
| Google OAuth callback (failure) | Automatic | Error toast appears below the card: "Sign-in failed. Please try again." with --status-error background. Auto-dismisses after 5 seconds. |

### States

| State | Visual Change |
|---|---|
| Default | As described above |
| Loading (after click) | Button shows spinner icon (animated, 20px) replacing Google "G" logo. Text: "Signing in..." Button disabled, opacity 0.7. |
| Error | Red toast notification below card. Card returns to default state. |
| Offline | Subtitle text changes to "No internet connection" in --status-error color. Sign-in button disabled. |

---

## Screen: Dashboard (Host List)

### Purpose

The primary screen after authentication. Displays all hosts in the user's
organization(s) as a grid of cards. Each card shows the host's name, status,
GPU info, and latency. Users can initiate connections from this screen.

### Layout Description

```
+----------------------------------------------------------------------+
| [Top Bar]                                                            |
| +------------------------------------------------------------------+ |
| | [NVIDIA Logo]  NVIDIA Remote Stream     [Org: Acme Corp v]  [A]  | |
| |  (20px h)      (heading-md, #FFF)       (Org selector     (User  | |
| |                                          dropdown)         avatar)| |
| +------------------------------------------------------------------+ |
| Background: #1E1E1E, height: 56px, border-bottom: 1px #333333       |
|                                                                      |
| +------------------------------------------------------------------+ |
| | [Sub Header]                                                     | |
| |                                                                  | |
| |  Hosts (heading-lg, #FFF)                  [Search...] [Filter]  | |
| |  3 online, 1 offline (body-sm, #A0A0A0)   (input)     (button)  | |
| +------------------------------------------------------------------+ |
| Padding: spacing-xl horizontal, spacing-lg vertical                  |
|                                                                      |
| +------------------------------------------------------------------+ |
| | [Host Card Grid]                                                 | |
| |  CSS Grid: auto-fill, minmax(320px, 1fr), gap: spacing-lg       | |
| |                                                                  | |
| | +---------------------------+  +---------------------------+     | |
| | | [Host Card - Online]      |  | [Host Card - Busy]        |     | |
| | |                           |  |                           |     | |
| | | +-----+ WORKSTATION-01    |  | +-----+ RENDER-NODE-03    |     | |
| | | | GPU |                   |  | | GPU |                   |     | |
| | | | ico | RTX 4090          |  | | ico | RTX 4090          |     | |
| | | +-----+ 24 GB VRAM       |  | +-----+ 24 GB VRAM       |     | |
| | |                           |  |                           |     | |
| | | (*) Online    12ms        |  | (!) Busy       8ms        |     | |
| | | (green dot)  (latency)    |  | (amber dot)  (latency)    |     | |
| | |                           |  |                           |     | |
| | | CPU: 12%  GPU: 45%        |  | CPU: 78%  GPU: 92%        |     | |
| | | [=====-----] [=========-] |  | [===========] [==========]|     | |
| | | (usage bars)              |  | (usage bars)              |     | |
| | |                           |  |                           |     | |
| | | [    Connect    ]         |  | [ In Use - alice@... ]    |     | |
| | | (accent btn, full width)  |  | (disabled btn, full width)|     | |
| | +---------------------------+  +---------------------------+     | |
| |                                                                  | |
| | +---------------------------+  +---------------------------+     | |
| | | [Host Card - Online]      |  | [Host Card - Offline]     |     | |
| | |                           |  |                           |     | |
| | | +-----+ DESIGN-LAB-01    |  | +-----+ BUILD-SERVER-07   |     | |
| | | | GPU |                   |  | | GPU |                   |     | |
| | | | ico | RTX 3080 Ti      |  | | ico | A6000             |     | |
| | | +-----+ 12 GB VRAM       |  | +-----+ 48 GB VRAM       |     | |
| | |                           |  |                           |     | |
| | | (*) Online    23ms        |  | (x) Offline               |     | |
| | |                           |  | (gray dot, no latency)    |     | |
| | | CPU: 5%   GPU: 2%         |  |                           |     | |
| | | [=----------] [=---------]|  | (no usage bars)           |     | |
| | |                           |  |                           |     | |
| | | [    Connect    ]         |  | [   Unavailable   ]       |     | |
| | | (accent btn, full width)  |  | (disabled, gray)          |     | |
| | +---------------------------+  +---------------------------+     | |
| |                                                                  | |
| +------------------------------------------------------------------+ |
|                                                                      |
+----------------------------------------------------------------------+
```

### Host Card Specification

Each host card is a self-contained component with the following structure:

**Card Container:**
- Background: `#242424`
- Border: 1px solid `#333333`
- Border radius: `--radius-md` (8px)
- Padding: `--spacing-md` (16px)
- Shadow: `--shadow-card`
- Hover: border-color transitions to `#444444`, shadow intensifies, translateY(-1px)

**Card Header (top section):**
- GPU icon: 40x40px, `#76B900` tint for online, `#666` for offline
- Hostname: `--heading-md`, `#FFFFFF`, truncated with ellipsis if too long
- GPU name: `--body-md`, `#A0A0A0`
- VRAM: `--body-sm`, `#6B6B6B`
- Display name (if set) shown below hostname in `--body-sm`, `#A0A0A0`

**Status Row:**
- Status dot: 8px circle, color based on status enum
- Status text: `--body-md`, color matches dot
- Latency: `--mono`, `--body-sm`, right-aligned. Color coded:
  - Green (`#76B900`): < 20ms
  - Amber (`#F5A623`): 20-50ms
  - Red (`#E74C3C`): > 50ms
  - Hidden if offline

**Usage Bars (only when online):**
- CPU usage: labeled "CPU: XX%", horizontal bar
- GPU usage: labeled "GPU: XX%", horizontal bar
- Bar background: `#1A1A1A`
- Bar fill: gradient from `#76B900` to `#F5A623` to `#E74C3C` based on percentage
- Bar height: 4px, radius: 2px

**Action Button:**
- Online: "Connect" -- `--accent-primary` bg, white text, full card width
- Busy: "In Use - [user email]" -- `#2E2E2E` bg, `#A0A0A0` text, disabled
- Offline: "Unavailable" -- `#2E2E2E` bg, `#6B6B6B` text, disabled
- Maintenance: "Maintenance" -- `#2E2E2E` bg, blue text, disabled

### Real-Time Updates

Host cards receive real-time updates via the WebSocket client channel:

| Update | Visual Behavior |
|---|---|
| Status change (online -> offline) | Status dot and text animate color transition (300ms). Usage bars fade out. Connect button transitions to "Unavailable". |
| GPU usage change | Usage bar width animates smoothly (200ms ease). Percentage text updates. |
| Latency change | Latency text updates. Color may change if threshold crossed. |
| New host appears | Card fades in (300ms) at the end of the grid. |
| Host removed | Card fades out (300ms) and grid reflows. |

### Search and Filter

**Search Input:**
- Placeholder: "Search hosts..."
- Searches hostname, display name, GPU name
- Results filter in real-time as the user types (debounced 200ms)
- Clear button (X) appears when text is present

**Filter Dropdown:**
- Options: All, Online Only, Offline Only, Available (online + not busy)
- Default: All
- Chip-style dropdown with active state indicator

---

## Screen: Host Detail / Connect Flow

### Purpose

Displayed when a user clicks on a host card (not the Connect button). Shows detailed
information about a host and provides the connection action. Also shown as a modal
overlay on the dashboard.

### Layout Description (Modal Overlay)

```
+----------------------------------------------------------------------+
| [Dashboard dimmed to 40% opacity]                                    |
|                                                                      |
|    +------------------------------------------------------------+    |
|    | [Host Detail Modal]                                        |    |
|    | Background: #2E2E2E, radius-lg, shadow-modal               |    |
|    | Width: 600px, max-height: 80vh, centered                   |    |
|    |                                                            |    |
|    | +--------------------------------------------------------+ |    |
|    | | [Header]                                                | |    |
|    | |                                               [X Close] | |    |
|    | | [GPU Icon]  WORKSTATION-01                               | |    |
|    | |   (64px)    Design Lab GPU 1                            | |    |
|    | |             (display name, body-md, #A0A0A0)            | |    |
|    | |                                                        | |    |
|    | |  (*) Online      Latency: 12ms                          | |    |
|    | +--------------------------------------------------------+ |    |
|    |                                                            |    |
|    | +--------------------------------------------------------+ |    |
|    | | [GPU Information]                 heading-md, #FFF       | |    |
|    | |                                                        | |    |
|    | |  GPU Model:     NVIDIA GeForce RTX 4090                | |    |
|    | |  VRAM:          24,576 MB (4,096 MB used)               | |    |
|    | |  Driver:        551.23                                  | |    |
|    | |  CUDA:          12.4                                    | |    |
|    | |  GPU Usage:     45%  [===========---------]             | |    |
|    | |  GPU Temp:      62 C                                    | |    |
|    | |                                                        | |    |
|    | |  (Labels: body-sm #A0A0A0, Values: body-md #FFF)       | |    |
|    | +--------------------------------------------------------+ |    |
|    |                                                            |    |
|    | +--------------------------------------------------------+ |    |
|    | | [System Information]           heading-md, #FFF          | |    |
|    | |                                                        | |    |
|    | |  Hostname:      WORKSTATION-01                          | |    |
|    | |  OS:            Windows 11 (22631)                      | |    |
|    | |  CPU Usage:     12%  [====-----------------]            | |    |
|    | |  Agent:         v1.2.0                                  | |    |
|    | |  Uptime:        3d 14h 22m                              | |    |
|    | |  Host Agent:    Running (v1.0)                          | |    |
|    | |                                                        | |    |
|    | +--------------------------------------------------------+ |    |
|    |                                                            |    |
|    | +--------------------------------------------------------+ |    |
|    | | [Recent Sessions]              heading-md, #FFF          | |    |
|    | |                                                        | |    |
|    | |  alice@co.com   Today 09:15   45 min   Completed        | |    |
|    | |  bob@co.com     Yesterday     2h 10m   Completed        | |    |
|    | |  alice@co.com   Feb 10        1h 5m    Completed        | |    |
|    | |                                                        | |    |
|    | |  (body-sm, #A0A0A0 for labels, #FFF for values)        | |    |
|    | +--------------------------------------------------------+ |    |
|    |                                                            |    |
|    | +--------------------------------------------------------+ |    |
|    | |                                                        | |    |
|    | |  [       Connect to WORKSTATION-01       ]              | |    |
|    | |  (Full-width accent button, 48px height)               | |    |
|    | |                                                        | |    |
|    | +--------------------------------------------------------+ |    |
|    +------------------------------------------------------------+    |
|                                                                      |
+----------------------------------------------------------------------+
```

### Connect Flow (after clicking Connect)

When the user clicks "Connect" (either from the host card or the detail modal), the
following visual sequence occurs:

```
Step 1: Button State Change
+----------------------------------+
| [  Connecting...   (spinner)  ]  |
| (Button shows spinner, accent bg |
|  at 70% opacity, disabled)       |
+----------------------------------+

Step 2: Connection Progress Modal (replaces detail modal or overlays dashboard)
+----------------------------------------------------------------------+
|  +----------------------------------------------+                    |
|  |  Connecting to WORKSTATION-01                 |                    |
|  |                                               |                    |
|  |  [====                                     ]  |                    |
|  |  (Progress bar, indeterminate, accent color)  |                    |
|  |                                               |                    |
|  |  Step 1 of 4: Generating secure keys...       |                    |
|  |  (body-md, #A0A0A0)                           |                    |
|  |                                               |                    |
|  |  [Cancel]                                     |                    |
|  |  (text button, #A0A0A0)                       |                    |
|  +----------------------------------------------+                    |
+----------------------------------------------------------------------+

Progress Steps (each updates the step text):
  1/4: "Generating secure keys..."
  2/4: "Requesting session..."
  3/4: "Establishing tunnel..."
  4/4: "Connecting to stream..."

Step 3: Success Transition
  - Progress modal fades out (200ms)
  - Screen transitions to Session Active Overlay (300ms fade-in)

Step 3 (alt): Failure
  - Progress bar turns red
  - Step text shows error: "Connection failed: Host is not responding."
  - Two buttons appear: [Retry] (accent) and [Close] (text)
```

### Connection Progress Timing

| Step | Expected Duration | Timeout |
|---|---|---|
| Generating keys | < 100ms | N/A |
| Requesting session | 500ms - 2s | 10s |
| Establishing tunnel | 1s - 5s | 15s |
| Connecting to stream | 500ms - 3s | 10s |
| **Total** | **2s - 10s typical** | **35s max** |

---

## Screen: Session Active Overlay

### Purpose

Displayed during an active streaming session. Shows the remote desktop content
full-screen with a minimal floating control bar that auto-hides.

### Layout Description

```
+----------------------------------------------------------------------+
|                                                                      |
|                                                                      |
|                   [NVRemote Video Stream]                           |
|                   (Full screen, no borders,                          |
|                    rendered by NVRemote viewer                     |
|                    in a child window/overlay)                        |
|                                                                      |
|                                                                      |
|                                                                      |
|                                                                      |
|                                                                      |
|                                                                      |
|                                                                      |
+----------------------------------------------------------------------+
|  [Floating Control Bar - appears on mouse move to bottom edge]       |
|  +----------------------------------------------------------------+  |
|  | [NVIDIA logo]  WORKSTATION-01  |  12ms  |  02:15:33  | [Disco] |  |
|  |  (16px)        (host name)     (ping)   (duration)   (button)  |  |
|  +----------------------------------------------------------------+  |
|  Background: #1A1A1A at 90% opacity, backdrop-blur: 12px             |
|  Height: 48px, radius-md (top corners only)                          |
|  Position: fixed bottom center, width: auto (content-fit)            |
|  Margin-bottom: 16px                                                 |
+----------------------------------------------------------------------+
```

### Floating Control Bar Behavior

| Trigger | Behavior |
|---|---|
| Mouse moves to bottom 80px of screen | Bar slides up from bottom (200ms ease-out). |
| Mouse leaves bottom 120px of screen | Bar slides down after 2 second delay (200ms ease-in). |
| Mouse hovers over the bar | Bar stays visible. Delay timer resets. |
| Keyboard shortcut (Ctrl+Shift+O) | Toggle bar visibility. |
| Session start | Bar is visible for 3 seconds, then auto-hides. |

### Control Bar Elements

| Element | Content | Style |
|---|---|---|
| NVIDIA logo | Small wordmark | 16px height, full color |
| Host name | Connected host's display name or hostname | `--body-md`, `#FFFFFF` |
| Latency | Current round-trip ping in ms | `--mono`, `--body-sm`, color-coded by threshold |
| Duration | Session elapsed time (HH:MM:SS) | `--mono`, `--body-sm`, `#A0A0A0` |
| Disconnect button | "Disconnect" text or power icon | `--status-error` bg on hover, `#FFF` text, radius-sm |

### Disconnect Flow

```
User clicks "Disconnect":
  1. Confirmation dialog appears (centered modal):
     +---------------------------------------+
     |  Disconnect from WORKSTATION-01?      |
     |                                       |
     |  Your streaming session will end.     |
     |                                       |
     |     [Cancel]        [Disconnect]      |
     |     (text btn)      (red bg btn)      |
     +---------------------------------------+

  2a. User clicks "Disconnect":
      - Modal closes
      - Brief "Disconnecting..." overlay (500ms)
      - Tunnel tears down
      - Returns to Dashboard

  2b. User clicks "Cancel":
      - Modal closes
      - Stream continues
```

### Session Interruption Handling

| Event | Visual Response |
|---|---|
| Tunnel latency > 100ms | Latency indicator turns red. Small warning icon appears next to it. |
| Tunnel lost (no keepalive for 5s) | Overlay banner: "Connection lost. Reconnecting..." with spinner. Background: `#E74C3C` at 80% opacity. |
| Reconnection successful | Banner changes to "Reconnected" (green) for 2 seconds, then fades. |
| Reconnection failed (30s timeout) | Banner changes to "Connection lost. Session ended." with [Return to Dashboard] button. |
| Host went offline | Overlay: "Host went offline. Session ended." with [Return to Dashboard] button. |

---

## Screen: Settings / Organization Management

### Purpose

Allows organization admins to manage members, view registered hosts, generate
bootstrap tokens, and configure organization settings. Accessible from the user
avatar menu in the top bar.

### Layout Description

```
+----------------------------------------------------------------------+
| [Top Bar - same as Dashboard]                                        |
+----------------------------------------------------------------------+
|                                                                      |
|  +------------+ +--------------------------------------------------+ |
|  | [Sidebar]  | | [Content Area]                                  | |
|  |            | |                                                  | |
|  | Profile    | |  Organization Settings                          | |
|  |            | |  (heading-lg, #FFF)                              | |
|  | ---------- | |                                                  | |
|  |            | | +----------------------------------------------+ | |
|  | Org:       | | | [General]                                    | | |
|  | Acme Corp  | | |                                              | | |
|  |            | | | Organization Name                            | | |
|  |  General   | | | +------------------------------------------+| | |
|  |  Members * | | | | Acme Corp                                || | |
|  |  Hosts     | | | +------------------------------------------+| | |
|  |  Bootstrap | | |                                              | | |
|  |  Audit Log | | | Organization Slug                            | | |
|  |            | | | +------------------------------------------+| | |
|  | ---------- | | | | acme-corp          (read-only, mono)     || | |
|  |            | | | +------------------------------------------+| | |
|  | Appearance | | |                                              | | |
|  | About      | | | Max Session Duration                         | | |
|  |            | | | +------------------------------------------+| | |
|  +------------+ | | | 8 hours                      [v]         || | |
|  Sidebar:       | | +------------------------------------------+| | |
|  bg: #1E1E1E    | |                                              | | |
|  width: 220px   | | [  Save Changes  ]                          | | |
|  border-right:  | | (accent button, disabled until changes made) | | |
|  1px #333333    | +----------------------------------------------+ | |
|                 +--------------------------------------------------+ |
+----------------------------------------------------------------------+
```

### Settings Sub-Screens

#### Members

```
+--------------------------------------------------+
| Members                               [+ Invite] |
| (heading-lg)                          (accent btn)|
|                                                  |
| +----------------------------------------------+ |
| | [Search members...]                          | |
| +----------------------------------------------+ |
|                                                  |
| +----------------------------------------------+ |
| | Alice Johnson     alice@co.com      Admin  [v]| |
| | (avatar) (name)   (email, #A0A0A0) (role     | |
| |                                    dropdown) | |
| +----------------------------------------------+ |
| | Bob Smith         bob@co.com        Member [v]| |
| +----------------------------------------------+ |
| | Carol Davis       carol@co.com      Guest  [v]| |
| +----------------------------------------------+ |
| | Dave Wilson       dave@co.com       Member [v]| |
| +----------------------------------------------+ |
|                                                  |
| Role dropdown options: Admin, Member, Guest      |
| Last row per member: [Remove] (red text, shows   |
| on hover)                                        |
+--------------------------------------------------+
```

**Invite Member Dialog:**

```
+---------------------------------------+
|  Invite Member                  [X]   |
|                                       |
|  Email Address                        |
|  +-----------------------------------+|
|  | user@example.com                  ||
|  +-----------------------------------+|
|                                       |
|  Role                                 |
|  +-----------------------------------+|
|  | Member                       [v]  ||
|  +-----------------------------------+|
|  (Options: Admin, Member, Guest)      |
|                                       |
|  [Cancel]           [Send Invite]     |
|  (text btn)         (accent btn)      |
+---------------------------------------+
```

#### Hosts (Admin View)

```
+--------------------------------------------------+
| Registered Hosts                                 |
| (heading-lg)                                     |
|                                                  |
| +----------------------------------------------+ |
| | Hostname          Status    GPU        Action | |
| +----------------------------------------------+ |
| | WORKSTATION-01    Online    RTX 4090   [...]  | |
| | RENDER-NODE-03    Busy      RTX 4090   [...]  | |
| | DESIGN-LAB-01     Online    RTX 3080Ti [...]  | |
| | BUILD-SERVER-07   Offline   A6000      [...]  | |
| +----------------------------------------------+ |
|                                                  |
| [...] menu options per host:                     |
|   View Details                                   |
|   Set Maintenance Mode                           |
|   Deregister Host (red text, confirmation req.)  |
+--------------------------------------------------+
```

#### Bootstrap Tokens

```
+--------------------------------------------------+
| Bootstrap Tokens                  [+ Generate]   |
| (heading-lg)                      (accent btn)   |
|                                                  |
| Generate a one-time token to register a new      |
| host agent with this organization. Tokens expire |
| after 24 hours.                                  |
| (body-md, #A0A0A0)                              |
|                                                  |
| +----------------------------------------------+ |
| | Token                  Created    Status      | |
| +----------------------------------------------+ |
| | nvs_boot...p6         2h ago     Unused       | |
| |   Expires in 22h               [Copy] [Revoke]| |
| +----------------------------------------------+ |
| | nvs_boot...k9         1d ago     Used          | |
| |   Used by WORKSTATION-01       (no actions)   | |
| +----------------------------------------------+ |
| | nvs_boot...m2         3d ago     Expired       | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

**Token Generation Dialog:**

```
+---------------------------------------+
|  Bootstrap Token Generated      [X]   |
|                                       |
|  Copy this token now. It will not     |
|  be shown again.                      |
|  (body-md, #F5A623 warning color)     |
|                                       |
|  +-----------------------------------+|
|  | nvs_bootstrap_a1b2c3d4e5f6g7h8i  ||
|  | 9j0k1l2m3n4o5p6                  ||
|  +-----------------------------------+|
|  (mono font, bg: #1A1A1A, selectable) |
|                                       |
|  [Copy to Clipboard]                  |
|  (accent btn, full width)             |
|                                       |
|  Expires: Feb 14, 2026 at 14:30 UTC  |
|  (body-sm, #A0A0A0)                  |
|                                       |
|  Run on the host machine:             |
|  +-----------------------------------+|
|  | nvstream-agent.exe \              ||
|  |   --bootstrap-token \            ||
|  |   nvs_bootstrap_a1b2c3...        ||
|  +-----------------------------------+|
|  (mono font, bg: #1A1A1A)            |
|                                       |
|  [Done]                               |
+---------------------------------------+
```

#### Audit Log

```
+--------------------------------------------------+
| Audit Log                                        |
| (heading-lg)                                     |
|                                                  |
| +----+ +----------+ +----------+ +------------+ |
| |Today| |Yesterday | |This Week | |Custom Range| |
| +----+ +----------+ +----------+ +------------+ |
| (tab-style date range selector)                  |
|                                                  |
| [Filter by event type...] [Filter by user...]    |
|                                                  |
| +----------------------------------------------+ |
| | Time        Event             Actor    Detail | |
| +----------------------------------------------+ |
| | 14:30:00    SESSION_CREATED   alice@   -> WS01| |
| | 14:29:55    SESSION_REQUESTED alice@   -> WS01| |
| | 14:15:00    HOST_ONLINE       system   WS01   | |
| | 13:45:22    MEMBER_INVITED    alice@   bob@   | |
| | 13:00:00    USER_LOGIN        alice@          | |
| +----------------------------------------------+ |
| (mono font for timestamps, body-sm for content)  |
|                                                  |
| [< Prev]  Page 1 of 12  [Next >]                |
| (pagination controls)                            |
|                                                  |
| [Export CSV]  [Export JSON]                       |
| (text buttons, bottom right)                     |
+--------------------------------------------------+
```

### Profile Screen

```
+--------------------------------------------------+
| Profile                                          |
| (heading-lg)                                     |
|                                                  |
| +----------------------------------------------+ |
| |   +--------+                                 | |
| |   | Avatar |  Alice Johnson                  | |
| |   | (64px) |  alice@company.com               | |
| |   +--------+  (via Google)                   | |
| |                                              | |
| |   Signed in since: Feb 13, 2026             | |
| |   Account created: Jan 5, 2026              | |
| +----------------------------------------------+ |
|                                                  |
| +----------------------------------------------+ |
| | Organization Memberships                     | |
| |                                              | |
| | Acme Corp          Admin    [Open]           | |
| | Beta Studios       Member   [Open]           | |
| +----------------------------------------------+ |
|                                                  |
| +----------------------------------------------+ |
| | Active Sessions                              | |
| |                                              | |
| | (none)                                       | |
| +----------------------------------------------+ |
|                                                  |
| [Sign Out]                                       |
| (text button, --status-error color)              |
+--------------------------------------------------+
```

---

## Component Library

### Buttons

| Variant | Background | Text | Border | Usage |
|---|---|---|---|---|
| Primary | `#76B900` | `#FFFFFF` | None | Primary actions (Connect, Save, Send Invite) |
| Primary Hover | `#8AD400` | `#FFFFFF` | None | |
| Primary Disabled | `#76B900` at 40% opacity | `#FFFFFF` at 60% | None | Disabled primary actions |
| Secondary | `transparent` | `#A0A0A0` | 1px `#333333` | Secondary actions (Cancel, Close) |
| Secondary Hover | `#363636` | `#FFFFFF` | 1px `#444444` | |
| Destructive | `transparent` | `#E74C3C` | 1px `#E74C3C` | Destructive actions (Deregister, Remove, Disconnect) |
| Destructive Hover | `#E74C3C` | `#FFFFFF` | 1px `#E74C3C` | |
| Text | `transparent` | `#A0A0A0` | None | Subtle actions (View Details, Export) |
| Text Hover | `transparent` | `#FFFFFF` | None | |

All buttons: height 40px (default), 48px (large), radius `--radius-md`, padding
0 16px, font `--body-md` weight 500.

### Inputs

| State | Background | Border | Text |
|---|---|---|---|
| Default | `#1E1E1E` | 1px `#333333` | `#FFFFFF` (placeholder: `#6B6B6B`) |
| Focused | `#1E1E1E` | 1px `#76B900` | `#FFFFFF` |
| Error | `#1E1E1E` | 1px `#E74C3C` | `#FFFFFF` |
| Disabled | `#1A1A1A` | 1px `#2A2A2A` | `#6B6B6B` |

All inputs: height 40px, radius `--radius-md`, padding 0 12px, font `--body-md`.

### Status Indicators

| Status | Dot Color | Text Color | Text |
|---|---|---|---|
| Online | `#76B900` | `#76B900` | "Online" |
| Offline | `#666666` | `#666666` | "Offline" |
| Busy | `#F5A623` | `#F5A623` | "Busy" or "In Use" |
| Maintenance | `#3498DB` | `#3498DB` | "Maintenance" |
| Connecting | `#76B900` (pulsing) | `#A0A0A0` | "Connecting..." |

Dot: 8px circle. Pulsing animation: opacity oscillates between 0.4 and 1.0 over
1.5 seconds.

### Toast Notifications

| Variant | Background | Icon | Border-left |
|---|---|---|---|
| Success | `#242424` | Checkmark, `#76B900` | 3px `#76B900` |
| Error | `#242424` | X circle, `#E74C3C` | 3px `#E74C3C` |
| Warning | `#242424` | Triangle, `#F5A623` | 3px `#F5A623` |
| Info | `#242424` | Info circle, `#3498DB` | 3px `#3498DB` |

Position: bottom-right, 16px from edge. Stack vertically with 8px gap. Auto-dismiss
after 5 seconds (except errors, which require manual dismiss). Slide-in from right
(200ms).

---

## Navigation Flow Diagram

```
                    +----------+
                    |  Login   |
                    +----+-----+
                         |
                    [Authenticate]
                         |
                         v
                   +-----+------+
                   | Dashboard  |<---------------------------------+
                   | (Host List)|                                  |
                   +-----+------+                                  |
                    |    |    |                                     |
           [Click  |    |    | [Click                              |
            Card]  |    |    |  Connect]                           |
                   |    |    |                                     |
                   v    |    v                                     |
           +-------+   | +--+----------+                          |
           | Host   |  | | Connection  |                          |
           | Detail |  | | Progress    |                          |
           | Modal  |  | +--+----------+                          |
           +---+----+  |    |                                     |
               |       |    | [Success]                           |
      [Connect]|       |    v                                     |
               +-------+ +--+-----------+    [Disconnect]         |
                         | Session      +-------------------------+
                         | Active       |
                         | Overlay      |
                         +--------------+

           [Avatar Menu]
                |
                v
           +----+-------+
           | Settings   |
           | +--------+ |
           | |Profile | |
           | +--------+ |
           | |General | |
           | +--------+ |
           | |Members | |
           | +--------+ |
           | |Hosts   | |
           | +--------+ |
           | |Bootstrap| |
           | +--------+ |
           | |Audit Log| |
           | +--------+ |
           +------------+
```

### Navigation Rules

| From | To | Trigger | Transition |
|---|---|---|---|
| Login | Dashboard | Successful OIDC | Fade (300ms) |
| Dashboard | Host Detail Modal | Click host card | Modal overlay (200ms slide up) |
| Dashboard | Connection Progress | Click Connect button | Replace content (200ms fade) |
| Host Detail | Connection Progress | Click Connect in modal | Modal transforms (200ms) |
| Connection Progress | Session Active | Connection success | Full-screen fade (300ms) |
| Connection Progress | Dashboard | Connection failure + close | Fade (200ms) |
| Session Active | Dashboard | Disconnect confirmed | Fade (300ms) |
| Dashboard | Settings | Click avatar menu -> Settings | Slide from right (250ms) |
| Settings | Dashboard | Click back or NVIDIA logo | Slide from left (250ms) |
| Any | Login | Sign out | Fade (300ms) |

---

## Responsive Behavior

The Electron app has a minimum window size of 960x640 pixels. The layout adapts as
follows:

| Breakpoint | Host Grid Columns | Sidebar | Notes |
|---|---|---|---|
| >= 1440px | 4 | Visible | Full layout |
| >= 1200px | 3 | Visible | Standard layout |
| >= 960px | 2 | Collapsible | Sidebar collapses to icon-only (56px wide) |

The session active overlay always uses the full window regardless of size.

---

## Accessibility

| Requirement | Implementation |
|---|---|
| Keyboard navigation | All interactive elements are focusable via Tab. Enter/Space activates buttons. Escape closes modals. Arrow keys navigate grids and lists. |
| Focus indicators | Focused elements show a 2px `#76B900` outline with 2px offset. Visible in all states. |
| Screen reader support | All images have alt text. Status indicators have aria-label. Live regions announce real-time updates (host status changes, connection progress). |
| Color contrast | All text meets WCAG 2.1 AA contrast ratios against their backgrounds. Primary text (#FFFFFF on #1A1A1A) = 16.75:1. Secondary text (#A0A0A0 on #1A1A1A) = 5.7:1. |
| Motion | Animations respect `prefers-reduced-motion`. When enabled, all transitions are instant (0ms duration). |
| Text scaling | UI supports up to 150% text scaling without layout breaking. |

---

## References

- [ARCHITECTURE.md](./ARCHITECTURE.md) -- System architecture
- NVIDIA Visual Identity (public brand resources)
- WCAG 2.1 AA: https://www.w3.org/WAI/WCAG21/quickref/
- Tailwind CSS: https://tailwindcss.com/docs
