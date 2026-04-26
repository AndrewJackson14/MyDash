# Phase 0 — Current-State Inventory

**Generated:** 2026-04-26 — pre-refresh baseline
**Branch:** `main` (work will move to `ui-refresh/main` per spec §Working Rules)

This document inventories the visual layer as it stands today, before the
Press Room refresh. Every count and value below is verified against the
codebase, not the global CLAUDE.md.

---

## 0. Stack reality check (read this first)

**The master spec assumes Tailwind. The codebase does not use Tailwind.**

- No `tailwindcss` in [package.json](package.json) dependencies
- No `tailwind.config.js`, no `postcss.config.js`
- Styling is split between two parallel systems:
  1. **CSS custom properties** in [src/styles/global.css](src/styles/global.css) (110+ vars on `:root` plus `[data-theme="light"]` overrides)
  2. **Inline-style React tokens** in [src/lib/theme.js](src/lib/theme.js) (mirrors the CSS vars; consumed by every component via `style={{...}}` props)

Components do not use `className="bg-paper text-ink"` — they use `style={{ background: Z.bg, color: Z.tx }}`. There is **no className-driven utility layer to wire tokens into.**

**Implication for Phase 2:** the master spec's "Wire tokens into `tailwind.config.js`" step has no target. Tokens become:
- CSS custom properties on `:root` (single source of truth)
- Mirrored to `theme.js` exports (or replace `Z`/`FS`/`FW` with thin proxies that read `getComputedStyle(document.documentElement).getPropertyValue('--ink')`)

We need to decide which path before Phase 2 ships. Recommendation in the post-inventory report below.

---

## 1. Routes

### Authenticated app (lazy-loaded in [src/App.jsx](src/App.jsx))

Grouped per the sidebar (App.jsx:471–510):

**(top)** — My Dash, Calendar, Messages, Mail
**Revenue** — Sales, Contracts, Billing
**Content** — Production, Design Studio, Media Library, Flatplan, Layout Console, Printers, Tearsheet Center, Collections, Newsletters, MySites, Knowledge Base
**Advertising** — Booking Queue, Classifieds, Merch
**Operations** — Circulation, Service Desk, Legal Notices, Performance
**Reports** — Reports (Analytics)
**Systems** — Team, Publications, Schedule, Email Templates, Integrations, Data Import

Plus context-only routes referenced from elsewhere: Issue Detail, Team Member Profile, Profile Panel, Permissions, Driver App, Mobile App.

**Route count (authenticated):** 36 lazy-loaded modules + ~6 context routes.

### Public routes (in [src/main.jsx](src/main.jsx) — pre-auth, no chrome)

| Route | Page | Purpose |
|---|---|---|
| `/approve/:token` | ProofApproval | Client signs off on an ad proof |
| `/sign/:token` | ProposalSign | Client signs a proposal → triggers convert_proposal_to_contract |
| `/portal*` | ClientPortal | Client-facing dashboard (invoices, ads, tearsheets) |
| `/pay/:token` | PayInvoice | Stripe checkout for an invoice |
| `/upload/:token` | ClientUpload | Client uploads camera-ready art |
| `/shop/*` | MerchShop | Public storefront for branded merch |
| `/r/:token` | CampaignPublic | Public campaign report (digital flight perf) |
| `/tearsheet/:token` | TearsheetPortal | Public tearsheet download |
| `/ads/*` | ClientPortfolioPortal | Public client ads portfolio |

These are the surfaces clients see. They need refresh polish too — at minimum to feel consistent with the authenticated app.

---

## 2. Shared components

### [src/components/](src/components/) (top level — 21 files)

Page-level composites used by multiple modules: `EditorialDashboard`, `RoleDashboard`, `StoryEditor`, `ChatPanel`, `EntityThread`, `MediaModal`, `Lightbox`, `AssetPanel`, `FuzzyPicker`, `NotificationPopover`, `GmailNotifPopover`, `AmbientPressureLayer`, `EblastComposer`, `IssueProofingTab`, `ProofAnnotationOverlay`, `SignalThreadPanel`, `TeamMemberPanel`, `ScheduleModal`, `SendTearsheetModal`, `SendToPressModal`, `MyHelperLauncher`, `CampaignReport`.

