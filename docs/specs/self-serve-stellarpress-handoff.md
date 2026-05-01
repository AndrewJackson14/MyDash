# Self-Serve → Proposal — StellarPress Phase 4 Handoff

**Audience:** the StellarPress repo agent.
**Purpose:** repoint the self-serve flow from `ad_bookings` to `proposals`. MyDash side is shipped (Phases 1–3); this is the StellarPress-side counterpart.
**Last verified against MyDash:** 2026-05-01.

---

## What changed in MyDash

The parallel `ad_bookings` intake pipeline is being deleted. New self-serve cart submissions land directly in `proposals` as `Awaiting Review` drafts. Reps work them in the existing Sales CRM — no separate Booking Queue.

You don't have to do data migration on your side. Three RPC calls and one page rewrite.

---

## Critical: RLS gap for the new status page

**Read this first.** The proposals table currently has no anon-readable policy. The new `ProposalStatusPage` needs to read a single proposal by `self_serve_token`. Two options:

- **(Recommended) Use a token-gated RPC** — MyDash will add `get_self_serve_proposal(p_token UUID) RETURNS JSONB`. SECURITY DEFINER, anon-callable, returns only safe fields (status, line items, totals, decline reason if any). **This RPC does not exist yet.** Confirm with Nic before building the status page; he'll ship it after this handoff lands.
- **(Not recommended) Add a row-level RLS policy** that lets anon SELECT proposals where `self_serve_token = <header value>`. Harder to audit, exposes more columns than needed.

Until the RPC is in, the status page can be stubbed to read `localStorage.lastProposal` (the submit RPC's return value).

---

## 1. Submit — replace `submit_self_serve_booking` with `submit_self_serve_proposal`

### Before
```js
const { data, error } = await supabase.rpc('submit_self_serve_booking', {
  p_site_id:           siteId,
  p_existing_client_id: clientId,        // null for new
  p_new_client:         newClientPayload, // null for existing
  p_billing_zip:        billingZip,
  p_booked_by_email:    intakeEmail,
  p_line_items:         lineItems,
  p_creative_notes:     creativeNotes,
})
// returns: { booking_id, share_token, totals }
```

### After
```js
const { data, error } = await supabase.rpc('submit_self_serve_proposal', {
  p_site_id:            siteId,
  p_existing_client_id: clientId,
  p_new_client:         newClientPayload,
  p_billing_zip:        billingZip,
  p_intake_email:       intakeEmail,     // renamed from p_booked_by_email
  p_line_items:         lineItems,
  p_creative_notes:     creativeNotes,
})
// returns: { proposal_id, self_serve_token }
```

### Payload shapes (unchanged)

```js
// p_new_client (when creating a new advertiser)
{
  business_name: 'ACME Plumbing',
  primary_email: 'jdoe@acmeplumbing.com',
  phone:         '(805) 555-1212',  // optional
  industry_id:   '<uuid>',          // optional, FK to industries
}

// p_line_items
[
  {
    product_id:     '<uuid>',        // FK to digital_ad_products
    quantity:       3,                // months
    run_start_date: '2026-05-01',    // optional but recommended
    run_end_date:   '2026-07-31',    // optional but recommended
  },
  // ...
]
```

### Redirect
```js
// Before
navigate(`/advertise/self-serve/booking/${data.share_token}`)

// After
navigate(`/advertise/self-serve/proposal/${data.self_serve_token}`)
```

---

## 2. Identify step — replace the broken `resolve-advertiser` edge function

The edge function at `<SUPABASE_URL>/functions/v1/resolve-advertiser` references tables that don't exist in MyDash (`advertisers`, `advertiser_contacts`). It's been silently returning `tier='none'` for every call. Replace with the new RPC.

### Before
```js
const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-advertiser`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
  body:    JSON.stringify({ email, site_id: siteId }),
})
const { tier, advertiser_id, business_name, requires_confirmation } = await res.json()
```

### After
```js
const { data, error } = await supabase.rpc('resolve_advertiser_tier', {
  p_email:   email,
  p_site_id: siteId,
})
// returns: { tier, client_id, business_name, requires_confirmation }
```

**Field rename:** `advertiser_id` → `client_id`. (MyDash never had an `advertisers` table — `clients` was always the truth. The edge function was vestigial.) Update wherever StellarPress reads the response.

**Tier semantics unchanged:**
- `exact` — email is on a client_contacts row → bind directly to that client_id, no confirmation prompt.
- `domain` — email's business domain matches an existing client's contact email domain (free-mail providers skipped) → show the "Are you with X?" confirmation step using `business_name`.
- `none` — unknown → collect new advertiser form (business_name, industry_id, phone, billing_zip).

**No rate limiting** in the new RPC (the edge function had IP-window limiting via `resolve_advertiser_log`). Re-add server-side if abuse appears; for now, rely on Supabase's default RPC throttling.

---

## 3. Browse & Book pricing — keep `calculate_booking_totals` for now

The old RPC `calculate_booking_totals(p_site_id, p_client_id, p_billing_zip, p_line_items)` is still installed and still works. Its output is in cents. **Keep using it through Phase 4** — we'll cut over to `calculate_proposal_totals_for_self_serve` (dollar units) at Phase 6 cleanup, in lockstep with deleting the booking RPC.

If you want to switch early to dollars, the new RPC has the same args and returns the same shape minus `_cents` suffixes:

```
{ subtotal, markup_applied, markup_percent, markup_amount,
  discount_applied, discount_percent, discount_amount, total,
  line_items: [{ product_id, name, quantity, unit_price, line_total }],
  applied_rule: 'markup'|'local_discount'|'none' }
