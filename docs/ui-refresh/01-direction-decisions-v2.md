# Phase 1 — Final Decisions v2 (2026-04-26 revision)

> **This file supersedes `01-direction-decisions.md` where they conflict.**
> The original Press Room direction is preserved as the heritage half of
> the synthesis; this revision adds the Steel Office half — the modern
> CRM/infrastructure register that was missing from v1.

## Aesthetic Name

**Press Room × Steel Office** — heritage on the page, modern infrastructure
on the chrome. Newsroom DNA in the typography and content surfaces; CRM-grade
glass, hover, and steel chrome around them.

## What Changed and Why

v1 (Press Room) executed the heritage-print half of the synthesis cleanly —
Cormorant headlines, paper grain, hairlines, no shadows, no glass, low-motion
buttons. What it didn't deliver was the "cutting-edge CRM automation" half
Andrew named in the brief: power, speed, responsive software feel.

The codebase already laid the groundwork for v2 without committing to it:
- `--md-steel-50` through `--md-steel-navy` (an 11-step steel scale) were
  defined in `global.css` but unused outside `--action`.
- `--md-glass-bg` / `--md-glass-border` / `--md-glass-shadow` (light + dark
  variants) were defined but the `glass()` mixin was deliberately neutered
  to return the hairline-card recipe.
- Hover was capped at `opacity: 0.88` globally — austere by design, but
  flatter than a "powerful tool" should feel.

v2 activates all three. It does NOT undo Cormorant + Geist + Geist Mono,
the metadata strip, paper-grain overlay, accent-red discipline, or the
radius scale (including the 13px card override). Those are the heritage
backbone and they stay.

## The New Synthesis Rule

Paper  →  content surfaces (page bodies, cards, article views, long-form)
Steel  →  chrome (sidebar, top bar, sub-toolbars, secondary canvas)
Glass  →  overlays + sticky elements over scrolling content
Navy   →  primary actions and active states (already in place)
Press  →  alerts and danger only (already in place)

The key invariant: **Cormorant Garamond never sits on glass or steel.** Display
type lives on paper or card. Glass and steel surfaces carry Geist only. This
keeps the heritage register inside the editorial frame, where it belongs, and
prevents the prestige-magazine read from bleeding into ops chrome.

## Resolved (v2 additions)

### 1. Steel becomes the primary canvas tone

Per Andrew's call: steel as primary canvas everywhere; paper retreats to
article and long-form views only.

| Surface | Light | Dark | Source |
|---|---|---|---|
| Page canvas (default) | `--md-steel-50` (`#f0f4f9`) | `--md-steel-900` (`#142433`) | new |
| Sidebar background | glass over steel canvas | glass over steel canvas | see §3 |
| TopBar background | glass over steel canvas | glass over steel canvas | see §3 |
| Card surface | `--card` (`#FFFFFF` / `#1F1C16`) | `--card` | preserved |
| Article / long-form page background | `--paper` (`#F5F1E8` / `#14120E`) | `--paper` | preserved |
| Modal panel | `--card` | `--card` | preserved |
| Table container | `--card` | `--card` | preserved |

**New token:** `--canvas`, defaulting to `--md-steel-50` (light) / `--md-steel-900`
(dark). Body sets `background: var(--canvas)`. The paper-grain overlay continues
to work on top — the grain reads as paper texture on light steel and as quiet
noise on dark steel.

