-- 151_anthony_p5e_tearsheet_token_and_rpc.sql
-- Anthony Phase 5e — public client tearsheet portal. Each sale gets
-- an unguessable tearsheet_token; the public RPC get_tearsheet
-- accepts that token and returns the sale's tearsheet payload (page,
-- pdf_url, pub branding) without requiring auth.
--
-- Why a SECURITY DEFINER RPC vs. an edge function: the join across
-- sales/clients/issues/publications/print_runs is one round-trip when
-- pushed into Postgres, and the function bypasses RLS without exposing
-- the service role to the browser. A future portal that adds
-- thumbnails or signed URLs can layer in an edge function without
-- changing this contract.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS tearsheet_token uuid DEFAULT gen_random_uuid();

UPDATE sales SET tearsheet_token = gen_random_uuid() WHERE tearsheet_token IS NULL;

ALTER TABLE sales ALTER COLUMN tearsheet_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tearsheet_token ON sales(tearsheet_token);

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
    AND s.status = 'Closed'
    AND s.page IS NOT NULL;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tearsheet(uuid) TO anon, authenticated;
