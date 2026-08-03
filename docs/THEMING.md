# Theme system

## The mechanism

A theme is a flat map of CSS custom properties written onto `:root` at runtime.
Components only ever reference `var(--token)` — never a literal colour. Switching
a theme mutates ~28 variables and the browser re-resolves every reference in one
composited pass: no stylesheet swap, no flash, and it eases smoothly because the
global stylesheet declares transitions on `background-color` and `color`.

```
settings.general.theme ──┐
prefers-color-scheme ────┼──> resolveTheme() ──> ThemeDefinition
                         │                            │
settings.general.accentOverride ──> deriveAccentTokens()
                                              │
                                       applyTheme()
                                              │
                            root.style.setProperty('--bg', …) ×28
                            root.dataset.theme = 'ocean'
                            root.style.colorScheme = 'dark'
```

`colorScheme` matters: it makes native scrollbars, `<select>` popups and
`<input type="time">` pickers follow the theme without any styling of our own.

---

## The token contract

Adding a theme means filling in exactly these. Nothing else.

| Group | Tokens | Notes |
|---|---|---|
| Surfaces | `--bg` `--bg-elevated` `--bg-subtle` `--bg-inset` | page → card → hover → track |
| Lines | `--border` `--border-strong` | hairline; strong is for hover/controls |
| Text | `--text` `--text-muted` `--text-faint` | body → secondary → axis labels |
| Accent | `--accent` `--accent-hover` `--accent-fg` `--accent-soft` `--accent-ring` | `-fg` must be readable *on* `--accent` |
| Status | `--success` `--warning` `--danger` + `-soft` each | reserved meaning |
| Reminder tones | `--tone-eye` `--tone-water` `--tone-focus` `--tone-move` `--tone-neutral` | tints cards and icon chips |
| Chrome | `--scrim` `--shadow-color` | scrim covers the break overlay |

Non-colour tokens (radii, spacing, elevation, type scale, motion timings,
z-layers) live in `src/renderer/src/styles/global.css` and do **not** change with
the theme.

---

## The nine themes

| Id | Scheme | Character |
|---|---|---|
| `system` | follows OS | resolves to `light` or `dark` |
| `light` | light | neutral cool grey, indigo accent |
| `dark` | dark | the default dark; slate with a soft blue accent |
| `amoled` | dark | true `#000000`; heavier scrim, since black needs more separation |
| `minimalGray` | light | desaturated; tones keep *just* enough hue to stay chart-legible |
| `ocean` | dark | deep teal-navy, cyan accent |
| `forest` | dark | pine, green accent |
| `sakura` | light | warm pink; accent darkened to `#e0409f` for contrast |
| `sunset` | dark | warm plum-brown, orange accent |
| `purpleNight` | dark | indigo-violet |

Two deliberate deviations worth knowing:

**AMOLED's scrim is heavier** (`rgba(0,0,0,0.80)` vs `0.68`). Against true black
a normal scrim does not read as a separate layer at all.

**Minimal Gray's reminder tones are not grey.** A truly monochrome palette makes
the statistics charts unreadable. They are desaturated but still four
distinguishable hues.

---

## Adding a theme

One object in `src/renderer/src/theme/themes.ts`:

```ts
const midnight: ThemeDefinition = {
  id: 'midnight',
  labelKey: 'theme.midnight',
  scheme: 'dark',
  preview: ['#0a0f1e', '#121a2e', '#5eead4'],   // page, card, accent
  tokens: tokens({ bg: '#0a0f1e', /* …every token… */ })
}
```

Then: add `'midnight'` to `THEME_IDS` in `src/shared/types/settings.ts`, to
`THEMES` and `THEME_ORDER` in `themes.ts`, a `theme.midnight` string to
`locales/en.ts`, and a launch background to `THEME_BACKGROUNDS` in
`MainWindow.ts` (this is only used to avoid a white flash before React paints).

The `tokens()` helper takes a typed object, so TypeScript will tell you if you
miss one. The theme picker, the overlay, the onboarding flow and the settings
swatch all pick it up with no further work.

---

## The accent override

A user can pin any accent on top of any theme. From one hex, five tokens are
derived (`src/renderer/src/theme/color.ts`):

```
accent       the hex itself
accentHover  light themes darken 14%, dark themes lighten 16%
             (each scheme signals "closer to the surface" in its own direction)
accentFg     black or white, whichever has more WCAG contrast against the accent
accentSoft   light themes lighten 86%, dark themes darken 72%
accentRing   the accent at 40% alpha, for focus rings
```

`accentFg` is computed rather than assumed. A user picking a pale yellow accent
must not end up with unreadable button labels.

`--tone-focus` follows the accent, so the focus ring and the focus series in the
statistics charts stay visually the same thing.

The value is regex-validated (`/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i`) in
`normalizeSettings` before it is ever interpolated into CSS.

---

## Charts do not follow the theme

This is intentional and is the one place the token rule is broken.

Theme tokens tint *chrome*. Series colour is *data*: it must be stable — "water
is this colour" should hold while you switch from Sakura to AMOLED — and it must
be validated for colour-vision deficiency. Repainting series per theme gives up
both, and validating nine palettes × two modes is not a thing anyone will
maintain.

So `src/renderer/src/features/stats/chartPalette.ts` holds one categorical
palette with a light and a dark set of steps, selected by the resolved theme's
`scheme` only. It was verified with a palette validator against both surfaces:

```
light  worst adjacent CVD ΔE 9.1 (protan) · normal-vision ΔE 19.6  PASS
dark   worst adjacent CVD ΔE 8.4 (protan) · normal-vision ΔE 19.3  PASS
```

Three light-mode slots sit below 3:1 contrast, so every chart ships a legend,
direct value labels, and a table-view twin as the relief channel.

A semantically nicer slot order (water = blue in slot 1) was tried and rejected:
it put magenta next to orange and failed the normal-vision floor at ΔE 12.9.
Slot order is the accessibility mechanism, not a styling choice.

---

## Reduced motion

Two sources — the app setting and the OS `prefers-reduced-motion` — are OR'd and
mirrored onto `data-reduced-motion` on `<html>`. The stylesheet collapses the
three motion tokens to 1 ms:

```css
:root[data-reduced-motion='true'] {
  --duration-fast: 1ms;
  --duration-base: 1ms;
  --duration-slow: 1ms;
}
```

Durations are collapsed rather than rules deleted, so any layout that waits on a
`transitionend` still settles. The mascot's keyframe animations are separately
disabled — it stays present, still shows bubbles, still responds to clicks; it
just stops moving.
