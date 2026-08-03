# Mascot design

## The window

The single decision everything else follows from: **the window does not move.**

It is a transparent strip spanning the full width of the chosen display, pinned
to the top or bottom edge, and the character walks *inside* it via CSS
transforms.

```
window bounds = display.workArea, height = size × 2.6
┌──────────────────────────────────────────────────────────┐ ← headroom for
│                                                          │   the bubble
│                        (◕‿◕)                             │
└──────────────────────────────────────────────────────────┘ ← workArea bottom
 x=0                                              x=width
      the character's transform moves; the window never does
```

The obvious alternative — a small window that `setPosition`s across the screen —
demos fine and is bad in practice: window moves on Windows are not vsynced, cost
an IPC round trip per frame, and tear visibly against the desktop. A stationary
strip gives a GPU-composited 60 fps walk cycle for free.

`workArea` rather than `bounds` means the mascot stands *on* the taskbar edge
rather than behind it. A user-supplied `offset` may overhang by up to half the
strip height (for "peeking over the top" placements) but the strip can never
leave the display.

### Click-through with a live region

```ts
window.setIgnoreMouseEvents(true, { forward: true })
```

Clicks pass through to the desktop, but the window still receives `mousemove`.
The renderer hit-tests the character's bounding box and asks main to flip
`setIgnoreMouseEvents` only while the pointer is actually over it — the standard
(and only reliable) way to have a click-through window with clickable regions.
The IPC call fires on *change* of the answer, not per mouse move.

Also: `focusable: false`, so it never steals focus from what you are typing;
`backgroundThrottling: false`, or the walk cycle freezes whenever the strip is
not the focused window — which is essentially always.

---

## The character

Live SVG on a 100×100 grid, not a sprite sheet.

```
                    ▲  droplet crown (the brand mark)
                  (   )
        ╭─────────────────────╮
   ◖   │   ●         ●        │   ◗     ← arms, transform-origin at shoulder
  arm  │  ◜ ◝       ◜ ◝       │  arm
        │  ╰──  ‿‿  ──╯       │        ← eyes (scaleY for blink) + mouth path
        │ ▨               ▨   │        ← blush
        ╰─────────────────────╯
             ◡         ◡               ← feet, alternate during walk
```

Why SVG:

- crisp from 64px to 260px on any DPI,
- a skin is a palette swap, not six more image files,
- individual parts are addressable, so animation is CSS on real elements rather
  than stepping through frames,
- nothing binary in the repository.

Expression is a single path swap. `mouthPath(animation)` returns a different `d`
for sleeping, celebrating, drinking and stretching — one attribute changes the
whole face.

Two details that do most of the "alive" work: **catchlights** (a small white
circle in each eye) and **irregular blinking**. Blink is driven by a class the
brain toggles on a random 1.8–7 s schedule, not a CSS loop, because real blinking
is not metronomic.

### Skins

Six colours each: `body`, `bodyShade`, `ink`, `blush`, `accent`, `glow`.
Geometry never changes, so every skin animates identically and is guaranteed
legible at the smallest size. `ghost` is near-transparent white with fully opaque
ink — for people who want a companion that is barely there.

---

## The animation system

Every animation is CSS keyframes on `transform` and `opacity` only — GPU
composited, no layout, no paint, no animation library in a window that must never
drop a frame.

| State | Motion |
|---|---|
| `idle` | 3.4 s breathe (`scale(1.015, 0.985)`) — barely visible, but its absence makes the character read as a sticker |
| `walk` | 0.52 s bob + ±1.5° lean; feet alternate via `animation-direction: reverse` |
| `sleep` | 4 s slow breathe, eyes become closed arcs, three `Zzz` float up on staggered delays |
| `wake` | squash-and-stretch, 0.9 s |
| `wave` | right arm rotates −52°, ×4 |
| `lookAround` | body rotates −7° → +7° |
| `knock` | lean in 6% + rap the arm to −64°, ×3 |
| `jump` | anticipation squash → −42% → landing squash |
| `drink` | tilt −11°, a glass appears in the SVG |
| `stretch` | `scaleY(1.16)` with both arms up |
| `celebrate` | alternating hops ±8° with four staggered sparkles |

