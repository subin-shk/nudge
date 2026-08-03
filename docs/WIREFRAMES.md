# Wireframes

The layouts as built. Every screen is 1080×720 minimum, responsive to 900px
(where the sidebar collapses to an icon rail) and comfortable up to 1120px of
content before it stops growing.

---

## Dashboard

Answers four questions, in the order they get asked: *is anything paused?* ·
*how am I doing today?* · *what is my timer doing?* · *when is the next nudge?*

```
┌─ ● Nudge ──────────────────── ⏱ 24:13 · Focus ────────── ─  □  ✕ ─┐
├──────────────┬─────────────────────────────────────────────────────┤
│  🏠 Dashboard│  Good morning        Monday, August 3    [📊 Stats] │
│  ⏱  Focus    │  Small nudges, better days.                         │
│  🔔 Reminders│                                                     │
│      ③      │  ┌──────────────────────────────────────────────┐   │
│  📊 Statistics│ │ 🌙  It's quiet hours — reminders are paused. │   │
│  🏆 Badges   │  └──────────────────────────────────────────────┘   │
│  ⚙  Settings │                                                     │
│              │  ┌─────────┬─────────┬─────────┬─────────┐          │
│              │  │⏱ Focus  │👁 Eye    │💧 Water │🔥 Streak│          │
│              │  │  0.8 h  │   15    │    6    │   27    │          │
│              │  │  47m    │15 of 20 │ 6 of 8  │ best 28 │          │
│              │  └─────────┴─────────┴─────────┴─────────┘          │
│              │                                                     │
│              │  ┌───────────────────────┐ ┌────────────────────┐   │
│              │  │ ⏱ Focus timer         │ │ 🎯 Goal            │   │
│              │  │                       │ │ 0 of 3 met         │   │
│              │  │        ╭───────╮      │ │ 👁 Eye breaks 15/20│   │
│              │  │       │ 25:00  │      │ │ 💧 Water       6/8 │   │
│              │  │       │NO TIMER│      │ │ 🤸 Stretches   3/5 │   │
│              │  │        ╰───────╯      │ └────────────────────┘   │
│              │  │  [15m][25m][45m][60m] │ ┌────────────────────┐   │
│              │  └───────────────────────┘ │ ✨ Quick toggles   │   │
│              │  ┌───────────────────────┐ │ 👁 Eye breaks  ●─  │   │
│              │  │ 🔔 Reminders   [Edit] │ │ 💧 Water       ●─  │   │
│              │  │ ┌───────────────────┐ │ │ 🤸 Stretches   ─○  │   │
│              │  │ │👁 Eye breaks      │ │ │ 🐣 Mascot      ●─  │   │
│              │  │ │  in 12m · 15 of 20│ │ │ 🔕 Do Not Dist ─○  │   │
│              │  │ │  ▓▓▓▓▓▓▓░░  ▶  ↻ │ │ └────────────────────┘   │
│              │  │ ├───────────────────┤ │                          │
│              │  │ │💧 Water    DUE NOW│ │  ← accent wash when due  │
│              │  │ │  6 today   ✓  ⏰  │ │                          │
│              │  │ └───────────────────┘ │                          │
│  ● Next      │  └───────────────────────┘                          │
│  🔥 27 days  │                                                     │
└──────────────┴─────────────────────────────────────────────────────┘
```

---

## Focus timer

