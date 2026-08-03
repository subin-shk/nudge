# Architecture

## 1. The shape of the thing

Nudge is an Electron app with **three processes** and **four renderer documents**.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            MAIN PROCESS (Node)                           │
│                                                                          │
│   AppController ── the composition root and the only heartbeat (1 Hz)    │
│        │                                                                 │
│        ├── SettingsRepository ─────┐                                     │
│        ├── ActivityRepository ─────┤──> JsonStorageAdapter ──> disk      │
│        ├── StatsService ───────────┘                                     │
│        ├── ReminderEngine ──────┐                                        │
│        ├── FocusTimerService ───┤──> NotificationService                 │
│        ├── TrayController       │         │                              │
│        ├── PowerService         │         ├─> OS toast (Electron)        │
│        ├── ShortcutService      │         ├─> sound  ──┐                 │
│        ├── UpdateService        │         ├─> mascot ──┤                 │
│        └── WindowManager <──────┘         └─> in-app ──┤                 │
│                 │                                      │                 │
└─────────────────┼──────────────────────────────────────┼─────────────────┘
                  │           preload (contextBridge)    │
┌─────────────────┼──────────────────────────────────────┼─────────────────┐
│                 ▼                                      ▼                 │
│   index.html        overlay.html        mascot.html        sound.html    │
│   dashboard         break overlay       desktop mascot     audio host    │
│   (React + Zustand) (one per display)   (transparent)      (invisible)   │
│                          RENDERER PROCESSES                              │
└──────────────────────────────────────────────────────────────────────────┘
```

### Why four documents rather than one

| Document | Why it is separate |
|---|---|
| `index.html` | The heavy one. A dashboard re-render must never stutter the mascot. |
| `overlay.html` | Created per display, destroyed when the break ends. Always-on-top. |
| `mascot.html` | Transparent, click-through, a few KB of DOM, runs a 60 fps loop. |
| `sound.html` | 1×1 and invisible: owns the `AudioContext` so sound works with the app closed to tray. |

---

## 2. The five rules

Everything else follows from these.

**1. Main owns the clock.** One `setInterval(1000)` in `AppController` advances
the reminder engine and the focus timer, then publishes one immutable
`AppRuntime` snapshot. Renderers *render* countdowns; they never compute them.
A background-throttled renderer therefore cannot drift out of sync, and the
number in the tray always matches the number on screen.

**2. Everything crosses one typed boundary.** `src/shared/ipc.ts` is the only
place a channel name is written. Main registers against `IpcCommandMap`, preload
exposes a typed façade, the renderer consumes it. A shape change breaks the build
in all three processes rather than failing silently at runtime.

**3. Domain services never import Electron.** `ReminderEngine`,
`FocusTimerService`, `StatsService` and `NotificationService` depend on narrow
*ports* (`ReminderNotifier`, `BreakPresenter`, `MascotPort`, `SoundPlayerPort`,
`SleepBlocker`). `WindowManager` and `PowerService` implement them. That is what
makes the scheduling logic testable without a browser.

**4. A reminder is data, not code.** One `ReminderDefinition` in the catalog
describes everything the app needs to schedule, render, notify, chart and score a
reminder. Adding one is a catalog entry plus locale strings — no new component,
no new IPC channel, no migration.

**5. Untrusted input is normalised at one boundary.** Anything from disk, a
backup file, or IPC passes through `normalizeSettings` before the app sees it.
Downstream code can assume totality, bounds, and valid enums.

---

## 3. Folder structure

```
nudge/
├── electron.vite.config.ts    three build targets, four renderer entries
├── electron-builder.yml       packaging (win / mac / linux)
├── vitest.config.ts
├── scripts/
│   └── generate-assets.mjs    renders icon.png + tray.png from code (no binaries in git)
├── resources/                 generated icons (gitignored)
├── docs/
└── src/
    ├── shared/                imported by ALL three processes — no Node, no DOM
    │   ├── types/
    │   │   ├── settings.ts        the persisted tree
    │   │   ├── activity.ts        events, rollups, streaks, achievements
    │   │   └── runtime.ts         non-persisted state + mascot command bus
    │   ├── reminders/catalog.ts   the extensibility seam (built-ins + registry)
    │   ├── i18n/                  60-line runtime + en/es/de/ne
    │   ├── ipc.ts                 THE contract
    │   ├── defaults.ts            factory settings + validation bounds
    │   ├── time.ts                pure date/duration/streak maths
    │   ├── sounds.ts              synthesis parameters for built-in sounds
    │   ├── achievements.ts        badge definitions + pure evaluator
    │   └── util.ts                deepMerge, clamp, debounce, ids
    │
    ├── main/
    │   ├── index.ts               entry: single-instance lock, logging, lifecycle
    │   ├── app/AppController.ts   composition root + the heartbeat
    │   ├── storage/
    │   │   ├── StorageAdapter.ts      the swappable interface
    │   │   ├── JsonStorageAdapter.ts  shipped backend (atomic writes, NDJSON log)
    │   │   ├── SettingsRepository.ts  single owner of settings + change events
    │   │   ├── ActivityRepository.ts  event log + rollup arithmetic
    │   │   ├── settingsSchema.ts      normalisation / the trust boundary
    │   │   └── migrations.ts          the version ladder
    │   ├── reminders/ReminderEngine.ts
    │   ├── focus/FocusTimerService.ts
    │   ├── stats/StatsService.ts
    │   ├── notifications/
    │   │   ├── NotificationService.ts  the four channels
    │   │   └── quietHours.ts           pure predicates
    │   ├── windows/
    │   │   ├── WindowManager.ts    facade + implements every port
    │   │   ├── MainWindow.ts       frameless dashboard
    │   │   ├── MascotWindow.ts     transparent click-through strip
    │   │   ├── OverlayWindows.ts   one per display
    │   │   ├── SoundHostWindow.ts  invisible audio host
    │   │   └── rendererEntry.ts    dev-server vs packaged path resolution
    │   ├── tray/TrayController.ts
    │   ├── system/                 autoLaunch, PowerService, ShortcutService, UpdateService
    │   ├── plugins/pluginLoader.ts declarative reminder plugins
    │   ├── ipc/                    router + the complete handler table
    │   └── util/                   logger, atomic filesystem helpers
    │
    ├── preload/
    │   ├── index.ts               allow-listed, structured `window.nudge`
    │   └── index.d.ts             ambient types for the renderer
    │
    └── renderer/
        ├── index.html · overlay.html · mascot.html · sound.html
        └── src/
            ├── main.tsx · overlay.tsx · mascot.tsx · sound.ts
            ├── app/App.tsx              shell + switch-based routing
            ├── store/useAppStore.ts     Zustand: settings, runtime, toasts, route
            ├── theme/                   color maths, nine themes, ThemeProvider
            ├── i18n/useTranslator.ts
            ├── styles/global.css        reset + non-colour design tokens
            ├── components/
            │   ├── Icon.tsx             inline SVG set (48 glyphs)
            │   ├── TitleBar.tsx · Sidebar.tsx
            │   ├── NotificationPrefsEditor.tsx   reused by every feature
            │   └── ui/                  primitives · controls · layout · feedback
            ├── hooks/                   useReminders, useKeyboardShortcuts
            └── features/
                ├── dashboard/  focus/  reminders/  stats/  achievements/
                ├── settings/   mascot/  break/     onboarding/
                └── …each with its own .module.css
