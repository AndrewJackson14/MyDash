# Proposal Wizard — Build Spec

**Status:** Ready for Claude Code implementation
**Author:** Andrew Jackson, EIC
**Target file replaced:** `src/pages/SalesCRM.jsx` proposal modal block (`propMo` state + `<Modal open={propMo}>` render)
**Date:** 2026-04-25
**Migration baseline:** 159 (next available: **160**)

---

## 1. Goals

1. Replace the dense single-screen proposal modal with a 7-step linear wizard.
2. Decompose ~1,500 lines out of `SalesCRM.jsx` into focused, maintainable files.
3. Adapt naturally to mobile (mobile work happens in a follow-up spec — but the wizard MUST be designed so the only thing that changes for mobile is layout, not data flow).
4. Preserve all existing entry points: `openProposal`, `editProposal`, `openRenewalProposal`, `closePropMo`, `submitProposal`, `sendProposalEmail`, `signProposal`, deep-linking from pipeline cards.
5. Add reference-asset capture tied to `client_id` that auto-tags to the resulting `ad_project_id` on conversion.
6. Auto-save drafts on every state change; resume at the furthest completed step.

---

## 2. Wizard Flow (Final)

The wizard is split into two mental phases that the rep moves through:
┌─────────── DEAL ────────────┐    ┌─────── INTAKE ────────┐
1 Client → 2 Publications →     5 Payment    →    6 Brief & →    7 Review &
3 Issues  → 4 Sizes & Flights   Terms             Art Source     Send
└─────────────────────────────┘    └────────────────────────┘

| # | Step | Required | Conditional | Purpose |
|---|------|----------|-------------|---------|
| 1 | Client | Always | – | Pick or confirm client; auto-generate proposal name |
| 2 | Publications | Always | – | Multi-select pubs; per-pub format toggle (print / digital / both) |
| 3 | Issues | Conditional | At least one pub has print format | Tabbed by pub; quick-pick (3/6/12mo) + per-issue checkboxes |
| 4 | Ad Sizes & Flights | Always | – | Default size + per-issue overrides (print pubs); flight dates + product (digital pubs) |
| 5 | Payment Terms | Always | – | Per Issue / Monthly / Lump Sum + auto-charge day; delivery cadence (digital only) |
| 6 | Brief & Art Source | Always | – | Art source toggle; brief fields (required if We Design); reference asset uploads |
| 7 | Review & Send | Always | – | Pricing confirmation + line breakdown + Save Draft / Next: Send |

**Step 3 is conditional** — proposals with only digital ads skip Step 3 (no issue selection needed), and the stepper visibly contracts to 6 steps.

**The Step 5 → Step 6 transition is the "deal closes, intake begins" pivot.** The Step 6 header is the cue: a single line of copy reading *"Deal locked — let's gather what we need to build the ad."*

---

## 3. File Structure
src/components/proposal-wizard/
├── ProposalWizard.jsx              # Shell: chrome, step routing, footer
├── useProposalWizard.js            # Reducer + auto-save hook
├── proposalWizardConstants.js      # Step definitions, validation rules
├── proposalWizardValidation.js     # Pure validation functions per step
├── steps/
│   ├── Step1Client.jsx
│   ├── Step2Publications.jsx
│   ├── Step3Issues.jsx
│   ├── Step4SizesAndFlights.jsx
│   ├── Step5PaymentTerms.jsx
│   ├── Step6BriefAndArtSource.jsx
│   └── Step7Review.jsx
├── chrome/
│   ├── WizardStepBar.jsx           # Top stepper, clickable for completed steps
│   ├── WizardFooter.jsx            # Cancel / Saved indicator / Back / Next
│   └── WizardSummaryPanel.jsx      # Right-rail running summary
└── parts/
├── PublicationFormatToggle.jsx # Per-pub print/digital/both toggle (Step 2)
├── IssuePicker.jsx             # Quick-pick + checkboxes (Step 3)
├── AdSizeDefault.jsx           # Default size + override toggle (Step 4)
├── DigitalFlightRow.jsx        # Single digital line editor (Step 4)
├── BriefFields.jsx             # Conditional brief inputs (Step 6)
└── ReferenceAssetUploader.jsx  # Drop zone + file list + captions (Step 6)

**Total estimated LOC:** ~1,800. Pulls roughly 1,500 lines out of `SalesCRM.jsx`, replaces them with a ~50-line integration block.

---

## 4. Integration with SalesCRM.jsx

