-- Anon-safe lookup of "what products did this email pick on their last
-- inquiry?" — used by SelfServePage to pre-fill the cart after email
-- identification. Returns ONLY the product UUIDs and a desired-start
-- date hint; never any other inquiry data.
CREATE OR REPLACE FUNCTION public.get_prior_inquiry_products(
  p_email   TEXT,
  p_site_id TEXT
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'product_ids',   COALESCE(interested_product_ids, ARRAY[]::uuid[]),
    'desired_start', desired_start
  )
  FROM ad_inquiries
  WHERE site_id = p_site_id
    AND lower(email) = lower(trim(p_email))
    AND interested_product_ids IS NOT NULL
    AND array_length(interested_product_ids, 1) > 0
  ORDER BY created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_prior_inquiry_products(TEXT, TEXT) TO anon, authenticated, service_role;