**Article / long-form opt-in:** pages that should retain the paper-canvas
register apply `data-surface="paper"` to their root container, which scopes
`background: var(--paper)` over `var(--canvas)`. Phase 5 work flags which
pages qualify (likely: StoryEditor, full article views, EblastComposer
preview, IssueProofingTab, anything that's reading-shaped). All other pages
inherit steel by default.

**Cards stay white-on-steel.** The contrast between steel canvas and white
cards is the new visual hierarchy — replaces "card has shadow" without
introducing one. On the dark theme, cards stay `#1F1C16` (warm dark) on
steel-900 (cool dark navy), giving the same lift via temperature shift.

### 2. Hover system (replaces the global opacity-0.88 rule)

Per Andrew's call: steel-100 / steel-800 background wash, no border change.

**Global rule** in `global.css` (replaces the existing `button:hover { opacity }`
block):

```css
/* Hover wash — steel scale, no border change, no transform */
button:hover:not(:disabled),
[role="button"]:hover:not([aria-disabled="true"]),
a.press-link:hover,
[data-hoverable]:hover {
  background-color: var(--hover-wash);
}

:root           { --hover-wash: rgba(219, 228, 239, 0.45); } /* steel-100 @ 45% */
[data-theme="dark"] { --hover-wash: rgba(31, 52, 72, 0.55); }   /* steel-800 @ 55% */
```

**Active state:** `--active-wash`, slightly stronger:
- Light: `rgba(184, 201, 222, 0.55)` (steel-200 @ 55%)
- Dark: `rgba(20, 36, 51, 0.65)` (steel-900 @ 65%)

**Where this applies, where it doesn't:**

- ✅ Buttons, role="button", links, NavItem, Pill, table rows, ListCard,
  GlassCard with onClick, FilterBar items, SolidTabs items
- ❌ Filled-variant buttons that already have a strong background (primary,
  danger, success, warning) — these keep their existing fill and shift via
  border-color or a subtle inner darken instead. Spec for filled-variant hover:
  `box-shadow: inset 0 0 0 9999px rgba(0, 0, 0, 0.06)` — costs zero layout,
  reads as a press/depress.
- ❌ Inputs and form controls — they already have their own focus treatment
- ❌ Cormorant display type (h1, h2, Stat numbers, PageHeader title) —
  these are not interactive

The previous `opacity: 0.88` rule is removed entirely. The opacity hover
read like a glitch on dark themes; steel wash reads like a tool.

### 3. Glass surfaces — where, why, exactly how

Per Andrew's selections, glass activates on six surfaces. Each has a specific
recipe and rationale.

**Shared glass tokens** (already defined in `global.css`, currently unused):

```css
/* Light */
--md-glass-bg:     rgba(255, 255, 255, 0.72);
--md-glass-border: rgba(255, 255, 255, 0.5);
--md-glass-shadow: 0 20px 60px -20px rgba(15, 29, 44, 0.25),
                   0 8px 24px -8px rgba(15, 29, 44, 0.12);

/* Dark */
--md-glass-bg:     rgba(18, 22, 27, 0.72);
--md-glass-border: rgba(255, 255, 255, 0.06);
--md-glass-shadow: 0 20px 60px -20px rgba(0, 0, 0, 0.6),
                   0 8px 24px -8px rgba(0, 0, 0, 0.4);
```

**Add to glass tokens** (new):

```css
--md-glass-blur: saturate(180%) blur(20px);
```

**Glass mixin** — restore `glass()` in `Primitives.jsx` to its real recipe:

```js
export const glass = () => ({
  background: "var(--md-glass-bg)",
  border: "1px solid var(--md-glass-border)",
  backdropFilter: "var(--md-glass-blur)",
  WebkitBackdropFilter: "var(--md-glass-blur)",
  boxShadow: "var(--md-glass-shadow)",
});
```

**GlassCard / ListCard** — these consume `glass()` and currently render as
hairline cards. They keep the hairline-card behavior (the in-page card surface
is still white-on-steel, NOT glass). Glass is reserved for *floating chrome*,
not in-flow content cards. Add a new `<FloatingPanel>` primitive for genuine
glass surfaces; leave Card / GlassCard / ListCard as content cards.

**Per-surface specs:**

| Surface | Recipe | Rationale |
|---|---|---|
| Sidebar (rail + expanded panel) | `glass()` background, 1px right hairline `--rule`, `boxShadow` only when hovered+unpinned (preserves current behavior) | Floats over canvas; glass disambiguates rail from content |
| TopBar | `glass()` background, 1px bottom hairline `--rule`, `position: sticky` | Sits above scrolling content; glass = "above" affordance |
| MetadataStrip | `glass()` background, top + bottom hairlines, `position: sticky` | Same logic — chrome that floats above the page |
| Modal backdrop | NEW: `background: rgba(20, 18, 14, 0.45)` + `backdropFilter: blur(8px)` (less aggressive than panel glass) | Backdrop should reveal-but-soften, not replace |
| Modal panel itself | Stays `--card` (NOT glass) | Reading content needs an opaque surface |
| Notification + Gmail popovers | `glass()` background, glass shadow ON, hairline border | Floating UI; glass distinguishes from in-flow cards |
| Sticky table headers when scrolling | `glass()` background, bottom hairline, `position: sticky; top: 0` | Header floats over scrolled rows; glass = "still here, you scrolled past" |

**Browser support guard:** every glass surface includes a fallback:

```css
.glass-surface {
  background: var(--md-glass-bg);
  /* fallback if backdrop-filter unsupported: bump opacity to .92 */
}
@supports (backdrop-filter: blur(20px)) or (-webkit-backdrop-filter: blur(20px)) {
  .glass-surface {
    background: var(--md-glass-bg);
    backdrop-filter: var(--md-glass-blur);
    -webkit-backdrop-filter: var(--md-glass-blur);
  }
}
@supports not ((backdrop-filter: blur(20px)) or (-webkit-backdrop-filter: blur(20px))) {
  .glass-surface {
    background: rgba(255, 255, 255, 0.92); /* opaque-ish fallback */
  }
  [data-theme="dark"] .glass-surface {
    background: rgba(18, 22, 27, 0.95);
  }
}
```

**What stays NOT-glass:**
- Cards (Card, GlassCard, ListCard, Stat) — opaque white/card on steel canvas
- Modal panels — opaque card surface (only the backdrop is glass)
- Table containers — opaque card surface
- AssetPanel and SignalThreadPanel right-side drawers — these are content
  surfaces, not chrome. They stay opaque card. (Confirmed: Andrew did NOT
  select them in the multi-select.)
- Command palette / FuzzyPicker — Andrew did NOT select these. Stays card.

### 4. Cards on steel canvas — the new visual hierarchy

Cards are now the only opaque content surfaces sitting on a slightly-cool
steel canvas. This *is* the elevation system — temperature lift, not shadow.

- Card border stays `1px solid var(--rule)` (hairline)
- Card radius stays `var(--rad-card)` (13px, Andrew override preserved)
- Card padding stays `var(--space-card-pad)` (20px)
- Card background stays `var(--card)` (white / `#1F1C16`)
- **NEW:** Cards on the canvas now have a barely-perceptible inner highlight
  to lift them off steel without introducing a shadow:
  `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6)` (light) / `inset 0 1px 0 rgba(255, 255, 255, 0.04)` (dark)

This is the only new shadow allowed. It's an inset highlight, not a drop
shadow. Press Room's no-shadow rule was about elevation drop shadows; an
inset highlight is the print-design equivalent of a debossed edge, which is
the right register.

### 5. Active states (existing) — confirmed

These already work and are unchanged:
- Active tabs / pills / nav items: `var(--action)` (navy) fill or border-bottom
- Selected rows / hover wash on data: `var(--action-soft)`
- Focus ring: `1px solid var(--action)`, `outline-offset: 2px`

### 6. Motion (unchanged)

Press Room's motion budget stays. The signature load (metadata strip type-in,
KPI count-up, page title fade-up) is preserved. Modal open/close stays
`v2FadeIn` + `v2ScaleIn`. The new hover wash uses the existing `--dur-fast`
(140ms) `--ease` curve.

