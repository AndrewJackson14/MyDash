# Proposal Wizard — Mobile Shell + Step Polish

> Field reps closing deals in person need to send a proposal from
> the parking lot, on a phone, with one thumb. This spec replaces
> the wizard's desktop chrome with a mobile-shaped shell at <768px
> and tightens each step component to work in single-column. Every
> piece of state, validation, persistence, and the send flow stays
> exactly as is.
>
> Sized for ~1 week of focused work. Three checkpoints.

## What's not changing

These are the load-bearing pieces that already work. **Do not touch them.**

- `useProposalWizard.js` — state, reducer, selectors, autosave
- `proposalWizardConstants.js` — STEP_IDS, STEPS, PHASE_LABELS
- `proposalWizardValidation.js` — `validateStep`, `validateStep7`, `hasAnyPrintFormat`
- `parts/` — AdSizeDefault, DigitalFlightRow, BriefFields, ReferenceAssetUploader (these get small responsive tweaks, not rewrites)
- `ProposalWizard.jsx`'s `performSend`, `handleNext`, `handleBack`, the Sent! confirmation screen, the data load `useEffect`s
- The Gmail send path, signature insert, history append, template rendering
- All `.jsx` files outside the wizard folder

## What's being added

A second shell — `ProposalWizardMobile.jsx` — used at viewport widths under 768px. It reuses every step component and the wizard hook unchanged. The desktop `ProposalWizard.jsx` stays the default at >=768px.

## Architecture

Add a viewport-aware wrapper at the top of `ProposalWizard.jsx`. **Don't fork `ProposalWizard.jsx` — share state, fork only the shell.**

```jsx
// ProposalWizard.jsx — top of file, after imports
import ProposalWizardMobile from "./ProposalWizardMobile";
import useViewport from "./useViewport"; // new hook, see below

export default function ProposalWizard(props) {
  const { isMobile } = useViewport();
  // The hook + send flow live in this component. Both shells render below.
  // If we forked them, autosave would run twice. So: same hook instance,
  // pick the shell at the bottom.
  return isMobile
    ? <ProposalWizardMobile {...props} />
    : <ProposalWizardDesktopShell {...props} />;
}
```

**Implementation note:** the cleanest way to do this without duplicating the 200+ lines of state/send setup is:
1. Extract everything in the existing `ProposalWizard` function from line "Hydrate from existing proposal..." through `performSend` into a new hook `useProposalWizardOrchestration({ ...props })` that returns `{ state, actions, ctx, activeStep, sentScreen, ... }`
2. Rename existing `ProposalWizard` → `ProposalWizardDesktopShell` and have it consume the orchestration hook
3. Build `ProposalWizardMobileShell` that consumes the same hook
4. `ProposalWizard.jsx` becomes a thin viewport-routing component

This is not optional — it's the only way both shells stay in sync as the wizard evolves. Do it first, before any mobile UI work.

## The mobile shell — visual structure

Full-screen takeover. No backdrop blur. No glass on the panel. Plain solid surface (`Z.bg`) with a `--paper` opt-in if v2 has landed.

```
┌──────────────────────────────────────────┐
│  ← Cancel    Step 3 of 7    $4,250 ⌃    │  ← TopBar (sticky, 56px)
├──────────────────────────────────────────┤
│                                          │
│  Pick issues                             │
│  Tap the issues you want to run in.      │
│                                          │
│  [Step content, single column,           │
│   scroll-y, 16px padding]                │
│                                          │
│                                          │
│                                          │
│                                          │
├──────────────────────────────────────────┤
│  Saved · 12s ago                         │  ← SaveStatus row (24px)
├──────────────────────────────────────────┤
│  [Back]              [    Next →    ]    │  ← Footer (sticky, 64px)
└──────────────────────────────────────────┘
```

### TopBar (replaces desktop Header + StepBar)

Sticky, 56px tall, full width:

