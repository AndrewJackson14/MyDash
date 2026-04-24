-- ============================================================
-- 109b — Back-office tables: tighten ALL/true policies to
-- permission-gated. Only the policies the advisor flagged as
-- "rls_policy_always_true" are touched; existing INSERT/SELECT
-- policies that gate on permissions are left alone.
--
-- Permission convention (from has_permission):
--   admin     — superuser, every check returns true
--   editorial — content side (stories, editions, tags, legal)
--   sales     — proposals, outreach, commission ledger
-- ============================================================

-- ─── Editorial / content surface ───────────────────────────
DROP POLICY IF EXISTS "Auth manage ad_zones" ON public.ad_zones;
CREATE POLICY ad_zones_editorial_admin ON public.ad_zones
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('editorial'))
  WITH CHECK (has_permission('admin') OR has_permission('editorial'));

DROP POLICY IF EXISTS "Auth manage redirects" ON public.redirects;
CREATE POLICY redirects_editorial_admin ON public.redirects
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('editorial'))
  WITH CHECK (has_permission('admin') OR has_permission('editorial'));

DROP POLICY IF EXISTS "Auth manage tags" ON public.tags;
CREATE POLICY tags_editorial_admin ON public.tags
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('editorial'))
  WITH CHECK (has_permission('admin') OR has_permission('editorial'));

DROP POLICY IF EXISTS "Auth manage article_tags" ON public.article_tags;
CREATE POLICY article_tags_editorial_admin ON public.article_tags
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('editorial'))
  WITH CHECK (has_permission('admin') OR has_permission('editorial'));

DROP POLICY IF EXISTS "Auth manage revisions" ON public.article_revisions;
CREATE POLICY article_revisions_editorial_admin ON public.article_revisions
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('editorial'))
  WITH CHECK (has_permission('admin') OR has_permission('editorial'));

DROP POLICY IF EXISTS "Auth delete categories" ON public.categories;
DROP POLICY IF EXISTS "Auth insert categories" ON public.categories;
DROP POLICY IF EXISTS "Auth update categories" ON public.categories;
CREATE POLICY categories_editorial_write ON public.categories
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('editorial'))
  WITH CHECK (has_permission('admin') OR has_permission('editorial'));

DROP POLICY IF EXISTS "Auth manage issuu_editions" ON public.editions;
DROP POLICY IF EXISTS "Authenticated users can manage editions" ON public.editions;
CREATE POLICY editions_editorial_admin ON public.editions
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('editorial'))
  WITH CHECK (has_permission('admin') OR has_permission('editorial'));

DROP POLICY IF EXISTS "Authenticated users can manage editorial_permissions" ON public.editorial_permissions;
CREATE POLICY editorial_permissions_admin ON public.editorial_permissions
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

DROP POLICY IF EXISTS "Authenticated users can insert story_activity" ON public.story_activity;
CREATE POLICY story_activity_insert ON public.story_activity
  FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin') OR has_permission('editorial') OR has_permission('stories'));

DROP POLICY IF EXISTS lnc_write ON public.legal_notice_clippings;
CREATE POLICY lnc_write_editorial_admin ON public.legal_notice_clippings
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('editorial'))
  WITH CHECK (has_permission('admin') OR has_permission('editorial'));

-- ─── Sales / proposals / commissions ───────────────────────
DROP POLICY IF EXISTS proposals_all ON public.proposals;
CREATE POLICY proposals_sales_admin ON public.proposals
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('sales') OR has_permission('clients'))
  WITH CHECK (has_permission('admin') OR has_permission('sales') OR has_permission('clients'));

DROP POLICY IF EXISTS proposal_lines_all ON public.proposal_lines;
CREATE POLICY proposal_lines_sales_admin ON public.proposal_lines
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('sales') OR has_permission('clients'))
  WITH CHECK (has_permission('admin') OR has_permission('sales') OR has_permission('clients'));

DROP POLICY IF EXISTS "Authenticated users can manage signatures" ON public.proposal_signatures;
CREATE POLICY proposal_signatures_sales_admin ON public.proposal_signatures
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('sales'))
  WITH CHECK (has_permission('admin') OR has_permission('sales'));

DROP POLICY IF EXISTS ad_projects_all ON public.ad_projects;
CREATE POLICY ad_projects_team ON public.ad_projects
  FOR ALL TO authenticated
  USING (
    has_permission('admin') OR has_permission('sales')
    OR has_permission('editorial') OR has_permission('clients')
  )
  WITH CHECK (
    has_permission('admin') OR has_permission('sales')
    OR has_permission('editorial') OR has_permission('clients')
  );

