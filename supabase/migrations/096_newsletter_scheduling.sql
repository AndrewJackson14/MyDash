-- ============================================================
-- Migration 096: Scheduled + recurring newsletter/eBlast sends
--
-- scheduled_at is the next run's UTC timestamp; recurrence jsonb
-- (null | daily | weekly | monthly) drives clone-and-reschedule
-- after a successful send. The cron tick scans every 2 minutes
-- and invokes send-newsletter over HTTP via cron_invoke_edge_function.
-- ============================================================

ALTER TABLE newsletter_drafts
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence   jsonb;

COMMENT ON COLUMN newsletter_drafts.scheduled_at IS
  'Next UTC firing time for status=scheduled drafts. Cleared when the send completes. For recurring drafts, a new cloned draft is created with the next scheduled_at after each send.';
COMMENT ON COLUMN newsletter_drafts.recurrence IS
  'Recurring-send rule. null = one-shot. Shapes:
   { type:"daily",   hour:8, minute:0, timezone:"America/Los_Angeles" }
   { type:"weekly",  days:[1,4], hour:8, minute:0, timezone:"America/Los_Angeles" }
     (days = ISO weekdays: 1=Mon, 7=Sun)
   { type:"monthly", day:15, hour:8, minute:0, timezone:"America/Los_Angeles" }';

CREATE INDEX IF NOT EXISTS idx_nl_drafts_due_scheduled
  ON newsletter_drafts(scheduled_at)
  WHERE status = 'scheduled';

CREATE OR REPLACE FUNCTION public.fire_scheduled_newsletter_drafts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d RECORD;
  fired int := 0;
BEGIN
  FOR d IN
    SELECT id FROM newsletter_drafts
     WHERE status = 'scheduled'
       AND scheduled_at IS NOT NULL
       AND scheduled_at <= now()
     ORDER BY scheduled_at ASC
     LIMIT 10
  LOOP
    UPDATE newsletter_drafts
       SET status = 'approved', last_error = NULL
     WHERE id = d.id AND status = 'scheduled';

    PERFORM public.cron_invoke_edge_function(
      'send-newsletter',
      jsonb_build_object('draft_id', d.id)
    );

    fired := fired + 1;
  END LOOP;

  RETURN fired;
END
$$;

COMMENT ON FUNCTION public.fire_scheduled_newsletter_drafts IS
  'Cron helper: scans newsletter_drafts for status=scheduled + scheduled_at <= now(), flips each to approved, and invokes send-newsletter over HTTP so the SES fan-out runs. Batch size 10 per tick (2-min cadence).';

REVOKE ALL ON FUNCTION public.fire_scheduled_newsletter_drafts FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.fire_scheduled_newsletter_drafts TO postgres, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'newsletter-scheduler-2min') THEN
    PERFORM cron.unschedule('newsletter-scheduler-2min');
  END IF;
END $$;

SELECT cron.schedule(
  'newsletter-scheduler-2min',
  '*/2 * * * *',
  $cron$ SELECT public.fire_scheduled_newsletter_drafts(); $cron$
);

NOTIFY pgrst, 'reload schema';