```
┌─────────────────────────────────────────────────────────────────┐
│  Focus Timer                            [ Timer │ Pomodoro ]    │
│  Focus today: 47m                                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │                    ╭─────────────────╮                    │  │
│  │                  ╱                     ╲                  │  │
│  │                 │       24:13           │   ← 280px ring  │  │
│  │                 │     ▶ FOCUS           │     2px stroke  │  │
│  │                 │      ● ● ○ ○          │     cycle dots  │  │
│  │                  ╲                     ╱                  │  │
│  │                    ╰─────────────────╯                    │  │
│  │                                                           │  │
│  │      [⏸ Pause]  [+5 min]  [⏭ Skip phase]  [⏹ Stop]        │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────┐ ┌───────────────────────────┐    │
│  │ 🎯 Pomodoro               │ │ ⚙ Focus & Pomodoro        │    │
│  │ Enable            ●─      │ │ Pause reminders    ─○     │    │
│  │ Focus length  [− 25 +] min│ │ Keep screen awake  ●─     │    │
│  │ Short break   [−  5 +] min│ │ Default length [− 25 +]   │    │
│  │ Long break    [− 15 +] min│ └───────────────────────────┘    │
│  │ Long break every [− 4 +]  │                                  │
│  │ Auto-start next   ●─      │                                  │
│  └───────────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Idle state** replaces the ring's contents with the chosen duration, and the
action row with presets `[10][15][25][30][45][60][90]`, a custom stepper, and a
full-width **Start**.

---

## Reminders

One card per catalog entry. Collapsed by default; the first expands. Every
control is rendered from the reminder's declared *capabilities*, so a plugin with
`timedBreak: false` simply has no break-length row.

```
┌─────────────────────────────────────────────────────────────────┐
│  Reminders                             [🔔 Notifications]       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 👁  Eye Care (20-20-20)                          ●─    ▾  │  │
│  │     Every 20m · in 12m                                    │  │
│  │  ─────────────────────────────────────────────────────    │  │
│  │  Every              [− 0 +] hr  [− 20 +] min              │  │
│  │  Reminder text      [Look at something 20 feet away…   ]  │  │
│  │  Break length       [− 20 +] sec                          │  │
│  │  Take over screen   ●─   Show a full-screen break         │  │
│  │  Allow skipping     ●─                                    │  │
│  │  Resume after break ●─                                    │  │
│  │  Snooze options     (1m)(5m)(10m) 15m  30m                │  │
│  │  Daily goal         [− 20 +] per day                      │  │
│  │  NOTIFICATIONS ───────────────────────────────────────    │  │
│  │  Desktop notification  ●─                                 │  │
│  │  Sound                 ●─                                 │  │
│  │  Notification sound    [ Chime      ▾ ]  🔊               │  │
│  │  Volume                ──────●──── 70%   ▶                │  │
│  │  Mascot delivers it    ●─                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 💧  Water                                        ●─    ▸  │  │
│  │     Every 1h · in 34m                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌ 🤸 Stretch ─ off ─ ▸ ┐ ┌ 🧍 Stand Up ─ off ─ ▸ ┐ …           │
└─────────────────────────────────────────────────────────────────┘
```

`Water` (and any plugin declaring `scheduledTimes`) additionally shows:

```
   When to remind    [ Every │ At set times ]
   At set times      (09:00 ✕)(11:30 ✕)(14:00 ✕)  [09:00 ⏰] [+ Add]
