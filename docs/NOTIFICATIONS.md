# Notification system

## Four channels, independently switchable

Every alert can travel by up to four routes, and each is a separate switch on
each feature. That is not a UI convention — it is the shape of the settings tree,
which is why "independent controls per feature" is structural rather than five
copies of the same four rows.

```
NotificationService.announceReminder()
   │
   ├── 1. OS toast     Electron Notification, ALWAYS silent: true
   ├── 2. Sound        → sound.html → Web Audio synthesis
   ├── 3. Mascot       → mascot.html → walk over, knock, speech bubble
   └── 4. In-app       → index.html → soft banner (only if the window is open)
```

`NotificationPrefs` is a reusable leaf on every reminder *and* on the focus
timer:

```ts
{ desktop, sound, soundId, customSoundPath, volume, mascot }
```

**OS toasts are always created silent.** Letting Windows play its own sound *and*
playing ours gives a double chime, and the user's per-feature volume slider would
control only half of it.

**Volume is multiplicative**: `masterVolume × feature.volume`, clamped to 0–1.
One global slider that actually affects everything, plus per-feature trim.

---

## Gating: who decides what is suppressed

A deliberate split, because getting this wrong produces the two worst bugs in the
category — reminders that never fire, and buttons that appear to do nothing.

| Concern | Owner | Reason |
|---|---|---|
| Master switch off | `NotificationService` | Nothing should be produced at all. |
| Quiet hours | `ReminderEngine` | It is a *scheduling* rule: the countdown freezes rather than the alert being swallowed. |
| Do Not Disturb | `ReminderEngine` | Same. |
| Focus session | `ReminderEngine` | Same, and only when `pauseRemindersDuringFocus`. |
| User away (idle > 5 min) | `ReminderEngine` | So you don't return to twelve stacked reminders. |

Because the engine owns pause and the service does not, an **explicit user
action** — "Drink water now" from the tray — is still delivered during Do Not
Disturb. That is what people expect from a button they just pressed.

### Pausing freezes; it does not skip

For interval reminders, `nextFireAt` is pushed forward by the elapsed tick while
paused. A 20-minute timer that spent 5 minutes in DND still has its full
remaining time. Time-of-day reminders cannot be shifted (18:00 is 18:00), so a
missed slot is recomputed forward instead — and optionally counted for the
end-of-quiet-hours summary.

### Quiet hours wrap midnight

The default is 22:00 → 07:00. `isWithinDailyWindow` treats `start > end` as
"at or after start OR before end". Equal endpoints mean an *empty* window, not
all-day — the safer reading when someone fat-fingers matching times.

At the end of the window, `quietHoursBehaviour` decides between forgetting what
was missed and showing one summary banner. One summary, never a backlog.

---

## Sound

Built-in sounds are **synthesised**, not shipped as files.

Each preset is a list of `ToneSpec` partials — frequency, optional exponential
glide, start offset, duration, gain, waveform, attack, optional low-pass, optional
tremolo. The audio host builds an oscillator + gain envelope per partial and lets
them be collected when they stop, which is the intended Web Audio lifecycle for
one-shots and keeps latency at a single frame.

| Preset | Construction |
|---|---|
| `chime` | E6 + B6 sine bell with a quiet octave below for body — the eye-care default |
| `marimba` | Two triangle waves, low-passed, rising a fifth |
| `droplet` | 1500 → 420 Hz exponential glide + a 2.6 kHz tick — the classic "plip" |
| `bell` | A5 with three harmonics, 2.4 s decay |
| `pluck` | Filtered sawtooth, 0.34 s |
| `bowl` | 220 + 330 Hz with a 3–4 Hz tremolo LFO, 3.2 s — the focus-complete sound |
| `blip` | One 1046 Hz sine, 0.12 s — almost subliminal, for blink reminders |

Why synthesis: the whole sound design is reviewable in a diff, tuning is a number
change rather than an art round-trip, and the installer carries no audio.

These are deliberately *soft*. A reminder you resent hearing is a reminder you
switch off within a week.

**Custom sounds** take the simpler path: `soundId: 'custom'` plus an absolute
path, played through an `<audio>` element so the OS handles every codec it knows.
A `custom` selection with no file is reverted during normalisation — otherwise
the reminder would look configured and be silent.

Envelopes use `exponentialRampToValueAtTime` with a 0.0001 floor (exponential
ramps cannot pass through zero). Exponential decay is what makes a synthesised
tone read as a struck object rather than a beep.

### Why a separate window owns the audio

Main has no audio stack, and the dashboard cannot be it — Nudge spends most of
its life closed to the tray, and a reminder that is silent unless the window
happens to be open is worse than no reminder.

So: one 1×1 invisible window whose only job is to own an `AudioContext`. Two
flags make it actually work:

- `backgroundThrottling: false` — a throttled renderer stalls scheduled Web Audio
  nodes, producing chimes that arrive seconds late;
- `autoplayPolicy: 'no-user-gesture-required'` — there is no user gesture
  available in a window nobody can see.

Requests that arrive before the host has loaded are queued, bounded at three, so
a startup burst does not play twelve chimes at once.

---

## The break lifecycle

```
fire(kind)
  │
  ├─ breakSeconds > 0 && useOverlay ──▶ full-screen overlay on EVERY display
  ├─ breakSeconds > 0 && !useOverlay ─▶ countdown in the mascot's speech bubble
  └─ breakSeconds == 0 ───────────────▶ toast + mascot; waits for acknowledgement
                                          │
                                          └─ unacknowledged after the grace
                                             period → 'reminder_missed',
                                             reschedule
```

The grace period is `clamp(interval / 2, 1 min, 10 min)`. Without it, a water
nudge nobody clicks would sit "due" forever and the reminder would silently stop.

**One break at a time.** A stretch reminder firing during an eye break is queued,
never stacked. Two overlays fighting for the screen is the fastest way to get an
app uninstalled.

**Multi-monitor:** a break covers *every* display. Dimming one screen while the
user keeps reading the other defeats the purpose and looks like a bug. The
primary display gets the full UI; the others show the same thing at 55% opacity.

**`autoResume`** means the overlay closes itself when the countdown reaches zero.
With it off, the overlay sits at `✓` until the user clicks "Done" — some people
want to finish their stretch at their own pace.

---

## Resilience

**Machine sleep.** A tick gap larger than 90 s means the laptop slept. Every
pending reminder is rebased to now rather than firing a backlog at someone who
just opened their lid. A break that spanned sleep is dropped silently.

**Screen lock** is treated as idle, so reminders pause.

**Focus sessions** pause on suspend, so a closed lid cannot inflate focus totals.

---

## Adding a channel

`NotificationService` depends on four narrow ports (`SoundPlayerPort`,
`MascotPort`, `ToastPort`, `AttentionPort`), all implemented by `WindowManager`.
A fifth channel — a webhook, a phone push, a smart bulb — is a new port plus a
field on `NotificationPrefs`. Nothing in the reminder engine changes, because the
engine only knows `announceReminder`.