**Remove from `SalesCRM.jsx`:**

- All `prop*` state declarations (lines ~95–180): `propClient`, `propPubs`, `propDigitalLines`, `propPayPlan`, `propPayTiming`, `propChargeDay`, `propArtSource`, `propBrief`, `propStep`, `propName`, `editPropId`, `propAddPubId`, `propExpandedPub`, `propEmailRecipients`, `propEmailMsg`, `propSending`, `propDeliveryCadence`, `propDeliveryContactId`, `propPending`.
- All `prop*` derived values: `totalInsertions`, `autoTier`, `autoTermLabel`, `monthSpan`, `digitalLineItems`, `propLineItems`, `pTotal`, `pMonthly`, `pubSummary`, `propPreviewHtml`.
- All `prop*` handlers: `addPropPub`, `removePropPub`, `togglePropIssue`, `setIssueAdSize`, `applyAdSizeBelow`, `selectIssueRange`, `goToEmailStep`, `toggleRecipient`, `submitProposal`, `sendProposalEmail`, `addDigitalLine`, `removeDigitalLine`, `updateDigitalLine`.
- The entire `<Modal open={propMo}>` JSX block.

**Keep in `SalesCRM.jsx` (with light modifications):**

- `openProposal(clientId)` — now sets a single `wizardOpen` boolean + initial state, instead of resetting individual props.
- `openRenewalProposal(clientId)` — same, plus passes a `mode: 'renewal'` flag.
- `editProposal(propId)` — same, plus passes the existing proposal as initial state.
- `closePropMo()` — renamed to `closeWizard()`; logic preserved (revert pipeline stage if `propPending` was set).
- `signProposal(propId)` — unchanged; still called from the post-send confirmation screen and the proposal detail view.
- `useEffect` pre-populating `propArtSource` from client history — moved into `useProposalWizard` reducer.

**New integration code in `SalesCRM.jsx`:**

```jsx
import ProposalWizard from "../components/proposal-wizard/ProposalWizard";

const [wizardState, setWizardState] = useState(null); // null = closed; object = open
// wizardState shape: { mode: 'new' | 'edit' | 'renewal', clientId, proposalId?, pendingSaleId? }

// Replace openProposal:
const openProposal = (clientId) => {
  setWizardState({ mode: 'new', clientId: clientId || clients[0]?.id });
};
const openRenewalProposal = (clientId) => {
  setWizardState({ mode: 'renewal', clientId });
};
const editProposal = (propId) => {
  const p = proposals.find(x => x.id === propId);
  if (!p) return;
  setWizardState({ mode: 'edit', clientId: p.clientId, proposalId: propId });
};
const closeWizard = () => {
  // Existing propPending revert logic preserved
  if (wizardState?.pendingSaleId) {
    setSales(sl => sl.map(s => s.id === wizardState.pendingSaleId ? { ...s, status: 'Presentation' } : s));
    logActivity('Proposal cancelled — back to Presentation', 'pipeline', /* ... */);
  }
  setWizardState(null);
};

// In render:
{wizardState && (
  <ProposalWizard
    mode={wizardState.mode}
    clientId={wizardState.clientId}
    proposalId={wizardState.proposalId}
    pendingSaleId={wizardState.pendingSaleId}
    clients={clients}
    pubs={pubs}
    issues={issues}
    digitalAdProducts={digitalAdProducts}
    team={props.team}
    currentUser={currentUser}
    proposals={proposals}
    onClose={closeWizard}
    onSent={(propId) => {
      setSales(sl => sl.map(s => s.clientId === wizardState.clientId && (s.status === 'Discovery' || s.status === 'Presentation') ? { ...s, status: 'Proposal' } : s));
      if (wizardState.pendingSaleId) {
        setSales(sl => sl.map(s => s.id === wizardState.pendingSaleId ? { ...s, proposalId: propId, status: 'Proposal' } : s));
      }
      logActivity(`Proposal sent`, 'proposal', wizardState.clientId, cn(wizardState.clientId));
      addNotif(`Proposal sent`);
      setWizardState(null);
    }}
    onSignedFromConfirm={async (propId) => {
      await signProposal(propId);
      setWizardState(null);
    }}
    insertProposal={insertProposal}
    updateProposal={updateProposal}
    loadDigitalAdProducts={loadDigitalAdProducts}
  />
)}
```

---

## 5. State Reducer (`useProposalWizard.js`)

Single reducer manages all wizard state. Replaces ~20 individual `useState` calls.

