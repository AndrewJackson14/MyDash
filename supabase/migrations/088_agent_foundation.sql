-- ============================================================
-- Migration 088: Wednesday Agent Station foundation
--
-- Adds tables, columns, RPCs, and cron schedules for the four
-- new Gemini-powered agents specified in
-- _specs/agent-station-spec.md:
--
--   1. Press Release Processor    (polling, agent station)
--   2. SEO Generator              (Edge Function, webhook-triggered)
--   3. Sales Proposal Drafter     (Edge Function, webhook-triggered)
--   4. Nightly Signal Runner      (cron + Edge Function)
--   5. Editorial Assistant        (Edge Functions + corpus embedder)
--
-- Pattern follows migration 074 (MyHelper):
--   * gen_random_uuid() for new uuid columns
--   * service_role bypasses RLS; authenticated reads gated by
--     public.is_admin() / public.my_team_member_id() helpers
--   * IF NOT EXISTS / OR REPLACE everywhere -> idempotent
--   * Bot identities seeded with hardcoded UUIDs so subsequent
--     migrations and Edge Functions can reference them by literal
--
-- Bot UUIDs (record these in your password manager and in each
-- agent's .env as {AGENT}_BOT_ID):
--   Press Processor:    a1111111-0000-0000-0000-000000000001
--   SEO Generator:      a2222222-0000-0000-0000-000000000002
--   Proposal Drafter:   a3333333-0000-0000-0000-000000000003
--   Signal Runner:      a4444444-0000-0000-0000-000000000004
--
-- Editorial Assistant doesn't need a bot identity -- it doesn't
-- write to team_notes per locked spec decision.
-- ============================================================


-- ============================================================
-- 1. BOT IDENTITIES
-- ============================================================
-- Hardcoded UUIDs so this migration is the single source of truth
-- for the bot ids. ON CONFLICT DO NOTHING makes re-runs safe.

INSERT INTO team_members (
  id, name, role, email, phone, is_active, permissions, assigned_pubs
) VALUES (
  'a1111111-0000-0000-0000-000000000001'::uuid,
  '📰 Press Processor', 'Bot', 'press-bot@mydash.local', '',
  true, ARRAY['bot']::text[], ARRAY['all']::text[]
) ON CONFLICT (email) DO NOTHING;

INSERT INTO team_members (
  id, name, role, email, phone, is_active, permissions, assigned_pubs
) VALUES (
  'a2222222-0000-0000-0000-000000000002'::uuid,
  '🔍 SEO Generator', 'Bot', 'seo-bot@mydash.local', '',
  true, ARRAY['bot']::text[], ARRAY['all']::text[]
) ON CONFLICT (email) DO NOTHING;

INSERT INTO team_members (
  id, name, role, email, phone, is_active, permissions, assigned_pubs
) VALUES (
  'a3333333-0000-0000-0000-000000000003'::uuid,
  '💼 Proposal Drafter', 'Bot', 'proposal-bot@mydash.local', '',
  true, ARRAY['bot']::text[], ARRAY['all']::text[]
) ON CONFLICT (email) DO NOTHING;

INSERT INTO team_members (
  id, name, role, email, phone, is_active, permissions, assigned_pubs
) VALUES (
  'a4444444-0000-0000-0000-000000000004'::uuid,
  '📊 Signal Runner', 'Bot', 'signal-bot@mydash.local', '',
  true, ARRAY['bot']::text[], ARRAY['all']::text[]
) ON CONFLICT (email) DO NOTHING;


-- ============================================================
-- 2. PRESS RELEASE PROCESSOR
-- ============================================================
-- Adds source-tracking columns to stories and a per-event log.
-- The body_original field preserves the verbatim release text
-- so an editor can compare the rewrite to the source.

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_external_id text,
  ADD COLUMN IF NOT EXISTS body_original text;

COMMENT ON COLUMN stories.source_type IS
  'Provenance of the story: null=manually-created, ''press_release''=auto-drafted by Press Processor, ''agent_draft''=other agent-created drafts.';
COMMENT ON COLUMN stories.source_external_id IS
  'For agent-created stories: the source identifier (gmail message id, drive file id) used for dedup.';
COMMENT ON COLUMN stories.body_original IS
  'Verbatim source text for agent-rewritten stories. Preserved so editors can compare the rewrite to the original.';

CREATE INDEX IF NOT EXISTS idx_stories_source_external_id
  ON stories(source_external_id) WHERE source_external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS press_release_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('email', 'drive')),
  source_id text,
  source_subject text,
  source_sender text,
  raw_body text,
  raw_attachments_text text,
  triaged_action text NOT NULL CHECK (triaged_action IN (
    'drafted', 'logged_low_score', 'rejected_duplicate',
    'rejected_out_of_geo', 'rejected_spam', 'error'
  )),
  newsworthiness int CHECK (newsworthiness BETWEEN 1 AND 5),
  publication_assigned text REFERENCES publications(id) ON DELETE SET NULL,
  story_id uuid REFERENCES stories(id) ON DELETE SET NULL,
  rationale text,
  cross_pub_suggestion text,
  gemini_model text,
  processing_seconds numeric(6,2),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_press_release_log_created
  ON press_release_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_press_release_log_action
  ON press_release_log(triaged_action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_press_release_log_source
  ON press_release_log(source, source_id) WHERE source_id IS NOT NULL;

ALTER TABLE press_release_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "press_log_admin_or_editorial_read"
  ON press_release_log FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM team_members
      WHERE auth_id = auth.uid()
        AND role IN ('Editor-in-Chief', 'Managing Editor', 'Editor')
    )
  );