### [src/components/ui/](src/components/ui/) — primitives (4 files + index)

- **[Primitives.jsx](src/components/ui/Primitives.jsx)** (~700 lines, 30+ exports): `Btn`, `Inp`, `Sel`, `TA`, `Modal`, `Card`, `Badge`, `SB` (search box), `TB` (tab bar), `Stat`, `Toggle`, `Checkbox`, `FilterBar`, `SortHeader`, `DataTable`, `Bar` (chart), `BackBtn`, `ThemeToggle`, `FileBtn`, `PageHeader`, `SolidTabs`, `GlassStat`, `GlassCard`, `SectionTitle`, `TabRow`, `TabPipe`, `ListCard`, `ListDivider`, `ListGrid`, `Pill`, `NavItem`, `NavSection`, `glass()`
- **[Icons.jsx](src/components/ui/Icons.jsx)**: `Ic` namespace with ~70 inline SVG icons
- **[FilterPillStrip.jsx](src/components/ui/FilterPillStrip.jsx)**
- **[EntityLink.jsx](src/components/ui/EntityLink.jsx)**

### [src/components/layout/](src/components/layout/)

- **[Sidebar.jsx](src/components/layout/Sidebar.jsx)** — 64px collapsed → 240px expanded, hover-or-pinned, owns `data-shell="v2"`
- **[TopBar.jsx](src/components/layout/TopBar.jsx)**

### [src/components/dashboard/](src/components/dashboard/) — 9 files

`CashFlowSignalCard`, `DashboardModule`, `EditedStoryImpactCard`, `IncomingPipelineCard`, `IssueAtRiskFeed`, `MetricWithBenchmark`, `RepLeaderboardCard`, `RevenuePaceCard`, `WebPublishingQueue`, `WriterPerformanceTable`

### [src/components/proposal-wizard/](src/components/proposal-wizard/) — just shipped

Phase 0 baseline: leave as-is. Refresh will sweep through with everything else in Phase 5 page pass.

### [src/components/editor/](src/components/editor/), [src/components/legal/](src/components/legal/)

- editor: `GalleryNodeView` (Tiptap node)
- legal: `AffidavitTemplate`, `AffidavitWorkspace`, `DeliveryPanel`

### Page-folder components

Sub-views co-located with their page module:
- [src/pages/sales/](src/pages/sales/): `ClientList`, `ClientProfile`, `ClientSignals`, `Commissions`, `Contracts`, `Outreach`, `constants.js`
- [src/pages/billing/](src/pages/billing/): `InvoiceDetail`, `constants.js`
- [src/pages/circulation/](src/pages/circulation/), [src/pages/driver/](src/pages/driver/), [src/pages/mobile/](src/pages/mobile/), [src/pages/performance/](src/pages/performance/), [src/pages/reports/](src/pages/reports/) — additional sub-views, not yet cataloged in detail

---

## 3. Token sources

### Source of truth

[src/styles/global.css](src/styles/global.css) defines tokens as CSS custom properties. [src/lib/theme.js](src/lib/theme.js) mirrors them as JS exports (`Z`, `FS`, `FW`, `R`, `Ri`, `RADII`, `SP`, `CARD`, `TBL`, `INPUT`, `BTN`, `MODAL`, `LABEL`, `TOGGLE`, `AVATAR`, `ZI`, `INV`, `EASE`, `DUR`, `FONT`).

Two parallel systems already exist inside theme.js itself:
- **Legacy `--md-*`** — the pre-refresh palette (`Z.bg`, `Z.tx`, `Z.tm`, etc.)
- **Shell v2** — partial migration toward semantic surface tokens (`Z.bgCanvas`, `Z.fgPrimary`, `Z.borderSubtle`, `RADII`, `EASE`, `DUR`, `FONT.sans`/`.display`/`.mono`)

