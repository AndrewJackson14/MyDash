# MyDash UI Refresh — Master Spec

## Context

You are working in the MyDash repo (React 18 + Vite + Tailwind + Supabase, 13 Stars Media publishing management system). This is a full visual overhaul: tokens, typography, components. Functionality stays. Routes stay. Data layer stays. Only the visual layer changes.

This is a publishing operations tool used daily by Sales, Editorial, Production, and Admin staff at a magazine group. The aesthetic should feel editorial — like a tool that belongs in a publishing house, not a generic SaaS dashboard.

The aesthetic direction is documented in `01-direction.md`. The final typography, color, and font-delivery decisions are in `01-direction-decisions.md` — that file supersedes any conflicting guidance elsewhere.

Core principles guiding execution:
- Commit to a bold, intentional aesthetic and execute every detail with precision
- No generic AI-slop defaults (Inter, purple gradients on white, predictable card layouts)
- Distinctive typography over safe neutrality
- Hairlines and texture over shadows
- One signature motion moment over scattered micro-interactions

---

## Phase 0 — Discovery

1. Read `01-direction.md` and `01-direction-decisions.md` end-to-end. These define the aesthetic, the typography stack, the color tokens, and the rules that take precedence over any conflicting guidance.
2. Inventory the current state. Produce `docs/ui-refresh/00-inventory.md` listing:
   - Every page route and its primary purpose
   - Every shared component in `src/components/` and where it's used
   - Current token sources (Tailwind config, any CSS vars, hardcoded values)
   - Current font stack
   - Current color palette (extract actual hex values in use)
   - Density/spacing patterns observed
   - Current border-radius tokens (recently finalized — list each token name and value)
