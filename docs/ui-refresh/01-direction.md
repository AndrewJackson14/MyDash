# Phase 1 — Final Decisions

> **This file supersedes the typography section of `01-direction.md`.** Where they conflict, this file wins.

## Resolved

1. **Display face** — **Cormorant Garamond** (Google Fonts, self-hosted via `@fontsource/cormorant-garamond`, Latin subset only). Display-only — page titles, KPI numbers, the auth screen header, empty-state illustrations. Nothing below ~28px.
2. **Header face (16–28px serif use)** — None. Headers in this range use Geist 500 or 700, not a serif. The contrast between Cormorant display and Geist headers becomes part of the aesthetic.
3. **Body & mono** — **Geist** (sans) and **Geist Mono**, both self-hosted via `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`.
4. **Accent color** — `#C8301E` light / `#E8473A` dark. Final.
5. **Metadata strip format** — `13 STARS / MYDASH ── {PAGE} ── REV. {MM.DD.YY} ── {DEPARTMENT}`. Wired into the layout shell, not per-page.
6. **Font delivery** — All faces self-hosted. No Monotype web project, no Adobe Fonts dependency.

## Color Tokens

**Light mode (default):**

| Token | Value | Use |
|---|---|---|
| `--ink` | `#1A1814` | Body text, primary surfaces inverted |
| `--paper` | `#F5F1E8` | Page background — warm off-white |
| `--card` | `#FFFFFF` | Elevated surfaces only |
| `--rule` | `#1A1814` at 12% | Hairlines, dividers, table borders |
| `--muted` | `#6B655A` | Secondary text, captions, metadata |
| `--accent` | `#C8301E` | Single hot accent — print-press red |
| `--accent-soft` | `#C8301E` at 8% | Selected row, hover wash |
| `--ok` | `#3B6B3B` | Success only |
| `--warn` | `#B8860B` | Caution |

**Dark mode:**

| Token | Value | Use |
|---|---|---|
| `--ink` | `#EDE8DC` | Body text |
| `--paper` | `#14120E` | Page background — near-black with warm cast |
| `--card` | `#1F1C16` | Elevated surfaces |
| `--rule` | `#EDE8DC` at 14% | Hairlines |
| `--muted` | `#8C8578` | Secondary text |
| `--accent` | `#E8473A` | Press red, lifted for dark |
| `--accent-soft` | `#E8473A` at 12% | Hover wash |
| `--ok` | `#7BA77B` | Success |
| `--warn` | `#D4A93C` | Caution |

## Color Application Rules

- **Accent color (`--accent`) applies to Geist type and UI chrome only.** Cormorant Garamond stays in `--ink` or `--muted` always. Cormorant 600 in accent red, especially on dark mode, has thin-stroke legibility issues.
- **No third accent color, ever.** Departments are signaled via the metadata strip, not chrome recoloring.
- **No gradients.** Anywhere. The paper grain provides all needed atmosphere.

## Font Stack

```css
--font-display: 'Cormorant Garamond', Georgia, serif;
--font-body: 'Geist', system-ui, sans-serif;
--font-mono: 'Geist Mono', ui-monospace, monospace;
```

## Type Scale and Routing

| Token | Size | Family | Weight | Use |
|---|---|---|---|---|
| `--type-display-xl` | 56px | Cormorant | 600 | Page titles, hero KPIs |
| `--type-display-lg` | 40px | Cormorant | 600 | Section heroes |
| `--type-display-md` | 32px | Cormorant | 600 | KPI numbers |
| `--type-h3` | 22px | Geist | 700 | Card headers, section heads |
| `--type-h4` | 18px | Geist | 700 | Subsection heads, table titles |
| `--type-h5` | 14px | Geist | 700 | Table column headers, form labels |
| `--type-body` | 14px | Geist | 400 | Default body |
| `--type-body-sm` | 13px | Geist | 400 | Dense table rows |
| `--type-caption` | 12px | Geist | 500 | Captions, helper text |
| `--type-meta` | 11px | Geist Mono | 500 | Metadata strip, timestamps, IDs |

## Weight Discipline

- **Cormorant Garamond**: 600 only by default. 700 for emphasis within display type. No 300, no 400, no 500. Italic 600 reserved for auth screen header and empty states only.
- **Geist**: 400, 500, 700.
- **Geist Mono**: 500.

Cormorant 400 has thin-stroke flicker at any size on standard DPI displays. Do not use it.

## Numeric Handling

- All KPI cards, table cells, timestamps, and IDs apply `font-variant-numeric: lining-nums tabular-nums` as a base.
- Bake into a `<Stat>` component default and a global `.nums` utility class.
- KPI numerics in Cormorant 600 — Cormorant's lining figures are excellent at display sizes when the variant is set explicitly.

## Line Heights

- Cormorant display: `1.0`
- Geist headers: `1.25`
- Body: `1.55`
- Small / metadata: `1.45`

## Metadata Strip Spec

- Geist Mono 500, 11px, letter-spacing 0.08em, uppercase, `--muted` color
- Hairline rule (`--rule`) above and below, 1px
- Verify rendering at 11px before committing. If thin against paper grain, step to 12px rather than changing the face.

## Locked / Movable

**Locked, do not revisit:**
- Cormorant + Geist + Geist Mono pairing
- Press red `#C8301E` / `#E8473A`
- Metadata strip concept and format
- Press Room aesthetic direction overall
- Off-white paper background, no card shadows, hairlines do structural work
- Cormorant restricted to 28px+ display use only
- Cormorant never receives accent color

**Still movable in Phase 2 if tokens reveal a problem:**
- Exact paper tone (`#F5F1E8`) — may need small warm/cool adjustment once Cormorant renders on it
- Exact `--muted` value — depends on Geist behavior at small sizes
- Specific weight choices within the discipline above