# Storage design

## Why not SQLite

The brief said "local SQLite **or** JSON storage". JSON won, and the reasoning is
worth recording because it is the kind of decision that gets second-guessed.

`better-sqlite3` is a native module. Every Electron release changes the Node ABI,
so it must be rebuilt per Electron version with a working C++ toolchain — on
Windows that means multiple gigabytes of Visual Studio Build Tools on every
machine that ever builds the app, including CI. That is a real, recurring cost.

What it buys you is indexed queries over large datasets. Nudge's dataset:

| | per day | per year |
|---|---|---|
| Activity events | ~60 | ~22,000 (~2.6 MB NDJSON) |
| Daily rollup | 1 row, ~150 bytes | ~55 KB |

Charts and streaks read **rollups only** — 55 KB per year, one small object per
day. There is no query here that benefits from an index, and raw events are
pruned after 400 days anyway. Paying a native toolchain tax to index 55 KB is a
bad trade.

So: plain files, and a `StorageAdapter` interface so the decision is reversible.

---

## On-disk layout

```
%APPDATA%/nudge/                          (app.getPath('userData'))
├── logs/
│   ├── nudge.log                         rolling, 1 MB cap, one previous kept
│   └── nudge.log.1
├── plugins/
│   └── <name>/plugin.json                declarative reminder plugins
└── data/
    ├── settings.json                     whole document, atomic replace
    ├── meta.json                         small key/value map
    ├── events/
    │   ├── 2026-06.ndjson                append-only log, sharded by month
    │   └── 2026-07.ndjson
    └── rollups/
        ├── 2026-06.json                  { "2026-06-01": DailyStats, … }
        └── 2026-07.json
```

### Why this shape

- **Appends are O(1).** The hot path — a reminder completing — costs one
  `appendFile`. History is never rewritten.
- **Month sharding bounds every read.** A 30-day chart touches at most two
  rollup files, never the archive.
- **Rollups are derived.** A damaged rollup is repaired by replaying that
  month's events (`ActivityRepository.repairDay`), so it is a recoverable
  inconvenience rather than data loss.
- **Different retention for different value.** Raw events (bulky, rarely read)
  are pruned at 400 days by whole shard; rollups (tiny, read constantly) are
  kept forever.

---

## Durability

Every whole-file write is **temp → `fsync` → `rename`**
(`src/main/util/fsAtomic.ts`). `rename` within a directory is atomic on NTFS and
POSIX alike, so a reader sees either the entire old file or the entire new one.
A wellness app runs for months and *will* be alive during an OS crash.

The NDJSON reader **skips malformed lines instead of throwing**. One half-written
final line is the classic power-loss signature; it must not cost a month of
history.

Writes are serialised through a promise chain, and rollup/meta writes are
coalesced behind a 400 ms debounce, so a burst of changes is one disk write and
two atomic renames never race for the same path. Settings bypass the debounce —
the user just clicked something.

---

## The schema, as SQL

The adapter interface is deliberately shaped like these four tables. This is the
DDL a SQLite backend would create:

```sql
-- One row. The whole settings tree as a JSON document.
CREATE TABLE settings (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  document TEXT NOT NULL
);

-- Append-only. Never updated, never deleted except by retention pruning.
CREATE TABLE activity_events (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL,   -- reminder_fired | reminder_completed | …
  kind             TEXT NOT NULL,   -- 'eyeCare' | 'water' | … | 'focus'
  at               INTEGER NOT NULL,-- epoch ms
  day              TEXT NOT NULL,   -- 'YYYY-MM-DD', local; denormalised on purpose
  duration_seconds INTEGER,
  meta             TEXT             -- JSON
);
CREATE INDEX idx_events_day ON activity_events(day);

-- Materialised view of the log. Upserted on every event.
CREATE TABLE daily_stats (
  day           TEXT PRIMARY KEY,  -- 'YYYY-MM-DD'
  focus_seconds INTEGER NOT NULL DEFAULT 0,
  completed     TEXT NOT NULL,     -- JSON: kind -> count
  skipped       TEXT NOT NULL,     -- JSON: kind -> count
  pomodoros     INTEGER NOT NULL DEFAULT 0,
  goals_met     TEXT NOT NULL      -- JSON: string[]
);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL              -- JSON
);
```

