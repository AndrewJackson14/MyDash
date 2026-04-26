-- ============================================================
-- Migration 163 — Retire Wednesday Agent's social_posts table
--
-- Andrew turned the Wednesday Agent off in the social-media area.
-- The agent's `social_posts` table (story-attached single-platform
-- drafts: id / story_id / platform / post_text / status / posted_at /
-- approved_at / created_at / updated_at) had 0 live rows and 6
-- archived rows at retire time. Pre-flight checks confirmed:
--
--   • No FKs reference public.social_posts
--   • No views reference it
--   • No RPCs / functions reference it
--   • Only client-side references: a "Social Posts" panel in
--     StoryEditor.jsx and a "social_posts" permission key in
--     TeamModule.jsx — both removed in the same commit.
--
-- Dropping it frees the canonical `social_posts` name for the new
-- per-publication scheduling feature defined in migration 162.
--
-- ⚠  APPLY ORDER: this migration must run BEFORE migration 162
-- (162_social_scheduling.sql), because 162 creates a fresh
-- public.social_posts with a different shape. Numerical 163 sorts
-- after 162 on disk; the codebase applies migrations manually via
-- `supabase db query --file ...`, so ordering on disk is for
-- human review only — actual apply order is whatever the operator
-- chooses. See DECISIONS.md for the apply sequence.
--
-- public.social_posts_archived is INTENTIONALLY preserved as the
-- historical record of the Wednesday Agent's prior output.
-- ============================================================

DROP TABLE IF EXISTS public.social_posts;

NOTIFY pgrst, 'reload schema';
