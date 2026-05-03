# One-time outreach: existing self-serve customers → new portal

> Draft per spec §9.2 + locked decision D10. Six recipients (the
> existing self-serve submitters from before portal launch). Send
> manually from your sender of choice (Gmail / SES — your call) so
> you can personalize the salutation. Not productized; one-time job.

---

## Sender / from address

Use the rep who handled the original self-serve submission (their
relationship is already warm). If unclear, use Hayley (publisher) as
the default sender so the recipient sees a single trusted face.

## Subject

```
Your 13 Stars Media account just got better
```

(Alternatives if you want to test: "Your account is ready —
portal.13stars.media", "We launched a customer portal · sign in to
see your proposal".)

## Body — plain version (what to actually paste)

```
Hi {{first_name}},

A quick heads-up: we just launched a customer portal at
portal.13stars.media so you can see your 13 Stars Media account
without having to email us for status.

You'll find:
  • Your proposal — review, sign if you haven't already, see what's
    live
  • Invoices — issue dates, balances, paid/open status
  • Activity — every step from "submitted" through "signed" through
    "ad project started"

Set up your account in 30 seconds:
  1. Go to https://portal.13stars.media/setup
  2. Enter the email address you used when you submitted —
     {{recipient_email}}
  3. We'll email you a one-time sign-in link. Click it, you're in.

The old proposal-status link we sent you originally has been
retired, so this is the new home base.

Reply to this email if anything looks off and I'll dig in.

— {{sender_first_name}}
{{sender_title}}, 13 Stars Media
```

## Body — HTML version (if your sender supports it)

```html
<p>Hi {{first_name}},</p>

<p>A quick heads-up: we just launched a customer portal at
<a href="https://portal.13stars.media">portal.13stars.media</a> so you
can see your 13 Stars Media account without having to email us for
status.</p>

<p>You'll find:</p>
<ul>
  <li><strong>Your proposal</strong> — review, sign if you haven't
    already, see what's live</li>
  <li><strong>Invoices</strong> — issue dates, balances, paid/open
    status</li>
  <li><strong>Activity</strong> — every step from "submitted" through
    "signed" through "ad project started"</li>
</ul>

<p><strong>Set up your account in 30 seconds:</strong></p>
<ol>
  <li>Go to <a href="https://portal.13stars.media/setup"
    >portal.13stars.media/setup</a></li>
  <li>Enter the email address you used when you submitted —
    <em>{{recipient_email}}</em></li>
  <li>We'll email you a one-time sign-in link. Click it, you're in.</li>
</ol>

<p>The old proposal-status link we sent you originally has been
retired, so this is the new home base.</p>

<p>Reply to this email if anything looks off and I'll dig in.</p>

<p>— {{sender_first_name}}<br>
{{sender_title}}, 13 Stars Media</p>
```

## Variables to fill before sending

| Token | What it is | How to find |
|---|---|---|
| `{{first_name}}` | Recipient's first name | `client_contacts.name` (split on first space) |
| `{{recipient_email}}` | The email they submitted with | `client_contacts.email` for the active contact (or `proposals.intake_email`) |
| `{{sender_first_name}}` | The rep sending the email | Whichever account is sending |
| `{{sender_title}}` | Sender's title | Publisher / Account Manager / etc. |

## How to pull the recipient list

```sql
-- The six (or however many) self-serve submitters who created an
-- account before portal launch. Filter on lead_source='Self-Serve'
-- (the source value submit_self_serve_proposal writes).
SELECT
  c.id            AS client_id,
  c.name          AS business_name,
  c.created_at    AS submitted_at,
  cc.id           AS contact_id,
  cc.name         AS contact_name,
  cc.email        AS contact_email,
  p.id            AS proposal_id,
  p.status        AS proposal_status,
  p.awaiting_review_at,
  p.signed_at
FROM clients c
JOIN client_contacts cc ON cc.client_id = c.id AND cc.is_primary = true
LEFT JOIN proposals p ON p.client_id = c.id AND p.source = 'self_serve'
WHERE c.lead_source = 'Self-Serve'
ORDER BY c.created_at;
```

Adjust the WHERE if you want to exclude already-converted accounts
or anything older than launch date.

## What the recipient experiences after they click "set up"

1. Lands on `/setup` — pre-filled email if they used the link.
2. Submits → `request_portal_setup_link` RPC mints a
   `portal_setup_token` row.
3. `send-portal-setup-email` Edge Function dispatches the Supabase
   magic-link email with `redirectTo` =
   `portal.13stars.media/setup/complete?token=<uuid>`.
4. They click the magic link → Supabase Auth establishes session →
   browser lands on `/setup/complete?token=...`.
5. `complete_portal_setup` RPC binds their Supabase auth user to
   their `client_contacts` row(s) matching their email.
6. Redirect to `/c/<their-slug>/home`.

The whole flow is the same as a fresh self-serve submission's
post-submit handoff (spec §9.3) — we just don't need to mint a new
token; the customer's `/setup` form does that on their behalf.

## Cadence

Six recipients → no batching needed. Send all in one sitting. If
ramping up later (lazy onboarding for the broader 4,030-client list
per spec §9.1), batch at 50/day to respect Supabase Auth's email
sender rate limit (or swap to Resend/SES first).
