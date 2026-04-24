-- ============================================================
-- 104 — message_threads.ref_id: uuid → text.
--
-- ref_id is polymorphic (story uuid, ad_project uuid, sale uuid,
-- contract uuid, legal_notice uuid — and now issue.id which is text
-- like "pub-santa-ynez-valley-st-2026-04-24"). Locking the column to
-- uuid blocks issue-level Discussions cold ("invalid input syntax for
-- type uuid"). Switch to text so the ref_type discriminator can route
-- to either id space.
-- ============================================================

ALTER TABLE message_threads
  ALTER COLUMN ref_id TYPE text USING ref_id::text;

CREATE OR REPLACE FUNCTION set_thread_expiry_on_press()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sent_to_press_at IS NOT NULL AND (OLD.sent_to_press_at IS NULL OR OLD.sent_to_press_at IS DISTINCT FROM NEW.sent_to_press_at) THEN
    UPDATE message_threads
       SET expires_at = NEW.sent_to_press_at + INTERVAL '45 days'
     WHERE ref_type = 'issue' AND ref_id = NEW.id;

    UPDATE message_threads mt
       SET expires_at = NEW.sent_to_press_at + INTERVAL '45 days'
      FROM stories s
     WHERE mt.ref_type = 'story'
       AND mt.ref_id = s.id::text
       AND s.print_issue_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
