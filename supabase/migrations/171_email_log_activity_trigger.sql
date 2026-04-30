-- 171_email_log_activity_trigger.sql
-- PR 3 (Phase 2b) of the Daily Activity Log spec.
--
-- A single AFTER-INSERT trigger on email_log mirrors any row tied to a
-- client into activity_log as either 'email_sent' (direction='outbound')
-- or 'email_received' (direction='inbound'). Catches every send path
-- (contract-email, send-*, sendGmailEmail RPC) and the inbound ingest
-- path (gmail-ingest-inbound) without modifying each call site.
--
-- All emitted events are event_category='effort' — they roll up to the
-- sales rep's TargetProgressCard but are filtered OUT of Hayley's
-- publisher stream per spec.
--
-- Rows without client_id are skipped (system-only emails like printer
-- handoffs, asset requests with no client link). The activity log is
-- a per-actor / per-client surface; orphan emails would just add noise.

CREATE OR REPLACE FUNCTION public.tg_email_log_to_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id    uuid;
  v_actor_name  text;
  v_actor_role  text;
  v_actor_slug  text;
  v_client_name text;
  v_event_type  text;
  v_summary     text;
BEGIN
  -- Skip orphan rows (no client). Activity log is a per-client surface.
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve actor — for outbound, sent_by carries it. For inbound, no
  -- explicit actor (the message came from outside); we leave actor_id
  -- null and tag the row to the client only.
  IF NEW.direction = 'outbound' AND NEW.sent_by IS NOT NULL THEN
    SELECT id, name, role
      INTO v_actor_id, v_actor_name, v_actor_role
      FROM team_members
     WHERE id = NEW.sent_by
     LIMIT 1;
  END IF;

  -- Map TEAM_ROLES enum value to spec slug. Mirrors the CASE in
  -- log_activity RPC — keep these two in sync if either changes.
  v_actor_slug := CASE v_actor_role
    WHEN 'Publisher'            THEN 'publisher'
    WHEN 'Editor-in-Chief'      THEN 'editor-in-chief'
    WHEN 'Salesperson'          THEN 'sales-rep'
    WHEN 'Sales Manager'        THEN 'sales-rep'
    WHEN 'Ad Designer'          THEN 'ad-designer'
    WHEN 'Layout Designer'      THEN 'layout-designer'
    WHEN 'Production Manager'   THEN 'layout-designer'
    WHEN 'Content Editor'       THEN 'content-editor'
    WHEN 'Managing Editor'      THEN 'content-editor'
    WHEN 'Office Administrator' THEN 'office-admin'
    WHEN 'Office Manager'       THEN 'office-admin'
    WHEN 'Finance'              THEN 'office-admin'
    ELSE NULL
  END;

  SELECT name INTO v_client_name FROM clients WHERE id = NEW.client_id LIMIT 1;

  IF NEW.direction = 'outbound' THEN
    v_event_type := 'email_sent';
    v_summary := format('Sent email to %s', COALESCE(v_client_name, 'client'));
  ELSE
    v_event_type := 'email_received';
    v_summary := format('Received email from %s', COALESCE(v_client_name, NEW.from_email, 'client'));
  END IF;

  INSERT INTO activity_log (
    type, summary, detail,
    event_category, event_source,
    actor_id, actor_name, actor_role,
    client_id, client_name,
    entity_table, entity_id,
    metadata, visibility,
    created_at
  ) VALUES (
    v_event_type, v_summary, NEW.subject,
    'effort', 'gmail',
    v_actor_id, v_actor_name, v_actor_slug,
    NEW.client_id, v_client_name,
    'email_log', NEW.id::uuid,
    jsonb_build_object(
      'gmail_message_id', NEW.gmail_message_id,
      'from_email',       NEW.from_email,
      'subject',          NEW.subject,
      'direction',        NEW.direction
    ),
    'team',
    COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
EXCEPTION
  -- Never block an email_log insert on activity-log mirroring failure.
  -- Log to Postgres logs (visible in Supabase dashboard) and continue.
  WHEN OTHERS THEN
    RAISE WARNING 'tg_email_log_to_activity: % %', SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_log_to_activity ON email_log;
CREATE TRIGGER email_log_to_activity
  AFTER INSERT ON email_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_log_to_activity();

COMMENT ON FUNCTION public.tg_email_log_to_activity IS
  'Mirrors email_log inserts (with client_id) into activity_log as email_sent / email_received. Effort-category events for the sales rep dashboard.';

-- ────────────────────────────────────────────────────────────────────
-- Calendar capture: deferred to a follow-up PR.
--
-- meeting_held events require a scheduled cron worker that polls
-- google_tokens users for events ending in the last interval and
-- matches attendees to client_contacts. The shape:
--
--   1. Edge function meeting-capture-cron
--   2. scheduled-tasks invokes it every 30 min
--   3. For each user, fetch events with end < now() AND end > now() -
--      INTERVAL '30 min', match attendees, insert activity_log rows
--      with event_type='meeting_held', event_category='effort'.
--
-- Not in this migration since it requires the cron infra wiring that
-- lives outside SQL. Tracked as a follow-up.
-- ────────────────────────────────────────────────────────────────────
