-- 153_anthony_p5i_manual_tearsheet_upload.sql
-- Anthony Phase 5i — manual tearsheet upload model. Anthony doesn't
-- upload PDFs to MyDash (each printer has its own FTP portal he uses
-- directly), so the auto-split-from-master-PDF path from P5c rarely
-- fires in practice. Sales reps + Cami curate tearsheets case-by-case
-- per sale: drop a PDF or JPG, it lands on BunnyCDN, the URL goes on
-- sales.tearsheet_url, and both public portals (P5e per-sale and P5g
-- per-client portfolio) prefer it over the auto-split fallback.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS tearsheet_url text,
  ADD COLUMN IF NOT EXISTS tearsheet_filename text,
  ADD COLUMN IF NOT EXISTS tearsheet_kind text CHECK (tearsheet_kind IN ('pdf','image')),
  ADD COLUMN IF NOT EXISTS tearsheet_byte_size bigint,
  ADD COLUMN IF NOT EXISTS tearsheet_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS tearsheet_uploaded_by uuid REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS tearsheet_bunny_path text;

CREATE INDEX IF NOT EXISTS idx_sales_with_tearsheet
  ON sales(client_id) WHERE tearsheet_url IS NOT NULL;

-- Rebuild the public RPCs to prefer sales.tearsheet_url when present,
-- falling back to print_runs.tearsheets only when the manual path is
-- empty. tearsheet_kind comes through so the portal pages can pick
-- between an iframe (PDF) and an <img> (image).

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
    'tearsheet_pdf_url', COALESCE(
      s.tearsheet_url,
      (
        SELECT t->>'pdf_url'
        FROM print_runs pr,
             jsonb_array_elements(pr.tearsheets) t
        WHERE pr.issue_id = s.issue_id
          AND pr.tearsheets IS NOT NULL
          AND (t->>'page')::int = s.page
        ORDER BY pr.confirmed_at DESC NULLS LAST, pr.shipped_at DESC NULLS LAST
        LIMIT 1
      )
    ),
    'tearsheet_kind',   COALESCE(
      s.tearsheet_kind,
      CASE WHEN s.tearsheet_url IS NULL THEN 'pdf' ELSE NULL END
    ),
    'tearsheet_filename', s.tearsheet_filename,
    'manual_upload',    s.tearsheet_url IS NOT NULL
  )
  INTO result
  FROM sales s
  JOIN clients c ON c.id = s.client_id
  JOIN issues i ON i.id = s.issue_id
  JOIN publications p ON p.id = i.pub_id
  WHERE s.tearsheet_token = p_token
    AND s.status = 'Closed'
    AND s.page IS NOT NULL;

  RETURN result;
END;
$$;

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
      'tearsheet_pdf_url', COALESCE(
        s.tearsheet_url,
        (
          SELECT t->>'pdf_url'
          FROM print_runs pr,
               jsonb_array_elements(pr.tearsheets) t
          WHERE pr.issue_id = s.issue_id
            AND pr.tearsheets IS NOT NULL
            AND (t->>'page')::int = s.page
          ORDER BY pr.confirmed_at DESC NULLS LAST, pr.shipped_at DESC NULLS LAST
          LIMIT 1
        )
      ),
      'tearsheet_kind',   COALESCE(
        s.tearsheet_kind,
        CASE WHEN s.tearsheet_url IS NULL THEN 'pdf' ELSE NULL END
      ),
      'manual_upload',    s.tearsheet_url IS NOT NULL
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

GRANT EXECUTE ON FUNCTION public.get_tearsheet(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_portfolio(uuid) TO anon, authenticated;