DROP POLICY IF EXISTS ad_proofs_all ON public.ad_proofs;
CREATE POLICY ad_proofs_team ON public.ad_proofs
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('sales') OR has_permission('editorial'))
  WITH CHECK (has_permission('admin') OR has_permission('sales') OR has_permission('editorial'));

DROP POLICY IF EXISTS cig_all ON public.commission_issue_goals;
CREATE POLICY cig_sales_admin ON public.commission_issue_goals
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('sales'))
  WITH CHECK (has_permission('admin') OR has_permission('sales'));

DROP POLICY IF EXISTS cl_all ON public.commission_ledger;
CREATE POLICY cl_sales_admin ON public.commission_ledger
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('sales'))
  WITH CHECK (has_permission('admin') OR has_permission('sales'));

DROP POLICY IF EXISTS cp_all ON public.commission_payouts;
CREATE POLICY cp_admin_only ON public.commission_payouts
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

DROP POLICY IF EXISTS spa_all ON public.salesperson_pub_assignments;
CREATE POLICY spa_admin_only ON public.salesperson_pub_assignments
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

DROP POLICY IF EXISTS "Authenticated users can modify outreach campaigns" ON public.outreach_campaigns;
DROP POLICY IF EXISTS oc_all ON public.outreach_campaigns;
CREATE POLICY outreach_campaigns_sales ON public.outreach_campaigns
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('sales'))
  WITH CHECK (has_permission('admin') OR has_permission('sales'));

DROP POLICY IF EXISTS "Authenticated users can modify outreach entries" ON public.outreach_entries;
DROP POLICY IF EXISTS oe_all ON public.outreach_entries;
CREATE POLICY outreach_entries_sales ON public.outreach_entries
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('sales'))
  WITH CHECK (has_permission('admin') OR has_permission('sales'));

-- ─── Finance / billing / printing ──────────────────────────
DROP POLICY IF EXISTS auth_delete_bills ON public.bills;
DROP POLICY IF EXISTS auth_insert_bills ON public.bills;
DROP POLICY IF EXISTS auth_update_bills ON public.bills;
CREATE POLICY bills_admin_write ON public.bills
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

DROP POLICY IF EXISTS subscription_payments_all ON public.subscription_payments;
CREATE POLICY subscription_payments_admin ON public.subscription_payments
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

DROP POLICY IF EXISTS subscriptions_all ON public.subscriptions;
CREATE POLICY subscriptions_admin ON public.subscriptions
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

DROP POLICY IF EXISTS "Authenticated users can modify printer_contacts" ON public.printer_contacts;
CREATE POLICY printer_contacts_admin ON public.printer_contacts
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

-- ─── Marketing / newsletters / mailing ────────────────────
DROP POLICY IF EXISTS mailing_lists_all ON public.mailing_lists;
CREATE POLICY mailing_lists_admin ON public.mailing_lists
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

DROP POLICY IF EXISTS newsletter_drafts_all ON public.newsletter_drafts;
DROP POLICY IF EXISTS nl_drafts_write ON public.newsletter_drafts;
CREATE POLICY newsletter_drafts_admin ON public.newsletter_drafts
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('sales'))
  WITH CHECK (has_permission('admin') OR has_permission('sales'));

DROP POLICY IF EXISTS auth_delete_newsletter_templates ON public.newsletter_templates;
DROP POLICY IF EXISTS auth_insert_newsletter_templates ON public.newsletter_templates;
DROP POLICY IF EXISTS auth_update_newsletter_templates ON public.newsletter_templates;
DROP POLICY IF EXISTS nl_templates_write ON public.newsletter_templates;
CREATE POLICY newsletter_templates_admin ON public.newsletter_templates
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

DROP POLICY IF EXISTS "Authenticated users can manage templates" ON public.email_templates;
CREATE POLICY email_templates_admin ON public.email_templates
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

DROP POLICY IF EXISTS "Authenticated can write social_posts" ON public.social_posts;
CREATE POLICY social_posts_admin ON public.social_posts
  FOR ALL TO authenticated
  USING (has_permission('admin') OR has_permission('editorial'))
  WITH CHECK (has_permission('admin') OR has_permission('editorial'));

-- ─── Site / ops ────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can modify daily_page_views" ON public.daily_page_views;
CREATE POLICY daily_page_views_admin ON public.daily_page_views
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

DROP POLICY IF EXISTS site_errors_update ON public.site_errors;
CREATE POLICY site_errors_admin_update ON public.site_errors
  FOR UPDATE TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

DROP POLICY IF EXISTS team_update_ad_inquiries ON public.ad_inquiries;
CREATE POLICY ad_inquiries_sales_update ON public.ad_inquiries
  FOR UPDATE TO authenticated
  USING (has_permission('admin') OR has_permission('sales'))
  WITH CHECK (has_permission('admin') OR has_permission('sales'));
