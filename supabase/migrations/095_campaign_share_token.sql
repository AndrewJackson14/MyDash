-- ============================================================
-- Migration 095: Campaign analytics share tokens
--
-- share_token is the unguessable key in public campaign report
-- URLs (https://mydash.media/r/<token>). Auto-populated on
-- insert; stays stable for the life of the draft so advertiser
-- bookmarks don't rot.
--
-- Public access goes through the get_campaign_report(uuid) RPC
-- (SECURITY DEFINER, granted to anon) rather than a raw SELECT
-- policy, so anon users can never list drafts by iterating.
-- ============================================================

ALTER TABLE newsletter_drafts
  ADD COLUMN IF NOT EXISTS share_token uuid UNIQUE DEFAULT gen_random_uuid();

UPDATE newsletter_drafts
SET share_token = gen_random_uuid()
WHERE share_token IS NULL;

CREATE OR REPLACE FUNCTION public.get_campaign_report(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft RECORD;
  v_stats RECORD;
  v_timeseries jsonb;
BEGIN
  SELECT d.id, d.subject, d.preheader, d.publication_id, d.draft_type, d.status,
         d.sent_at, d.recipient_count, d.advertiser_name, d.advertiser_logo_url,
         d.advertiser_website, d.created_at,
         p.name AS publication_name
    INTO v_draft
    FROM newsletter_drafts d
    LEFT JOIN publications p ON p.id = d.publication_id
   WHERE d.share_token = p_token
   LIMIT 1;

  IF v_draft IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*) FILTER (WHERE status IN ('sent','delivered','bounced','complained')) AS total_sent,
    count(*) FILTER (WHERE status IN ('delivered'))                               AS delivered,
    count(*) FILTER (WHERE first_opened_at IS NOT NULL)                           AS unique_opens,
    coalesce(sum(open_count), 0)                                                  AS total_opens,
    count(*) FILTER (WHERE first_clicked_at IS NOT NULL)                          AS unique_clicks,
    coalesce(sum(click_count), 0)                                                 AS total_clicks,
    count(*) FILTER (WHERE status = 'bounced')                                    AS bounces,
    count(*) FILTER (WHERE status = 'complained')                                 AS complaints
    INTO v_stats
    FROM email_sends WHERE draft_id = v_draft.id;

  SELECT jsonb_agg(row_to_json(t))
    INTO v_timeseries
    FROM (
      WITH anchor AS (
        SELECT coalesce(v_draft.sent_at, (SELECT min(sent_at) FROM email_sends WHERE draft_id = v_draft.id)) AS t0
      )
      SELECT
        gs.hour AS hour_offset,
        (SELECT count(*) FROM email_sends es, anchor
          WHERE es.draft_id = v_draft.id
            AND es.first_opened_at IS NOT NULL
            AND es.first_opened_at >= anchor.t0 + (gs.hour     || ' hours')::interval
            AND es.first_opened_at <  anchor.t0 + ((gs.hour+1) || ' hours')::interval
        ) AS opens,
        (SELECT count(*) FROM email_sends es, anchor
          WHERE es.draft_id = v_draft.id
            AND es.first_clicked_at IS NOT NULL
            AND es.first_clicked_at >= anchor.t0 + (gs.hour     || ' hours')::interval
            AND es.first_clicked_at <  anchor.t0 + ((gs.hour+1) || ' hours')::interval
        ) AS clicks
      FROM generate_series(0, 47) AS gs(hour)
    ) t;

  RETURN jsonb_build_object(
    'draft',      row_to_json(v_draft),
    'stats',      row_to_json(v_stats),
    'timeseries', coalesce(v_timeseries, '[]'::jsonb)
  );
END
$$;

COMMENT ON FUNCTION public.get_campaign_report IS
  'Read-only per-campaign stats for advertiser-shareable report pages. Input: share_token (from newsletter_drafts.share_token). Returns draft meta + aggregated email_sends stats + 48h hourly engagement timeseries, or NULL if the token does not match.';

GRANT EXECUTE ON FUNCTION public.get_campaign_report(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