### State Shape

```js
{
  // Navigation
  currentStep: 1,                      // 1..7
  completedSteps: Set<number>,         // which steps the user has visited and validated
  mode: 'new' | 'edit' | 'renewal',
  proposalId: string | null,           // set when editing or after first auto-save

  // Step 1 — Client
  clientId: string,
  proposalName: string,

  // Step 2 — Publications
  pubs: [
    { pubId: string, formats: { print: boolean, digital: boolean } }
  ],

  // Step 3 — Issues (only for pubs with formats.print === true)
  issuesByPub: { [pubId: string]: Array<{ issueId: string, adSizeIdx: number }> },

  // Step 4 — Sizes & Flights
  defaultSizeByPub: { [pubId: string]: number },
  perIssueOverrides: Set<string>,      // Set of `${pubId}:${issueId}` keys
  digitalLines: [
    {
      id: string,
      pubId: string,
      digitalProductId: string,
      flightStartDate: string,
      flightEndDate: string,
      flightMonths: number,
      price: number,
      customPrice: boolean,
    }
  ],

  // Step 5 — Payment Terms
  payTiming: 'per_issue' | 'monthly' | 'lump_sum',
  chargeDay: 1 | 15,
  payPlan: boolean,                    // legacy compat: derived as (payTiming === 'monthly')
  deliveryCadence: 'weekly' | 'monthly' | 'end_of_flight' | 'annual',
  deliveryContactId: string | null,

  // Step 6 — Brief & Art Source
  artSource: 'we_design' | 'camera_ready',
  brief: {
    headline: string,
    style: string,
    colors: string,
    instructions: string,
  },
  referenceAssets: [
    {
      id: string,
      mediaAssetId: string | null,
      fileName: string,
      thumbnailUrl: string,
      caption: string,
      uploadStatus: 'pending' | 'uploading' | 'done' | 'error',
      uploadProgress: number,
    }
  ],

  // Step 7 — Send
  emailRecipients: string[],
  emailMessage: string,

  // Auto-save bookkeeping
  saveStatus: 'idle' | 'saving' | 'saved' | 'error',
  lastSavedAt: ISOString | null,
  isDirty: boolean,
}
```

### Actions

```js
// Navigation
{ type: 'GOTO_STEP', step: number }
{ type: 'NEXT_STEP' }
{ type: 'PREV_STEP' }
{ type: 'MARK_COMPLETED', step: number }

// Step 1
{ type: 'SET_CLIENT', clientId: string }
{ type: 'SET_PROPOSAL_NAME', name: string }

// Step 2
{ type: 'ADD_PUB', pubId: string }
{ type: 'REMOVE_PUB', pubId: string }
{ type: 'TOGGLE_PUB_FORMAT', pubId: string, format: 'print' | 'digital' }

// Step 3
{ type: 'TOGGLE_ISSUE', pubId: string, issueId: string }
{ type: 'SELECT_ISSUE_RANGE', pubId: string, months: 3 | 6 | 12 }
{ type: 'CLEAR_ISSUES_FOR_PUB', pubId: string }

// Step 4
{ type: 'SET_DEFAULT_SIZE', pubId: string, adSizeIdx: number }
{ type: 'SET_ISSUE_SIZE', pubId: string, issueId: string, adSizeIdx: number }
{ type: 'APPLY_SIZE_BELOW', pubId: string, fromIssueId: string, adSizeIdx: number }
{ type: 'ADD_DIGITAL_LINE', pubId: string }
{ type: 'UPDATE_DIGITAL_LINE', id: string, patch: object }
{ type: 'REMOVE_DIGITAL_LINE', id: string }

// Step 5
{ type: 'SET_PAY_TIMING', timing: string }
{ type: 'SET_CHARGE_DAY', day: 1 | 15 }
{ type: 'SET_DELIVERY_CADENCE', cadence: string }
{ type: 'SET_DELIVERY_CONTACT', contactId: string | null }

// Step 6
{ type: 'SET_ART_SOURCE', source: 'we_design' | 'camera_ready' }
{ type: 'SET_BRIEF_FIELD', field: 'headline' | 'style' | 'colors' | 'instructions', value: string }
{ type: 'ADD_REFERENCE_ASSET', asset: object }
{ type: 'UPDATE_REFERENCE_ASSET', id: string, patch: object }
{ type: 'REMOVE_REFERENCE_ASSET', id: string }

// Step 7 (send)
{ type: 'SET_EMAIL_RECIPIENTS', recipients: string[] }
{ type: 'TOGGLE_RECIPIENT', email: string }
{ type: 'SET_EMAIL_MESSAGE', message: string }

// Save
{ type: 'SAVE_START' }
{ type: 'SAVE_SUCCESS', proposalId: string, savedAt: string }
{ type: 'SAVE_ERROR', error: string }
{ type: 'HYDRATE_FROM_PROPOSAL', proposal: object }
{ type: 'HYDRATE_FROM_CLIENT_HISTORY', renewalData: object }
```

