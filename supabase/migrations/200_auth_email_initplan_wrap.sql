-- 200_auth_email_initplan_wrap.sql
-- Mig 199 wrapped auth.uid()/auth.role()/auth.jwt()/current_setting()
-- but missed auth.email(). These two subscriber-side policies still
-- triggered the auth_rls_initplan advisor afterward.
DROP POLICY IF EXISTS authed_read_own_subscriber ON public.subscribers;
CREATE POLICY authed_read_own_subscriber ON public.subscribers
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lower(email) = lower((SELECT auth.email()))));

DROP POLICY IF EXISTS authed_read_own_subscription ON public.subscriptions;
CREATE POLICY authed_read_own_subscription ON public.subscriptions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((subscriber_id IN ( SELECT subscribers.id FROM subscribers
    WHERE (lower(subscribers.email) = lower((SELECT auth.email()))))));
