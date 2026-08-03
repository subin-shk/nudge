# Future improvements

Ordered by value per unit of effort, with the traps called out. Everything here
is deliberately *not* built — the app is complete as specified.

---

## Tier 1 — high value, the seams already exist

### Smart scheduling (adaptive intervals)
The engine already records `reminder_completed` / `skipped` / `missed` per kind
per hour. That is enough to notice "this user skips every eye break between 14:00
and 16:00" and shift the cadence rather than keep interrupting.

*Trap:* make it visible and reversible. An app that silently changes its own
behaviour feels broken, not smart. Show "Nudge noticed you skip afternoon breaks —
space them out?" and let the user say no.

### Meeting / screen-share awareness
The single most requested feature in this category. Auto-enable Do Not Disturb
when a call app is in the foreground or the screen is being shared. A full-screen
break overlay during a shared screen is a genuinely bad moment.

*Approach:* on Windows, poll foreground-window executable names plus
`QueryDisplayConfig`; a small allow-list (Teams, Zoom, Meet, Slack huddles) beats
a heuristic. Wire it as one more `ReminderPauseReason` — the engine already
supports the concept.

### Water amount, not just count
Track millilitres per log with quick-add buttons (250 / 500 / custom), so the
daily goal becomes "2 L" rather than "8 nudges". Needs a `meta.amount` on the
event (already supported) and a unit preference.

### Focus session labels + history
Let a session carry a name ("write the storage doc"). The event log already has a
`meta` field; the missing pieces are an input on the focus screen and a session
list on Statistics. Turns the timer into something that answers "where did my
week go?".

### CSV / JSON export of statistics
Settings → Data currently exports settings only. Activity export is a small
addition and the thing people ask for as soon as they trust the numbers.

---

## Tier 2 — worthwhile, more design needed

### A real onboarding for the 20-20-20 rule
Explain *why* 20 feet for 20 seconds. Retention on wellness apps tracks closely
with whether the user believes the mechanism.

### Break content
Rotate through actual stretches or eye exercises with an illustration, instead of
one static line. The mascot can demonstrate — the animation system already has
`stretch`.

### Weekly summary
A Monday-morning card: last week vs the week before, best day, longest streak.
The rollups already contain everything needed.

### Custom mascot packs
The seam is half-built: a skin is six hex values. A pack format would add
per-animation timing overrides, loaded the same declarative no-code-execution way
plugins are. Swapping *geometry* needs a real format decision — most likely an
SVG document with named parts (`#eyes`, `#armRight`, `#feet`) that the animation
CSS targets.

### More languages
The runtime falls back per key and Settings shows a coverage badge, so partial
translations ship safely today. `es` is ~75% complete, `de` and `ne` cover the
core UI.

*Trap:* the mascot's speech bubbles are sized for English. Check German.

### Sound pack import
`custom` already accepts one file per feature. A "pack" would be a folder of
named sounds selectable per feature — a small UI change over existing plumbing.

---

## Tier 3 — larger projects

### Sync across machines
Two honest options. **File-based** (point the data directory at OneDrive/Dropbox)
is nearly free but needs conflict handling — the append-only NDJSON log is
actually well suited to it, since concurrent appends merge cleanly and rollups
can be recomputed. **Account-based** means a backend, and it changes the product
from "no network calls at all" to something that needs a privacy policy.

Start with file-based. Most people have one work machine.

### Executable plugins
If declarative reminders stop being enough, the next step is a sandboxed
**utility process** with a narrow message-passing contract — *not* `require()` in
the main process. That would need a permission model, an API compatibility
promise, and a review story. See [PLUGINS.md](PLUGINS.md#why-not-executable-plugins).

### Health platform integration
Apple Health / Google Fit for water and activity. Meaningful on macOS; mostly
theatre on Windows.

### Team / workspace mode
Shared break schedules for co-located teams. A real product, not a feature.

---

## Deliberately not doing

**Gamification beyond badges.** Points, levels and leaderboards turn a wellness
tool into an obligation. The current 16 badges are already at the edge; the first
in every track is reachable on day one precisely so they never feel like homework.

**Streak punishment.** No "you lost your 40-day streak!" notification. The grace
rule in `computeDayStreak` exists for the same reason — a streak that reads zero
every morning until your first break is technically true and emotionally wrong.

**Screenshot or activity monitoring.** Some competitors track which apps you use
to infer focus. That is surveillance, and it is a different product.

**Ads or a paid tier on the reminders themselves.** Whatever the business model
becomes, gating "your eyes need a break" behind a subscription is not it.

---

## Known limitations

| Limitation | Detail |
|---|---|
| Mascot on Wayland | Transparent always-on-top windows and click-through behave per-compositor. Needs feature detection before a Linux release. |
| macOS menu bar | Electron supplies a default Windows menu; macOS needs a real one. |
| Custom sounds in dev | `file://` media from an `http://localhost` dev-server page can be blocked. Works in packaged builds, where the page is itself `file://`. |
| Idle detection on Linux | `powerMonitor.getSystemIdleTime()` is unavailable in some sessions; the code assumes "present" rather than guessing. |
| Rollup repair is manual | `ActivityRepository.repairDay()` exists but nothing calls it automatically. A startup integrity check for the last 7 days would be cheap. |
| No E2E tests | Unit tests cover the pure logic; window behaviour is verified by hand. Playwright's Electron driver would be the natural next step. |
| Event retention is whole-shard | Pruning drops entire months, so the cutoff is approximate (400 days rounds to the month). Rollups are unaffected. |
