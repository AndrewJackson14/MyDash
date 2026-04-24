-- ============================================================
-- 103 — Relax stories_priority_check.
--
-- The original constraint allowed only the legacy bucket names
-- (low / normal / high / urgent). The Issue Planning UI now uses the
-- 6-level numeric scheme from the editorial→production spec
-- (PRIORITY_OPTIONS = "1".."6"), and every dropdown UPDATE has been
-- silently failing the constraint — leaving 88,880 rows stuck at
-- "normal" despite editor input. The recent inline "+ New Story"
-- insert that defaulted to "1" surfaced the failure outright.
--
-- Relax to accept both vocabularies so historical rows stay valid
-- and the new numeric scheme starts persisting cleanly. NULL is
-- explicitly allowed so an unset priority is fine.
-- ============================================================
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_priority_check;

ALTER TABLE stories
  ADD CONSTRAINT stories_priority_check CHECK (
    priority IS NULL
    OR priority = ANY (ARRAY['low','normal','high','urgent','1','2','3','4','5','6'])
  );