### Auto-save Hook Behavior

```js
useEffect(() => {
  if (!state.isDirty) return;
  if (state.currentStep === 7 && state.saveStatus === 'saving') return;
  const timer = setTimeout(async () => {
    dispatch({ type: 'SAVE_START' });
    try {
      const proposalRow = serializeStateToProposalRow(state, 'Draft');
      const result = state.proposalId
        ? await updateProposal(state.proposalId, proposalRow)
        : await insertProposal(proposalRow);
      dispatch({
        type: 'SAVE_SUCCESS',
        proposalId: state.proposalId || result.id,
        savedAt: new Date().toISOString(),
      });
    } catch (err) {
      dispatch({ type: 'SAVE_ERROR', error: err.message });
    }
  }, 2000); // 2s debounce, same as StoryEditor
  return () => clearTimeout(timer);
}, [state.isDirty]);
```

**Critical:** auto-save writes `status: 'Draft'` until the rep explicitly hits "Send" on Step 7.

### Resume Logic

When `mode === 'edit'` or a previously-saved Draft exists:

1. Hydrate state from the proposal row.
2. Run validation on each step.
3. Set `currentStep` to the **first invalid step**, or to Step 7 if all are valid.
4. Mark all valid steps as `completedSteps`.

---

## 6. Validation (`proposalWizardValidation.js`)

Pure functions, one per step. Return `{ valid: boolean, errors: { [field]: string } }`.

```js
export function validateStep1(state) {
  const errors = {};
  if (!state.clientId) errors.clientId = 'Pick a client to continue';
  if (!state.proposalName?.trim()) errors.proposalName = 'Proposal needs a name';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep2(state) {
  const errors = {};
  if (state.pubs.length === 0) errors.pubs = 'Add at least one publication';
  state.pubs.forEach(p => {
    if (!p.formats.print && !p.formats.digital) {
      errors[`pub:${p.pubId}`] = 'Pick print, digital, or both';
    }
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep3(state) {
  const errors = {};
  const printPubs = state.pubs.filter(p => p.formats.print);
  printPubs.forEach(p => {
    const issues = state.issuesByPub[p.pubId] || [];
    if (issues.length === 0) errors[`issues:${p.pubId}`] = 'Pick at least one issue';
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep4(state) {
  const errors = {};
  state.pubs.filter(p => p.formats.print).forEach(p => {
    if (state.defaultSizeByPub[p.pubId] === undefined) {
      errors[`size:${p.pubId}`] = 'Pick a default ad size';
    }
  });
  state.pubs.filter(p => p.formats.digital).forEach(p => {
    const lines = state.digitalLines.filter(d => d.pubId === p.pubId);
    if (lines.length === 0) {
      errors[`digital:${p.pubId}`] = 'Add at least one digital line';
    }
    lines.forEach(line => {
      if (!line.digitalProductId) errors[`digitalProduct:${line.id}`] = 'Pick a product';
      if (!line.flightStartDate) errors[`flightStart:${line.id}`] = 'Set start date';
      if (!line.flightEndDate) errors[`flightEnd:${line.id}`] = 'Set end date';
    });
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep5(state) {
  const errors = {};
  if (!['per_issue', 'monthly', 'lump_sum'].includes(state.payTiming)) {
    errors.payTiming = 'Pick a payment timing';
  }
  if (state.payTiming === 'monthly' && ![1, 15].includes(state.chargeDay)) {
    errors.chargeDay = 'Pick a charge day';
  }
  if (state.digitalLines.length > 0) {
    if (!['weekly', 'monthly', 'end_of_flight', 'annual'].includes(state.deliveryCadence)) {
      errors.deliveryCadence = 'Pick a delivery report cadence';
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep6(state) {
  const errors = {};
  if (!['we_design', 'camera_ready'].includes(state.artSource)) {
    errors.artSource = 'Pick an art source';
  }
  if (state.artSource === 'we_design') {
    if (!state.brief.headline?.trim()) errors.headline = 'Headline required for We Design';
    if (!state.brief.style?.trim()) errors.style = 'Style required for We Design';
    if (!state.brief.colors?.trim()) errors.colors = 'Colors required for We Design';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep7(state) {
  const all = [
    { step: 1, ...validateStep1(state) },
    { step: 2, ...validateStep2(state) },
    ...(hasAnyPrintFormat(state) ? [{ step: 3, ...validateStep3(state) }] : []),
    { step: 4, ...validateStep4(state) },
    { step: 5, ...validateStep5(state) },
    { step: 6, ...validateStep6(state) },
  ];
  const allErrors = all.flatMap(s =>
    Object.entries(s.errors).map(([field, msg]) => ({ step: s.step, field, msg }))
  );
  return { valid: allErrors.length === 0, errors: allErrors };
}

export function hasAnyPrintFormat(state) {
  return state.pubs.some(p => p.formats.print);
}
```

