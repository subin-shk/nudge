# Build instructions

## Prerequisites

| | Required | Notes |
|---|---|---|
| **Node.js** | 18+ (built and tested on 22.18) | |
| **npm** | 9+ | pnpm and yarn work too |
| **OS** | Windows 10/11 to build the Windows installer | macOS and Linux targets need their own host |

That is the whole list. There are **no native modules**, so no Python, no Visual
Studio Build Tools, no Xcode command-line tools, no `node-gyp`.

---

## Install

```bash
npm install
```

`postinstall` runs `scripts/generate-assets.mjs`, which renders `resources/`
(`icon.png`, `tray.png`, `tray@2x.png`) from code. They are gitignored because
they are reproducible.

To regenerate them after changing the brand colours:

```bash
npm run assets
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | electron-vite dev server, HMR in all four renderers, main restarts on change |
| `npm start` | Preview the production bundle without packaging |
| `npm run build` | Typecheck both projects, then bundle to `out/` |
| `npm run typecheck` | `tsc --noEmit` over main+preload+shared **and** renderer+shared |
| `npm test` | Vitest, 77 tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run dist:win` | Build + NSIS installer → `release/1.0.0/` |
| `npm run dist:mac` | Build + DMG (x64 + arm64), macOS host required |
| `npm run dist:linux` | Build + AppImage and .deb |

---

## Development

```bash
npm run dev
```

Opens the dashboard, the mascot strip and the invisible audio host. DevTools:
`Ctrl+Shift+I`.

Useful in-app shortcuts while developing: `1`–`6` jump between screens, `Space`
starts/pauses the focus timer, `Ctrl+,` opens Settings, and the tray menu can
fire any reminder on demand so you never have to wait 20 minutes to test a break.

The log tails everything the scheduler does — the single most useful file when a
reminder "didn't fire":

```
%APPDATA%/nudge/logs/nudge.log
```

### Running the built app manually

```bash
npm run build
npx electron .
```

> **If `app` is `undefined` on startup:** something in your environment has set
> `ELECTRON_RUN_AS_NODE=1`, which makes the Electron binary run as plain Node.
> Terminals launched from VS Code inherit it from the extension host. Clear it
> first: `set "ELECTRON_RUN_AS_NODE="` (cmd) or
> `Remove-Item Env:\ELECTRON_RUN_AS_NODE` (PowerShell).

### Resetting to a clean state

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\nudge"
```

---

## Output layout

```
out/
├── main/index.js          184 KB   Node bundle (CJS)
├── preload/index.js         6 KB
└── renderer/
    ├── index.html          ·  assets/index-*.js      ~186 KB  dashboard
    ├── overlay.html        ·  assets/overlay-*.js       7 KB  break overlay
    ├── mascot.html         ·  assets/mascot-*.js       14 KB  desktop mascot
    ├── sound.html          ·  assets/sound-*.js         3 KB  audio host
    └── assets/global-*.js  225 KB   shared React runtime
```

---

## Packaging for Windows

```bash
npm run dist:win
```

Produces `release/1.0.0/Nudge-Setup-1.0.0-x64.exe` — an NSIS installer that is
per-user (no elevation), lets the user choose the directory, creates desktop and
Start Menu shortcuts, and **preserves user data on uninstall**
(`deleteAppDataOnUninstall: false`).

`electron-builder` derives the multi-resolution `.ico` from the 512px
`resources/icon.png` automatically.

### Code signing

Unsigned builds trigger SmartScreen on first run. To sign, set these before
`npm run dist:win`:

```powershell
$env:CSC_LINK = "C:\path\to\certificate.pfx"   # or a base64 string
$env:CSC_KEY_PASSWORD = "…"
```

An EV certificate is what actually clears SmartScreen reputation from day one; an
OV certificate builds reputation over time.

---

## Packaging for macOS and Linux

Both targets are already configured in `electron-builder.yml` and build from
their own host.

```bash
npm run dist:mac     # DMG, x64 + arm64
npm run dist:linux   # AppImage + .deb
```

macOS additionally needs notarisation for distribution outside the App Store:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="…"
export APPLE_TEAM_ID="…"
```

See [ARCHITECTURE.md § 9](ARCHITECTURE.md#9-cross-platform-readiness) for the
platform work that remains beyond packaging (a real macOS menu bar; Linux tray
and compositor caveats for the transparent mascot window).

---

## Auto-update

`electron-updater` is fully wired but **inert by default**, gated on two
conditions: a packaged build, and a real publish provider. Until then the
Settings screen honestly reports "Updates are not configured in this build"
rather than showing a button that spins forever.

To enable:

1. Point `publish` in `electron-builder.yml` at a real server:

   ```yaml
   publish:
     - provider: generic
       url: https://downloads.example.com/nudge
   ```

   (`github`, `s3` and `spaces` providers also work.)

2. Flip the flag in `src/main/system/UpdateService.ts`:

   ```ts
   const PUBLISH_CONFIGURED = true
   ```

3. `npm run dist:win` and upload the installer **plus** `latest.yml` from
   `release/<version>/`.

Downloads respect the user's "Download updates automatically" setting, and an
update is never installed behind their back — it applies on quit.

---

## Continuous integration

Nothing in the build needs a compiler toolchain, so CI is unremarkable:

```yaml
- uses: actions/setup-node@v4
  with: { node-version: 22, cache: npm }
- run: npm ci
- run: npm run typecheck
- run: npm test
- run: npm run build
# packaging step only on a tag, on a matching runner OS
```

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Cannot read properties of undefined (reading 'requestSingleInstanceLock')` | `ELECTRON_RUN_AS_NODE=1` — see above. |
| App starts, no window | `startMinimized` is on, or it is already in the tray. `Ctrl+Alt+N` toggles the dashboard. |
| A second launch does nothing | Working as designed — the single-instance lock focuses the existing window. |
| Mascot invisible | Either disabled, or **visibility is set to "Only for reminders"** (Settings → Mascot). |
| No sound | Check the master switch, the per-feature switch, and that `soundId` is not `none`. A `custom` sound with a missing file logs a warning in `nudge.log`. |
| Shortcut does nothing | Another app owns the accelerator. Nudge shows a toast on startup listing the ones it could not claim. |
| Charts empty | No history yet. Rollups only exist for days with activity. |