```

---

## 4. `BookingStatusPage.jsx` → `ProposalStatusPage.jsx`

Full rewrite. New route `/advertise/self-serve/proposal/:token`. Reads `proposals` row by `self_serve_token`. Renders based on status.

### Status → UI table

| Status                | UI                                                                                  |
|-----------------------|-------------------------------------------------------------------------------------|
| `Awaiting Review`     | "Submitted — a rep will review shortly. You can still edit." Show line items + total + "Resume editing" button (links back to `/advertise/self-serve` with cart prefilled from this proposal's lines). |
| `Under Review`        | Same as Awaiting Review but read-only — rep is actively working. "A rep is finalizing your proposal." |
| `Sent`                | "Your proposal is ready." Show line items + total + **View & Sign** button linking to `data.signing_url` (the RPC returns `https://mydash.media/sign/<access_token>` when an unsigned, unexpired `proposal_signatures` row exists; null otherwise — fall back to "watch for the email" copy). |
| `Approved/Signed`     | "Signed. Watch your email for the Ad Project portal — that's where you'll upload creative." |
| `Signed & Converted`  | Same as Approved/Signed — converted to contract, Ad Project should already exist.    |
| `Declined`            | "Not accepted." Show the rep's reason from `notes`. No further actions.              |
| `Cancelled`           | "Cancelled." Same treatment as Declined.                                             |

### What goes away

- **Pre-conversion creative upload.** The booking-status page used to show a creative-upload UI before the rep approved. That moves to the post-conversion Ad Project portal — same path every managed sale uses. Drop the upload component entirely from this page.
- **`creative_status` state machine.** No longer surfaced. Creative state lives on Ad Projects after conversion.
- **`get_booking_by_share_token` / `attach_creative_to_booking`** RPCs. Don't call them.

### Resume-edit flow

When the customer clicks "Resume editing" on an `Awaiting Review` proposal:

1. ProposalStatusPage stashes a payload in `localStorage` under the key
   `sp:resumeProposal` and navigates to `/advertise/self-serve`. Payload shape:

   ```js
   {
     proposal_id:      '<uuid>',
     self_serve_token: '<uuid>',
     intake_email:     'jdoe@acmeplumbing.com',
     billing_zip:      '93446',
     creative_notes:   'Headline: Spring Sale...',
     lines: [
       { digital_product_id: '<uuid>', flight_start_date: '2026-05-01', flight_end_date: '2026-07-31' },
       // ...
     ],
   }
   ```

2. SelfServePage on mount: read the payload, pre-fill `email` / `billingZip` /
   `creativeNotes`, set internal `editingProposal = { proposal_id, self_serve_token }`,
   skip identify + businessDetails (the proposal already has a `client_id`),
   jump straight to the catalog step. Clear localStorage immediately so a refresh
   doesn't re-trigger.

3. After the catalog finishes loading, hydrate the cart by matching
   `lines[].digital_product_id` against the live `digital_ad_products` rows.
   Lines whose product is no longer active are silently dropped — the user
   can re-add or contact a rep.

4. On submit, dispatch to `update_self_serve_proposal` (NOT `submit_self_serve_proposal`):

   ```js
   await supabase.rpc('update_self_serve_proposal', {
     p_proposal_id:      editingProposal.proposal_id,
     p_self_serve_token: editingProposal.self_serve_token,
     p_line_items:       lineItems,         // same shape as submit
     p_creative_notes:   creativeNotes,
   })
   // returns: { proposal_id, self_serve_token }   (same shape as submit)
   ```

   The server validates the token matches the proposal AND the proposal is still
   `Awaiting Review`, then atomically deletes existing `proposal_lines`, inserts
   the new ones, and recomputes/persists pricing on the proposals row.

   `billing_zip`, `intake_email`, and the `client_id` are not mutable via this
   RPC — they're locked at first-submit time. If the customer needs to change
   those, they call the rep.