**Soft validation rule:** the wizard does NOT block forward progress on steps 1–6. Errors highlight inline but Next is always enabled. Step 7 is the one place where errors hard-block: the Send button is disabled until Step 7 validation passes.

**Step bar click behavior:** the rep can jump to any *completed* step (in `completedSteps`) at any time. They can NOT skip forward to uncompleted steps via the step bar — only via the Next button.

---

## 7. Wizard Chrome

### `WizardStepBar.jsx`

Top of wizard. Horizontal bar with 7 (or 6, if no print) numbered + labeled steps. Each segment:

- **Completed:** filled green check icon, clickable, hover highlights.
- **Current:** filled accent color, label bolded.
- **Future:** outlined gray, not clickable, label muted.

Visual treatment of the **DEAL → INTAKE pivot** between steps 5 and 6: a subtle 2px vertical divider line in the step bar, with "DEAL" label above steps 1–5 and "INTAKE" label above steps 6–7. Use `Z.tm` color, 10px font-size, uppercase, letter-spacing 0.5.

### `WizardFooter.jsx`

Fixed bottom of wizard. Three zones:

- **Left:** `Cancel` button (calls `onClose`)
- **Center:** save status indicator
  - `'idle'` → empty
  - `'saving'` → "Saving…" with spinner
  - `'saved'` → "Saved · {fmtTimeRelative(lastSavedAt)}"
  - `'error'` → "Save failed — retrying" in `Z.da` red
- **Right:** `Back` button (disabled on Step 1) + `Next` button (Step 1–6) OR `Save Draft` + `Send →` on Step 7

The `Next` button text on Step 6 reads `Review →` to set expectations.

### `WizardSummaryPanel.jsx` — Right Rail

Always-visible 280px panel on the right of the wizard. Shows the deal forming in real time. Sticky positioning.
┌────────────────────────────┐
│ DEAL SUMMARY               │
├────────────────────────────┤
│ Client                     │
│ {clientName}               │
│                            │
│ Publications · {n}         │
│ • Paso Robles Press        │
│   12 print issues          │
│ • Atascadero News          │
│   Digital · Leaderboard    │
│                            │
│ Insertions · {n}           │
│ Tier: {autoTermLabel}      │
│                            │
│ ─────────────────────      │
│ Print subtotal    $X,XXX   │
│ Digital subtotal  $X,XXX   │
│ ─────────────────────      │
│ TOTAL             $X,XXX   │
│                            │
│ {paymentTermsLabel}        │
└────────────────────────────┘

Updates live as state changes. On Step 7 the panel collapses into the main content area.

---

## 8. Step-by-Step UX

### Step 1 — Client
[ Client Picker ─────────────── ]   ← FuzzyPicker, existing component
[ Proposal Name ─────────────── ]   ← Auto: "{clientName} — Proposal {date}"

**Renewal mode behavior:** state hydrates from prior closed sales; the wizard auto-advances to Step 4 since 1–3 are pre-filled. Step bar shows steps 1–3 as completed.

### Step 2 — Publications
[ Add Publication ▾ ]  [ + Add ]
┌──────────────────────────────────────────┐
│ Paso Robles Press                    [×] │
│ Format: [✓ Print]  [  Digital]           │
└──────────────────────────────────────────┘

Format toggles are pill buttons. At least one must be selected per pub.

### Step 3 — Issues (skipped if no print pubs)

