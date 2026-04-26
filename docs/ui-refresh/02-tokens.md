# Phase 2 — Token Reference

Authoritative mapping of every token in the Press Room layer. CSS custom
properties are the source of truth ([global.css](../../src/styles/global.css));
JS exports in [theme.js](../../src/lib/theme.js) mirror them for inline-style
consumers.

**Light is the default** per `01-direction-decisions.md`. Dark activates
when `document.documentElement.dataset.theme === "dark"`.

> Radius tokens are intentionally absent from this doc and from the layer
> they describe. The `--rad-*` scale waits for Andrew's approval of
> [02-radius-proposal.md](./02-radius-proposal.md). Until that approval
> lands, components reach for legacy `--md-r-*` values; Phase 7 QA grep
> catches them.

---

## Color tokens

CSS variable on `:root` (light default). Same name overridden under
`[data-theme="dark"]`. Mirrored as the `PRESS` JS object.

| CSS var | JS key | Light value | Dark value | Purpose |
|---|---|---|---|---|
| `--ink` | `PRESS.ink` | `#1A1814` | `#EDE8DC` | Body text, primary surfaces inverted |
| `--paper` | `PRESS.paper` | `#F5F1E8` | `#14120E` | Page background — warm off-white / near-black with warm cast |
| `--card` | `PRESS.card` | `#FFFFFF` | `#1F1C16` | Elevated surfaces only |
| `--rule` | `PRESS.rule` | `rgba(26, 24, 20, 0.12)` | `rgba(237, 232, 220, 0.14)` | Hairlines, dividers, table borders |
| `--muted` | `PRESS.muted` | `#6B655A` | `#8C8578` | Secondary text, captions, metadata |
| `--accent` | `PRESS.accent` | `#C8301E` | `#E8473A` | Single hot accent — print-press red |
| `--accent-soft` | `PRESS.accentSoft` | `rgba(200, 48, 30, 0.08)` | `rgba(232, 71, 58, 0.12)` | Selected row, hover wash |
| `--ok` | `PRESS.ok` | `#3B6B3B` | `#7BA77B` | Success only |
| `--warn` | `PRESS.warn` | `#B8860B` | `#D4A93C` | Caution |

### Application rules (verified at Phase 7 grep)

- **`--accent` may only color Geist type and UI chrome.** Cormorant Garamond
  always carries `--ink` or `--muted`. Cormorant 600 in accent red has
  thin-stroke legibility issues, especially on dark mode.
- **No third accent color, ever.** Departments are signaled via the metadata
  strip's section label, not chrome recoloring.
- **No gradients.** Anywhere. The paper grain provides all needed atmosphere.
- **No `box-shadow` outside `--elev-input`.** Hairlines do the elevation work
  shadows used to do.

---

## Type tokens

### Family stacks

| CSS var | JS key | Stack |
|---|---|---|
| `--font-display` | `TYPE.family.display` | `'Cormorant Garamond', Georgia, serif` |
| `--font-body` | `TYPE.family.body` | `'Geist', system-ui, sans-serif` |
| `--font-mono` | `TYPE.family.mono` | `'Geist Mono', ui-monospace, monospace` |

Faces self-hosted via `@fontsource/cormorant-garamond`,
`@fontsource-variable/geist`, `@fontsource-variable/geist-mono`. Latin
subset only. Phase 3 adds the `import` statements to the entry.

### Sizes

| CSS var | JS key | px | Family | Weight | Use |
|---|---|---|---|---|---|
| `--type-display-xl` | `TYPE.size.displayXL` | 56 | Cormorant | 600 | Page titles, hero KPIs |
| `--type-display-lg` | `TYPE.size.displayLg` | 40 | Cormorant | 600 | Section heroes |
| `--type-display-md` | `TYPE.size.displayMd` | 32 | Cormorant | 600 | KPI numbers |
| `--type-h3` | `TYPE.size.h3` | 22 | Geist | 700 | Card headers, section heads |
| `--type-h4` | `TYPE.size.h4` | 18 | Geist | 700 | Subsection heads, table titles |
| `--type-h5` | `TYPE.size.h5` | 14 | Geist | 700 | Table column headers, form labels |
| `--type-body` | `TYPE.size.body` | 14 | Geist | 400 | Default body |
| `--type-body-sm` | `TYPE.size.bodySm` | 13 | Geist | 400 | Dense table rows |
| `--type-caption` | `TYPE.size.caption` | 12 | Geist | 500 | Captions, helper text |
| `--type-meta` | `TYPE.size.meta` | 11 | Geist Mono | 500 | Metadata strip, timestamps, IDs |

### Weights — discipline rules

| CSS var | JS key | Value | Used by |
|---|---|---|---|
| `--weight-display` | `TYPE.weight.display` | 600 | Cormorant default |
| `--weight-display-emph` | `TYPE.weight.displayEmph` | 700 | Cormorant emphasis only |
| `--weight-body` | `TYPE.weight.body` | 400 | Geist body |
| `--weight-body-mid` | `TYPE.weight.bodyMid` | 500 | Geist captions, subtle emphasis |
| `--weight-body-bold` | `TYPE.weight.bodyBold` | 700 | Geist headings, buttons |
| `--weight-mono` | `TYPE.weight.mono` | 500 | Geist Mono — only weight in use |

**Rules.** Cormorant 600 is the default; Cormorant 700 only for emphasis.
**No Cormorant 300, 400, or 500 anywhere** — thin strokes flicker at
standard DPI. **No Cormorant below 28px** — the display-only restriction
in `01-direction-decisions.md`. Italic 600 reserved for the auth screen
header and empty-state illustrations.

### Line heights

