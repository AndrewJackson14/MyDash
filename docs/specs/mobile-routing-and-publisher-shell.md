# Mobile Routing & Publisher Mobile Shell — Build Spec

**Version:** 1.0
**Last updated:** 2026-04-30
**Owner:** Nic Mattson (Support Admin)
**Status:** Ready for implementation
**Related specs:** publisher-dashboard-spec.md, contractor-portal-spec.md (future)

---

## Goal

Fix the broken mobile experience for non-salesperson users, and build a focused Publisher mobile shell so Hayley can run the company from her phone.

Today, anyone opening MyDash on a phone < 768px is auto-redirected to `/mobile`, which is a sales-rep-specific 5-tab experience. A Publisher landing there sees a sales dashboard that has nothing to do with her job. Editorial/Layout/Ad/Office roles get the same wrong-shell treatment.

This spec does three things:

1. **Replaces the pre-auth phone-width redirect** with a post-auth role-aware redirect.
2. **Adds a "this view isn't optimized" fallback** for roles without a mobile shell, with an escape hatch to view desktop anyway.
3. **Builds a Publisher mobile shell** at `/mobile/publisher` — the third distinct mobile experience after sales (`/mobile`) and driver (`/driver`).

---

## Current state recap

The codebase has two distinct mobile shells today:

| Shell | Path | Audience | Auth | Features |
|---|---|---|---|---|
| Sales mobile | `/mobile` | Salespeople | Google SSO (shared with desktop) | 5-tab nav: Home, Pipeline, Capture (+), Clients, Me. Contract photo upload + AI parse, in-person card charge, mobile proposal wizard. |
| Driver mobile | `/driver` | Delivery drivers (not team_members) | Magic link + 6-digit PIN | Today's routes, route navigation, completion. Dark mode default. |

The auto-redirect logic in `App.jsx` (current state):

```javascript
if (window.location.pathname === "/"
    && window.innerWidth < 768
    && !window.location.search.includes("desktop=1")) {
  window.history.replaceState({}, "", "/mobile");
}
```

This fires before auth resolves, so it's role-blind. The bug.

---

## Target behavior

### The redirect

Phone-width users (< 768px) on path `/` go through this flow:

