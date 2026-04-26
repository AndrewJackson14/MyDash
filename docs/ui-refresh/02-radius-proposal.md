# Phase 2 — Radius Proposal

> **Awaits Andrew's approval before applying.** Per `00-spec.md` §Phase 2,
> the radius scale is the one token decision that must be confirmed before
> the tokens layer ships. The rest of Phase 2 (colors, type, motion) can
> proceed in parallel.

## Working hypothesis (from `00-spec.md` §Phase 2)

> "Most surfaces should be 0–2px radius. Buttons and inputs may go to 4px.
> Nothing above 6px. Pills and fully-rounded elements (avatar, status dot)
> stay rounded. Justify any deviation."

Press Room is hairline-driven and print-adjacent. The current scale was
built for a glass/Apple aesthetic and is roughly 3× too rounded for the
new direction.

---

## Proposed Press Room scale

| Token | Value | Use |
|---|---|---|
| `--rad-0` | `0px` | Page chrome, table containers, sidebar regions, top-bar, full-bleed sections — anywhere a hairline is the edge |
| `--rad-1` | `2px` | Cards, panels, modals, dropdown menus, popover surfaces — softens the corner without rounding it |
| `--rad-2` | `4px` | Buttons, inputs, selects, textareas, badges, segmented controls — subtle press-press-button feel |
| `--rad-3` | `6px` | Drop-zone outlines, image previews, file-card thumbnails — the absolute max for any rectangular surface |
| `--rad-pill` | `9999px` | Avatars, status dots, small tag chips inside tag clouds, the metadata strip's revision label if it ever rounds — fully circular by intent |

Total ladder: **0 / 2 / 4 / 6 / pill.** Five values. Press Room used to ship
on print presses; print never has rounded corners.

---

## Mapping current → proposed

| Current token | Current value | Proposed token | Proposed value | Rationale |
|---|---|---|---|---|
| `R` | `18px` | `--rad-1` | `2px` | Cards drop dramatically — the biggest single visual shift in the refresh. Hairlines now do the elevation work shadows used to do. |
| `Ri` | `10px` | `--rad-2` | `4px` | Buttons/inputs lose the soft pebble silhouette; gain the press-button feel. |
| `RADII.xs` | `6px` | `--rad-3` | `6px` | Already at the new ceiling — keep, just rename for the new scale. |
| `RADII.sm` | `8px` | `--rad-2` | `4px` | Half the current, on-target for the new scale. |
| `RADII.md` | `12px` | `--rad-1` | `2px` | Was used by the brand-mark tile in Sidebar; 2px is enough to keep the tile readable as a tile and not a hairline. |
| `RADII.lg` | `16px` | `--rad-1` | `2px` | Used by floating cards — collapses into the same value as RADII.md. |
| `RADII.xl` | `20px` | `--rad-1` | `2px` | Modal panels lose ~18px of rounding. The proposal-wizard panel will look noticeably more editorial. |
| `--md-radius` | `18px` | `--rad-1` | `2px` | CSS-only consumers (the global card-hover rule, etc.) match `R`. |
| `--md-radius-sm` | `10px` | `--rad-2` | `4px` | Matches `Ri`. |
| `--md-radius-pill` | `999px` | `--rad-pill` | `9999px` | Renamed for the new scale. Bumped to 9999 to defeat any future `box-sizing: content-box` edge case. Same visual result. |
| `CARD.radius` | `5px` | `--rad-2` | `4px` | Was already on the right track; nudge to the new ladder. |
| `TBL.radius` | `5px` | `--rad-0` | `0px` | **Tables become hard rectangles.** Per direction docs, "tables are tables, not card-wrapped pretend-tables." The 5px was hiding the table's tabular nature. |
| `TOGGLE.radius` | `10px` | `--rad-pill` | `9999px` | Toggles are pill-shaped switches; this was wrong before (they look fine because the inner circle radius dominates, but the outer should match the actual concept). |

---

## What needs to change beyond renaming

### 1. Kill the global `!important` button-pill rule

`global.css:174–176` currently forces every `<button>` in the app to
`border-radius: 9999px !important`, with carve-outs for grid cells and color
swatches. Press Room **buttons are 4px rectangles**, not pills. The rule
inverts:

- New default: buttons get `--rad-2` (4px)
- Carve-outs for genuinely pill-shaped controls (segmented control items,
  status dots, avatar circles, the few "filter chip" pills inside filter
  strips) — these get `--rad-pill` explicitly via inline style or class

Migration: keep the current rule active during Phase 2. Phase 4 (component
refresh) flips it as the Btn primitive lands, with a `[data-shell="press"]`
opt-in mirroring the existing `[data-shell="v2"]` carve-out.

### 2. Modal panels

The proposal wizard panel ([ProposalWizard.jsx:212](src/components/proposal-wizard/ProposalWizard.jsx#L212))
uses `RADII.xl` (20px). Under Press Room it becomes `--rad-1` (2px). This is
intentional and correct — but flag for visual review when it lands.

### 3. Avatars and status dots

These stay `--rad-pill`. Existing tokens (`AVATAR.sm`/`md`/`lg` heights, the
Toggle inner circle) remain pixel-exact circles.

### 4. Segmented controls (TabPipe, FilterPillStrip pills)

These keep `--rad-pill` for the outer container shape, with hard `0px`
between segments. Current `FilterPillStrip` uses `999px` which is
correct under the new scale — no change.

---

## Justified deviations from the working hypothesis

The hypothesis says "Nothing above 6px." Two carve-outs:

1. **Pill controls (`--rad-pill` = 9999px).** Avatars, status dots, segmented
   pills. These are *fully* round by intent — different concept from "rounded
   rectangle." Hypothesis explicitly permits this.
2. **No 8px tier proposed.** Could have offered `--rad-3 = 6` and `--rad-4 = 8`.
   Skipping 8px keeps the ladder under 5 values (cognitive load) and forces
   the question "is this surface a button-ish thing or an oversized card?"
   when in doubt. If a designer reaches for 8px during the refresh, that's a
   signal to step down to 6px or up to a pill, not to add a new tier.

No tier above 6px is justified for any rectangular surface in this app.

---

## Rollout plan (post-approval)

1. **Phase 2 token layer** — adds `--rad-0` through `--rad-pill` to `global.css`
   and `RAD = { 0, 1, 2, 3, pill }` to `theme.js`. Legacy `R`, `Ri`, `RADII.*`
   stay as deprecated aliases pointing at the new scale. Nothing breaks.
2. **Phase 4 component refresh** — each batch updates inline styles to read
   from `RAD.*`, eventually deletes the deprecated aliases.
3. **Phase 4 button-pill rule flip** — happens with the `Btn` primitive
   refresh.
4. **Phase 7 QA grep** — no token reference outside `RAD.*` / `--rad-*` may
   contain a `borderRadius` / `border-radius` literal greater than `0px`.

---

## Awaiting your call

Approve as written → I apply this scale in the tokens commit alongside the
color and type tokens, then proceed.

Want a tier added or removed (e.g., a `--rad-3-5 = 5` for parity with the
current `CARD.radius`) → tell me and I'll revise before applying.

Want the tables-as-pure-rectangles call walked back (TBL.radius stays at
2–4px instead of 0) → tell me; I'll keep the rest of the scale and adjust.