| CSS var | JS key | Value | Use |
|---|---|---|---|
| `--lh-display` | `TYPE.lh.display` | 1.0 | Cormorant display lockup |
| `--lh-heading` | `TYPE.lh.heading` | 1.25 | Geist headers |
| `--lh-body` | `TYPE.lh.body` | 1.55 | Body |
| `--lh-meta` | `TYPE.lh.meta` | 1.45 | Small / metadata |

### Letter spacing

| CSS var | JS key | Value | Use |
|---|---|---|---|
| `--ls-meta` | `TYPE.ls.meta` | `0.08em` | Metadata strip uppercase tracking |
| `--ls-headers` | `TYPE.ls.headers` | `0.02em` | Optical fix for tight Geist headers |

### Numeric handling

All KPI cards, table cells, timestamps, and IDs apply
`font-variant-numeric: lining-nums tabular-nums` as a base. This will be
baked into the refreshed `<Stat>` primitive and a global `.nums` utility
class in Phase 3.

---

## Spacing tokens

Preserved from the existing `SP` scale (re-exported as `SPACE`).
Press Room is comfortable with this base — adjustments happen at component
density level, not at the token scale.

| CSS var | JS key | px | Use |
|---|---|---|---|
| `--space-xs` | `SPACE.xs` | 4 | Inline gaps, badge padding |
| `--space-sm` | `SPACE.sm` | 8 | Tight gaps, list-row padding |
| `--space-md` | `SPACE.md` | 16 | Standard form-field gap |
| `--space-lg` | `SPACE.lg` | 24 | Card-to-card, section internal |
| `--space-xl` | `SPACE.xl` | 32 | Major section gap |
| `--space-xxl` | `SPACE.xxl` | 40 | Hero / page-header bottom |
| `--space-card-pad` | `SPACE.cardPad` | 20 | Internal card padding |
| `--space-section-gap` | `SPACE.sectionGap` | 28 | Gap between major sections |
| `--space-page-gap` | `SPACE.pageGap` | 32 | Gap between top-level page blocks |

---

## Elevation tokens

Press Room rejects shadows. The single allowed elevation is the inset for
input fields — kept light enough to read as a fold, not a glow.

| CSS var | JS key | Value | Use |
|---|---|---|---|
| `--elev-none` | `ELEV.none` | `none` | Default for cards, panels, modals — hairlines do the work |
| `--elev-input` | `ELEV.input` | `inset 0 1px 2px rgba(26, 24, 20, 0.04)` (light) / `inset 0 1px 2px rgba(0, 0, 0, 0.20)` (dark) | Text inputs, selects, textareas |

There is no `--elev-card`, `--elev-modal`, `--elev-popover`, etc. by
design. If a refreshed component reaches for a shadow, that's a signal to
reach for a heavier hairline (`border-bottom: 1px solid var(--rule)`) or a
tonal shift (`background: var(--card)` over `--paper`) instead.

---

## Motion tokens

| CSS var | JS key | Value | Use |
|---|---|---|---|
| `--ease` | `EASE` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Default ease for anything |
| `--dur-fast` | `DUR.fast` | `140ms` | Hover, focus rings |
| `--dur-med` | `DUR.med` | `220ms` | Modal open/close, toast slide-in |
| `--dur-slow` | `DUR.slow` | `320ms` | Sidebar expand, signature load step |

Motion is reserved for the signature dashboard load (Phase 6) plus
modal/toast/hover. **No page-transition animations, no scroll-triggered
reveals, no parallax.** See `01-direction.md` §Motion Philosophy.

---

## Theme switching wiring

Three pieces stay in lockstep on every toggle:

1. `Z` (legacy palette) — mutated via `Object.assign(Z, LIGHT/DARK)` in
   [App.jsx:286](../../src/App.jsx#L286)
2. `PRESS` (Press Room palette) — mutated via
   `Object.assign(PRESS, PRESS_LIGHT/PRESS_DARK)` in the same handler
3. `document.documentElement.dataset.theme` — set to `"light"` or `"dark"`,
   activates the matching CSS-var override block

Initial mount: [theme.js](../../src/lib/theme.js) reads
`localStorage.getItem("mydash-theme")` (or falls back to
`prefers-color-scheme`), then calls the same three updates from a side-
effect block. CSS vars are correct from first paint.

---

## What's deliberately NOT here

- **Radius scale.** Pending [02-radius-proposal.md](./02-radius-proposal.md)
  approval.
- **Tailwind config.** No Tailwind in this codebase. CSS vars are the
  single source of truth; JS proxies via `theme.js` exports.
- **Per-component density tokens.** `CARD.pad`, `TBL.cellPad`, etc. stay
  in `theme.js` for back-compat. Phase 4 component refresh either
  consumes them directly or replaces them with token references.
- **Glass / overlay styles.** `Z.glassBg`, `Z.glassBorder`, `Z.glassShadow`,
  and `--md-glass-*` will be retired in Phase 4. Press Room rejects glass.

---

## Phase 7 QA checklist (relevant to this layer)

Per `00-spec.md` §Phase 7:

- [ ] `grep -rE "color: ['\"]#" src/components` returns zero matches
      outside the token layer
- [ ] `grep -rE "fontFamily: ['\"](?!var|--)"` returns zero matches outside
      the token layer
- [ ] `grep -rE "fontSize: \d+" src/components` returns zero matches —
      every font size flows through `var(--type-*)` or `TYPE.size.*`
- [ ] `grep -rE "boxShadow: " src/components` returns only the input inset
      and any signature-load animation shadows
- [ ] Cormorant never receives `--accent` (verify via `grep -rE
      "fontFamily.*Cormorant"` then check each result)
- [ ] Cormorant never used below 28px (verify via the type-scale routing
      table above — Cormorant tokens are all `≥32px`)
