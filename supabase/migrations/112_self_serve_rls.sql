-- Helper: does the current auth.uid() have access to this site?
-- Joins team_members.auth_id and checks site_id is in assigned_pubs
-- (or the user is a super_admin / has stellarpress access global_role).
CREATE OR REPLACE FUNCTION public.user_has_site_access(p_site_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.auth_id = auth.uid()
      AND tm.is_active = true
      AND (
        tm.global_role = 'super_admin'
        OR p_site_id = ANY(tm.assigned_pubs)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_site_access(TEXT) TO authenticated, service_role;

-- Enable RLS on every new table
ALTER TABLE free_email_domains      ENABLE ROW LEVEL SECURITY;
ALTER TABLE industries              ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_zip_codes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE advertisers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE advertiser_contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_booking_line_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolve_advertiser_log  ENABLE ROW LEVEL SECURITY;

-- ── free_email_domains ──────────────────────────────────────
DROP POLICY IF EXISTS free_email_domains_read ON free_email_domains;
CREATE POLICY free_email_domains_read ON free_email_domains FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS free_email_domains_write ON free_email_domains;
CREATE POLICY free_email_domains_write ON free_email_domains FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid() AND tm.global_role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid() AND tm.global_role = 'super_admin'));

-- ── industries ──────────────────────────────────────────────
DROP POLICY IF EXISTS industries_site_access ON industries;
CREATE POLICY industries_site_access ON industries FOR ALL TO authenticated
  USING (user_has_site_access(site_id))
  WITH CHECK (user_has_site_access(site_id));

-- ── local_zip_codes ─────────────────────────────────────────
DROP POLICY IF EXISTS local_zips_site_access ON local_zip_codes;
CREATE POLICY local_zips_site_access ON local_zip_codes FOR ALL TO authenticated
  USING (user_has_site_access(site_id))
  WITH CHECK (user_has_site_access(site_id));

-- ── advertisers ─────────────────────────────────────────────
DROP POLICY IF EXISTS advertisers_site_access ON advertisers;
CREATE POLICY advertisers_site_access ON advertisers FOR ALL TO authenticated
  USING (user_has_site_access(site_id))
  WITH CHECK (user_has_site_access(site_id));

-- ── advertiser_contacts ─────────────────────────────────────
DROP POLICY IF EXISTS advertiser_contacts_inherited ON advertiser_contacts;
CREATE POLICY advertiser_contacts_inherited ON advertiser_contacts FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM advertisers a
    WHERE a.id = advertiser_contacts.advertiser_id
      AND user_has_site_access(a.site_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM advertisers a
    WHERE a.id = advertiser_contacts.advertiser_id
      AND user_has_site_access(a.site_id)
  ));

-- ── ad_products ─────────────────────────────────────────────
DROP POLICY IF EXISTS ad_products_site_access ON ad_products;
CREATE POLICY ad_products_site_access ON ad_products FOR ALL TO authenticated
  USING (user_has_site_access(site_id))
  WITH CHECK (user_has_site_access(site_id));
-- Anon needs read access to BROWSE the catalog from the public self-serve UI.
DROP POLICY IF EXISTS ad_products_anon_read_active ON ad_products;
CREATE POLICY ad_products_anon_read_active ON ad_products FOR SELECT TO anon
  USING (is_active = true);

-- ── ad_bookings ─────────────────────────────────────────────
DROP POLICY IF EXISTS ad_bookings_site_access ON ad_bookings;
CREATE POLICY ad_bookings_site_access ON ad_bookings FOR ALL TO authenticated
  USING (user_has_site_access(site_id))
  WITH CHECK (user_has_site_access(site_id));
-- Public booking-status page reads via the get_booking_by_share_token RPC
-- (added in a later migration), not via direct table access — so no anon
-- policy needed here. Keeps share_token from being enumerable.

-- ── ad_booking_line_items ───────────────────────────────────
DROP POLICY IF EXISTS line_items_inherited ON ad_booking_line_items;
CREATE POLICY line_items_inherited ON ad_booking_line_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ad_bookings b
    WHERE b.id = ad_booking_line_items.booking_id
      AND user_has_site_access(b.site_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ad_bookings b
    WHERE b.id = ad_booking_line_items.booking_id
      AND user_has_site_access(b.site_id)
  ));

-- ── resolve_advertiser_log ──────────────────────────────────
-- Service role writes (from edge fn); no other access needed.
-- (RLS enabled with no policies = locked to service_role/postgres only.)