Tabbed interface, one tab per print pub. Within each tab:
[ 3 mo ] [ 6 mo ] [ 12 mo ] [ Clear ]
May 2026  Jun 2026  Jul 2026  Aug 2026
✓        ✓         ✓         ✗
Sep 2026  Oct 2026  Nov 2026  Dec 2026
✓        ✓         ✗         ✗
Selected: 6 issues

### Step 4 — Ad Sizes & Flights

Tabbed by pub. **Print pubs:**
Default Ad Size for Paso Robles Press
[ Quarter Page ▾ ]
[ ▸ Customize per issue (0 of 6 changed) ]
May 2026     [ Quarter Page ▾ ]  [↓ Apply below]
Jun 2026     [ Quarter Page ▾ ]  [↓]
...

**Digital pubs:**
┌──────────────────────────────────────────────────────────┐
│ Product:  [ Leaderboard ▾ ]                              │
│ Flight:   [ 2026-05-01 ] → [ 2026-10-31 ]  ( 6 mo )      │
│ Price:    [ $1,800 ]  ($300/mo × 6mo, 6mo tier)       [×]│
└──────────────────────────────────────────────────────────┘
[ + Add Digital Line ]

### Step 5 — Payment Terms
Payment Timing
┌─────────────┬─────────────┬──────────────┐
│ Per Issue   │ Monthly     │ Lump Sum     │
│ Pay before  │ {n}mo ×     │ Full $X,XXX  │
│ each issue  │ ${monthly}  │ before first │
│             │             │ issue        │
└─────────────┴─────────────┴──────────────┘
[Monthly selected:]
Auto-charge on the [ 1st ▾ ] of each month
[Only if any digital lines:]
Delivery Reports
Cadence: [Weekly] [Monthly] [End of flight] [Annual]
Send to: [ Contact dropdown ▾ ]

### Step 6 — Brief & Art Source

Single screen. Header: *"Deal locked — let's gather what we need to build the ad."*
Art Source
┌────────────────────┬────────────────────┐
│ ✓ We Design        │   Camera Ready     │
│ Our team builds it │ Client provides    │
└────────────────────┴────────────────────┘
[Conditional, We Design only:]
Creative Brief — Required
Headline / CTA *
Style Direction *
Brand Colors *
Special Instructions (optional)
──────────────────────────────────────
Reference Materials
Storefront photos, logos, reference ads — anything Jen
should see. Skip if you have nothing yet.
┌────────────────────────────────────────────────┐
│  Drag files here or [ Upload Photos ]          │
│  Accepted: JPG, PNG, HEIC, WebP, GIF, PDF,     │
│  AI, EPS, SVG, PSD · 25 MB max per file        │
└────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│ [thumb] storefront.jpg                           │
│         Caption: [ Storefront ___________ ]  [×] │
└──────────────────────────────────────────────────┘

**Reference asset behavior:**

- Drop zone accepts multi-file. On select, each file:
  1. Immediately appears in the list with `uploadStatus: 'uploading'` and a spinner.
  2. Calls `uploadMedia(file, { clientId, category: 'proposal_intake', uploadedBy: currentUser.id })`.
  3. On success, updates the entry with `mediaAssetId` and the returned `thumbnail_url`.
  4. On error, shows a retry button.
- Smart placeholder captions:
  - First file uploaded: "Storefront"
  - Files with `logo` in filename: "Logo"
  - Files with `interior`/`inside`: "Interior"
  - Files with `menu`/`merch`/`product`: title-cased filename keyword
  - Otherwise: empty placeholder.
- Files persist in `media_assets` immediately; if rep abandons, assets remain on the client (tagged `category: 'proposal_intake'`).
- File type allowlist (client-side):
  - Images: `image/jpeg`, `image/png`, `image/heic`, `image/heif`, `image/webp`, `image/gif`, `image/svg+xml`
  - Documents: `application/pdf`, `application/postscript` (AI/EPS), `image/vnd.adobe.photoshop`
  - Reject everything else.
- File size cap: **25 MB** per file.
- Desktop-only: hide the explicit "Take Photo" button — show only "Upload Photos" with drag-drop. (Mobile spec adds camera capture later.)

### Step 7 — Review & Send

Two-column layout (no right-rail summary on this step).

