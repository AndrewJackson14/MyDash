-- ============================================================
-- Migration 166: Public share-token expiration + revocation
--
-- Four tables expose unguessable share tokens to anon users:
--   newsletter_drafts.share_token     -> /r/<token>     (campaign report)
--   sales.tearsheet_token             -> /t/<token>     (per-sale tearsheet)
--   clients.portfolio_token           -> /portfolio/<>  (client tearsheet history)
--   ad_projects.client_upload_token   -> /upload/<>     (client asset upload)
--
-- Until now these were stable for the life of the row with no way to
-- expire or revoke. If a link leaked (forwarded email, screenshot, etc.)
-- the only mitigation was rotating the column with gen_random_uuid(),
-- which silently broke any honest bookmark too.
--
-- This migration adds two nullable timestamp columns per token:
--   *_expires_at  — NULL = never expires (back-compat default)
--   *_revoked_at  — NULL = active; non-null = manually revoked
--
-- The three SECURITY DEFINER RPCs are updated to enforce the gate; the
-- ClientUpload page query (the one direct-read surface) is updated in
-- the same commit.
-- ============================================================

ALTER TABLE newsletter_drafts
  ADD COLUMN IF NOT EXISTS share_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS share_token_revoked_at timestamptz;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS tearsheet_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS tearsheet_token_revoked_at timestamptz;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS portfolio_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS portfolio_token_revoked_at timestamptz;

ALTER TABLE ad_projects
  ADD COLUMN IF NOT EXISTS client_upload_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_upload_token_revoked_at timestamptz;

-- ─── get_campaign_report: gate on share_token expiry/revocation ───
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
     AND d.share_token_revoked_at IS NULL
     AND (d.share_token_expires_at IS NULL OR d.share_token_expires_at > now())
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

GRANT EXECUTE ON FUNCTION public.get_campaign_report(uuid) TO anon, authenticated, service_role;

-- ─── get_tearsheet: gate on tearsheet_token expiry/revocation ───
CREATE OR REPLACE FUNCTION public.get_tearsheet(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'sale_id',          s.id,
    'client_name',      c.name,
    'page',             s.page,
    'ad_size',          s.ad_size,
    'pub_id',           p.id,
    'pub_name',         p.name,
    'pub_logo_url',     p.logo_url,
    'pub_primary_color', p.primary_color,
    'issue_id',         i.id,
    'issue_label',      i.label,
    'issue_date',       i.date,
    'shipped_at',       (
      SELECT pr.shipped_at
      FROM print_runs pr
      WHERE pr.issue_id = s.issue_id
      ORDER BY pr.shipped_at DESC NULLS LAST
      LIMIT 1
    ),
    'tearsheet_pdf_url', (
      SELECT t->>'pdf_url'
      FROM print_runs pr,
           jsonb_array_elements(pr.tearsheets) t
      WHERE pr.issue_id = s.issue_id
        AND pr.tearsheets IS NOT NULL
        AND (t->>'page')::int = s.page
      ORDER BY pr.confirmed_at DESC NULLS LAST, pr.shipped_at DESC NULLS LAST
      LIMIT 1
    )
  )
  INTO result
  FROM sales s
  JOIN clients c ON c.id = s.client_id
  JOIN issues i ON i.id = s.issue_id
  JOIN publications p ON p.id = i.pub_id
  WHERE s.tearsheet_token = p_token
    AND s.tearsheet_token_revoked_at IS NULL
    AND (s.tearsheet_token_expires_at IS NULL OR s.tearsheet_token_expires_at > now())
    AND s.status = 'Closed'
    AND s.page IS NOT NULL;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tearsheet(uuid) TO anon, authenticated;

-- ─── get_client_portfolio: gate on portfolio_token expiry/revocation ───
CREATE OR REPLACE FUNCTION public.get_client_portfolio(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id uuid;
  v_client_name text;
  v_tearsheets jsonb;
BEGIN
  SELECT id, name INTO v_client_id, v_client_name
  FROM clients
  WHERE portfolio_token = p_token
    AND portfolio_token_revoked_at IS NULL
    AND (portfolio_token_expires_at IS NULL OR portfolio_token_expires_at > now())
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(row), '[]'::jsonb)
  INTO v_tearsheets
  FROM (
    SELECT jsonb_build_object(
      'sale_id',          s.id,
      'tearsheet_token',  s.tearsheet_token,
      'page',             s.page,
      'ad_size',          s.ad_size,
      'pub_id',           p.id,
      'pub_name',         p.name,
      'pub_logo_url',     p.logo_url,
      'pub_primary_color', p.primary_color,
      'issue_id',         i.id,
      'issue_label',      i.label,
      'issue_date',       i.date,
      'tearsheet_pdf_url', (
        SELECT t->>'pdf_url'
        FROM print_runs pr,
             jsonb_array_elements(pr.tearsheets) t
        WHERE pr.issue_id = s.issue_id
          AND pr.tearsheets IS NOT NULL
          AND (t->>'page')::int = s.page
        ORDER BY pr.confirmed_at DESC NULLS LAST, pr.shipped_at DESC NULLS LAST
        LIMIT 1
      )
    ) AS row
    FROM sales s
    JOIN issues i ON i.id = s.issue_id
    JOIN publications p ON p.id = i.pub_id
    WHERE s.client_id = v_client_id
      AND s.status = 'Closed'
      AND s.page IS NOT NULL
      AND s.tearsheet_token_revoked_at IS NULL
      AND (s.tearsheet_token_expires_at IS NULL OR s.tearsheet_token_expires_at > now())
    ORDER BY i.date DESC NULLS LAST, s.page ASC
  ) sub;

  RETURN jsonb_build_object(
    'client_id',   v_client_id,
    'client_name', v_client_name,
    'tearsheets',  v_tearsheets
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_portfolio(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
