# Reminder plugins

## The security model, first

A plugin is a folder containing **`plugin.json` — data only, never code.**

Nothing a plugin ships is `require`d, evaluated, or given access to the renderer,
the filesystem, or IPC. The worst a malicious manifest can do is describe an
annoying reminder, which the user can switch off or delete.

This is possible because everything a reminder needs is already expressible as
data (see `ReminderDefinition`). Real extensibility at essentially no risk.

---

## Location

```
%APPDATA%/nudge/plugins/<anything>/plugin.json     Windows
~/Library/Application Support/nudge/plugins/…      macOS
~/.config/nudge/plugins/…                          Linux
```

Plugins are scanned once at startup, **before** settings are normalised — so a
plugin's reminder gets its defaults merged in on first run.

`Settings → Data → Open data folder` reveals the parent directory.

---

## Manifest

```json
{
  "id": "posture",
  "name": "Posture Check",
  "version": "1.0.0",
  "nudgeApi": 1,
  "reminders": [
    {
      "kind": "posture",
      "title": "Posture Check",
      "shortTitle": "Posture",
      "message": "Sit back, shoulders down, feet flat on the floor.",
      "emoji": "🪑",
      "icon": "stand",
      "tone": "move",
      "defaultIntervalMinutes": 60,
      "breakSeconds": 15,
      "useOverlay": false,
      "dailyGoal": 6,
      "snoozeMinutes": [5, 10]
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `nudgeApi` | yes | Must equal `1`. A mismatch skips the plugin with a log line. |
| `id` | no | Defaults to the folder name. |
| `reminders[].kind` | yes | `^[a-z][a-zA-Z0-9_]{1,30}$`. Used as an object key and a CSS class suffix. |
| `title` / `shortTitle` / `message` | no | Injected as `plugin.<kind>.*` i18n strings, so they resolve through the normal translator and can be overridden by a locale file later. |
| `emoji` | no | Truncated to 4 chars. Shown in the tray, bubbles and toasts. |
| `icon` | no | A name from the built-in set (`eye`, `droplet`, `timer`, `stretch`, `stand`, `bell`, `target`, …). Unknown names render nothing rather than a broken box. |
| `tone` | no | `eye` · `water` · `focus` · `move` · `neutral`. Tints the card. |
| `defaultIntervalMinutes` | no | Clamped 1–1440. Default 60. |
| `breakSeconds` | no | Clamped 0–900. `0` means acknowledge-only. |
| `useOverlay` | no | Only honoured when `breakSeconds > 0`. |
| `dailyGoal` | no | Clamped 0–100. `0` disables goal tracking for this kind. |
| `snoozeMinutes` | no | Each clamped 1–120. |

Everything is clamped and validated; a malformed field falls back rather than
rejecting the plugin.

---

## What you get for free

A valid manifest produces, with no further work:

- a fully-configurable card on **Reminders** (schedule, message, break length,
  snooze presets, daily goal, and the whole notification block),
- a live status row and a quick toggle on the **Dashboard**,
- an action item in the **tray** menu,
- a **series in the statistics charts**, with a colour assigned by catalog
  position (stable — disabling another reminder never repaints it),
- **daily-goal tracking**, contribution to perfect days and the streak,
- a **settings tree entry** that survives export/import and migrations.

Capabilities are derived from the manifest, and the UI renders from
capabilities — so declaring `breakSeconds: 0` simply means the card has no
break-length row. There is no per-kind branching anywhere in the app.

---

## Rules and limits

- **Built-ins win.** A plugin cannot shadow `eyeCare`, `water`, `stretch`,
  `standUp` or `blink`.
- **Plugins are opt-in.** A newly discovered reminder is registered with
  `enabled: false`. Something you just installed should not start interrupting
  you before you have looked at it.
- **Plugins sort last** (order 1000+), after every built-in.
- **Uninstalling is safe.** If a plugin's folder disappears, its settings record
  is *preserved* rather than deleted — reinstalling restores your configuration.
  Normalisation deliberately keeps reminder kinds it does not recognise.

---

## Debugging

Startup logs every decision:

```
%APPDATA%/nudge/logs/nudge.log

INFO  [plugins] plugin loaded {"id":"posture","kinds":["posture"]}
WARN  [plugins] plugin skipped: unsupported API version {"plugin":"foo","api":2}
WARN  [plugins] plugin reminder rejected: invalid kind {"pluginId":"bar","kind":"My Kind"}
```

A plugin that produces no valid reminders is ignored entirely and does not appear
in the loaded list.

---

## Why not executable plugins

Executable plugins would need a permission model, a sandbox, an API surface with
a compatibility promise, and a review story — a great deal of machinery for an
app whose extension point is "remind me about a different thing on a timer".

If a future plugin genuinely needs behaviour, the right next step is a sandboxed
**utility process** with a narrow message-passing contract — not `require()` in
the main process. See [ROADMAP.md](ROADMAP.md).