## What Stays Locked from v1

- Cormorant Garamond as display, Geist as body, Geist Mono as mono
- Type scale and weight discipline (Cormorant 600 only by default)
- Numeric handling (lining + tabular figures)
- Press red `#C8301E` light / `#E8473A` dark — alerts and danger ONLY
- Navy `--action` `#2C465E` light / `#486B95` dark — primary action color
- Metadata strip format and behavior
- Paper grain overlay (now appears on steel canvas, slightly lower opacity:
  `0.015` light, `0.03` dark — it should be barely-there on cool steel)
- Radius scale including 13px card override
- "Cormorant never receives accent color" rule
- "No second accent color, ever" rule
- Hairlines do structural work; drop shadows are not the elevation system

## What's Removed from v1

- The `opacity: 0.88` global hover rule — replaced by steel wash
- The `glass()` mixin's hairline-card pretense — restored to real glass for
  floating chrome
- Paper as the universal canvas — paper now opts in via `data-surface="paper"`
  on long-form/article pages

## Migration Checklist for Claude Code

This is a focused revision pass, not a rebuild. Don't touch finished work.

### Tokens (`src/styles/global.css`)
- [ ] Add `--canvas` token (light: `#f0f4f9`, dark: `#142433`)
- [ ] Add `--hover-wash` token (light: `rgba(219, 228, 239, 0.45)`, dark: `rgba(31, 52, 72, 0.55)`)
- [ ] Add `--active-wash` token (light: `rgba(184, 201, 222, 0.55)`, dark: `rgba(20, 36, 51, 0.65)`)
- [ ] Add `--md-glass-blur: saturate(180%) blur(20px)`
- [ ] Update `body` background from `var(--paper)` to `var(--canvas)`
- [ ] Add `[data-surface="paper"] { background: var(--paper); }` rule
- [ ] Lower paper-grain opacity: light `0.015`, dark `0.03`
- [ ] Replace the `button:hover { opacity: 0.88 }` block with the steel wash rule
- [ ] Add the `@supports` browser-guard block for `backdrop-filter`
- [ ] Add the inset highlight rule for cards: `box-shadow: inset 0 1px 0 rgba(255,255,255,0.6)` (apply via Card primitive, not global selector)

