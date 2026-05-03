# Customer Portal — `portal.13stars.media`

> Shared role-KB snippet. Add `<!-- include: _shared/customer-portal.md -->`
> wherever a role needs portal context.

The portal is the customer-facing window into MyDash. Same Supabase
project, separate bundle, lives at `portal.13stars.media`. RLS isolates
customers to their own client(s); staff sessions get cross-client read
via the existing `has_permission` policies plus the support-view flag.

## What customers can do (v1)

- Sign in with magic link (`/login`) — password optional, settable later
- See proposals (filter by status, view detail, click "View & Sign"
  for Sent proposals — opens the existing `mydash.media/sign/<token>`
  flow)
- See invoices (filter Open / Overdue / Paid, view detail — payment
  is **v2**, current copy points them to their rep)
- See ad projects (read-only list + detail; creative upload is **v2**)
- See activity feed (proposals submitted / sent / signed / converted,
  ad project created, invoice issued / paid)
- Manage Team contacts (invite + revoke, advertising/billing roles
  only). Sends magic-link invite email via `send-portal-setup-email`.
- Edit notification preferences (per-contact JSONB on `client_contacts`)

## What customers can't do (yet)

- Pay invoices online (v2 — Stripe integration)
- Edit business details inline (v2 — `update_client_business_details`)
- Upload creative to ad projects (v2)
- Receive notification emails on triggered events (v2 —
  `notify-portal-event` Edge Function)

## Account creation paths

1. **Post-self-serve.** When a prospect submits the StellarPress
   self-serve flow, `submit_self_serve_proposal` issues a
   `portal_setup_token` and StellarPress fires
   `send-portal-setup-email`. Magic-link redirects to
   `/setup/complete?token=...` which redeems the token and lands on
   `/c/<slug>/home`.
2. **Existing customer claims an account.** Customer visits
   `/setup`, enters their email. If a `client_contacts` row matches,
   `request_portal_setup_link` mints a token and the Edge Function
   fires the magic link. Otherwise UI returns the same "check your
   email" message (no enumeration).
3. **Teammate invite.** A primary contact at the client uses Account
   → Team → Invite. `invite_client_contact` mints a token; the Edge
   Function dispatches.

## How to support a customer

In the staff app at `mydash.media`, every client profile has a small
**View as customer · portal (read-only)** button below the four
action verbs. Click → opens `portal.13stars.media/c/<slug>/?staff_view=1`
in a new tab.

- A yellow banner pins to the top of the portal: "Support view as
  {client name} — read-only."
- Write actions (invite, revoke, save notification preferences) are
  disabled with a "Read-only in support view" tooltip.
- The same auth user is gated by `current_user_is_staff()` — only
  Publisher / Salesperson / Office Administrator / Support Admin
  pass the check. If the auth user isn't staff, the `staff_view=1`
  flag is silently ignored and the page falls through to normal
  customer routing.

If the staff user isn't yet authenticated on `portal.13stars.media`,
the view-as-customer link first lands on `/login?next=...` so after
sign-in (typically magic-link to their staff email) they bounce
straight back into support view. One-time per portal session.

## Where the data flows

- **Reads**: PostgREST queries against the seven portal-readable
  tables (`clients`, `client_contacts`, `proposals`, `proposal_lines`,
  `proposal_signatures`, `ad_projects`, `invoices`). RLS via
  `user_can_access_client(client_id)` for customers; existing
  `has_permission()` policies for staff.
- **Writes**: every mutation goes through a SECURITY DEFINER RPC.
  None of the portal pages do direct table writes.
- **Activity feed**: `get_client_activity(client_id, limit)` runtime
  function — no event table, no triggers.

## Common questions

- **"My customer didn't get the magic-link email."** → Check spam.
  If still missing, ask them to use `/setup` and re-enter their email
  — request rate-limited at Supabase, not us.
- **"My customer says the View & Sign button errors."** → That URL
  goes to `mydash.media/sign/<access_token>`, not the portal.
  Confirm `proposal_signatures.signed = false` and the row exists
  for the proposal.
- **"They can see invoices but not pay."** → Expected for v1. Stripe
  flow lands in v2.
- **"How do I change a contact's role?"** → Two paths: (a) ask the
  customer's primary contact to invite a new role for that email
  (existing rows update in place); (b) v2 will let staff edit roles
  directly from MyDash.
