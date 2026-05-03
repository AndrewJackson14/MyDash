# Batch 5 — `rls_policy_always_true` audit

**Status:** Documentation pass. No migration applied. Tightening
the flagged policies requires app-side changes (audit fields,
ownership checks) that don't belong in a one-shot SQL migration.

**Generated:** 2026-05-03 alongside batches 1–4 of the RLS / perf
hardening pass.

---

## Counts

| Category | Count | Action |
|---|---|---|
| Anon public-ingest | 4 | **Keep as-is** — intentional public form endpoints |
| Service-role only | 15 | **Keep as-is** — service role bypasses RLS regardless; policies are documentation |
| Authenticated — `INSERT`-only audit/log writes | 10 | **Defer** — requires app-side audit-field plumbing |
| Authenticated — blanket `ALL` / `UPDATE` / `DELETE` | 13 | **Defer** — currently intentional in single-tenant staff model |
| **Total non-SELECT always-true policies in production** | **42** |  |
| **Advisor-flagged subset** | **27** | All categorized below |

(SELECT-only `USING (true)` policies are not flagged — they're the
standard "everyone can read this public reference data" pattern,
covering `publications`, `ad_sizes`, `categories`, `tags`, etc.)

---

## Category 1 — Anon public ingest (keep as-is)

These are the public form-submission endpoints. The auth-level gate
(anon role) is the protection; any subsequent gating happens via the
edge function or pricing RPC the form posts to.

| Table | Policy | Cmd | Why intentional |
|---|---|---|---|
| `ad_inquiries` | `anon_insert_ad_inquiries` | INSERT | Public ad-inquiry form |
| `daily_page_views` | `Anon can insert page views` | INSERT | Public-site analytics ingest |
| `newsletter_signups` | `Anyone can sign up` | INSERT | Public newsletter signup |
| `page_views` | `anon_insert_page_views` | INSERT | Public-site analytics ingest |

**Action:** none. The advisor will keep flagging them and that's
fine — the only meaningful tightening would be rate-limiting at the
edge function, which is a separate concern.

---

## Category 2 — Service-role only (keep as-is)

These policies are scoped to `service_role`. Service-role calls
bypass RLS by design, so the policy is documentation — it makes the
intent explicit when reading the schema. No actual enforcement
happens here.

| Table | Policy |
|---|---|
| `bot_query_log` | `bot_query_log_service_write` |
| `daily_briefings` | `briefings_service_write` |
| `email_sends` | `email_sends_write` |
| `gmail_tokens` | `gmail_tokens_service_only` |
| `gmail_watches` | `gmail_watches_service` |
| `legal_notice_sequences` | `legal_seq_write` |
| `legal_notice_sequences_v2` | `lns2_write` |
| `press_release_log` | `press_log_service_write` |
| `proposal_drafting_log` | `proposal_log_service_write` |
| `provider_usage` | `provider_usage_service_write` |
| `qbo_account_mapping` | `qbo_account_mapping_write` |
| `seo_generation_log` | `seo_log_service_write` |
| `social_accounts` | `social_accounts_service_all` |
| `social_post_results` | `social_post_results_service_write` |
| `story_embeddings` | `story_embeddings_service_write` |

**Action:** none.

---

## Category 3 — Authenticated INSERT-only logs (defer)

These let any authenticated staff user write rows (typically logs,
notes, comms, messages). The standard tightening is to add a
`WITH CHECK` that ensures the actor field on the row matches
`(SELECT auth.uid())` (or maps through `people`). Doing this safely
requires:

1. Confirming every staff-app insert path explicitly sets the actor
   field. If any path relies on a default value or trigger, the
   tighter `WITH CHECK` will start failing inserts in production.
2. Sometimes adding a column-level default `created_by uuid DEFAULT
   (SELECT id FROM people WHERE auth_id = auth.uid())` plus tests.