- **Left**: Cancel button as a chevron-left icon + word "Cancel" (smaller text). Tap opens a confirm sheet ("Discard this draft?") only if the proposal has unsaved meaningful changes; otherwise closes immediately.
- **Center**: Step indicator. Format: `Step 3 of 7 · Issues`. Single line. The step name is the truncating element if the screen is narrow. Tappable — opens the step jump sheet (see "Step jump sheet" below).
- **Right**: Total + summary disclosure caret. Format: `$4,250 ⌃`. Tappable — opens the deal summary sheet from the bottom. The dollar figure live-updates as state changes.

No glass on this bar. Solid `Z.bg` with a 1px bottom hairline (`Z.bd`). Works fine when the iOS address bar collapses because the wrapper is `position: fixed` not `sticky`.

### Step jump sheet (tap step indicator)

Bottom sheet, dismissible by drag-down or backdrop tap. Lists every visible step as a row:

```
1.  ✓  Client & Publications     Client picked, 2 pubs
2.  ✓  Issues                    8 issues across 2 pubs
3.  ✓  Sizes & Flights           ← active
4.     Payment Terms             not started
5.     Brief & Art               not started
6.     Review & Send             not started
```

Tapping a row jumps to that step (only if completed or current — non-completed future steps are disabled). Closes the sheet. Same `clickable = completed || current` rule as desktop.

### Deal summary sheet (tap the total)

Bottom sheet, same pattern. Renders the contents of `WizardSummaryPanel` reflowed for vertical: client → proposal name → publications (each with format hints + summary line) → insertions → print/digital subtotals → grand total → payment timing footnote. Dismissible.

This replaces the right-rail summary panel. It's hidden by default — only one tap away when the rep wants to confirm what they're sending.

### Footer (sticky, 64px tall, safe-area-inset-bottom)

Two zones, full-width buttons:

- **Steps 1–6**: `[Back] [Next →]` — Back is 40% width, Next is 60%. Back disabled on Step 1.
- **Step 7**: `[Save Draft] [Send Now →]` — same 40/60 split. Send Now becomes the primary navy button when `canSend` is true.

The desktop's `[Cancel | Save status | Back+Next]` 3-column grid does not survive on mobile. Cancel moves to the TopBar (where iOS users expect it). Save status moves to its own thin row above the footer (24px tall, only renders when status !== "idle").

Use `padding-bottom: env(safe-area-inset-bottom)` so the buttons don't sit under the iPhone home indicator.

## Step component changes

Each step needs a localized media query pass. None require a fork. The pattern:

```jsx
// Top of each step file, beside the imports:
import { useViewport } from "../useViewport";

// Inside the component:
const { isMobile } = useViewport();
const containerStyle = {
  display: "flex", flexDirection: "column", gap: isMobile ? 12 : 18,
  maxWidth: isMobile ? "none" : 820,
};
```

Per-step polish:

### Step 1 (Client & Publications) — `Step1Client.jsx`

- Two-column grid for Client + Proposal Name → single column on mobile. `gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr"`
- Pub pill row: change `flexWrap: "wrap"` to a horizontal scroll strip on mobile with `overflow-x: auto`, `scroll-snap-type: x mandatory`, and `-webkit-overflow-scrolling: touch`. Pills already have correct sizing.
- Selected pub cards: keep stacked (already work), but the inline Print/Digital toggles overflow at narrow widths. On mobile, drop the toggles below the pub name in a second row inside each card.
- The "Reset to auto" button's `marginLeft: "auto"` causes it to escape narrow rows. Move to its own row below the input on mobile.

### Step 3 (Issues) — `Step3Issues.jsx`

I haven't read it yet but based on the architecture, it's likely a per-pub issue selector. The mobile pass:
- Per-pub sections stack vertically (probably already do)
- Issue grid → 2 columns max on mobile (or 1 if tiles are large)
- Use 44px minimum tap targets — issue tiles likely smaller now
- Read the file first before changing it. Pattern: same `isMobile` hook, same one-column collapse.

### Step 4 (Sizes & Flights) — `Step4SizesAndFlights.jsx` ⚠️ this is the hard one

This is the densest step. The mobile pass:

- **Tab strip (FilterPillStrip with `slider`)**: at 4+ pubs, it overflows. Replace with a horizontal-scrolling chip strip on mobile — the existing FilterPillStrip already supports horizontal scroll if width is constrained, but verify. If not, swap to a native `<select>` on mobile that lists pubs as `Pub Name · P·D` style options.
- **Print + Digital cards stack**: already stack, but `padding: CARD.pad` is too generous on mobile. Reduce to 12px on mobile. The cards are nested inside a step that's already inside a scroll container, so reducing padding gives back ~16px of horizontal real estate.
- **`AdSizeDefault` component**: this lives in `parts/`. I haven't read it but it almost certainly has a select + per-issue override list with horizontal layout. On mobile:
  - Default size picker stays single-row
  - Per-issue override list goes vertical (one row per issue, full width)
  - "Apply to issues below" button moves below the override row, not beside it
- **`DigitalFlightRow`**: same — a row of (product, dates, price) controls horizontally. On mobile each control gets its own line.

Read both `parts/AdSizeDefault.jsx` and `parts/DigitalFlightRow.jsx` before starting. They're the actual mobile bottleneck on Step 4.

### Step 5 (Payment Terms) — `Step5PaymentTerms.jsx`

- TimingCard row (`display: "flex", gap: 8`) at 367px gives each card ~110px. Fine for "Per Issue" / "Monthly" / "Lump Sum" titles but the sub-text ("Pay before each issue") wraps. On mobile, stack the three cards vertically. Each card can be full-width with title + sub on one row.
- ChargeDayPicker stays inline (it's small).
- Cadence pill row (`display: "flex", gap: 6, flexWrap: "wrap"`): already wraps, fine.
- The Sel for delivery contact: already full-width, fine.

### Step 6 (Brief & Art Source) — `Step6BriefAndArtSource.jsx`

- ArtSourceCard row (We Design / Camera Ready): same fix as Step 5's TimingCards — stack vertically on mobile.
- BriefFields: read the file, but textareas should already be full-width.
- ReferenceAssetUploader: this is a file picker. On mobile the upload trigger needs to use `accept="image/*" capture="environment"` so tapping it opens the camera directly — field reps in the parking lot will photograph the client's logo right there. Confirm or add this.

### Step 7 (Review & Send) — `Step7Review.jsx`

This is the second hardest step. The desktop layout is `gridTemplateColumns: "1fr 2fr"` — left is summary, right is send actions + iframe preview. On mobile:

- **Stack to single column**: validation banner → summary → send actions → preview
- **Move the iframe preview behind a "Show preview" disclosure button**: rendering a full proposal HTML iframe inline on a phone is a memory and scroll nightmare. Make it opt-in — tap "Show preview" to expand it, with a fixed `height: 60vh` when shown.
- **RecipientPicker**: contact tiles already wrap, fine. The manual-add `<input> + <Btn>` row stays as-is.
- **Message textarea**: works as-is.
- **Footer Send Now button** (in the wizard chrome, not Step 7 itself) is the action; the per-step "Use the Send Now button at the bottom" footnote is correctly worded for both shells.

## The viewport hook

New file: `src/components/proposal-wizard/useViewport.js`

```js
import { useEffect, useState } from "react";

const MOBILE_MAX = 767; // matches Tailwind's md breakpoint - 1

export default function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1200 : window.innerWidth
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return {
    width,
    isMobile: width <= MOBILE_MAX,
  };
}
```

If MyDash already has a viewport hook elsewhere (check `src/hooks/`), use that instead — don't make a duplicate.

## Glass and motion budget on mobile

Per the v2 direction doc, glass goes on chrome surfaces (sidebar, top bar, popovers, modal backdrops). The wizard panel itself is glass on desktop. **On mobile, drop all glass and backdrop blur from the wizard:**

- `ProposalWizardMobileShell` uses a solid `Z.bg` surface, no `backdropFilter`
- The full-screen wrapper has no backdrop blur — no parent visible behind it anyway
- Bottom sheets (step jump, deal summary) use solid `Z.bg` with a hairline at the top, no glass
- The TopBar can use a subtle hairline + solid background, not glass

This single change fixes the worst of the mobile performance issues. It also fixes the iOS keyboard transition flicker that nested glass panels cause.

Motion stays minimal — bottom sheets slide up over 200ms with the existing `EASE`/`DUR.med` tokens. No staggered reveals. No KPI count-ups (this isn't a dashboard).

## Bottom sheet primitive

If MyDash doesn't already have a bottom sheet component, build one as a small primitive: `src/components/proposal-wizard/chrome/MobileSheet.jsx`.

```jsx
// Props: { open, onClose, title, children, height = "auto" | "60vh" | etc }
// Behavior: slides up from bottom, dismissible by drag-down OR backdrop tap.
// Drag-down threshold: 80px translateY OR velocity > 0.5px/ms.
// Use pointer events, not touch events, for cross-platform drag.
// Handle bar (small grey pill) at top, 36x4px, centered.
// Header (title + close X) below handle.
// Body scrolls if content exceeds height.
// Close on Escape (when keyboard not open).
```

This same primitive serves both the step jump sheet AND the deal summary sheet. Reuse, don't rebuild.

## Tap-target audit

Apple's HIG says 44×44pt minimum. Material says 48×48dp. The wizard has plenty of small buttons that violate this:

- "Reset to auto" button in Step 1: currently `padding: "3px 10px"`. Mobile: minimum 8px vertical, 14px horizontal.
- Charge-day pills (1st / 15th) in Step 5: `padding: "5px 14px"`. Mobile: 10px vertical, 16px horizontal.
- Format toggles in Step 1: `padding: "4px 12px"`. Mobile: 10px vertical.
- Recipient remove `×` buttons in Step 7: tiny. Mobile: at least 28px hit area, even if visually small (use `padding` to expand the hit zone).
- StepBar number badges (22px circles): tappable — bump to 28px on mobile.

Don't bump these everywhere. Use `isMobile` to swap the values. Desktop stays compact.

## Cancel-and-confirm on mobile

The desktop wizard's Backdrop closes the wizard on click-outside. On mobile there's no backdrop to click. The Cancel button must:

1. Check if the proposal has any meaningful state (clientId set, any pubs added, anything beyond the initial proposalName)
2. If yes: open a confirm sheet — "Discard draft? Your work won't be saved as a sent proposal, but a draft is auto-saved." with [Keep editing] [Discard]
3. If no: close immediately

This protects the field rep who taps Cancel by accident. On desktop the same logic should apply (user might Esc-key out by accident), but it's lower-stakes there because the modal is non-destructive.

## What changes in the existing files

Concrete file diff plan:

### Files to add
- `src/components/proposal-wizard/useViewport.js` — or use existing if present
- `src/components/proposal-wizard/ProposalWizardMobile.jsx` — new mobile shell
- `src/components/proposal-wizard/chrome/MobileSheet.jsx` — bottom sheet primitive
- `src/components/proposal-wizard/chrome/MobileTopBar.jsx` — 56px top bar
- `src/components/proposal-wizard/chrome/MobileFooter.jsx` — 64px footer
- `src/components/proposal-wizard/chrome/MobileStepJumpSheet.jsx` — step jump bottom sheet
- `src/components/proposal-wizard/chrome/MobileDealSummarySheet.jsx` — summary bottom sheet

### Files to refactor (architectural)
- `src/components/proposal-wizard/ProposalWizard.jsx` — extract orchestration hook, become viewport router

### Files to extend with `isMobile` branches
- `Step1Client.jsx` — collapse 2-col grid, scroll-snap pub pills, stack format toggles in cards
- `Step3Issues.jsx` — single-column layout (audit before changing)
- `Step4SizesAndFlights.jsx` — pub tab strip, print/digital cards padding, child component handoff
- `Step5PaymentTerms.jsx` — stack TimingCards
- `Step6BriefAndArtSource.jsx` — stack ArtSourceCards, add `capture="environment"` to file inputs
- `Step7Review.jsx` — single-column, preview behind disclosure
- `parts/AdSizeDefault.jsx` — vertical layout for per-issue overrides
- `parts/DigitalFlightRow.jsx` — vertical layout for date/product controls
- `parts/BriefFields.jsx` — verify already mobile-okay (textareas usually are)
- `parts/ReferenceAssetUploader.jsx` — camera capture attribute

## Build order — three checkpoints

### Checkpoint 1 — Architecture extraction (~half day)
1. Extract `useProposalWizardOrchestration` hook from `ProposalWizard.jsx`
2. Rename existing component → `ProposalWizardDesktopShell`
3. Make `ProposalWizard` a thin viewport router that renders the desktop shell only (mobile shell stub returns "Mobile coming soon" placeholder)
4. Verify desktop wizard works identically — same end-to-end send flow, same autosave, same hydration
5. Stop and report. Andrew runs through one full proposal on desktop to confirm no regression.

This checkpoint is the highest-risk, lowest-visibility part of the work. Do it carefully and test thoroughly. Everything after this is additive.

### Checkpoint 2 — Mobile shell + chrome (~2-3 days)
1. Build `useViewport` (or wire existing)
2. Build `MobileSheet` primitive
3. Build `MobileTopBar`, `MobileFooter`, step jump sheet, deal summary sheet
4. Build `ProposalWizardMobileShell` consuming the orchestration hook + the desktop step components unchanged
5. At this point, mobile renders the full wizard with proper chrome but the steps themselves are still desktop-shaped and crammed. That's fine — checkpoint surfaces the chrome, not the polish.
6. Stop and report. Andrew opens it on a phone, navigates all 7 steps, confirms structure works, sees what's broken inside each step.

### Checkpoint 3 — Step polish (~3 days)
Walk Steps 1, 3, 4, 5, 6, 7 in order, applying `isMobile` branches per the per-step guidance above. Steps 4 and 7 are the largest. Commit per step.

After Step 4 lands, stop and report — that's the most architecturally significant step change because it touches `parts/`. Eyeball it on a phone before continuing to Step 5.

After Step 7 lands, the wizard is mobile-complete.

### Final QA pass

- Test on iOS Safari (iPhone 13+, current iOS)
- Test on Android Chrome (recent Pixel or Samsung)
- Test in landscape — should still work, just with more horizontal room
- Test with a real Bluetooth keyboard attached to a phone — Tab/Enter/Esc should work
- Test the iOS keyboard interaction: tap a textarea on Step 7, keyboard pops, footer should stay visible (use `interactiveWidget=resizes-content` if needed in the meta viewport — confirm `index.html` has the right meta).
- Run through one full proposal end-to-end on a phone, send to a real Gmail account, verify it lands.

## What this does NOT include

- **No native app.** This is a responsive web build only.
- **No offline mode.** Field reps need cell signal. (Future feature.)
- **No camera-only photo capture flow.** The `capture="environment"` attribute opens the camera but the Reference Asset upload still uses the existing Bunny Storage path.
- **No swipe-between-steps gesture.** Power users would love it; first cut uses Back/Next buttons only. Tap targets, not swipe gestures, are the priority.
- **No mobile-specific autosave behavior.** Same 2s debounce as desktop.
- **No different validation behavior on mobile.** Same hard-gates and soft-gates as desktop.
- **No PWA install prompt.** Out of scope; can ship later as a global feature.

## Risks

- **Architectural extraction (Checkpoint 1) breaking the desktop wizard.** Mitigation: comprehensive desktop test after extraction, before any mobile work begins.
- **Step 4's `parts/AdSizeDefault` and `parts/DigitalFlightRow` having more complexity than expected.** Mitigation: read those files first; if they're truly entangled, propose a small refactor before adding mobile branches.
- **iOS Safari `position: fixed` + keyboard interactions being unpredictable.** Mitigation: test the keyboard interaction path on a real device early in Checkpoint 2; if `position: fixed` footer is unreliable when the keyboard opens, fall back to non-fixed footer with body scroll.
- **Glass/blur removal on mobile causing visual jank during the desktop ↔ mobile transition** (rotating an iPad, resizing a browser window across the breakpoint). Mitigation: not a real-world workflow; document and move on.
- **Sales reps using older Android devices where the bottom sheet drag-down feels janky.** Mitigation: ensure the backdrop tap dismisses cleanly, so drag-down is a nice-to-have, not load-bearing.
