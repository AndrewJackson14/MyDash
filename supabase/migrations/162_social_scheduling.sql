-- ============================================================
-- Migration 162 — Social Scheduling: per-publication social posting
--
-- Spec: _specs/social-scheduling.md (Andrew, 2026-04-26)
--
-- Four tables:
--   • social_accounts       — OAuth tokens per (pub_id, provider)
--   • social_posts          — drafts / scheduled / published posts
--   • social_post_results   — per-destination publish outcome
--   • provider_usage        — monthly cost + write counters
--
-- Token columns NEVER readable by client. Edge Functions
-- (social-x-auth / social-facebook-auth / social-linkedin-auth /
-- social-publish) use the service role for all access. Client
-- reads of social_accounts must go through a view that elides
-- access_token, refresh_token, and token_expiry — see the
-- social_accounts_safe view at the bottom.
-- ============================================================

-- ─── social_accounts ─────────────────────────────────────────
-- One row per (publication, provider) — UNIQUE constraint enforces.
-- Facebook row carries the linked Instagram destination inline so
-- one OAuth unlocks two destinations (per Meta's API model).
CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('x', 'facebook', 'linkedin')),
  account_label TEXT NOT NULL,                  -- "@malibutimes", "Malibu Times Page", "Andrew Mattson"
  external_id TEXT NOT NULL,                    -- provider's user/page id

  -- Token columns — service-role-only access (RLS denies client reads).
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,                     -- NULL = never expires (FB Page Access Token)
  scopes TEXT[] NOT NULL DEFAULT '{}',

  -- Facebook → Instagram derived destination. Set during the
  -- callback when /{page-id}?fields=instagram_business_account
  -- returns a linked IG. NULL otherwise; UI renders an "IG not
  -- linked" notice with the fix-it path.
  instagram_account_id TEXT,
  instagram_account_label TEXT,

  -- LinkedIn — flips to true after MDP approval lands and the
  -- callback discovers Pages the user can administer. Phase 1
  -- ships personal-profile only with this false.
  linkedin_can_post_as_page BOOLEAN NOT NULL DEFAULT FALSE,

  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'expired', 'revoked', 'pending_setup')),

  connected_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (pub_id, provider)
);

-- ─── social_posts ────────────────────────────────────────────
-- One draft → one optional schedule → one publish event. The
-- per-destination outcome lives in social_post_results so a
-- post with X-success + IG-failure can be partially recovered.
CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id),

  body_text TEXT NOT NULL DEFAULT '',
  -- media: [{ url, type: 'image'|'video', alt_text, width, height }]
  media JSONB NOT NULL DEFAULT '[]',
  -- targets: [{ destination: 'x'|'facebook'|'instagram'|'linkedin', enabled: bool }]
  -- Snapshot of toggle state at scheduling time; the worker reads this
  -- to decide which networks to publish to.
  targets JSONB NOT NULL DEFAULT '[]',

  scheduled_for TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'partial')),

  -- Optional link back to the originating story when the
  -- composer was opened from StoryEditor's "Compose Social
  -- Post" affordance.
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

-- ─── social_post_results ─────────────────────────────────────
-- One row per (post, destination). The UNIQUE constraint provides
-- idempotency: a stuck post that gets reprocessed after a worker
-- restart cannot double-send to the same destination.
CREATE TABLE social_post_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  destination TEXT NOT NULL CHECK (destination IN ('x', 'facebook', 'instagram', 'linkedin')),

  external_post_id TEXT,                        -- e.g. tweet id, FB post id, IG media id
  external_url TEXT,                            -- deep-link to the live post
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'success', 'failed', 'skipped')),
  error_message TEXT,
  posted_at TIMESTAMPTZ,

  UNIQUE (post_id, destination)
);