1. Render the auth gate (existing `AppRouter` / `LoginPage`)
2. After auth completes and `teamMember.role` is known
3. Branch by role:
   - `Publisher` → redirect to `/mobile/publisher`
   - `Salesperson` → redirect to `/mobile` (existing sales shell)
   - `Stringer` → redirect to `/contractor` (future spec — placeholder route returns "coming soon" screen for now)
   - `Bot` → no redirect (bots don't browse)
   - All others (`Ad Designer`, `Layout Designer`, `Content Editor`, `Office Administrator`) → render the **MobileNotOptimizedScreen**

`/driver` is unchanged — drivers aren't team_members, they hit `/driver` directly via magic link.

### The escape hatch

A localStorage flag `mydash-mobile-preference` controls override behavior:

| Value | Meaning |
|---|---|
| `auto` (default) | Honor the role-based redirect |
| `desktop` | Always render desktop shell, regardless of viewport width |
| `mobile` | Force the role-appropriate mobile shell on any viewport (debugging) |

Users access the toggle via:
- `?desktop=1` URL param (one-time override, doesn't persist) — already supported, kept as-is
- A "Use desktop view on this device" toggle on the **MobileNotOptimizedScreen**
- A "Switch to desktop view" link in the Publisher mobile shell's Me/settings tab
- A "Switch to mobile view" link buried in desktop Settings (low priority — only matters when someone has set `desktop` and wants to undo)

The `?desktop=1` URL param sets `mydash-mobile-preference = 'desktop'` in localStorage if the user clicks "Remember this choice" on the next visit. Single-shot otherwise.

### The fallback screen

For roles without a mobile shell, show a focused screen rather than dumping them into the wrong app:
┌────────────────────────────────────────────┐
│                                            │
│         [13 Stars logo]                    │
│                                            │
│   This view isn't built for                │
│   mobile yet.                              │
│                                            │
│   Hi Anthony — the Layout Designer         │
│   workspace is desktop-only for now.       │
│   We're working on a mobile version,       │
│   but it's not ready yet.                  │
│                                            │
│   In the meantime, you can:                │
│                                            │
│   ┌──────────────────────────────────┐    │
│   │   Use the desktop view anyway    │    │
│   └──────────────────────────────────┘    │
│                                            │
│   ☐ Remember this choice on this device   │
│                                            │
│   [Sign out]                               │
│                                            │
└────────────────────────────────────────────┘

Greeting includes their first name and role (drawn from `teamMember.name` and `teamMember.role`). Honest copy — doesn't pretend the desktop view will work great on a phone, just acknowledges it's the available option.

---

## The Publisher mobile shell

### Audience and scope

**Hayley Mattson**, currently fills both Publisher and Editor-in-Chief roles. She's in meetings, on the road, between events, away from her desk much of the workday. She doesn't need to *do* publishing work on her phone — she needs to *see* what's happening, *approve* what needs approving, and *react* to what's urgent.

This is **not** the desktop Publisher Dashboard miniaturized. It's a focused mobile-native experience for the on-the-go view of running the company.

### Three core jobs Hayley does on mobile

1. **Triage urgency** — what needs my attention right now
2. **Approve pending items** — sign-offs, proofs, reviews queued for her
3. **Check pulse** — revenue, deadlines, team status at a glance

Anything beyond these three goes to desktop. The shell explicitly does not try to be a complete operational surface — it's a dashboard + an inbox + a few quick actions.

### Tab structure

5-tab bottom nav, mirroring `/mobile` structurally but with different content:
┌────────────────────────────────────────┐
│                                        │
│           [tab content]                │
│                                        │
├────────────────────────────────────────┤
│  Pulse  Urgent  [+]  Approvals  Me    │
└────────────────────────────────────────┘

| Tab | Purpose |
|---|---|
| Pulse | Revenue strip, today's deadlines, team status at a glance |
| Urgent | Items flagged urgent by the system or pinned by Hayley |
| Quick Action (+) | Floating action button — see below |
| Approvals | Items awaiting her sign-off (proofs, contracts, large invoices, story approvals) |
| Me | Profile, switch to desktop view, sign out |

The elevated `+` opens a Quick Action sheet:
- Note to team (writes a `team_notes` row to chosen recipient)
- Voice memo to journal (writes to her support_admin_journal equivalent — needs the publisher analog)
- Mark item urgent (picks from a recent activity list)
- Approve all pending proofs (bulk approval shortcut)

### Tab contents

#### Pulse tab

The "is everything okay" surface. Three stacked cards:

**Revenue strip** — same shape as sales mobile's KPIs, but org-wide:
- MTD revenue (closed sales, all reps)
- Quarterly pacing (% to goal, with simple bar)
- Outstanding receivables (overdue invoice count + total)

**Today's deadlines** — list of issues with `ad_deadline` or `ed_deadline` ≤ today + 2:
- Publication name + issue label
- Days until deadline (red if today, amber if tomorrow, green if 2+)
- Tap → desktop deep-link to issue detail (with localStorage flag set so this single navigation goes to desktop, then returns to mobile after)

**Team status** — list of active team_members with status indicators:
- Avatar + name
- OOO badge if `ooo_from <= today <= ooo_until`
- "On a deadline" badge if they're assigned to anything deadline-imminent
- Tap → quick-message sheet (writes team_note)

Pulse is read-only. No edit capability. Pure visibility.

#### Urgent tab

System-flagged + manually-pinned urgent items:

**System-flagged** (computed):
- Overdue invoices > 60 days
- Stories past their due_date with status not in ('Approved', 'Sent to Web', 'On Page')
- Ad projects with deadline today and status != 'approved'
- Service tickets with status='escalated'
- Inquiries unassigned > 24 hours

**Manually-pinned**:
- Items Hayley has pinned via the Quick Action "Mark item urgent"
- Stored in a new table or jsonb field on `people.alert_preferences` — see schema section

Each urgent card shows: type, title, age (how long it's been urgent), one-tap action ("View on desktop" or context-specific action like "Mark as resolved"). Swipe-to-dismiss for a single card.

#### Approvals tab

Items awaiting Hayley's specific approval. Filtered by `team_member_id = hayley.id` on:

- **Issue proofs** — `issue_proofs` rows where `status = 'pending_publisher_signoff'`. Tap → full-screen proof viewer with "Approve" / "Request changes" buttons.
- **Large contracts** — sales/contracts above a threshold (e.g., $5,000) needing publisher countersign. Tap → contract preview + approve.
- **Story approvals** — stories with `status = 'Needs Approval'`. Tap → read-only StoryEditor preview + approve.
- **Refunds / write-offs** — invoices marked for write-off needing publisher approval.
- **New team members** — onboarding requests (future, post people-unification).

Each card: type icon, item title, requestor name, age, "Approve" + "Open" buttons. Approve writes the corresponding row update + audit log entry.

#### Me tab

- Profile (avatar, name, role)
- OOO toggle (sets `ooo_from`/`ooo_until`)
- Quiet hours preference (read from `alert_preferences`, e.g. "no notifications between 8pm-7am")
- "Switch to desktop view" link (sets localStorage to `desktop`)
- "Sign out"

---

## Architecture

### Shared mobile infrastructure

Currently `/mobile` and `/driver` each have their own shell, tokens, helpers. Some duplication is inevitable (different audiences, different design needs), but a few things should be lifted into a shared layer:
src/pages/mobile/
├── _shared/                      ← new
│   ├── MobileShell.jsx           shared viewport setup, theme forcing, PWA meta
│   ├── BottomTabBar.jsx          tab bar component, parameterized by tab list
│   ├── MobileHeader.jsx          existing — already shared-ish, finalize it
│   ├── tokens.js                 base mobile tokens (renamed from mobileTokens.js)
│   └── usePostAuthRedirect.js    the redirect hook (see below)
├── sales/                        ← existing /mobile content, moved here
│   ├── SalesMobileApp.jsx
│   ├── tabs/...
│   └── modals/...
├── publisher/                    ← new
│   ├── PublisherMobileApp.jsx
│   ├── tabs/
│   │   ├── PulseTab.jsx
│   │   ├── UrgentTab.jsx
│   │   ├── ApprovalsTab.jsx
│   │   └── MeTab.jsx
│   └── modals/
│       └── QuickActionSheet.jsx
└── _common/
├── MobileNotOptimizedScreen.jsx
└── MobilePreferenceProvider.jsx   localStorage state hook

Existing `/mobile` files in `src/pages/mobile/` get reorganized into the `sales/` subfolder. Imports in `App.jsx` update accordingly.

### The redirect hook

```javascript
// src/pages/mobile/_shared/usePostAuthRedirect.js
import { useEffect } from "react";
import { useAuth } from "../../../hooks/useAuth";

const PHONE_WIDTH = 768;

export function usePostAuthRedirect() {
  const { teamMember, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!teamMember) return;
    if (typeof window === "undefined") return;

    const path = window.location.pathname;
    const search = window.location.search;
    const isPhone = window.innerWidth < PHONE_WIDTH;
    const pref = localStorage.getItem("mydash-mobile-preference") || "auto";

    // Honor explicit overrides
    if (search.includes("desktop=1")) return;
    if (pref === "desktop") return;

    // Already on a mobile route → don't re-redirect
    if (path.startsWith("/mobile") || path.startsWith("/driver") || path.startsWith("/contractor")) {
      return;
    }

    // Only redirect from path "/" — don't hijack deep links
    if (path !== "/") return;

    // Only redirect on phone-width OR when preference is "mobile"
    if (!isPhone && pref !== "mobile") return;

    const target = mobileTargetForRole(teamMember.role);
    if (target) {
      window.history.replaceState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    // null target → let App render desktop or fallback screen
  }, [teamMember, loading]);
}

function mobileTargetForRole(role) {
  switch (role) {
    case "Publisher":            return "/mobile/publisher";
    case "Salesperson":          return "/mobile";
    case "Stringer":             return "/contractor";
    case "Bot":                  return null;
    case "Ad Designer":
    case "Layout Designer":
    case "Content Editor":
    case "Office Administrator":
    default:
      return "/mobile/not-optimized";
  }
}
```

Usage in `App.jsx`: this hook runs after auth resolves, replacing the pre-auth phone-width check at the top of the file.

### Routing changes in `App.jsx`

The early-return branches at the top of `App.jsx` get reorganized:

```javascript
// 1. /driver — unchanged, separate auth tree
if (path.startsWith("/driver")) {
  return <Suspense fallback={...}><DriverApp /></Suspense>;
}

// 2. /contractor — placeholder for now (future spec)
if (path.startsWith("/contractor")) {
  return <Suspense fallback={...}><ContractorPortalPlaceholder /></Suspense>;
}

// 3. /mobile — branches to sub-shells by sub-path
if (path.startsWith("/mobile")) {
  if (path.startsWith("/mobile/publisher")) {
    return <Suspense fallback={...}><PublisherMobileApp /></Suspense>;
  }
  if (path.startsWith("/mobile/not-optimized")) {
    return <Suspense fallback={...}><MobileNotOptimizedScreen /></Suspense>;
  }
  // Default: existing sales mobile
  return <Suspense fallback={...}><SalesMobileApp /></Suspense>;
}

// 4. Desktop — existing path, with usePostAuthRedirect added inside App
```

The pre-auth phone-width redirect is **deleted**. The `usePostAuthRedirect` hook inside `App` handles all redirect logic post-auth.

### Where `usePostAuthRedirect` lives

It runs inside `App` (not `AppRouter`), since `AppRouter` doesn't have `teamMember` resolved yet. First render of `App` happens with `loading: true` from `useAuth`, then `teamMember` populates, the effect fires, and the redirect happens.

This means the desktop chrome will momentarily render before the redirect on a phone. That's acceptable — the alternative is gating App rendering on `teamMember` resolution, which delays first paint for everyone. The flash is one frame and only on phones, only on first load. Subsequent loads come from the redirected URL directly.

If the flash proves jarring in real testing, the fix is to gate desktop App rendering specifically when `window.innerWidth < 768` until `teamMember` resolves. Build it and test.

---

## Schema

This spec needs minimal schema changes. Three small additions:

### `people.urgent_pins` (or jsonb on `alert_preferences`)

Manually-pinned urgent items for the Urgent tab:

```sql
ALTER TABLE people
  ADD COLUMN urgent_pins jsonb DEFAULT '[]';

COMMENT ON COLUMN people.urgent_pins IS
  'Array of {type, ref_id, pinned_at, note} objects representing items the person has manually flagged as urgent. Surfaced on the Publisher mobile Urgent tab.';
```

Shape: `[{ "type": "story", "ref_id": "<uuid>", "pinned_at": "...", "note": "..." }]`

### `mobile_preferences` (or simpler: jsonb on `people`)

Persisted mobile view preference per device is a localStorage concern. But persisted preferences across devices live on the user record:

```sql
ALTER TABLE people
  ADD COLUMN mobile_preference text DEFAULT 'auto';

-- CHECK: auto | desktop | mobile
```

Cross-device default. If Hayley sets "desktop" on her iPad, her phone respects it next login. localStorage is the per-device override.

### Approvals queue view

A view that aggregates all "items needing publisher approval" from disparate tables. This is what feeds the Approvals tab:

```sql
CREATE OR REPLACE VIEW publisher_approvals AS
  SELECT
    'issue_proof' AS item_type,
    p.id AS item_id,
    p.issue_id AS context_id,
    'Issue proof for ' || i.label AS title,
    p.uploaded_by AS requestor_id,
    p.created_at AS submitted_at,
    p.created_at AS sort_at
  FROM issue_proofs p
  JOIN issues i ON i.id = p.issue_id
  WHERE p.status = 'pending_publisher_signoff'

  UNION ALL

  SELECT
    'large_contract' AS item_type,
    s.id AS item_id,
    s.client_id AS context_id,
    c.name || ' · $' || s.amount::text AS title,
    s.assigned_to AS requestor_id,
    s.updated_at AS submitted_at,
    s.updated_at AS sort_at
  FROM sales s
  JOIN clients c ON c.id = s.client_id
  WHERE s.status = 'Negotiation'
    AND s.amount >= 5000
    AND (s.publisher_approved_at IS NULL)

  UNION ALL

  SELECT
    'story_approval' AS item_type,
    st.id AS item_id,
    st.publication_id AS context_id,
    st.title AS title,
    st.author_id AS requestor_id,
    st.updated_at AS submitted_at,
    st.updated_at AS sort_at
  FROM stories st
  WHERE st.status = 'Needs Approval'

  ORDER BY sort_at DESC;
```

The view enables a single query from the Approvals tab. Adding new approval types later = adding a UNION arm.

**Open question:** does `sales.publisher_approved_at` exist? If not, add it. Migration includes `ALTER TABLE sales ADD COLUMN publisher_approved_at timestamptz;`.

### RLS

All new view rows are filtered to publisher access:

```sql
GRANT SELECT ON publisher_approvals TO authenticated;
-- View inherits RLS from underlying tables, so existing policies apply.
-- A user without RLS access to the underlying table sees an empty view.
```

A non-publisher querying this view sees only the rows they have access to via underlying-table RLS. That's actually fine — Cami pulling this view sees nothing because she can't read pending approvals. The view is just a convenience.

---

## Settings UI updates

### Settings → Mobile preferences

A new section in Settings (desktop) lets users manage the cross-device mobile preference:
┌─────────────────────────────────────────────┐
│  Mobile preferences                          │
├─────────────────────────────────────────────┤
│  When I open MyDash on a phone:             │
│                                             │
│  ◉ Show me the mobile view (auto)           │
│  ○ Always show me the desktop view          │
│  ○ Show mobile view even on tablets/laptops │
│                                             │
│  [Save preference]                          │
└─────────────────────────────────────────────┘

Updates `people.mobile_preference`. Independent of localStorage. Settings → Mobile preferences only shows for users whose role has a mobile shell or fallback (so 99% of users).

### Me tab → mobile preference

The mobile Me tab includes a "Switch to desktop view" link that:

1. Sets localStorage `mydash-mobile-preference = 'desktop'`
2. Optionally syncs to `people.mobile_preference` (toggle: "Apply to all my devices")
3. Reloads to `/`

---

## Files to create

### New files
src/pages/mobile/_shared/
├── MobileShell.jsx
├── BottomTabBar.jsx
├── tokens.js                     ← renamed from mobileTokens.js
└── usePostAuthRedirect.js
src/pages/mobile/_common/
├── MobileNotOptimizedScreen.jsx
└── MobilePreferenceProvider.jsx
src/pages/mobile/publisher/
├── PublisherMobileApp.jsx
├── tabs/
│   ├── PulseTab.jsx
│   ├── UrgentTab.jsx
│   ├── ApprovalsTab.jsx
│   └── MeTab.jsx
└── modals/
└── QuickActionSheet.jsx
src/pages/contractor/
└── ContractorPortalPlaceholder.jsx   simple "coming soon" screen
src/components/settings/
└── MobilePreferencesSection.jsx      desktop Settings panel

### Files to refactor
src/pages/mobile/                   ← existing files moved into sales/ subfolder
├── sales/                          ← move all current /mobile files here
│   ├── SalesMobileApp.jsx          ← renamed from MobileApp.jsx
│   ├── tabs/...                    ← already organized
│   └── modals/...                  ← move Capture/ContractReview/etc here

`App.jsx`:
- Delete pre-auth phone-width redirect block
- Add `/mobile/publisher` and `/mobile/not-optimized` route branches
- Add `/contractor` route branch (placeholder)
- Inside the desktop App component, call `usePostAuthRedirect()`

`useAuth.jsx`:
- No changes required — `teamMember.role` is already exposed

### Migration
supabase/migrations/180_mobile_preferences_and_publisher_approvals.sql

(Numbered after the people-unification migration 179.)

Contents:
- `ALTER TABLE people ADD COLUMN urgent_pins jsonb DEFAULT '[]'`
- `ALTER TABLE people ADD COLUMN mobile_preference text DEFAULT 'auto' CHECK (mobile_preference IN ('auto', 'desktop', 'mobile'))`
- `ALTER TABLE sales ADD COLUMN publisher_approved_at timestamptz` (if not present)
- `CREATE OR REPLACE VIEW publisher_approvals AS ...`
- `NOTIFY pgrst, 'reload schema'`

---

## Acceptance criteria

### Phase 1: Redirect fix

- [ ] Pre-auth phone-width redirect deleted from `App.jsx`
- [ ] `usePostAuthRedirect` hook implemented and called inside App component
- [ ] Salesperson on phone-width → `/mobile` (existing behavior preserved)
- [ ] Publisher on phone-width → `/mobile/publisher`
- [ ] Stringer on phone-width → `/contractor` (placeholder)
- [ ] Other roles on phone-width → `/mobile/not-optimized`
- [ ] `?desktop=1` URL param respected (no redirect)
- [ ] `mydash-mobile-preference = 'desktop'` localStorage respected (no redirect)
- [ ] Deep links (e.g., `/sales?clientId=...`) not hijacked by redirect
- [ ] Existing `/driver` flow unchanged

### Phase 2: Fallback screen

- [ ] `MobileNotOptimizedScreen` renders with first name + role greeting
- [ ] "Use the desktop view anyway" button navigates to `/?desktop=1`
- [ ] "Remember this choice" checkbox sets localStorage when used
- [ ] Sign-out button works
- [ ] Renders correctly on iOS Safari and Chrome mobile

### Phase 3: Publisher mobile shell

- [ ] `/mobile/publisher` renders without console errors
- [ ] All 5 tabs render: Pulse, Urgent, Quick Action (+), Approvals, Me
- [ ] Pulse tab: revenue strip + today's deadlines + team status all populate from real data
- [ ] Urgent tab: shows system-flagged urgent items + manually-pinned items
- [ ] Approvals tab: queries `publisher_approvals` view, renders cards by type
- [ ] Approve action on a proof writes the correct row update + audit log
- [ ] Approve action on a contract sets `publisher_approved_at`
- [ ] Approve action on a story sets `status = 'Approved'`
- [ ] Quick Action sheet opens from the elevated `+`
- [ ] Quick Action: "Note to team" writes a `team_notes` row
- [ ] Quick Action: "Mark item urgent" updates `people.urgent_pins`
- [ ] Me tab: OOO toggle, quiet hours, switch-to-desktop, sign-out all work
- [ ] PWA installable from Safari "Add to Home Screen"
- [ ] Latency: Pulse tab paints with data within 2 seconds on cold load

### Phase 4: Settings integration

- [ ] Desktop Settings → Mobile preferences section renders
- [ ] Setting persists to `people.mobile_preference`
- [ ] Cross-device sync works: setting `desktop` on iPad → phone respects it on next login
- [ ] localStorage override still works on individual devices (per-device escape)

### Phase 5: Migration

- [ ] Migration 180 applied cleanly to production
- [ ] `publisher_approvals` view returns correct rows for Hayley
- [ ] `publisher_approvals` view returns empty (or correct subset) for non-publishers
- [ ] No FK or constraint violations during migration

---

## Out of scope

- Mobile shell for Editorial roles (Camille, future Content Editors). Deferred — desktop-only for v1.
- Mobile shell for Layout/Ad Designers. Their work is desktop-bound; no mobile experience planned.
- Mobile shell for Office Administrator (Cami). Could be useful for ticket triage on the go — defer to a follow-up if requested.
- Contractor portal (`/contractor`). Tracked separately — placeholder for now.
- Multi-language mobile support.
- Push notifications. Mobile shell uses existing in-app notification system; web push is a separate spec.
- Offline-first mobile (Dexie cache, conflict resolution). Sales mobile noted this as v2; same here. Online-only for v1.
- Tablet-specific layout breakpoints. iPad uses desktop view by default; mobile preference can override.
- Voice input on mobile.
- Biometric auth on mobile (Face ID, Touch ID). Existing Google SSO is sufficient.

---

## Open implementation questions

1. **Threshold for "large contract" approvals.** Spec'd at $5,000. Hayley should confirm — could be higher or lower depending on how often she wants to be in the loop.

2. **Quiet hours implementation.** Where do they live in the existing notification stack? `alert_preferences.quiet_hours_start/end` already exists per the schema — confirm shape and that mobile reads from the same field.

3. **Approve actions need audit log entries.** Migration 170's `activity_log_v2` is the right place — confirm shape of the activity_log row for each approval type. Probably: `actor_id = hayley.id, action = 'publisher_approved', context_type = 'issue_proof'/'sales'/'stories', context_id = item_id`.

4. **PWA manifest reuse.** Sales mobile already has `/mobile-manifest.json`. Publisher mobile needs its own (different name, different icon, different start_url) — `/mobile-publisher-manifest.json`. Confirm the icon set (16/32/180/192/512 sizes) is available.

5. **Pulse tab data freshness.** Does the page need realtime subscriptions (deadlines, team status), or is a 30-second poll fine? Recommendation: 30-second poll for v1, realtime as optimization later.

6. **Approvals notification badge.** Should the bottom tab show a count badge for pending approvals? Yes — pending count from `publisher_approvals` view, refreshed on tab focus. Spec includes it; just calling out for implementer.

7. **Hayley's Editor-in-Chief overlap.** Hayley currently fills both Publisher and Content Editor roles. The redirect maps her to Publisher mobile. But she also has editorial approvals to handle — those flow through the Approvals tab (story_approval items) so it works without special-casing. Confirm post-build.

---

## Build order

### Phase A: Redirect plumbing (no new UI)
1. Create `_shared/usePostAuthRedirect.js`
2. Delete pre-auth phone-width block from `App.jsx`
3. Add `usePostAuthRedirect()` call inside App component
4. Reorganize existing `/mobile` files into `sales/` subfolder
5. Update imports and route branching in `App.jsx`
6. Test: salesperson on phone still goes to `/mobile`; other roles go to `/mobile/not-optimized` (which 404s for now)

### Phase B: Fallback screen
7. Build `MobileNotOptimizedScreen.jsx`
8. Wire `/mobile/not-optimized` route in `App.jsx`
9. Test all non-mobile-shelled roles see the screen
10. Test "Use desktop view" button + "Remember this choice" flow

### Phase C: Schema
11. Write and apply migration 180
12. Test `publisher_approvals` view returns correct data

### Phase D: Publisher mobile shell skeleton
13. `PublisherMobileApp.jsx` with bottom nav and 5 tab stubs
14. `BottomTabBar.jsx` (factored from existing TabBar in sales mobile)
15. Wire `/mobile/publisher` route in `App.jsx`
16. Test: Hayley on phone gets redirected here, sees empty tabs

### Phase E: Tab content (one at a time)
17. Pulse tab: revenue strip → deadlines → team status
18. Urgent tab: system-flagged → manually-pinned
19. Approvals tab: query view → render cards → wire approve actions
20. Me tab: OOO toggle → quiet hours → desktop switch → sign-out
21. Quick Action sheet: 4 actions wired

### Phase F: PWA + polish
22. Publisher manifest + icons
23. Loading states, error boundaries per tab
24. Realtime subscriptions or poll cadence for live data
25. Approvals tab badge count

### Phase G: Settings integration
26. Desktop Settings → Mobile preferences section
27. Cross-device persistence via `people.mobile_preference`

### Phase H: Calibration
28. Walk Hayley through the Publisher mobile shell on her actual phone
29. Iterate based on her feedback (likely affects Approvals + Pulse most)
30. Document the workflow in publisher.md role KB

---

## Notes for implementer

- **The fallback screen is honest, not apologetic.** Don't over-explain or promise features. "This view isn't built yet, here's what you can do" is enough.
- **The Publisher shell is opinionated about what goes in.** When in doubt, leave it out. Hayley's mobile time is for triage, not deep work. If a feature requires more than 2 taps to reach a decision, it belongs on desktop.
- **The Approvals tab is the highest-value feature.** Most of the unique mobile value lives here. Build it last so you've absorbed enough of the Publisher mental model from the other tabs first, but make it the polished one.
- **Deep links from mobile to desktop need care.** When a user taps a deadline on Pulse and lands on desktop, they expect to come back to mobile. Implement: tap → set `localStorage.mydash-return-to-mobile = '/mobile/publisher/pulse'`, navigate to desktop URL with `?desktop=1`. Desktop page reads the flag, shows a "Back to mobile" button. After navigation away, clear the flag.
- **`/contractor` placeholder.** Use the same `MobileNotOptimizedScreen` shape but with copy specific to contractors: "Contractor portal coming soon. For now, email Camille at camille@13stars.media." This will be replaced when the contractor portal spec ships.
- **Don't share state between sales mobile and publisher mobile.** They're different apps that happen to live in the same React tree. Hayley's PublisherMobileApp shouldn't reach into sales-mobile state and vice versa.
- **Test on a real phone, not Chrome DevTools mobile mode.** Touch targets, viewport behavior, iOS Safari quirks (especially address bar collapse and pinch zoom) all matter and devtools won't catch them.