### `src/lib/theme.js`
- [ ] No structural changes needed; the STEEL scale is already exported
- [ ] Add `CANVAS` constant referencing the new tokens, for JS consumers
- [ ] Update `Z.bgCanvas` and `Z.bgChrome` to point at the new steel canvas values (currently they're set to paper)

### `src/components/ui/Primitives.jsx`
- [ ] Restore real `glass()` mixin (recipe in §3 above)
- [ ] Add new `FloatingPanel` primitive that wraps `glass()` for popover/drawer use
- [ ] `Card` / `GlassCard` / `ListCard` — keep current opaque recipe, ADD the inset-highlight box-shadow
- [ ] `Modal` — backdrop gets the new glass backdrop recipe; panel stays opaque card
- [ ] `Btn` filled variants — replace any `:hover` opacity logic with the inset-darken `box-shadow` recipe in §2
- [ ] All other interactive primitives inherit the global hover wash automatically

### `src/components/layout/Sidebar.jsx`
- [ ] Background: `var(--paper)` → `glass()` mixin
- [ ] Border-right hairline stays
- [ ] Box-shadow on hover-unpinned: keep current logic, sourcing from `var(--md-glass-shadow)`

### `src/components/layout/TopBar.jsx`
- [ ] Background: `var(--paper)` → `glass()` mixin
- [ ] Border-bottom hairline stays

### `src/components/layout/MetadataStrip.jsx`
- [ ] Background: `var(--paper)` → `glass()` mixin
- [ ] Top + bottom hairlines stay
- [ ] Notification popover: `var(--paper)` → `glass()` mixin

### `src/components/GmailNotifPopover.jsx`, `NotificationPopover.jsx`
- [ ] Background → `glass()` mixin
- [ ] Glass shadow ON (these are floating UI)

### Sticky table headers
- [ ] Audit `DataTable` and any custom table headers for `position: sticky`
- [ ] Apply `glass()` to sticky headers; keep bottom hairline

### Page surface opt-in
- [ ] Audit pages that should retain paper canvas; add `data-surface="paper"` to their root containers. Initial candidates: StoryEditor, IssueProofingTab full-article views, EblastComposer preview pane, any "reading-shaped" full-page view.
- [ ] All other pages — no change needed; they inherit `--canvas` from body.

## Stop-and-Report Points

Run this as a single revision pass with three checkpoints:

1. **After token + global.css updates** — Andrew reviews canvas / hover-wash / glass-blur tokens before component changes start.
2. **After Sidebar + TopBar + MetadataStrip activate glass** — Andrew eyeballs the chrome on light + dark before propagating glass to popovers and table headers.
3. **After page surface opt-in audit** — Andrew approves the list of `data-surface="paper"` pages before they're committed.

Component-level work between checkpoints proceeds autonomously.

## Out of Scope for This Revision

- No changes to typography (Cormorant/Geist intact)
- No changes to color palette beyond the new neutral tokens
- No changes to the radius scale
- No changes to the metadata strip format or motion
- No new dependencies
- No changes to component APIs — every primitive's props stay the same
- AssetPanel and SignalThreadPanel stay opaque card (NOT glass) — they're
  content drawers, not chrome