3. Confirm prerequisites:
   - Geist install path is `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (Vite project, not Next)
   - Cormorant Garamond install path is `@fontsource/cormorant-garamond`
   - No Monotype web project required
   - No Adobe Fonts dependency
4. Stop and report. Do not proceed to Phase 2 until Andrew reviews the inventory.

---

## Phase 1 — Aesthetic Direction

Already locked. See `01-direction.md` (Press Room concept) and `01-direction-decisions.md` (final typography, color, and delivery decisions).

No work needed in this phase except confirming you've read both files and understood the supersede rule.

---

## Phase 2 — Token Layer

Establish the foundation in `src/styles/tokens.css` (or wherever the existing token source lives — match the convention).

- Define all colors as CSS custom properties with light/dark variants per `01-direction-decisions.md`
- Define typography scale per the table in `01-direction-decisions.md`
- Define spacing scale
- Define radius scale — see "Border-radius decision" below
- Define elevation/shadow scale (note: Press Room uses hairlines, not shadows; the elevation scale should be minimal — likely just two values: none and a single subtle inset for input fields)
- Define motion tokens (durations, easings)
- Wire tokens into `tailwind.config.js` so existing Tailwind classes resolve through the new tokens

### Border-radius decision

Press Room is hairline-driven and print-adjacent. The existing border-radius tokens are likely too rounded for the new aesthetic. Do not preserve them as-is, and do not silently scale them.

Instead: propose a new radius scale aligned with Press Room and produce `docs/ui-refresh/02-radius-proposal.md` showing the existing tokens, the proposed new tokens, and a one-line rationale per token. Wait for Andrew's approval before applying.

Working hypothesis to anchor the proposal: most surfaces should be 0–2px radius. Buttons and inputs may go to 4px. Nothing above 6px. Pills and fully-rounded elements (avatar, status dot) stay rounded. Justify any deviation.

### Deliverables for Phase 2

- Working tokens layer (colors, typography, spacing, motion, elevation)
- `docs/ui-refresh/02-tokens.md` table mapping every token name to purpose and value
- `docs/ui-refresh/02-radius-proposal.md` (separate file, awaits approval)

Stop and report. Andrew reviews tokens AND radius proposal before component work begins.

---

## Phase 3 — Typography & Global Styles

- Install Cormorant Garamond via `@fontsource/cormorant-garamond` (Latin subset only)
- Install Geist via `@fontsource-variable/geist`
- Install Geist Mono via `@fontsource-variable/geist-mono`
- Apply base typography to `body`, headings, and prose per the type scale
- Apply paper-grain SVG noise overlay per `01-direction.md` (2% opacity, fixed to viewport, ~3KB)
- Apply the metadata strip to the global layout shell. Format: `13 STARS / MYDASH ── {PAGE} ── REV. {MM.DD.YY} ── {DEPARTMENT}`. Geist Mono 500, 11px, letter-spacing 0.08em, uppercase, --muted color, hairline rules above and below. Verify rendering at 11px before committing — if thin against paper grain, step to 12px rather than changing face.
- Build `/dev/typography` route showing the full type scale in context

---

## Phase 4 — Component Library Refresh

Refresh shared components in `src/components/` in this order, one batch at a time, committing after each:

1. **Primitives**: Button, Input, Select, Textarea, Checkbox, Radio, Toggle, Badge, Tag
2. **Layout**: Card, Panel, Divider, PageHeader, SectionHeader
3. **Feedback**: Alert, Toast, Modal/Dialog, Tooltip, Skeleton, EmptyState
4. **Navigation**: Sidebar, TopBar, Tabs, Breadcrumb, Pagination
5. **Data**: Table, DataGrid row, KPI/Stat card, sparkline wrapper
6. **Forms**: form field group, form section, validation message styling

For each component:
- Refactor markup only as needed to support the new aesthetic
- Use tokens; no hardcoded values
- Preserve all existing props and behavior
- Update the dev/showcase route so each component renders in isolation with all its states (default, hover, focus, disabled, loading, error)

After each batch, run the app and verify nothing visually breaks on the live pages that consume those components.

---

## Phase 5 — Page Pass

Walk every page and apply the refreshed components plus any page-level composition the direction requires (atmospheric backgrounds, hero treatments, section dividers, etc.). Order:

1. Sales department views
2. Editorial department views
3. Production department views
4. Admin views
5. Performance Review page (apply the new system as it lands)
6. Auth, settings, and edge routes

For each page, take a before/after screenshot pair and drop into `docs/ui-refresh/screenshots/`.

---

## Phase 6 — Motion & Polish

Per the direction document, motion is reserved for one signature moment (orchestrated initial dashboard load) plus minimal supporting motion. Implement:

- Initial app load: metadata strip types in (60ms/char), page title fades up 8px, KPI numbers count from 0 to value over 600ms with sharp ease-out
- Modal open/close: 150ms fade + 4px rise
- Toast: slide-in
- Primary link hover: 2px underline draw
- Nothing else. No page transitions. No scroll-triggered reveals. No parallax.

Use CSS where possible. Use Motion (Framer Motion) only where CSS is genuinely insufficient.

---

## Phase 7 — QA Checklist

Before declaring done, verify:

- [ ] Light and dark mode parity on every page
- [ ] All existing E2E and unit tests pass
- [ ] No hardcoded hex values, font names, px values, or shadow strings outside the token layer (grep for `#`, `rgb(`, `px solid`, `box-shadow:` in component files)
- [ ] Lighthouse accessibility score ≥ 95 on the main dashboard route
- [ ] Color contrast meets WCAG AA on body text and interactive elements
- [ ] Keyboard navigation works on every refreshed component
- [ ] Focus states are visible and on-brand
- [ ] No CLS regressions on font load (`font-display: swap`, size-adjust)
- [ ] Bundle size delta reported in the final PR
- [ ] Cormorant never receives accent color (verify via grep)
- [ ] Cormorant never used below 28px (verify via grep / token routing)

---

## Working Rules

- **Branch**: `ui-refresh/main` with sub-branches per phase (`ui-refresh/phase-2-tokens`, etc.). PR each phase separately.
- **DECISIONS.md**: log every meaningful aesthetic or architectural decision as you go, per the global CLAUDE.md convention.
- **Stop points are non-negotiable.** Phases 0 and 2 each require approval before continuing. After Phase 2, you may proceed through 3–7 autonomously, committing per component/page, surfacing only blockers or genuine ambiguities.
- **Reasonable assumptions, logged.** When a detail isn't specified, make the call, note it in DECISIONS.md, keep moving.
- **No new dependencies** without flagging them in the PR description with a one-line justification. Pre-approved: `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `@fontsource/cormorant-garamond`.
- **Preserve the dev role switcher and any other dev-mode UI** — those are not for refresh.

---

## Stop-and-report points

- After Phase 0 inventory → Andrew reviews
- After Phase 2 tokens AND radius proposal → Andrew reviews and approves radius scale before Phase 3 begins
- All other phases: proceed autonomously, surface blockers only