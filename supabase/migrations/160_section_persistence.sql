-- ============================================================
-- 160 — Section persistence: pub-defaults + main/sub kind
--
-- Two changes:
--   1. publications.default_sections (jsonb) — ordered list of
--      [{ label, kind }] used as a TEMPLATE when the publisher opens
--      a new issue. Not auto-applied — issues independently materialize
--      flatplan_sections rows when the publisher chooses to.
--
--   2. flatplan_sections.kind ('main' | 'sub') — newspapers reset
--      page numbering at every MAIN section (A1, A2, B1, B2). SUB
--      sections (e.g. "Sports" inside Section A) are pure labels with
--      no page reset. Magazines ignore main/sub for page numbering
--      and use linear pagination (handled in display layer).
--
-- The flatplan_sections table itself already exists (migration 001);
-- this just adds the kind column.
-- ============================================================

ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS default_sections jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN publications.default_sections IS
  'Ordered template of sections for new issues: [{ label, kind }] where kind is "main" | "sub". Not auto-materialized to flatplan_sections — surfaced as suggestions in the Issue Planner / Flatplan section UI.';

ALTER TABLE flatplan_sections
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'main';

ALTER TABLE flatplan_sections
  DROP CONSTRAINT IF EXISTS flatplan_sections_kind_check;

ALTER TABLE flatplan_sections
  ADD CONSTRAINT flatplan_sections_kind_check
  CHECK (kind IN ('main', 'sub'));

COMMENT ON COLUMN flatplan_sections.kind IS
  '"main" sections reset newspaper page numbering (A1,A2,B1,B2). "sub" sections are labels only — no page reset. Magazines use pub.type=Magazine in display layer to disable per-section page reset entirely regardless of kind.';

-- Live prod schema uses (name, start_page, end_page, color) — different
-- from migration 001's (after_page, label, sort_order). The lib/sections
-- module reads/writes the live schema; older code paths that referenced
-- after_page/label have been retired.
CREATE INDEX IF NOT EXISTS idx_flatplan_sections_issue_start_page
  ON flatplan_sections(issue_id, start_page);

NOTIFY pgrst, 'reload schema';