```

---

## Statistics

One filter row scopes every chart. Each chart has a legend (≥2 series), a
tooltip, and a table-view twin behind the header toggle.

```
┌─────────────────────────────────────────────────────────────────┐
│  Statistics                                                     │
│  30 days · Active days: 27                                      │
│  ( 7 days )( 30 days )( 90 days )( 365 days )   ← scopes all    │
│  ┌────────┬────────┬────────┬────────┬────────┬────────┐        │
│  │⏱ Focus │👁 Eye   │💧 Water│🔥Streak│🎯Follow│📅 Weeks│        │
│  │ 41.2 h │  384   │  173   │   27   │  89%   │   4    │        │
│  └────────┴────────┴────────┴────────┴────────┴────────┘        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Focus time                                       [table]  │  │
│  │ 4 ┤                    ▁                                  │  │
│  │ 2 ┤   ▃  ▅  ▂  ▆  ▃  ▄ █  ▅  ▃  ▇  ▄  ▂  ▅  ▃            │  │
│  │ 0 ┼───────────────────────────────────────────────────    │  │
│  │    Jul 5      Jul 12     Jul 19     Jul 26     Aug 2      │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────┐ ┌──────────────────────────┐  │
│  │ Reminders completed          │ │ Where your breaks go     │  │
│  │ ■ Eye ■ Water ■ Stretch      │ │ ■ 👁 Eye breaks ▇▇▇▇▇ 384│  │
│  │ 20┤   ▄  ▆  ▃  ▅  ▄          │ │ ■ 💧 Water     ▇▇▇   173│  │
│  │ 10┤   █  █  █  █  █          │ │ ■ 🤸 Stretches ▇      41│  │
│  │  0┼──────────────────         │ └──────────────────────────┘  │
│  └──────────────────────────────┘                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Activity                                         [table]  │  │
│  │     Jun        Jul        Aug                             │  │
│  │  M □■■■□■■ ■■□■■■■ ■■□                                    │  │
│  │  W ■■□■■■■ □■■■■■□ ■■■     ← sequential single-hue ramp   │  │
│  │  F ■■■■□■■ ■■■□■■■ ■□                                     │  │
│  │  None ░▁▂▃▄▅ More                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Badges

```
┌─────────────────────────────────────────────────────────────────┐
│  Badges                                                         │
│  7 of 16 unlocked                                               │
│  ● BRONZE                                                       │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐          │
│  │ ⏱             │ │ 👁             │ │ 🔥             │          │
│  │ First Hour    │ │ Fresh Eyes    │ │ Getting Started│         │
│  │ Focus for one │ │ Complete 10   │ │ Keep a 3-day  │          │
│  │ hour total.   │ │ eye breaks.   │ │ streak.       │          │
│  │ ✓ Earned 3 Jul│ │ ✓ Earned 3 Jul│ │ ✓ Earned 6 Jul│          │
│  └───────────────┘ └───────────────┘ └───────────────┘          │
│  ● SILVER                                                       │
│  ┌───────────────┐ ┌───────────────┐                            │
│  │ 💧 (dimmed)   │ │ 🏆 (dimmed)   │  ← locked shows progress,  │
│  │ Well Hydrated │ │ Two Weeks     │    never a question mark   │
│  │ ▓▓▓▓▓▓░░░ 173/200│ ▓▓▓▓▓▓▓▓░ 12/14│                          │
│  └───────────────┘ └───────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Settings

```
┌─────────────────────────────────────────────────────────────────┐
│  Settings                                                       │
│  [⚙ General][🎨 Appearance][🔔 Notifications][🐣 Mascot]        │
│  [⌨ Shortcuts][📁 Data]                                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 🎨 Theme                                                  │  │
│  │ ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐   │  │
│  │ │▤ ▬ ││□ ▬ ││■ ▬ ││▨ ▬ ││▦ ▬ ││▩ ▬ ││▧ ▬ ││▥ ▬ ││▪ ▬ │   │  │
│  │ │Sys ││Light││Dark││AMOLED││Gray││Ocean││Forest││Sakura││…│  │
│  │ └────┘└────┘└────┘└────┘└────┘└────┘└────┘└────┘└────┘   │  │
│  │  ↑ each swatch is a mini app: page, card, accent pill     │  │
│  │ Accent colour   ⊘ ● ● ● ● ● ● ● ●                         │  │
│  │ Reduce motion   ─○                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Mascot tab** — a live preview using the same component the desktop uses:

```
┌───────────────────────────────────────────────────────────┐
│ 🐣 Preview                                    [✨ Preview] │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                       (◕‿◕)                         │  │
│  │                  ← click to cycle poses             │  │
│  └─────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────┤
│ ⚙ Mascot                                                  │
│ Enable the mascot                              ●─         │
│ When to show it            [ Always on screen │ Only for  │
│ Stays out of sight and walks on only            reminders]│
│ to deliver a reminder, then leaves again.                 │
│ Skin                       ● ● ● ● ● ●                    │
│ Size                       ──────●──── 120 px             │
│ Walking speed              ────●────── 1.0×               │
│ Monitor                    [ Primary monitor      ▾ ]     │
│ Walks along                [ Bottom of the screen ▾ ]     │
│ Distance from edge         ────●────── 0 px               │
│ Resting spot               ──●──────── 18%                │
│ Let clicks pass through    ●─                             │
│ Speech bubbles             ●─                             │
│ Falls asleep after         ───●─────── 5 min              │
└───────────────────────────────────────────────────────────┘
```

