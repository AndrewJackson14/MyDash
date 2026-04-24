-- ============================================================
-- 122 — Lock down anon access to subscribers / subscriptions.
--
-- Before: anon could SELECT every column of every subscriber row
-- (the "by_email" filter was client-side only) and UPDATE any column
-- on any row. Subscriptions were also fully anon-readable.
--
-- After: anon can only INSERT a free-tier subscriber. Authenticated
-- users (via Supabase Auth OTP) can read their own subscriber row +
-- subscriptions, and update their address via a SECURITY DEFINER RPC
-- that only touches address/contact columns.
--
-- Note: the public.sites view inherits RLS from publications (RLS-on
-- with a permissive read). publications.settings has no secrets
-- (verified: colors, social URLs, GA IDs, weather coords, layout) so
-- public read stays as-is.
-- ============================================================

-- 1) Drop wide-open SELECT/UPDATE on subscribers
DROP POLICY IF EXISTS "anon_read_subscriber_by_email" ON public.subscribers;
DROP POLICY IF EXISTS "anon_update_subscriber_address" ON public.subscribers;

-- 2) Tighten anon insert: free signups only (paid path goes through Stripe webhook + service role).
DROP POLICY IF EXISTS "anon_insert_subscribers" ON public.subscribers;
CREATE POLICY "anon_insert_free_subscriber"
  ON public.subscribers
  FOR INSERT TO anon
  WITH CHECK (
    stripe_customer_id IS NULL
    AND COALESCE(amount_paid, 0) = 0
    AND COALESCE(payment_method, 'free') = 'free'
  );

-- 3) Authenticated users can read their own subscriber row
CREATE POLICY "authed_read_own_subscriber"
  ON public.subscribers
  FOR SELECT TO authenticated
  USING (lower(email) = lower(auth.email()));

-- 4) Drop wide-open SELECT/INSERT on subscriptions
DROP POLICY IF EXISTS "anon_read_subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "anon_insert_subscriptions" ON public.subscriptions;

-- 5) Authenticated users can read their own subscriptions
CREATE POLICY "authed_read_own_subscription"
  ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    subscriber_id IN (
      SELECT id FROM public.subscribers
      WHERE lower(email) = lower(auth.email())
    )
  );

-- 6) Address update goes through a SECURITY DEFINER RPC so the client
--    never gets a generic UPDATE grant on subscribers — eliminates the
--    risk of anyone changing status/amount_paid/stripe_customer_id on
--    their own row.
CREATE OR REPLACE FUNCTION public.update_my_subscriber_address(
  p_address_line1 text,
  p_address_line2 text,
  p_city          text,
  p_state         text,
  p_zip           text,
  p_phone         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  v_email := lower(auth.email());
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  UPDATE public.subscribers
  SET
    address_line1 = p_address_line1,
    address_line2 = p_address_line2,
    city          = p_city,
    state         = p_state,
    zip           = p_zip,
    phone         = p_phone,
    updated_at    = now()
  WHERE lower(email) = v_email;
END
$$;

REVOKE ALL ON FUNCTION public.update_my_subscriber_address(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_subscriber_address(text,text,text,text,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