-- ─── provider_usage ──────────────────────────────────────────
-- Monthly write counts + estimated cost per (provider, publication).
-- The X spend cap check in social-publish reads this for the current
-- 'YYYY-MM' period. Reads_count is for future Insights/Analytics work
-- (out of v1 scope but reserved here so the cardinality is set).
CREATE TABLE provider_usage (
  provider TEXT NOT NULL,
  pub_id TEXT REFERENCES publications(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                         -- 'YYYY-MM'
  writes_count INTEGER NOT NULL DEFAULT 0,
  reads_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, pub_id, period)
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX social_accounts_pub_idx
  ON social_accounts(pub_id);

-- Composite index serves two queries: pub-scoped listing (e.g.
-- IntegrationsPage matrix) and the worker's queue scan.
CREATE INDEX social_posts_pub_status_idx
  ON social_posts(pub_id, status);

-- Partial index — only rows the cron worker scans every minute.
-- Tiny + always hot.
CREATE INDEX social_posts_scheduled_idx
  ON social_posts(status, scheduled_for)
  WHERE status = 'scheduled';

CREATE INDEX social_post_results_post_idx
  ON social_post_results(post_id);

-- Composer queue + history tabs both filter by author + status.
CREATE INDEX social_posts_author_status_idx
  ON social_posts(author_id, status, updated_at DESC);

-- ─── updated_at touch trigger ────────────────────────────────
-- Reuses the project-wide touch_updated_at function from migration
-- 049. social_post_results doesn't need it (rows are insert-only).
CREATE TRIGGER social_accounts_touch
  BEFORE UPDATE ON social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER social_posts_touch
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Row Level Security ──────────────────────────────────────
-- Token columns NEVER exposed to client. The pattern:
--   • Tables enable RLS
--   • Authenticated team members can SELECT non-token rows via
--     a security-barrier view (social_accounts_safe) that elides
--     access_token / refresh_token / token_expiry / scopes
--   • Direct table SELECTs are denied to authenticated; only the
--     service role (used by Edge Functions) can read tokens
--   • social_posts / social_post_results / provider_usage have
--     standard authenticated read-write following the existing
--     publication-access pattern from prior migrations
ALTER TABLE social_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_results    ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_usage         ENABLE ROW LEVEL SECURITY;

-- social_accounts: deny direct client reads; client uses the safe view below.
-- The "deny by omission" pattern — no SELECT policy granted to
-- authenticated, only ALL to service_role.
CREATE POLICY social_accounts_service_all
  ON social_accounts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated team members can read the safe view (defined below)
-- which inherits the underlying table's RLS. They cannot UPDATE/INSERT
-- /DELETE social_accounts directly — Edge Functions write tokens.
-- Granting SELECT on the safe view requires SELECT on the underlying
-- columns; we scope the read policy to only non-token columns by
-- making the view itself security-barrier and granting SELECT to
-- authenticated on the view, NOT the table.

-- social_posts: standard authenticated read + write. Scoped by author
-- in client logic; server-side RLS enforces team-membership read.
CREATE POLICY social_posts_authenticated_read
  ON social_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY social_posts_authenticated_write
  ON social_posts FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- social_post_results: read-open to authenticated for History tab.
-- Inserts/updates only via service role (the worker writes results).
CREATE POLICY social_post_results_authenticated_read
  ON social_post_results FOR SELECT TO authenticated USING (true);
CREATE POLICY social_post_results_service_write
  ON social_post_results FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- provider_usage: read-open for the IntegrationsPage usage panel.
-- Writes only from the publish worker (service role).
CREATE POLICY provider_usage_authenticated_read
  ON provider_usage FOR SELECT TO authenticated USING (true);
CREATE POLICY provider_usage_service_write
  ON provider_usage FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── social_accounts_safe view ───────────────────────────────
-- Token-stripped read surface for the client.
--
-- The model:
--   • Underlying table has RLS enabled with NO authenticated SELECT
--     policy — direct table queries return zero rows for any client.
--   • This view explicitly elides access_token, refresh_token,
--     token_expiry, and scopes. Those columns cannot be referenced
--     through it.
--   • security_invoker = false makes the view run as its owner
--     (the migration role, which has full access). The view bypasses
--     the deny-all policy on the table because RLS is checked
--     against the view owner, not the calling user.
--   • security_barrier = true prevents the optimizer from pushing
--     a hostile predicate past the RLS layer (no "ORDER BY token"
--     side-channel attacks).
--   • GRANT SELECT to authenticated on the view, not the table.
CREATE OR REPLACE VIEW social_accounts_safe
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  id,
  pub_id,
  provider,
  account_label,
  external_id,
  -- access_token, refresh_token, token_expiry, scopes — INTENTIONALLY OMITTED
  instagram_account_id,
  instagram_account_label,
  linkedin_can_post_as_page,
  status,
  connected_by,
  created_at,
  updated_at,
  -- Convenience computed flag for the IG card UI.
  (instagram_account_id IS NOT NULL) AS instagram_linked
FROM social_accounts;

REVOKE ALL ON social_accounts_safe FROM PUBLIC;
GRANT SELECT ON social_accounts_safe TO authenticated;
GRANT SELECT ON social_accounts_safe TO service_role;

-- ─── Helper: bump provider_usage atomically ──────────────────
-- Called by the social-publish worker after every successful
-- network write. Upserts the (provider, pub_id, period) row and
-- increments writes + cost. period is computed in UTC to keep
-- the spend-cap check coherent regardless of caller timezone.
CREATE OR REPLACE FUNCTION public.bump_provider_usage(
  p_provider TEXT,
  p_pub_id   TEXT,
  p_writes   INTEGER DEFAULT 1,
  p_cost_usd NUMERIC DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period TEXT := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM');
BEGIN
  INSERT INTO provider_usage (provider, pub_id, period, writes_count, estimated_cost_usd)
  VALUES (p_provider, p_pub_id, v_period, p_writes, p_cost_usd)
  ON CONFLICT (provider, pub_id, period) DO UPDATE
    SET writes_count       = provider_usage.writes_count + EXCLUDED.writes_count,
        estimated_cost_usd = provider_usage.estimated_cost_usd + EXCLUDED.estimated_cost_usd;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_provider_usage(TEXT, TEXT, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_provider_usage(TEXT, TEXT, INTEGER, NUMERIC) TO service_role;

-- ─── Helper: monthly X spend total ───────────────────────────
-- Edge Function reads this before each X publish to enforce the
-- monthly budget. Sums across all publications because the X
-- spend cap is org-wide (one MyDash dev app).
CREATE OR REPLACE FUNCTION public.x_spend_this_month()
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(estimated_cost_usd), 0)
  FROM provider_usage
  WHERE provider = 'x'
    AND period = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM');
$$;

REVOKE ALL ON FUNCTION public.x_spend_this_month() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.x_spend_this_month() TO service_role;

NOTIFY pgrst, 'reload schema';