This is real app-level work — a per-table mini-refactor — not a
one-shot SQL migration.

| Table | Policy | Suggested actor field |
|---|---|---|
| `activity_log` | `activity_write` | `actor_id` (UUID FK to people) |
| `calendar_events` | `events_authenticated_insert` | `created_by` |
| `communications` | `comms_write` | `author_id` |
| `email_log` | `email_log_authenticated_write` | `sent_by` |
| `merch_order_items` | `Public insert merch_order_items` | (review — likely public form) |
| `merch_orders` | `Public insert merch_orders` | (review — likely public form) |
| `messages` | `messages_insert` | `sender_id` |
| `notifications` | `notifs_write` | (no actor — system-emitted) |
| `site_errors` | `site_errors_write` | (no actor — error logging) |
| `team_notes` | `team_notes_authenticated_insert` | `from_user` |
| `ticket_comments` | `ticket_comments_write` | `author_id` |

Some of these have *no* logical actor (notifications, site_errors)
— they're system-side writes. Those are fine as-is even though the
advisor flags them.

**Action:** track per-table; convert opportunistically when each
surface is being touched anyway.

---

## Category 4 — Authenticated blanket ALL/UPDATE/DELETE (defer)

The most permissive group: any authenticated staff user can read,
update, or delete any row. In a single-tenant staff app where every
authenticated user is a trusted team member, this is functionally
correct. The advisor flags it because:

1. If a non-staff user ever gets `authenticated` role, they bypass
   all controls.
2. There's no audit trail for which user made which mutation.

| Table | Policy | Cmd |
|---|---|---|
| `ad_proofs` | `ad_proofs_public_update` | UPDATE |
| `calendar_events` | `events_authenticated_delete` | DELETE |
| `calendar_events` | `events_authenticated_update` | UPDATE |
| `daily_page_views` | `Authenticated users can modify` | ALL |
| `gmail_message_links` | `gmail_links_authenticated` | ALL |
| `message_threads` | `threads_authenticated_all` | ALL |
| `outreach_campaigns` | `Authenticated users can modify` | ALL |
| `outreach_entries` | `Authenticated users can modify` | ALL |
| `printer_contacts` | `Authenticated users can modify` | ALL |
| `social_posts` | `social_posts_authenticated_write` | ALL |
| `team_notes` | `team_notes_authenticated_delete` | DELETE |
| `team_notes` | `team_notes_authenticated_update` | UPDATE |

**Tightening pattern when ready:**

```sql
-- Replace USING (true) with role-gated check
USING (EXISTS (
  SELECT 1 FROM people
  WHERE auth_id = (SELECT auth.uid())
    AND status = 'active'
))
```

Or more strictly, restrict to specific staff roles that should write:

```sql
USING (EXISTS (
  SELECT 1 FROM people
  WHERE auth_id = (SELECT auth.uid())
    AND role IN ('Publisher', 'Office Administrator', 'Salesperson')
    AND status = 'active'
))
```

**Action:** track for future refactor. The customer portal is
already isolated via `user_can_access_client()` — these blanket
policies don't affect customer data.

---

## When to revisit

- **Customer portal v2 with multi-tenant data.** Right now every
  authenticated user is staff. If the portal ever lets non-staff
  authenticated users into surfaces beyond `/c/<slug>/*`, every
  blanket `authenticated` policy in Category 4 becomes a real
  vulnerability and needs to be tightened first.
- **Compliance audit.** If 13 Stars Media ever needs SOC2 or
  similar, the auditor will flag these. Plan a 1-week sweep then.
- **Per-table touches.** Each time a Category-3 or Category-4 table
  is the subject of a feature, knock its always-true policy out as
  part of that work.

---

## Source

Generated from `pg_policies` snapshot 2026-05-03 against the
`hqywacyhpllapdwccmaw` Supabase project. Re-run the categorization
script in `docs/rls-always-true-audit.md` itself if the policy set
drifts.