---

## The behaviour brain

`useMascotBrain` is a small autonomous agent with two modes.

```
                    ┌──────────── auto ────────────┐
                    │                              │
   ┌─────┐  3–9 s   │   walk 52%                   │
   │idle │─────────▶│   lookAround 16%             │
   └─────┘          │   wave 10%                   │
      ▲             │   stretch 10%                │
      │             │   jump 7%                    │
      └─────────────│   idle 5%                    │
                    └──────────────────────────────┘
                              │ idle > sleepAfter
                              ▼
                          ┌───────┐  input   ┌──────┐
                          │ sleep │─────────▶│ wake │
                          └───────┘          └──────┘

   announce(kind) ─────▶ ┌────────────┐
                         │ announcing │  walk to centre → knock → bubble
                         └────────────┘  holds until dismissed
                              │
                    dismiss(celebrate)
                              ▼
              always:  celebrate → walk home → resume auto
              onAlert: celebrate → walk off-screen → report retired
```

Movement is integrated in a `requestAnimationFrame` loop and written straight to
a transform. Position lives in a **ref**, not state — walking must not cause a
React render per frame. Speed scales with mascot size so a large mascot does not
appear to crawl:

```
px/second = 46 × speedMultiplier × (size / 120)
```

Personality tuning is entirely in `WEIGHTS` and the delay ranges at the top of
the file. The intent is a companion you notice a few times an hour, not a pet
demanding attention.

---

## Visibility modes

Two genuinely different wants, so two modes:

**`always`** — the mascot lives on the desktop. Wanders, idles, looks around,
sleeps when you step away, wakes when you come back.

**`onAlert`** — the window exists but stays hidden. When a reminder fires, main
calls `present()`, the brain parks the character just off the nearer edge and
walks it on; after the errand it walks off, reports `mascot:retired`, and main
hides the window again.

```
 main                          renderer
 ────                          ────────
 announce ──present()──▶  show window
          ──command────▶  placeOffStage() → walkTo(centre) → knock + bubble
                                    │
 dismiss  ──command────▶  celebrate → exitStage() → walk past the edge
                                    │
          ◀──'mascot:retired'───────┘
 retire() → hide window
```

The window is built up front rather than created on demand: creating a
`BrowserWindow` costs ~200 ms, which would put a visible stutter between "the
reminder fired" and "the mascot appeared".

In `onAlert` the brain never enters the autonomous loop, and `setIdleSeconds` is
a no-op — the mascot is not there to fall asleep.

---

## Speech bubbles

Positioned above the character in the strip's headroom. The tail is a rotated
square inheriting the bubble's background, not a border triangle, so it stays
correct on any skin.

During a non-overlay timed break (stretch, stand-up, blink) the bubble hosts the
countdown itself, so those reminders never take over the screen:

```
   ╭────────────────────────╮
   │ ⏳ Roll your shoulders │
   │    and stretch.        │
   │         42s            │  ← accent-coloured, tabular figures
   ╰──────────╮╭────────────╯
```

---

## Reduced motion

The mascot holds still: no walk, no bob, no sparkles. It is still present, still
shows bubbles, still responds to clicks. In `onAlert` mode with reduced motion it
places itself at centre rather than walking in — the bubble alone carries the
message.

---

## Custom mascot packs (not yet built)

The seam is already there: skins are six hex values, and the character is one
component. A pack format would be a manifest of skin palettes plus optional
per-animation timing overrides, loaded the same declarative, no-code-execution
way plugins are. Swapping the *geometry* would need a real format decision (an
SVG document with named parts, most likely) — see [ROADMAP.md](ROADMAP.md).
