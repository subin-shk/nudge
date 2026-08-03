# Nudge

A desktop productivity and wellness companion. Nudge schedules eye-care breaks,
hydration reminders and focus sessions, then delivers them through independently
configurable notification channels — including an optional animated desktop
mascot.

Windows-first, with macOS and Linux targets already configured.

---

## Contents

- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Features](#features)
- [Application overview](#application-overview)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Technology](#technology)
- [Privacy](#privacy)
- [Usage](#usage)
- [License](#license)

---

## Requirements

| | Required |
|---|---|
| **Node.js** | 18 or later (developed and tested on 22.18) |
| **npm** | 9 or later (pnpm and yarn also work) |
| **Operating system** | Windows 10/11 to build the Windows installer; macOS and Linux targets require their own host |

There are no native modules, so Python, Visual Studio Build Tools and `node-gyp`
are not required.

---

## Getting started

```bash
npm install       # installs dependencies and generates the icon assets
npm run dev       # development build with hot module replacement
npm test          # 77 unit tests over the pure logic
npm run build     # typecheck both projects, then bundle to out/
npm run dist:win  # NSIS installer in release/1.0.0/
```

Toolchain, packaging, auto-update and code-signing instructions:
**[docs/BUILD.md](docs/BUILD.md)**.

---

## Features

| Feature | Summary |
|---|---|
| **20-20-20 eye care** | A full-screen 20-second break every 20 minutes, with countdown, skip and snooze. |
| **Hydration** | Fixed interval or specific times of day, custom message, daily goal. |
| **Focus timer** | Plain countdown or Pomodoro chains; pause, resume and extend; keeps the display awake. |
| **Stretch, stand-up, blink** | The same scheduling engine, shipped disabled. |
| **Desktop mascot** | Walks, idles, sleeps, waves and delivers reminders. Six skins. Optionally shown only when it has something to report. |
| **Themes** | Nine themes including true-black AMOLED, plus an optional accent override. |
| **Statistics** | Streaks, follow-through rate, per-day charts, activity calendar and table views. |
| **Badges** | Sixteen achievements with live progress. |
| **System tray** | Live countdown tooltip, quick focus start, reminder shortcuts and Do Not Disturb. |
| **Quiet hours and DND** | A time window that may wrap midnight, plus manual and timed Do Not Disturb. |
| **Shortcuts** | Global accelerators plus in-window keys (`1`–`6`, `Space`, `Ctrl+,`). |
| **Data management** | Export and import settings, open the data directory, clear statistics. |
| **Plugins** | Declare a new reminder type in a `plugin.json`. Data only; no code execution. |
| **Localisation** | English, Spanish, German and Nepali, with per-key fallback and a coverage indicator. |

---

## Application overview

### Dashboard

Presents current state in priority order: any active pause, today's progress, the
status of the focus timer, and the next scheduled reminder. Reminder rows are
highlighted while awaiting acknowledgement, and each row exposes its two most
frequently used actions directly.

### Reminders

One collapsible card per reminder type. Controls are rendered from each
reminder's declared *capabilities*, so a reminder with no timed break has no
break-length control; there is no per-type branching anywhere in the interface.
Adding a reminder type — built-in or via plugin — produces a fully configurable
card with no change to UI code.

### Focus timer

Runs either a plain countdown or a Pomodoro chain, with pause, resume,
five-minute extension and phase skip. Pomodoro configuration is presented
alongside the timer rather than on a separate settings screen. The display is
kept awake for the duration of a session.

### Statistics

A single filter row scopes every chart on the page. Charts are hand-drawn SVG
built to a fixed specification: 24px bar cap, 4px rounded data-end square at the
baseline, 2px surface-coloured gaps between stacked segments, and hairline solid
gridlines.

The series palette is validated for colour-vision deficiency rather than
selected by eye: worst adjacent CVD ΔE is 9.1 in light mode and 8.4 in dark,
against 19.6 and 19.3 for normal vision. Because three light-mode slots fall
below a 3:1 contrast ratio, every chart also provides a legend, direct value
labels and an equivalent table view.

### Badges

Sixteen achievements grouped by tier. Locked badges display live progress toward
their threshold rather than a placeholder, and the first badge in every track is
attainable on the first day of use.

### Themes

Nine themes, including a true-black AMOLED variant. Each selector swatch is a
miniature rendering of the application — page, card and accent — rather than a
flat colour chip. An optional accent override derives its hover, soft and
foreground steps automatically, selecting black or white foreground text by WCAG
contrast ratio, so a custom accent cannot produce an unreadable control.

### Desktop mascot

The mascot occupies a transparent, click-through strip pinned to a screen edge.
The window itself never moves: the character is translated within it using CSS
transforms, which keeps the walk cycle GPU-composited at 60 fps rather than
issuing a stream of un-vsynced window moves. Its resting position is 18% across
the display width; when a reminder fires it walks to centre, knocks on the
screen and displays a speech bubble.

Behaviour includes wandering, idling, looking around, waving, sleeping when the
user is away and waking on their return. The character is rendered as live SVG
and remains crisp between 64px and 260px. Each of the six skins is a six-colour
palette substitution. Size, walking speed and per-monitor placement are
configurable, as is whether the mascot is always present or appears only to
deliver a reminder.

Design notes: **[docs/MASCOT.md](docs/MASCOT.md)**.

### Break overlay

When a timed break begins, Nudge covers every connected display with a themed
overlay showing the mascot, a countdown, the break instruction, and controls to
complete, snooze by one or five minutes, or skip. `Esc` skips.

Covering all displays is deliberate: dimming one screen does not interrupt work
continuing on another. The scrim is translucent rather than opaque, so a break
reads as a pause rather than a lockout.

### Notifications

Every feature has four independently switchable delivery channels: operating
system toast, sound, mascot and in-app banner. Quiet hours support windows that
wrap midnight, and Do Not Disturb may be toggled manually or set for a fixed
duration.

Channel semantics, gating rules and sound synthesis:
**[docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md)**.

### System tray

| Item | Behaviour |
|---|---|
| **Open Nudge** | Restores and focuses the dashboard. |
| **Start focus timer** ▸ | Submenu: 15, 25, 45 or 60 minutes. |
| **Start eye break** | Begins an eye-care break immediately. |
| **Drink water now** | Triggers the hydration reminder immediately. |
| **Do Not Disturb** | Checkable toggle. |
| **Pause for** ▸ | Submenu: 30, 60 or 120 minutes. |
| **Show mascot** | Checkable toggle. |
| **Quit Nudge** | Exits the application. |

The tray tooltip reflects current state — for example
`Nudge — Focus · 24:13 left` or `Nudge — Next: Eye breaks in 12m`.

### Data and plugins

Settings can be exported and imported, statistics cleared, and the data
directory opened from within the application. New reminder types are declared in
a `plugin.json`; plugins are data only and execute no code. See
**[docs/STORAGE.md](docs/STORAGE.md)** and
**[docs/PLUGINS.md](docs/PLUGINS.md)**.

---

## Architecture

Three processes, four renderer documents, one heartbeat.

```
┌──────────────────────── MAIN (Node) ─────────────────────────┐
│  AppController — composition root, single 1 Hz tick          │
│    ├── SettingsRepository ─┐                                 │
│    ├── ActivityRepository ─┼─> JsonStorageAdapter ─> disk    │
│    ├── StatsService ───────┘                                 │
│    ├── ReminderEngine ──┐                                    │
│    ├── FocusTimerService┼──> NotificationService ─┐          │
│    └── WindowManager <──┘                         │          │
└───────────────────┬───────────────────────────────┼──────────┘
                    │  preload (contextBridge)      │
┌───────────────────▼───────────────────────────────▼──────────┐
│  index.html      overlay.html      mascot.html    sound.html │
│  dashboard       break overlay     desktop pet    audio host │
└──────────────────────────────────────────────────────────────┘
```

### Design principles

1. **Main owns the clock.** Renderers display countdowns; they never compute
   them.
2. **One typed IPC contract.** A change to its shape fails the build in all
   three processes.
3. **Domain services never import Electron.** They depend on narrow ports, so
   the scheduler is testable without a browser.
4. **A reminder is data, not code.** A single catalog entry adds a reminder
   everywhere it appears.
5. **Untrusted input is normalised at one boundary.** Downstream code may assume
   totality, bounds and valid enum members.

Full detail: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Processes, layers, folder structure, component hierarchy, data flow |
| [WIREFRAMES.md](docs/WIREFRAMES.md) | Layout of every screen |
| [STORAGE.md](docs/STORAGE.md) | On-disk format, schema, migrations, the SQLite migration path |
| [THEMING.md](docs/THEMING.md) | Token contract and how to add a theme |
| [MASCOT.md](docs/MASCOT.md) | Character construction, animation system, behaviour model |
| [NOTIFICATIONS.md](docs/NOTIFICATIONS.md) | The four channels, gating rules, sound synthesis |
| [PLUGINS.md](docs/PLUGINS.md) | Writing a reminder plugin |
| [IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md) | Build order, as executed |
| [BUILD.md](docs/BUILD.md) | Toolchain, scripts, packaging, code signing |
| [ROADMAP.md](docs/ROADMAP.md) | Planned work and known constraints |

---

## Technology

TypeScript · React 18 · Zustand · Electron 33 · electron-vite · CSS Modules ·
Vitest

The application has one runtime dependency, `electron-updater`. It uses no UI
framework, charting library, icon package, animation library or date library;
each omission is justified in
[ARCHITECTURE.md § Dependency policy](docs/ARCHITECTURE.md#7-dependency-policy).

Bundle sizes: `out/main` 184 KB, dashboard approximately 466 KB, mascot 14 KB.

---

## Privacy

Nudge requires no account, collects no telemetry and makes no network calls. All
data is stored locally in `%APPDATA%/nudge`. The only outbound request the
application is capable of making is an update check, which is disabled unless a
publish provider is configured.

---

## Usage

You may download and use the official Nudge releases for personal,
non-commercial use.

The source code is proprietary. You may not copy, modify, redistribute, or use
it to create derivative works without prior written permission.

---

## License

This project is proprietary and is not licensed for copying, modification,
redistribution, or commercial use. All rights reserved.