Components are split between the two. Migration to the v2 set is partial.

### Hardcoded values found in components (sample, not exhaustive)

`grep -rE "color: ['\"]#[0-9A-F]" src/components` returns hundreds of hits. Patterns:
- Auth-flow loading screens (AppRouter.jsx:44–58) hardcode `#08090D`, `#E8ECF2`, `#525E72`
- Many Btn variants in [Primitives.jsx:56–62](src/components/ui/Primitives.jsx#L56-L62) hardcode `#3b82f6` (primary blue) — this is a real palette deviation, not a token
- Status colors and chart tokens scattered throughout

A grep sweep will be Phase 7 QA. Estimate: ~50–100 sites need to flip from hex literals to tokens.

---

## 4. Current font stack

[global.css:25–27](src/styles/global.css#L25-L27) and [theme.js:173–175](src/lib/theme.js#L173-L175):

```css
--md-font-body:    'Source Sans 3', 'DM Sans', 'Segoe UI', system-ui, sans-serif
--md-font-cond:    'IBM Plex Sans Condensed', 'DM Sans', sans-serif   /* ubiquitous in inline styles */
--md-font-display: 'Playfair Display', Georgia, serif                 /* legacy display */
```

Plus a partial Shell v2 stack at [theme.js:222–226](src/lib/theme.js#L222-L226):

```js
FONT.sans    = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif'
FONT.display = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", system-ui, sans-serif'
FONT.mono    = 'ui-monospace, "SF Mono", Menlo, monospace'
```

**Loading mechanism:** A single Google Fonts URL at [theme.js:177](src/lib/theme.js#L177):
```
https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700;800&family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&family=Playfair+Display:wght@700;800;900&display=swap
```

I haven't grepped for where this URL is injected into the document — needs a Phase 3 precheck. Likely a `<link>` in `index.html` or a runtime inject in `main.jsx`.

**Phase 3 will replace all four faces** with self-hosted Cormorant Garamond / Geist / Geist Mono. The Google Fonts link disappears.

---

## 5. Color palette (actual hex values in use)

### Light mode ([global.css:108–136](src/styles/global.css#L108-L136))

| Token | Value | Role |
|---|---|---|
| `--md-bg` | `#F4F5F7` | Page background |
| `--md-sf` | `#FFFFFF` | Card surface |
| `--md-sa` | `#EBEDF0` | Alt surface (subtle wash) |
| `--md-bd` | `#D8DBE2` | Border |
| `--md-tx` | `#111318` | Body text |
| `--md-tm` | `#6B7280` | Muted text |
| `--md-td` | `#9CA3AF` | Dim/label text |
| `--md-ac` | `#111318` | Accent (= text in light) |
| `--md-go` | `#00a300` | Success / on |
| `--md-da` | `#C53030` | Danger |
| `--md-wa` | `#D4890E` | Warning |

### Dark mode (default, [global.css:10–30](src/styles/global.css#L10-L30))

| Token | Value | Role |
|---|---|---|
| `--md-bg` | `#08090D` | Page background |
| `--md-sf` | `#0E1018` | Card surface |
| `--md-sa` | `#161A24` | Alt surface |
| `--md-bd` | `#1C2130` | Border |
| `--md-tx` | `#E8ECF2` | Body text (softened ~13% from pure white) |
| `--md-tm` | `#8A95A8` | Muted text |
| `--md-td` | `#525E72` | Dim/label |
| `--md-ac` | `#E8ECF2` | Accent (= text in dark) |
| `--md-da` | `#E05050` | Danger |

Plus Shell v2 secondary palettes (Steel `#0f1d2c`–`#f0f4f9`, Neutral `#0a0c10`–`#fbfbfc`, Signal success/warning/danger) added but only partially used.

### Stray hardcoded color: primary blue `#3b82f6`

Used by `Btn` primary/secondary variants ([Primitives.jsx:56–60](src/components/ui/Primitives.jsx#L56-L60)) and a sliding tab indicator ([Primitives.jsx:135](src/components/ui/Primitives.jsx#L135)). This is the only "second accent" in the app and is exactly what `01-direction.md` forecloses ("No second accent color later"). It will be the most repetitive replacement in Phase 4.

---

## 6. Density / spacing patterns

### Token scale ([theme.js:227–237](src/lib/theme.js#L227-L237))

```
SP.xs=4  sm=8  md=16  lg=24  xl=32  xxl=40
SP.cardPad=20  sectionGap=28  pageGap=32
```

### Observed inline patterns (from skim of SalesCRM, Billing, Editorial)

- **Tables**: 4–6px row gap (`border-spacing: 0 4px`), 10–14px cell padding, 11px headers uppercase
- **Cards**: 14–20px internal padding, 8px gap between floating cards
- **Forms**: 9–11px input padding (INPUT.pad), 5px label-input gap, 14px between fields
- **Page chrome**: 32px gap between top-level page blocks; modals padded 16/24px
- **Section headers**: 28px section-gap (in line with spec's "32–48px section gaps" target)

Press Room calls for tighter table density (8px row padding spec'd) but more generous section breathing. Today's spacing is in the right shape but tables are slightly looser than the spec wants.

---

## 7. Border-radius — current tokens

### Defined tokens

| Token | Value | Source | Use today |
|---|---|---|---|
| `R` | 18 | [theme.js:203](src/lib/theme.js#L203) | "Card-level rounding" — top-level surfaces |
| `Ri` | 10 | [theme.js:204](src/lib/theme.js#L204) | "Internal elements" — buttons, badges, inputs |
| `RADII.xs` | 6 | [theme.js:209](src/lib/theme.js#L209) | Shell v2 — sparse use so far |
| `RADII.sm` | 8 | [theme.js:210](src/lib/theme.js#L210) | Shell v2 |
| `RADII.md` | 12 | [theme.js:211](src/lib/theme.js#L211) | Shell v2 |
| `RADII.lg` | 16 | [theme.js:212](src/lib/theme.js#L212) | Shell v2 |
| `RADII.xl` | 20 | [theme.js:213](src/lib/theme.js#L213) | Shell v2 — modal panels (proposal wizard) |
| `--md-radius` | 18px | [global.css:22](src/styles/global.css#L22) | CSS-only consumers |
| `--md-radius-sm` | 10px | [global.css:23](src/styles/global.css#L23) | CSS-only consumers |
| `--md-radius-pill` | 999px | [global.css:24](src/styles/global.css#L24) | Pill buttons + scrollbar thumb |
| `CARD.radius` | 5 | [theme.js:243](src/lib/theme.js#L243) | Card list rows (note: 5, not 18 — inconsistency) |
| `TBL.radius` | 5 | [theme.js:258](src/lib/theme.js#L258) | Table containers |
| `TOGGLE.radius` | 10 | [theme.js:329](src/lib/theme.js#L329) | Toggle switch outer |
| `MODAL.radius` | 18 | derived `R` | Modal corners (legacy) |

Plus a global rule at [global.css:174–176](src/styles/global.css#L174-L176) that **forces every `<button>` in the app to `border-radius: 999px` via `!important`** unless inside `[data-shell="v2"]`. This is why most buttons are pill-shaped.

### Press Room target (from spec §Phase 2 working hypothesis)

> "Most surfaces should be 0–2px radius. Buttons and inputs may go to 4px. Nothing above 6px. Pills and fully-rounded elements (avatar, status dot) stay rounded."

The current scale (5 / 10 / 18 / 20) is roughly **3× too round** for Press Room. Every value above 6px violates the working hypothesis. The radius proposal in Phase 2 will need to:
- Drop `R` from 18 → ~2px
- Drop `Ri` from 10 → ~4px
- Collapse `RADII.xs..xl` into a tighter scale (`0 / 2 / 4 / 6` or similar)
- Reverse the global "all buttons are pills" rule — only avatars / status dots / segmented pills stay 999px
- Keep `CARD.radius=5` and `TBL.radius=5` honest (they were already on the right track)

The actual proposal lives in `02-radius-proposal.md` after Phase 2 token work begins. Awaiting Andrew approval before applying.

---

## 8. Font package availability (npm verification)

Confirmed via `npm view`:

| Package | Latest | Status |
|---|---|---|
| `@fontsource-variable/geist` | 5.2.8 | ✓ |
| `@fontsource-variable/geist-mono` | 5.2.7 | ✓ |
| `@fontsource/cormorant-garamond` | 5.2.11 | ✓ |

None are currently installed. All three add together to ~150 KB (variable font + Latin subset + Cormorant 600/700/600-italic).

The current Google Fonts request (Source Sans 3 + DM Sans + IBM Plex Sans Condensed + Playfair Display, all multi-weight) carries more total weight than the Press Room replacement will. Net delivery should drop.

---

## 9. Dev-mode UI to preserve

Per spec §Working Rules: do not refresh the dev role switcher. Located at [App.jsx](src/App.jsx) `setImpersonating` plumbing → renders inside Sidebar via `showSwitcher` / `setShowSwitcher` props ([Sidebar.jsx:36–39](src/components/layout/Sidebar.jsx#L36-L39)). Functionality + appearance frozen.

---

## 10. Tooling / build notes

- Vite 6 + React 18 + ReactDOM 18 (no Tailwind, no PostCSS)
- Framer Motion 11 already installed — available for the Phase 6 signature load
- Self-hosting fonts requires Vite's standard CSS asset handling — no extra config beyond `import "@fontsource-variable/geist"` somewhere in the entry
- Build emits a single `dist/` for rsync deploy ([per CLAUDE.md memory](../../CLAUDE.md))
- No type system (JSX only); no test framework currently installed (master spec §Phase 7 mentions "All existing E2E and unit tests pass" — there don't appear to be any)

---

## Open questions for Andrew before Phase 2

1. **No-Tailwind reality.** Confirm the path forward: keep CSS vars as the single source of truth and have `theme.js` thinly proxy them, OR keep `theme.js` authoritative and emit CSS vars from a build step. (My recommendation: **CSS vars authoritative; `theme.js` emits a typed proxy that reads from `getComputedStyle`** — solves dark/light theme switching cleanly and dovetails with the spec's existing token-table format.)
2. **Public routes.** The 9 client-facing routes (sign, pay, portal, etc.) inherit the same chrome. Confirm they're in scope for the refresh. They appear to be, but worth flagging — those screens are the ones outside-the-company humans see.
3. **Existing test surface.** Spec §Phase 7 expects E2E + unit tests to pass. I see none. Either there's a separate test repo I'm missing, or that line in the spec is aspirational. Confirm.
4. **Stray `#3b82f6`.** Treat as Phase 4 sweep target (replace with `--accent`/Press red where currently primary, with `--ink` where currently a chrome-only blue tab indicator). No second-accent leakage allowed per direction docs.
5. **Shell v2 partial migration.** `RADII`, `FONT.sans/display/mono`, semantic surface tokens (`bgCanvas`/`fgPrimary`/etc.) are partially landed. Phase 2 either consolidates these into the new Press Room scale or keeps them as a parallel track. Recommendation: **collapse Shell v2 into the Press Room scale and retire the `Z.glass*` overlay treatment** — Press Room rejects glass.
6. **Radius proposal.** Working hypothesis above is ready to formalize as `02-radius-proposal.md` once Phase 2 starts. Awaiting your green light on the direction.

**Stop point.** Phase 0 ends here. Awaiting your review and approval before Phase 2 begins.
