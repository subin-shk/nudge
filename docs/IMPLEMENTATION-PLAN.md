# Implementation plan

The order this was actually built in, with the reasoning. Useful as a rebuild
guide, and as a record of which decisions were load-bearing.

---

## Phase 0 — Decide the runtime *(before any code)*

Environment audit first: Node 22 and npm present; **no Rust, no MSVC C++ build
tools**.

That settles two things immediately.

**Tauri → Electron.** Tauri needs rustup *plus* several GB of Visual Studio Build
Tools before a single line compiles. The brief allowed Electron; shipping code
that builds today beat shipping code that needs a multi-gigabyte prerequisite
first. The architecture keeps every OS call behind a port so the decision stays
reversible ([ARCHITECTURE.md § 9](ARCHITECTURE.md#9-cross-platform-readiness)).

**SQLite → JSON.** Same root cause: `better-sqlite3` is a native module needing a
C++ toolchain per Electron ABI. The brief allowed JSON. Reasoning and the swap
path: [STORAGE.md](STORAGE.md).

**Deliverable:** `package.json`, three tsconfigs, `electron.vite.config.ts` with
four renderer entries, `electron-builder.yml`.

---

## Phase 1 — Assets without binaries

`scripts/generate-assets.mjs` renders `icon.png` (512px) and `tray.png` (32/64px)
from code: a small signed-distance-field rasteriser for analytic anti-aliasing,
and a hand-rolled PNG encoder (IHDR + deflate IDAT + IEND).

Why bother: `canvas` and `sharp` are both native modules — the exact dependency
class already ruled out. And the brand becomes a few hex values in a diff.

---

## Phase 2 — The shared layer

Built first because all three processes depend on it, and because getting the
types right constrains everything downstream in a useful way.

1. `types/settings.ts` — the persisted tree. Every reminder shares one
   `ReminderSettings` shape; `NotificationPrefs` is a reusable leaf.
2. `types/activity.ts` — events, rollups, streaks, badges.
3. `types/runtime.ts` — the snapshot pushed to renderers + the mascot command bus.
4. `time.ts` — pure date/duration/streak maths. Written before anything used it,
   because quiet-hours wrapping and the streak grace rule are exactly the things
   that are wrong-by-default.
5. `reminders/catalog.ts` — the extensibility seam.
6. `ipc.ts` — the contract, written before either side of it.
7. `defaults.ts`, `sounds.ts`, `achievements.ts`, `i18n/`.

---

## Phase 3 — Storage

`StorageAdapter` (the interface) → `JsonStorageAdapter` (atomic writes,
month-sharded NDJSON) → `settingsSchema.ts` (the trust boundary) →
`migrations.ts` → `SettingsRepository` / `ActivityRepository`.

Normalisation was written *before* any UI, so no screen ever had to defend
against a malformed value.

---

## Phase 4 — Domain services

`ReminderEngine`, `FocusTimerService`, `StatsService`, `NotificationService`.

The rule that made this phase clean: **no Electron imports.** Each service
declares the ports it needs (`ReminderNotifier`, `BreakPresenter`, `MascotPort`,
`SleepBlocker`) and the window layer implements them later.

Decisions worth calling out:

- One state machine for every reminder kind — the alternative is five subtly
  different schedulers.
- Pausing freezes the countdown rather than skipping fires.
- Elapsed focus time is derived from wall-clock anchors, never from counting
  ticks, so a delayed tick cannot lose a minute of someone's record.
- Aborted focus sessions still bank the time actually spent.

---

## Phase 5 — Platform layer

`WindowManager` + four window classes, `TrayController`, `PowerService`,
`ShortcutService`, `UpdateService`, `autoLaunch`, the plugin loader, the IPC
router and handler table, `AppController`, `index.ts`, preload.

The mascot's stationary-strip design and the audio host both came out of this
phase; see [MASCOT.md](MASCOT.md) and
[NOTIFICATIONS.md](NOTIFICATIONS.md#why-a-separate-window-owns-the-audio).

**Checkpoint:** `tsc -p tsconfig.node.json` clean before writing any UI.

---

## Phase 6 — Renderer foundation

Theme system (colour maths → nine themes → `ThemeProvider`), `global.css`
(reset + non-colour tokens), the Zustand store, the translator hook, the icon set.

The store's one interesting rule: **optimistic local writes**, reconciled by
main's authoritative broadcast. Without it every slider lags by an IPC round
trip. Snapshots carry a monotonic `revision` so an out-of-order push can never
rewind a live countdown.

---

## Phase 7 — UI kit and shell

`primitives` · `controls` · `layout` · `feedback`, one shared CSS module, then
`TitleBar` / `Sidebar` / `App`.

Frameless window with a React-drawn caption: a native frame cannot follow nine
themes (AMOLED black behind a light Windows caption looks broken).

---

## Phase 8 — Screens

Dashboard → Focus → Reminders → Settings → Onboarding → Badges.

`useReminderViews()` joins catalog + settings + runtime into one view model, so
every screen listing reminders stays automatically in sync when a kind appears.

---

## Phase 9 — Charts

Deliberately last, and done to an explicit procedure rather than by taste:

1. pick the form from the data's job (magnitude / identity / consistency),
2. assign colour by job — categorical for series, sequential for the calendar,
3. **validate the palette with a script**, in both modes, and fix what fails,
4. apply mark specs (24px bar cap, 4px rounded data-end, 2px surface gaps),
5. add tooltips and one filter row scoping every chart,
6. legend + table-view twin for accessibility,
7. render it and look at it.

Step 3 caught a real problem: the semantically nicer slot order (water = blue)
failed the normal-vision floor at ΔE 12.9. The documented order was kept.
Charts are theme-independent for the same reason —
[THEMING.md § Charts](THEMING.md#charts-do-not-follow-the-theme).

---

## Phase 10 — Tests

77 unit tests over the pure logic only: `time.ts`, `settingsSchema`,
`migrations`, event folding, goal/perfect-day rules, quiet-hours predicates,
badge evaluation.

Not covered: Electron window plumbing and React rendering. Both need heavyweight
harnesses to assert things a manual pass catches faster. The tests that exist are
the ones where a silent regression is expensive — a reminder that never fires, a
streak that resets wrongly.

One test caught a real bug in *the test*: two sample dates landed in the same ISO
week. Worth noting because it is exactly the class of mistake week-streak logic
invites.

---

## Phase 11 — Verify for real

`tsc` both projects → `vitest` → `electron-vite build` → **launch it and take a
screenshot**.

Launching exposed something a typecheck never would: the VS Code extension host
exports `ELECTRON_RUN_AS_NODE=1`, which makes any Electron binary run as plain
Node so `app` is `undefined`. An environment artifact, not an app bug — but only
visible by actually running the thing.

Screenshots then confirmed onboarding, the dashboard with seeded history
(streaks, goals, tiles), Settings, and the mascot live on the desktop.

---

## Phase 12 — Documentation

Written last, when the decisions were settled, so it documents what exists rather
than what was intended.

---

## If you were rebuilding this

The order that matters most:

1. **Types and the IPC contract before implementations.** They constrain three
   processes at once.
2. **Pure logic before anything stateful**, with tests. Scheduling and streak
   maths are where correctness is cheap early and expensive late.
3. **Domain services before the platform layer**, behind ports. This is what
   keeps the Tauri door open and the tests fast.
4. **Normalisation before UI.** Every screen downstream gets simpler.
5. **Charts last, to a procedure.** Colour is computable; compute it.
6. **Run the app before believing it works.**