**Left column: Summary + validation**
Review
[If errors:]
⚠ 2 items need attention before sending:
• Step 4: Pick a default ad size for Paso Robles Press [Fix →]
• Step 6: Headline required for We Design       [Fix →]
[If no errors:]
✓ Everything checks out. Ready to send.
Client: Conejo Hardwoods
Proposal Name: Conejo Hardwoods — Proposal 4/25/26
Publications:
• Paso Robles Press — 12 print issues
• Atascadero News — Digital Leaderboard (6mo flight)
Pricing Tier: 12-month commitment ($120 rate)
[Per-pub line breakdown, expandable accordion per pub]
Payment: Monthly · $1,200 × 6mo · auto-charge on the 1st
Art Source: We Design · Brief complete · 3 reference photos
Total: $7,200

**Right column: Send actions**
┌────────────────────────────────────────┐
│ Send Proposal                          │
├────────────────────────────────────────┤
│ Recipients:                            │
│ [✓] Maria Lopez maria@conejo.com     │
│ [ ] Jen Park jen@conejo.com          │
│ [ + Add another email ]                │
│                                        │
│ Message: [textarea]                    │
│                                        │
│ [ Save Draft ]  [ Send Now → ]         │
│ [ Save as Gmail Draft ]                │
└────────────────────────────────────────┘
[Below: live preview iframe]

**Send flow** (preserves existing logic from `sendProposalEmail`):

1. Save proposal with `status: 'Sent'`, `sentAt: now`, `sentTo: recipients`.
2. Create `proposal_signatures` row with `proposal_snapshot` and `access_token`.
3. Build `signLink = ${origin}/sign/${access_token}`.
4. Call `generateProposalHtml(...)` with template config.
5. Call `sendGmailEmail({ ... mode: 'send' | 'draft' })`.
6. On success → flip wizard to "Sent!" confirmation panel:
   - `Client Signed → Convert to Contract` (calls existing `signProposal(propId)`)
   - `Close`

---

## 9. Schema Changes (Migration 160)

```sql
-- Migration 160: proposal wizard reference assets + workflow flags
--
-- Reference assets are uploaded during the proposal wizard's Brief step
-- (Step 6) and tag with category='proposal_intake'. On contract conversion,
-- these assets get re-tagged with the new ad_project_id so they
-- automatically appear in the designer's queue.

COMMENT ON COLUMN media_assets.category IS 'general | obituary | story | ad_brief | proposal_intake | tearsheet | etc.';

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS source_proposal_id uuid
  REFERENCES proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_assets_source_proposal
  ON media_assets(source_proposal_id)
  WHERE source_proposal_id IS NOT NULL;

-- Patch convert_proposal_to_contract to re-tag intake assets to the new
-- ad_project_id(s). When a proposal converts, all media_assets with
-- source_proposal_id = that proposal get ad_project_id stamped with the
-- first created ad_project for the resulting contract.
--
-- This block goes inside the existing convert_proposal_to_contract RPC,
-- after the ad_projects rows are created. Pseudocode:
--
-- v_first_ad_project_id := (
--   SELECT id FROM ad_projects
--   WHERE source_contract_id = v_new_contract_id
--   ORDER BY created_at ASC LIMIT 1
-- );
-- IF v_first_ad_project_id IS NOT NULL THEN
--   UPDATE media_assets
--      SET ad_project_id = v_first_ad_project_id
--    WHERE source_proposal_id = p_proposal_id
--      AND ad_project_id IS NULL;
-- END IF;
```

**Existing schema reused (no changes needed):**

- `proposals.brief_headline`, `brief_style`, `brief_colors`, `brief_instructions` (Migration 038)
- `proposals.art_source` (existing)
- `proposals.pay_timing`, `pay_plan`, `charge_day` (existing)
- `proposals.delivery_report_cadence`, `delivery_report_contact_id` (existing)
- `media_assets.client_id`, `ad_project_id`, `category`, `tags`, `caption`, `notes` (existing)
- `convert_proposal_to_contract` RPC (existing — needs the patch above)

---

## 10. Existing Code Touchpoints

| Existing | Action | Notes |
|----------|--------|-------|
| `src/lib/media.js` `uploadMedia()` | Use as-is | Pass `{ clientId, category: 'proposal_intake', uploadedBy }` |
| `src/lib/proposalTemplate.js` `generateProposalHtml`, `DEFAULT_PROPOSAL_CONFIG` | Use as-is | Step 7 preview iframe + send |
| `src/lib/gmail.js` `sendGmailEmail`, `initiateGmailAuth` | Use as-is | Step 7 send action |
| `src/lib/contractTemplate.js`, `invoiceTemplate.js` | Use as-is | Triggered by `signProposal` |
| `src/components/ui` (Modal, Btn, Inp, Sel, FuzzyPicker, GlassCard, etc.) | Use as-is | All chrome reuses existing |
| `src/components/AssetPanel.jsx` | Reference only | Build `ReferenceAssetUploader.jsx` from scratch but mirror upload pattern |
| `src/pages/sales/constants.js` `getAutoTier`, `getAutoTermLabel` | Use as-is | Pricing tier in derived selectors |
| `src/pages/SalesCRM.jsx` `convertProposal` | Use as-is | Migration 160 patches the RPC; client unchanged |
| `src/hooks/useAppData.js` | No changes | All proposal data flows through existing selectors |

