-- 152_anthony_p5g_client_portfolio_token.sql
-- Anthony Phase 5g — client portfolio portal. One unguessable token
-- per client; the public RPC get_client_portfolio returns the
-- client's entire tearsheet history (every closed sale that has a
-- page + a tearsheet PDF on print_runs.tearsheets) without auth.
--
-- Counterpart to migration 151's per-sale tearsheet portal — that
-- one shows a single page, this one aggregates every tearsheet a
-- client has ever earned with us. Same SECURITY DEFINER pattern so
-- anon callers don't need read access on sales/issues/publications/
-- print_runs.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS portfolio_token uuid DEFAULT gen_random_uuid();

UPDATE clients SET portfolio_token = gen_random_uuid() WHERE portfolio_token IS NULL;

ALTER TABLE clients ALTER COLUMN portfolio_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_portfolio_token ON clients(portfolio_token);

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
