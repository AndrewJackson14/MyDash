-- ============================================================
-- Migration 167: Lock down quickbooks_tokens
--
-- The 013 policy "Authenticated users can read QB tokens" was created
-- with `for select using (true)` and no role restriction, which in
-- Postgres defaults to {public} — meaning anonymous callers could
-- SELECT the full row including access_token + refresh_token. Any
-- attacker hitting the PostgREST endpoint without a JWT could pull
-- the OAuth tokens and impersonate the org against the QBO API.
--
-- The Gmail equivalent (gmail_tokens) is correctly locked to
-- service_role; this brings QBO into parity with two layers:
--
--   Layer 1 — drop the {public} policy, replace with {authenticated}
--             so anon callers fail at the row level.
--   Layer 2 — REVOKE SELECT on the secret columns from authenticated
--             so even logged-in staff can't extract tokens via the
--             browser. Edge functions (qb-auth, qb-api) use the
--             service-role client and are unaffected.
--
-- The IntegrationsPage UI only reads (company_name, token_expiry,
-- updated_at) so the tightening is invisible to legit users.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can read QB tokens" ON quickbooks_tokens;

CREATE POLICY "qb_tokens_metadata_read_authed" ON quickbooks_tokens
  FOR SELECT TO authenticated
  USING (true);

-- Column-level lockdown. Postgres won't honor a column-subset REVOKE
-- when the original grant is table-wide, so we revoke the table-wide
-- grant first and re-grant only the safe metadata columns. anon gets
-- nothing; service_role retains full access via the role's superuser-
-- like default privileges (used by qb-auth and qb-api edge functions).
REVOKE SELECT ON quickbooks_tokens FROM authenticated;
REVOKE SELECT ON quickbooks_tokens FROM anon;

GRANT SELECT (id, realm_id, company_name, token_expiry, connected_by, created_at, updated_at)
  ON quickbooks_tokens TO authenticated;

NOTIFY pgrst, 'reload schema';