```

---

## 4. Component hierarchy (dashboard window)

```
App
├── ThemeProvider ................ writes ~28 CSS custom properties to :root
│   ├── TitleBar ................. drag region, live timer, window controls
│   ├── Sidebar .................. nav + "is it on?" status footer
│   ├── <main>
│   │   └── {route}
│   │       ├── DashboardPage
│   │       │   ├── StatusBanner ......... DND / quiet hours / muted
│   │       │   ├── StatTile ×4 .......... focus · eye · water · streak
│   │       │   ├── FocusCard ............ ProgressRing + quick starts
│   │       │   ├── ReminderRow ×n ....... from useReminderViews()
│   │       │   ├── TodayGoals
│   │       │   └── QuickToggles
│   │       ├── FocusPage
│   │       │   ├── ProgressRing + CycleDots
│   │       │   ├── PomodoroSettingsCard
│   │       │   └── BehaviourCard
│   │       ├── RemindersPage
│   │       │   └── ReminderCard ×n ...... collapsible, capability-driven
│   │       │       ├── ScheduleEditor ... interval | times-of-day
│   │       │       └── NotificationPrefsEditor
│   │       ├── StatsPage
│   │       │   ├── filter row (scopes every chart)
│   │       │   ├── StatTile ×6
│   │       │   └── ChartFrame ×4 ........ legend + table-view twin + tooltip
│   │       │       ├── ColumnChart ...... single & stacked
│   │       │       ├── BarList
│   │       │       └── ActivityCalendar
│   │       ├── AchievementsPage ......... grouped by tier, live progress
│   │       └── SettingsPage
│   │           ├── GeneralTab · AppearanceTab · NotificationsTab
│   │           ├── MascotSettingsSection ... live MascotCharacter preview
│   │           ├── ShortcutsTab ............ ShortcutRecorder
│   │           └── DataTab ................. export/import/reset + About
│   ├── ToastHost
│   └── Onboarding ............... first run only
```

The other three windows are deliberately shallow:

```
overlay.tsx → BreakOverlay          (ring, message, skip/snooze, Esc)
mascot.tsx  → MascotApp             (hit-testing) → MascotCharacter (SVG)
                └── useMascotBrain  (autonomous behaviour, rAF walk loop)
sound.ts    → no components at all  (Web Audio only)
```

---

## 5. Data flow

### A reminder firing

```
tick(now)                                   AppController, 1 Hz
  └─ ReminderEngine.tick()
       now >= nextFireAt?
         └─ fire(kind)
              ├─ ActivityRepository.record('reminder_fired')  → NDJSON append
              ├─ NotificationService.announceReminder()
              │     ├─ OS toast          (silent: true)
              │     ├─ SoundPlayerPort   → sound.html → Web Audio
              │     ├─ MascotPort        → mascot.html → walk, knock, bubble
              │     └─ ToastPort         → index.html  → in-app banner
              └─ BreakPresenter.showBreak() → overlay per display
                                                 │