`day` is stored as a **local** calendar date, not derived from the timestamp at
read time. Someone working past midnight thinks in local days, and the rollup
must not shift when they travel.

---

## Swapping in SQLite

Implement eleven methods and change one line.

```ts
// src/main/app/AppController.ts
- this.storage = new JsonStorageAdapter({ directory: dataDirectory })
+ this.storage = new SqliteStorageAdapter({ file: join(dataDirectory, 'nudge.db') })
```

Nothing above the repository layer changes, because nothing above it knows how
data is stored. The interface (`src/main/storage/StorageAdapter.ts`):

```ts
init()                          readSettingsDocument()   writeSettingsDocument(doc)
appendEvents(events)            readEventsForDays(days)
readDailyStats(days)            writeDailyStats(rows)    readAllDailyStats()
readMeta(key)                   writeMeta(key, value)
clearActivity()                 pruneEventsBefore(day)   close()
```

Migrating existing users: read every rollup and event shard through the JSON
adapter, write them through the SQLite one, then rename the `data/` directory to
`data.bak/`. Because rollups are derived, an interrupted migration is safe to
re-run.

---

## Settings: schema and migrations

`settings.json` carries a `schemaVersion`. On load:

```
read → migrateSettingsDocument() → normalizeSettings() → in memory
                    │                       │
        runs the version ladder    clamps, validates enums,
        (src/main/storage/         fills every missing field
         migrations.ts)
                    └───────────────────────┴──> if either changed anything,
                                                 write the canonical form back
```

Three properties this guarantees, which the rest of the codebase depends on:

1. **Totality** — every field exists, so no consumer needs `?? fallback`.
2. **Bounds** — numbers are clamped to `LIMITS`, so a hand-edited file cannot
   produce a 0-minute reminder interval that pegs a CPU core.
3. **Enum safety** — an unknown theme or locale falls back rather than leaving
   the UI rendering against tokens that do not exist.

Plus several rules that stop a reminder being configured into a state where it
can never fire: `mode: 'times'` with an empty list reverts to interval; a
`custom` sound with no file reverts to a preset; a reminder that does not support
time-of-day scheduling is forced to interval.

**Adding a migration:**

1. bump `SCHEMA_VERSION` in `src/shared/defaults.ts`,
2. append a step to `STEPS` in `migrations.ts` with `to` set to the new version,
3. add a case to `tests/migrations` with a real v(N) document.

Never edit an existing step — users in the wild have already run it.

A document from a **newer** build is read best-effort rather than discarded:
known fields survive normalisation, unknown ones are dropped. The alternative —
refusing to start — would punish someone for trying a beta.

Unknown *reminder kinds* are deliberately preserved, so an uninstalled or
not-yet-loaded plugin's configuration is not silently deleted.

---

## Backup, export, restore

- **Export** (`Settings → Data`) writes the normalised settings document to a
  JSON file the user chooses. It contains no activity history — settings are
  what people want to move between machines.
- **Import** validates loosely (`looksLikeSettingsDocument`) to catch "wrong file
  picked in the dialog", then runs the full migration + normalisation path.
- **Open data folder** reveals `data/` for manual backup of the whole thing.
- **Clear statistics** deletes events, rollups, and unlock timestamps; settings
  survive.

---

## What is *not* stored

No account, no telemetry, no network calls of any kind. Everything above stays on
the machine. The only outbound request the app is capable of making is an update
check, which is disabled unless a publish provider is configured (see
[BUILD.md](BUILD.md)).