---

## Break overlay (full screen, one per display)

```
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║                          (◕‿◕)   ← mascot, primary display only   ║
║                                                                   ║
║                       ╭─────────────╮                             ║
║                      ╱               ╲                            ║
║                     │       14        │   ← 300px ring, 8px       ║
║                     │       s         │     stroke, linear 1s     ║
║                      ╲               ╱                            ║
║                       ╰─────────────╯                             ║
║                                                                   ║
║                            👀                                     ║
║        Look at something 20 feet (6 meters) away for 20 seconds.  ║
║                                                                   ║
║      ( I'm done )   ( Snooze 1 min )( Snooze 5 min )   ( Skip )   ║
║                                                                   ║
║                       Press Esc to skip                           ║
╚═══════════════════════════════════════════════════════════════════╝
   translucent themed scrim + 14px backdrop blur — a pause, not a lockout
```

At `remainingSeconds = 0` the number becomes `✓`, the copy becomes
"Nice work! / Your eyes will thank you.", the mascot celebrates, and the button
reads **Done**.

---

## Desktop mascot

A transparent, click-through strip spanning the display, pinned to an edge.
The window never moves; the character walks inside it.

```
                                      ╭────────────────────────╮
                                      │ 💧 Time to drink some  │
                                      │    water!              │
                                      ╰───────────╮╭───────────╯
                                                  ╰╯
                                              (◕‿◕)
════════════════════════════════════════════════════════════════════
 ← 0                    display width                     width →
   ↑ home (18%)                    ↑ walks to centre to announce
```

---

## System tray

```
  ┌────────────────────────────────┐
  │ Open Nudge                     │
  ├────────────────────────────────┤
  │ Start focus timer            ▸ │──┬─ Focus for 15 min
  ├────────────────────────────────┤  ├─ Focus for 25 min
  │ 👀  Start eye break            │  ├─ Focus for 45 min
  │ 💧  Drink water now            │  └─ Focus for 60 min
  │ 🤸  Stretch now                │
  ├────────────────────────────────┤
  │ ☐ Do Not Disturb               │
  │ Pause for                    ▸ │──┬─ For 30 minutes
  │ ☑ Show mascot                  │  ├─ For 60 minutes
  ├────────────────────────────────┤  └─ For 120 minutes
  │ Quit Nudge                     │
  └────────────────────────────────┘

  Hover tooltip:  "Nudge — Focus · 24:13 left"
                  "Nudge — Next: Eye breaks in 12m"
```

The menu is rebuilt only when its *shape* changes (pause↔resume, DND on↔off);
the tooltip refreshes every second. Rebuilding a native `Menu` at 1 Hz leaks
handles on Windows and makes an open menu flicker.

---

## First run

```
┌─────────────────────────────────────────────┐
│              ▬▬  ▬▬  ──  ──                 │
│                                             │
│                  (◕‿◕)  ← waving            │
│                                             │
│           Welcome to Nudge                  │
│   I'll keep an eye on your eyes, your       │
│   water, and your focus. Let's set up the   │
│   essentials — you can change anything      │
│   later.                                    │
│                                             │
│  Skip setup                    [ Let's go ▸]│
└─────────────────────────────────────────────┘
```

Steps 2–4: which nudges (multi-select cards), pick a look (theme grid), and the
mascot's three-way choice — **Always on screen** / **Only for reminders** / **Off**.
Every step is skippable and every default already works.