User clicks "I'm done" ─────────────────────────┘
  └─ IPC 'reminder:complete'
       └─ ReminderEngine.complete()
            ├─ record('reminder_completed') → rollup += 1, goal check
            ├─ presenter.hideBreak(celebrate: true)
            ├─ nextFireAt = now + interval
            └─ emit change → publish() → new AppRuntime to renderers + tray
```

### A setting changing

```
Renderer: patchSettings({ mascot: { size: 160 } })
  ├─ optimistic local merge          (slider feels instant)
  └─ IPC 'settings:patch'
       └─ SettingsRepository.patch()
            ├─ normalizeSettings()   clamp, validate
            ├─ diffPaths()           → ['mascot.size']
            ├─ atomic write to disk
            └─ emit change
                 ├─ WindowManager.applySettings(paths) → mascot re-bounds
                 ├─ ReminderEngine.handleSettingsChange(paths)
                 │     (reschedules ONLY if .enabled or .schedule changed —
                 │      changing a sound must not restart your 20-min countdown)
                 └─ broadcast authoritative settings → renderer reconciles
```

---

## 6. Extensibility

Adding a reminder type — **built-in**: append a `ReminderDefinition` to
`src/shared/reminders/catalog.ts` and add its strings to `locales/en.ts`. It
appears on the dashboard, the reminders screen, the tray menu, the stats charts,
the settings tree and the goal tracker automatically.

Adding a reminder type — **plugin**: drop `plugin.json` in
`%APPDATA%/nudge/plugins/<name>/`. Data only; nothing is executed. See
[PLUGINS.md](PLUGINS.md).

Adding a theme: one object in `src/renderer/src/theme/themes.ts`.

Adding a language: one file in `src/shared/i18n/locales/`. Partial translations
are fine — the runtime falls back per key and Settings shows a coverage badge.

Adding a sound: one parameter set in `src/shared/sounds.ts`.

---

## 7. Dependency policy

The runtime dependency list is one package (`electron-updater`). Everything else
is a devDependency that disappears at build time. Things deliberately **not**
used, and why:

| Not used | Why |
|---|---|
| A UI framework (MUI, Mantine) | Nine themes means owning the token layer anyway; a framework would be re-skinned into a fight. |
| A charting library | The mark specs the app follows (24px bar cap, 4px data-end, 2px surface gaps in stacks) are awkward through a library's abstractions, and it would be the largest thing in the bundle. |
| An animation library | Every animation here is `transform`/`opacity`. CSS does that on the GPU without shipping a runtime. |
| An icon package | 48 glyphs as inline JSX cost nothing and inherit `currentColor`. |
| An i18n framework | Flat keys + `{placeholder}` + fallback is ~60 lines and needs bundling into four renderers. |
| A date library | The app needs ~15 pure functions, and they need to be exactly right for streaks. |
| `better-sqlite3` | A native module needing a C++ toolchain to rebuild per Electron ABI, for a dataset measured in tens of KB per year. See [STORAGE.md](STORAGE.md). |

Result: `out/main` 184 KB, the dashboard bundle ~466 KB, mascot 14 KB.

---

## 8. Security posture

- `contextIsolation: true`, `nodeIntegration: false` on every window.
- Preload exposes a **structured API** over an **allow-list**; an unknown channel
  is rejected in preload before it reaches `ipcMain`.
- CSP on all four documents: `default-src 'self'`, no remote origins at all.
  `'unsafe-inline'` is granted to styles only (the theme system writes custom
  properties to `:root`); scripts get no such exemption.
- `setWindowOpenHandler` and `will-navigate` force every external link to the
  system browser; the shell can never navigate away from the bundle.
- `system:openExternal` refuses anything that is not `http(s):`.
- Accent colours are regex-validated before being interpolated into CSS.
- Plugins are declarative data. Nothing from a plugin is `require`d or evaluated.

---

## 9. Cross-platform readiness

Windows-specific behaviour is confined to four files: `MainWindow.ts` (frameless
caption), `autoLaunch.ts` (login item), `TrayController.ts` (left-click opens),
and `generate-assets.mjs` (icon sizes). Everything else is already portable —
`electron-builder.yml` carries working mac and Linux targets.

The known work for a real macOS release: a menu bar (Electron gives Windows a
default one and macOS needs a real one), `LSUIElement` if the dock icon should be
hidden, and notarisation. For Linux: the tray needs `libayatana-appindicator3`,
and transparent always-on-top windows behave differently per compositor — the
mascot should be feature-detected on Wayland.

### If you later want Tauri

The port is bounded because the domain layer has no Electron imports. You would
replace: `WindowManager` + the four window classes, `TrayController`,
`PowerService`, `ShortcutService`, `autoLaunch`, and the `ipc/` layer — roughly
1,400 lines. `shared/`, the renderer, and every domain service move unchanged,
because they only ever talk to ports.