CREATE POLICY "press_log_service_write"
  ON press_release_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE press_release_log IS
  'Every press release the agent processes. One row per source item, regardless of whether it produced a story. Read by editors and admins for triage tuning.';


-- ============================================================
-- 3. SEO GENERATOR
-- ============================================================
-- Note: stories.seo_title, seo_description, slug already exist
-- (added in migration 026). This migration adds the social and
-- summary fields, plus a generation log.

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS og_alt_text text,
  ADD COLUMN IF NOT EXISTS social_facebook text,
  ADD COLUMN IF NOT EXISTS social_linkedin text,
  ADD COLUMN IF NOT EXISTS seo_keywords text[],
  ADD COLUMN IF NOT EXISTS summary_2_sentence text,
  ADD COLUMN IF NOT EXISTS seo_generated_at timestamptz;

COMMENT ON COLUMN stories.og_alt_text IS
  'Alt text for the OpenGraph share image. Generated by the SEO Generator agent on web_status=published.';
COMMENT ON COLUMN stories.social_facebook IS
  'Facebook-tuned share copy. Generated by the SEO Generator agent.';
COMMENT ON COLUMN stories.social_linkedin IS
  'LinkedIn-tuned share copy (professional register, no emoji). Generated by the SEO Generator agent.';
COMMENT ON COLUMN stories.seo_keywords IS
  'SEO keyword array (3-5 terms). Generated by the SEO Generator agent.';
COMMENT ON COLUMN stories.summary_2_sentence IS
  'Two-sentence summary for category page previews and RSS. Generated by the SEO Generator agent.';
COMMENT ON COLUMN stories.seo_generated_at IS
  'Timestamp of the most recent SEO Generator run. Null if SEO fields were filled manually.';