5. **Errors to handle:**
   - `not_editable` — a rep has moved the proposal off `Awaiting Review` since
     the page was loaded. The customer's edits are dropped (intended). UI
     should reload the proposal and show the new status.
   - `token_mismatch` — somebody tampered with the URL or localStorage. Treat
     as auth failure.
   - `proposal_not_found` — proposal was deleted. Show the "not found" state.
   - `missing_required_fields` — empty cart. UI prevents submit when cart is
     empty already, so this should never fire from a real client.

---

## 5. Routing — keep the old URL alive for 90 days

```js
// Old URL pattern: /advertise/self-serve/booking/:token
// New URL pattern: /advertise/self-serve/proposal/:token

// Add a redirect:
{
  path: '/advertise/self-serve/booking/:token',
  element: <Navigate to={`/advertise/self-serve/proposal/${useParams().token}`} replace />,
}
```

Email links sent before the cutover use the old URL. 90 days covers most reissue cycles; sweep this redirect after that.

---

## 6. `AdvertisePage.jsx` — no change

The Talk-to-a-Rep flow continues to write to `ad_inquiries`. Nothing on this page moves.

---

## Acceptance criteria

- [ ] Self-serve submission end-to-end: identify → catalog → review → submit creates a row in `proposals` with `source='self_serve'`, `status='Awaiting Review'`, `self_serve_token` populated, and the customer lands on `/advertise/self-serve/proposal/{token}`.
- [ ] Tier 1/2/3 resolution from `resolve_advertiser_tier` maps the same way as before (existing client → bind; domain match → confirm; none → new lead).
- [ ] `ProposalStatusPage` renders correctly for each status; resume-editing works; declined reason displays.
- [ ] Old `/advertise/self-serve/booking/:token` URLs redirect to the new path.
- [ ] No remaining call sites for `submit_self_serve_booking`, `attach_creative_to_booking`, `get_booking_by_share_token`, or the `resolve-advertiser` edge function (grep confirms).
- [ ] `AdvertisePage` (Talk-to-a-Rep) untouched and still works — submits to `ad_inquiries`.

---

## Open items needing MyDash-side action

Resolved since the original handoff:

- ~~`get_self_serve_proposal(p_token UUID)` RPC~~ — **shipped.** Returns proposal
  metadata + lines (with `digital_product_id`) + `signing_url` (when an unsigned,
  unexpired `proposal_signatures` row exists for the proposal). Token-gated,
  anon-callable, `SECURITY DEFINER`.
- ~~Resume-edit submit semantics~~ — **resolved.** `update_self_serve_proposal(p_proposal_id, p_self_serve_token, p_line_items, p_creative_notes)` is live and token-gated. Errors: `not_editable`, `token_mismatch`, `proposal_not_found`, `missing_required_fields`. See the Resume-edit flow section above.

Still open:

1. **Decline-reason email template** — the spec called for the rep's decline reason to be emailed to the advertiser via "existing template." That email path doesn't exist today. The Decline action in MyDash writes the reason to `proposals.notes`; the email side is unbuilt. Out of scope for Phase 4, but flag for Phase 5/6 cleanup planning.

---

## Build order

### Discovery
1. Confirm StellarPress's current submit-RPC call sites and identify-step edge function calls. Match the new shape.
2. Check whether StellarPress reads `share_token` anywhere outside the booking-status path.

### Implementation
3. Update `SelfServePage` submit handler to call `submit_self_serve_proposal`. Update redirect URL.
4. Update identify step to call `resolve_advertiser_tier` RPC. Rename `advertiser_id` → `client_id` in callers.
5. Add `/advertise/self-serve/booking/:token` → `/advertise/self-serve/proposal/:token` redirect.
6. Build `ProposalStatusPage` against `get_self_serve_proposal`. Wire `data.signing_url` for Sent and the localStorage-based resume-edit handoff for Awaiting Review per the status table + Resume-edit flow section.
7. Delete `BookingStatusPage.jsx` after the rewrite is verified.
8. End-to-end test: synthetic submission → verify in MyDash that proposal appears in Sales CRM with 🛒 badge and Awaiting Review banner. Then click Resume editing on that submission, change a line, re-submit → confirm the same proposal updates in place (no second row).

### Cleanup (after Phase 4 ships)
10. Remove dead references: legacy `share_token` usage, edge-function fetch helpers, creative-upload components from booking page.

---

## Things NOT to do

- Don't change `AdvertisePage.jsx`.
- Don't try to delete `submit_self_serve_booking` from the database — that's MyDash's Phase 6 cleanup.
- Don't recompute markup/discount client-side. Server is authoritative.
- Don't bypass the `Awaiting Review` state — every self-serve submission lands there. The rep is the gate.

Ping Nic when ready and the `get_self_serve_proposal` RPC + resume-edit semantics land in MyDash.