---

## 11. Validation & Acceptance Criteria

The wizard ships when:

1. **Functional parity** — every action possible in the current modal works:
   - [ ] Create new proposal from `openProposal(clientId)`
   - [ ] Edit existing draft via `editProposal(propId)`
   - [ ] Renewal pre-fill via `openRenewalProposal(clientId)`
   - [ ] Multi-publication proposals (≥ 2 pubs)
   - [ ] Mixed print + digital proposals
   - [ ] Digital-only proposals (skip Step 3)
   - [ ] All three payment timing modes
   - [ ] Brief required for We Design
   - [ ] Camera Ready bypasses brief
   - [ ] Send proposal email
   - [ ] Save Gmail draft
   - [ ] Save as Draft (auto-save) and resume
   - [ ] Cancel mid-wizard reverts pipeline stage if `pendingSaleId` was set
2. **New capability** — reference asset upload:
   - [ ] Single file upload
   - [ ] Multiple files at once
   - [ ] Drag-drop on desktop
   - [ ] HEIC files from iPhone process correctly
   - [ ] Rejected file types show clear error
   - [ ] >25MB files rejected
   - [ ] Smart placeholder captions populate correctly
   - [ ] Captions editable and persist
   - [ ] Delete removes from `media_assets`
   - [ ] Assets visible in client profile under "Proposal Intake" category after wizard close
   - [ ] After conversion, assets visible in resulting Ad Project's asset panel
3. **Auto-save** —
   - [ ] Saves silently after 2s of inactivity
   - [ ] "Saved · Xs ago" indicator updates correctly
   - [ ] Save errors retry up to 3× before surfacing
   - [ ] Network blip mid-save doesn't lose data
4. **Validation** —
   - [ ] Soft validation per step (errors visible, Next not blocked)
   - [ ] Hard validation on Step 7 (Send blocked until errors clear)
   - [ ] "Fix in Step X" links jump to right step with right field focused
5. **Performance** —
   - [ ] Wizard opens in <300ms
   - [ ] Step transitions feel instant (<50ms)
   - [ ] Right-rail summary updates without lag while typing
   - [ ] Image compression happens off main thread
6. **Mobile-readiness** (for follow-up spec, not this build):
   - [ ] All step components accept a `layout="mobile" | "desktop"` prop
   - [ ] Right-rail summary panel hides on mobile (max-width: 900px)
   - [ ] Reference asset uploader has a `showCameraButton` prop (false on desktop)

---

## 12. Implementation Order

1. **Migration 160** — schema + RPC patch (10 min, low risk)
2. **`useProposalWizard.js`** + **`proposalWizardConstants.js`** + **`proposalWizardValidation.js`** — pure logic (90 min)
3. **Wizard chrome** (`ProposalWizard.jsx` + `WizardStepBar` + `WizardFooter` + `WizardSummaryPanel`) — visible scaffold (60 min)
4. **Step 1** (Client) (30 min)
5. **Step 2** (Publications) (45 min)
6. **Step 3** (Issues) (60 min)
7. **Step 4** (Sizes & Flights) (90 min)
8. **Step 5** (Payment Terms) (45 min)
9. **Step 6** (Brief & Art Source) — port brief; **build new `ReferenceAssetUploader`** (90 min)
10. **Step 7** (Review & Send) (90 min)
11. **Integration** — replace SalesCRM.jsx modal block; wire entry points; smoke-test (60 min)
12. **Acceptance pass** — Section 11 checklist (45 min)

**Total estimated build time:** ~12 hours.

---

## 13. Out of Scope (followup specs)

- Mobile responsive rebuild
- Multi-user concurrent editing of the same draft
- Proposal templates / saved snippets
- Inline rate negotiation
- E-signature inline within wizard
- Bulk proposal creation across multiple clients
- Mobile camera capture

---

## 14. Open Questions for Andrew

None — spec is locked. Begin with Migration 160 + `useProposalWizard.js`.