CREATE TABLE IF NOT EXISTS seo_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  trigger_event text NOT NULL,
  fields_generated text[],
  fields_skipped text[],
  gemini_model text,
  processing_seconds numeric(6,2),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_generation_log_story
  ON seo_generation_log(story_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_generation_log_created
  ON seo_generation_log(created_at DESC);

ALTER TABLE seo_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seo_log_authed_read"
  ON seo_generation_log FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "seo_log_service_write"
  ON seo_generation_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE seo_generation_log IS
  'Every SEO Generator run. One row per publish event including which fields were generated vs skipped (already filled by editor).';


-- ============================================================
-- 4. SALES PROPOSAL DRAFTER
-- ============================================================
-- The Edge Function fires on sales row insert where the sale was
-- created from an inquiry. Stores the AI-drafted text alongside
-- (not replacing) the rep's eventual final proposal text.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS ai_drafted_proposal_text text,
  ADD COLUMN IF NOT EXISTS ai_drafted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_recommended_products jsonb;

COMMENT ON COLUMN sales.ai_drafted_proposal_text IS
  'AI-drafted proposal narrative (4 paragraphs joined). Preserved as-drafted for audit; rep edits go to the proposals table.';
COMMENT ON COLUMN sales.ai_drafted_at IS
  'Timestamp of most recent Proposal Drafter run. Used to make the Edge Function idempotent.';
COMMENT ON COLUMN sales.ai_recommended_products IS
  'JSONB array of recommended products: [{product_id, ad_size, publication_id, qty, unit_price, rationale}]. Pre-populated as proposal lines, swappable by the rep.';

CREATE TABLE IF NOT EXISTS proposal_drafting_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  inquiry_id uuid REFERENCES ad_inquiries(id) ON DELETE SET NULL,
  rep_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  similar_sales_used uuid[],
  rep_voice_corpus_size int,
  voice_fallback boolean DEFAULT false,
  gemini_model text,
  processing_seconds numeric(6,2),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_drafting_log_sale
  ON proposal_drafting_log(sale_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_drafting_log_rep
  ON proposal_drafting_log(rep_id, created_at DESC);

ALTER TABLE proposal_drafting_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposal_log_rep_read"
  ON proposal_drafting_log FOR SELECT TO authenticated
  USING (
    rep_id = public.my_team_member_id()
    OR public.is_admin()
  );

CREATE POLICY "proposal_log_service_write"
  ON proposal_drafting_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE proposal_drafting_log IS
  'Every Proposal Drafter run. Records voice-mimicry corpus size, fallback usage, and similar-sales references for ongoing tuning.';


-- ============================================================
-- 5. NIGHTLY SIGNAL RUNNER
-- ============================================================
-- Briefings are stored AND emailed (belt and suspenders).
-- Single recipient per row (Hayley); structure supports multi-recipient
-- if scope expands later.
-- daily   = weekday morning at 6:00 PT
-- weekly  = Sunday evening at 18:00 PT

CREATE TABLE IF NOT EXISTS daily_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_type text NOT NULL CHECK (briefing_type IN ('daily', 'weekly')),
  briefing_date date NOT NULL,
  recipient_user_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  subject text,
  body_markdown text NOT NULL,
  body_html text,
  emailed_at timestamptz,
  email_message_id text,
  source_data_snapshot jsonb,
  gemini_model text,
  processing_seconds numeric(6,2),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_briefings_unique
  ON daily_briefings(briefing_type, briefing_date, recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_recipient_date
  ON daily_briefings(recipient_user_id, briefing_date DESC);

ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "briefings_recipient_or_admin_read"
  ON daily_briefings FOR SELECT TO authenticated
  USING (
    recipient_user_id = public.my_team_member_id()
    OR public.is_admin()
  );

CREATE POLICY "briefings_service_write"
  ON daily_briefings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE daily_briefings IS
  'Hayley''s daily and weekly briefings. body_markdown is the canonical content; body_html is the rendered email version. source_data_snapshot preserves the raw signal data so a briefing can be regenerated or audited.';


-- ============================================================
-- 6. EDITORIAL ASSISTANT -- STORY EMBEDDINGS
-- ============================================================
-- Used by "Suggest related stories" tool. Embeddings come from
-- Gemini's text-embedding-004 model (768-dim) so the Edge Function
-- can call Gemini for both corpus and query without depending on
-- the agent station's local Ollama (which Edge Functions can't reach).
--
-- The corpus embedder runs on agent-station/editorial-corpus/bot.py
-- and maintains this table on a 5-minute poll cadence.

CREATE TABLE IF NOT EXISTS story_embeddings (
  story_id uuid PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
  vec real[] NOT NULL,
  embedded_text_hash text NOT NULL,
  embedded_model text NOT NULL DEFAULT 'text-embedding-004',
  embedded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_embeddings_embedded_at
  ON story_embeddings(embedded_at DESC);

ALTER TABLE story_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_embeddings_authed_read"
  ON story_embeddings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "story_embeddings_service_write"
  ON story_embeddings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE story_embeddings IS
  'Per-story 768-dim embeddings from Gemini text-embedding-004. Maintained by agent-station/editorial-corpus. Used by the "Suggest related stories" Edit Assistant tool via search_story_embeddings RPC.';

-- ----------------------------------------------------------
-- search_story_embeddings -- cosine similarity search RPC
-- ----------------------------------------------------------
-- Naive Postgres array cosine. Adequate for corpora up to ~50k
-- stories. Migrate to pgvector if the corpus grows past that.

CREATE OR REPLACE FUNCTION public.search_story_embeddings(
  query_vec real[],
  exclude_story_id uuid,
  limit_n int DEFAULT 5
)
RETURNS TABLE (
  story_id uuid,
  title text,
  publication_id text,
  publication_name text,
  published_at timestamptz,
  similarity numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  query_norm numeric;
BEGIN
  -- Compute query norm once
  SELECT sqrt(coalesce(sum(v::numeric * v::numeric), 0))
    INTO query_norm
    FROM unnest(query_vec) AS v;

  IF query_norm = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id AS story_id,
    s.title,
    s.publication_id,
    p.name AS publication_name,
    s.published_at,
    (
      (
        SELECT coalesce(sum(a.v::numeric * b.v::numeric), 0)
        FROM unnest(se.vec) WITH ORDINALITY AS a(v, idx)
        JOIN unnest(query_vec) WITH ORDINALITY AS b(v, idx)
          ON a.idx = b.idx
      ) / (
        query_norm * (
          SELECT sqrt(coalesce(sum(v::numeric * v::numeric), 0))
            FROM unnest(se.vec) AS v
        )
      )
    )::numeric AS similarity
  FROM story_embeddings se
  JOIN stories s ON s.id = se.story_id
  JOIN publications p ON p.id = s.publication_id
  WHERE se.story_id <> exclude_story_id
    AND s.web_status = 'published'
    AND s.audience = 'public'
  ORDER BY similarity DESC
  LIMIT greatest(1, least(limit_n, 20));
END;
$$;

COMMENT ON FUNCTION public.search_story_embeddings IS
  'Cosine similarity search over story_embeddings. SECURITY DEFINER so anon-readable published stories are searchable from Edge Functions without leaking unpublished content. Caps limit_n at 20 for safety.';

GRANT EXECUTE ON FUNCTION public.search_story_embeddings TO authenticated, service_role;


-- ============================================================
-- 7. CRON SCHEDULES
-- ============================================================
-- Signal Runner runs via Supabase Cron rather than the Mac Mini's
-- LaunchAgent. Reasons: removes a single point of failure (Mac
-- Mini reboot loses the schedule), centralizes ops in Supabase
-- dashboard, and the briefing data fetches all run server-side
-- anyway so latency is identical.
--
-- The Press Processor stays on agent-station LaunchAgent because
-- it needs Gmail and Drive OAuth tokens that are easier to manage
-- from a long-running process on a known machine.

-- Daily briefing -- weekdays at 6:00 AM Pacific (14:00 UTC standard,
-- 13:00 UTC during daylight savings -- schedule in UTC and let the
-- Edge Function note the local time in the email subject).
SELECT cron.schedule(
  'signal-runner-daily',
  '0 14 * * 1-5',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/signal-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"type":"daily"}'::jsonb
  );
  $$
);

-- Weekly preview -- Sundays at 18:00 Pacific (02:00 UTC Monday standard).
SELECT cron.schedule(
  'signal-runner-weekly',
  '0 2 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/signal-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"type":"weekly"}'::jsonb
  );
  $$
);

-- ============================================================
-- 8. SCHEMA RELOAD
-- ============================================================
-- PostgREST needs to refresh its schema cache after column adds
-- so the new columns are visible to the JS client without a manual
-- restart from the Supabase dashboard.

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- END Migration 088
-- ============================================================
