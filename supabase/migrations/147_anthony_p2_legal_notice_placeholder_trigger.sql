-- 147_anthony_p2_legal_notice_placeholder_trigger.sql
-- Anthony Phase 2 — auto-sync flatplan_placeholders when Cami sets
-- a page on a legal_notice_issues row, so Anthony sees the legal
-- notice as a purple-bordered placeholder on his flatplan without
-- a separate manual placement step.

ALTER TABLE flatplan_placeholders
  ADD COLUMN IF NOT EXISTS legal_notice_id uuid REFERENCES legal_notices(id) ON DELETE CASCADE;

-- One placeholder row per (issue, notice) pair so the trigger can
-- safely upsert. Existing rows without legal_notice_id keep working
-- because the partial unique only applies when the FK is non-null.
CREATE UNIQUE INDEX IF NOT EXISTS uq_flatplan_placeholders_legal_per_issue
  ON flatplan_placeholders(issue_id, legal_notice_id)
  WHERE legal_notice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_legal_notice_placeholder() RETURNS trigger AS $$
DECLARE
  notice_title text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM flatplan_placeholders
     WHERE legal_notice_id = OLD.legal_notice_id
       AND issue_id = OLD.issue_id;
    RETURN OLD;
  END IF;

  IF NEW.page IS NULL THEN
    DELETE FROM flatplan_placeholders
     WHERE legal_notice_id = NEW.legal_notice_id
       AND issue_id = NEW.issue_id;
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE' AND OLD.issue_id IS DISTINCT FROM NEW.issue_id) THEN
    DELETE FROM flatplan_placeholders
     WHERE legal_notice_id = NEW.legal_notice_id
       AND issue_id = OLD.issue_id;
  END IF;

  SELECT title INTO notice_title FROM legal_notices WHERE id = NEW.legal_notice_id;

  INSERT INTO flatplan_placeholders (issue_id, page, label, type, color, legal_notice_id)
  VALUES (NEW.issue_id, NEW.page, COALESCE(notice_title, 'Legal Notice'), 'legal_notice', '#9333ea', NEW.legal_notice_id)
  ON CONFLICT (issue_id, legal_notice_id) WHERE legal_notice_id IS NOT NULL
  DO UPDATE SET
    page = EXCLUDED.page,
    label = EXCLUDED.label,
    color = EXCLUDED.color;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_legal_notice_placeholder ON legal_notice_issues;
CREATE TRIGGER tr_legal_notice_placeholder
  AFTER INSERT OR UPDATE OR DELETE ON legal_notice_issues
  FOR EACH ROW EXECUTE FUNCTION sync_legal_notice_placeholder();
