-- 199_auth_rls_initplan_wrap.sql
-- Wrap auth.uid() / auth.role() / auth.jwt() / current_setting() in scalar
-- subqueries inside RLS policies so Postgres caches the value once
-- per query instead of re-evaluating per row. Pure latency win;
-- semantics unchanged.
--
-- Generated DDL: DROP POLICY + CREATE POLICY for each of the 69 flagged
-- policies. Wrapped in a transaction so any failure rolls back the
-- whole batch.

BEGIN;

-- activity_targets
DROP POLICY IF EXISTS activity_targets_publisher_write ON public.activity_targets;
CREATE POLICY activity_targets_publisher_write ON public.activity_targets
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1 FROM people
    WHERE ((people.auth_id = (SELECT auth.uid())) AND (people.role = 'Publisher'::team_role)))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM people
    WHERE ((people.auth_id = (SELECT auth.uid())) AND (people.role = 'Publisher'::team_role)))));

-- client_contacts
DROP POLICY IF EXISTS portal_contacts_read ON public.client_contacts;
CREATE POLICY portal_contacts_read ON public.client_contacts
  AS PERMISSIVE FOR SELECT TO public
  USING (((email = ((SELECT auth.jwt()) ->> 'email'::text)) OR has_permission('admin'::text) OR has_permission('sales'::text) OR has_permission('clients'::text)));

-- contract_imports
DROP POLICY IF EXISTS contract_imports_insert ON public.contract_imports;
CREATE POLICY contract_imports_insert ON public.contract_imports
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((uploaded_by IS NULL) OR (uploaded_by IN ( SELECT people.id FROM people
    WHERE (people.auth_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS contract_imports_select ON public.contract_imports;
CREATE POLICY contract_imports_select ON public.contract_imports
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((uploaded_by IN ( SELECT people.id FROM people
    WHERE (people.auth_id = (SELECT auth.uid())))) OR (EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Salesperson'::team_role, 'Publisher'::team_role, 'Office Administrator'::team_role])))))));

DROP POLICY IF EXISTS contract_imports_update ON public.contract_imports;
CREATE POLICY contract_imports_update ON public.contract_imports
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((uploaded_by IN ( SELECT people.id FROM people
    WHERE (people.auth_id = (SELECT auth.uid())))) OR (EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Salesperson'::team_role, 'Publisher'::team_role, 'Office Administrator'::team_role])))))));

-- contracts
DROP POLICY IF EXISTS portal_contracts_read ON public.contracts;
CREATE POLICY portal_contracts_read ON public.contracts
  AS PERMISSIVE FOR SELECT TO public
  USING (((client_id IN ( SELECT cc.client_id FROM client_contacts cc
    WHERE (cc.email = ((SELECT auth.jwt()) ->> 'email'::text)))) OR has_permission('admin'::text) OR has_permission('sales'::text)));

-- credit_memos
DROP POLICY IF EXISTS "Authenticated users can manage credit_memos" ON public.credit_memos;
CREATE POLICY "Authenticated users can manage credit_memos" ON public.credit_memos
  AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

-- driver_messages
DROP POLICY IF EXISTS driver_messages_own ON public.driver_messages;
CREATE POLICY driver_messages_own ON public.driver_messages
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text)));

DROP POLICY IF EXISTS office_all_driver_messages ON public.driver_messages;
CREATE POLICY office_all_driver_messages ON public.driver_messages
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) IN ( SELECT people.auth_id FROM people WHERE (people.status = 'active'::text))));

-- driver_route_pubs
DROP POLICY IF EXISTS driver_read_own_route_pubs ON public.driver_route_pubs;
CREATE POLICY driver_read_own_route_pubs ON public.driver_route_pubs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((route_id IN ( SELECT route_instances.route_template_id FROM route_instances
    WHERE (((route_instances.driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text)) AND (route_instances.status = ANY (ARRAY['scheduled'::text, 'sms_sent'::text, 'in_progress'::text]))))));

DROP POLICY IF EXISTS office_all_driver_route_pubs ON public.driver_route_pubs;
CREATE POLICY office_all_driver_route_pubs ON public.driver_route_pubs
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) IN ( SELECT people.auth_id FROM people WHERE (people.status = 'active'::text))));

-- driver_routes
DROP POLICY IF EXISTS office_all_driver_routes ON public.driver_routes;
CREATE POLICY office_all_driver_routes ON public.driver_routes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) IN ( SELECT people.auth_id FROM people WHERE (people.status = 'active'::text))));

-- drop_locations
DROP POLICY IF EXISTS driver_insert_drop_locations ON public.drop_locations;
CREATE POLICY driver_insert_drop_locations ON public.drop_locations
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((source = 'driver-added'::text) AND ((created_by_driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text))));

DROP POLICY IF EXISTS driver_read_route_locations ON public.drop_locations;
CREATE POLICY driver_read_route_locations ON public.drop_locations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((id IN ( SELECT route_stops.drop_location_id FROM route_stops
    WHERE (route_stops.route_id IN ( SELECT route_instances.route_template_id FROM route_instances
      WHERE (((route_instances.driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text)) AND (route_instances.status = ANY (ARRAY['scheduled'::text, 'sms_sent'::text, 'in_progress'::text]))))))));

DROP POLICY IF EXISTS driver_update_notes_on_own_route_locations ON public.drop_locations;
CREATE POLICY driver_update_notes_on_own_route_locations ON public.drop_locations
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((id IN ( SELECT route_stops.drop_location_id FROM route_stops
    WHERE (route_stops.route_id IN ( SELECT route_instances.route_template_id FROM route_instances
      WHERE (((route_instances.driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text)) AND (route_instances.status = ANY (ARRAY['scheduled'::text, 'sms_sent'::text, 'in_progress'::text]))))))));

DROP POLICY IF EXISTS office_read_drop_locations ON public.drop_locations;
CREATE POLICY office_read_drop_locations ON public.drop_locations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) IN ( SELECT people.auth_id FROM people WHERE (people.status = 'active'::text))));

DROP POLICY IF EXISTS office_write_drop_locations ON public.drop_locations;
CREATE POLICY office_write_drop_locations ON public.drop_locations
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) IN ( SELECT people.auth_id FROM people WHERE (people.status = 'active'::text))));

-- flatplan_page_layouts
DROP POLICY IF EXISTS flatplan_layouts_select ON public.flatplan_page_layouts;
CREATE POLICY flatplan_layouts_select ON public.flatplan_page_layouts
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM people WHERE ((people.auth_id = (SELECT auth.uid())) AND (people.status = 'active'::text)))));

-- flatplan_page_status
DROP POLICY IF EXISTS "production can insert page status" ON public.flatplan_page_status;
CREATE POLICY "production can insert page status" ON public.flatplan_page_status
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Layout Designer'::team_role, 'Publisher'::team_role]))))));

DROP POLICY IF EXISTS "production can update page status" ON public.flatplan_page_status;
CREATE POLICY "production can update page status" ON public.flatplan_page_status
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Layout Designer'::team_role, 'Publisher'::team_role]))))));

-- free_email_domains
DROP POLICY IF EXISTS free_email_domains_write ON public.free_email_domains;
CREATE POLICY free_email_domains_write ON public.free_email_domains
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.global_role = 'super_admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.global_role = 'super_admin'::text)))));

-- gmail_watches
DROP POLICY IF EXISTS gmail_watches_self_read ON public.gmail_watches;
CREATE POLICY gmail_watches_self_read ON public.gmail_watches
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = (SELECT auth.uid())));

-- google_tokens
DROP POLICY IF EXISTS "Service role full access" ON public.google_tokens;
CREATE POLICY "Service role full access" ON public.google_tokens
  AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users manage own tokens" ON public.google_tokens;
CREATE POLICY "Users manage own tokens" ON public.google_tokens
  AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

-- industries
DROP POLICY IF EXISTS industries_publisher_write ON public.industries;
CREATE POLICY industries_publisher_write ON public.industries
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND ((tm.global_role = 'super_admin'::text) OR (tm.role = 'Publisher'::team_role))))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND ((tm.global_role = 'super_admin'::text) OR (tm.role = 'Publisher'::team_role))))));

-- issue_goal_allocations
DROP POLICY IF EXISTS "Admin manages allocations" ON public.issue_goal_allocations;
CREATE POLICY "Admin manages allocations" ON public.issue_goal_allocations
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_permission('admin'::text) OR (EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = 'Publisher'::team_role))))));

DROP POLICY IF EXISTS "Admin sees all allocations" ON public.issue_goal_allocations;
CREATE POLICY "Admin sees all allocations" ON public.issue_goal_allocations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_permission('admin'::text) OR (EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = 'Publisher'::team_role))))));

DROP POLICY IF EXISTS "Salesperson sees own allocations" ON public.issue_goal_allocations;
CREATE POLICY "Salesperson sees own allocations" ON public.issue_goal_allocations
  AS PERMISSIVE FOR SELECT TO public
  USING ((salesperson_id = ( SELECT people.id FROM people WHERE (people.auth_id = (SELECT auth.uid())))));

-- issue_proof_annotations
DROP POLICY IF EXISTS "authors delete annotations" ON public.issue_proof_annotations;
CREATE POLICY "authors delete annotations" ON public.issue_proof_annotations
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.id = issue_proof_annotations.author_id)))));

DROP POLICY IF EXISTS "team updates annotations" ON public.issue_proof_annotations;
CREATE POLICY "team updates annotations" ON public.issue_proof_annotations
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.id = issue_proof_annotations.author_id)))) OR (EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Layout Designer'::team_role, 'Publisher'::team_role, 'Content Editor'::team_role])))))));

DROP POLICY IF EXISTS "team writes own annotations" ON public.issue_proof_annotations;
CREATE POLICY "team writes own annotations" ON public.issue_proof_annotations
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.id = issue_proof_annotations.author_id)))));

-- issue_proofs
DROP POLICY IF EXISTS "production updates proofs" ON public.issue_proofs;
CREATE POLICY "production updates proofs" ON public.issue_proofs
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Layout Designer'::team_role, 'Publisher'::team_role, 'Content Editor'::team_role]))))));

DROP POLICY IF EXISTS "production writes proofs" ON public.issue_proofs;
CREATE POLICY "production writes proofs" ON public.issue_proofs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Layout Designer'::team_role, 'Publisher'::team_role, 'Content Editor'::team_role]))))));

-- location_audit_log
DROP POLICY IF EXISTS driver_insert_audit_log ON public.location_audit_log;
CREATE POLICY driver_insert_audit_log ON public.location_audit_log
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((actor_type = 'driver'::text) AND ((actor_driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text))));

DROP POLICY IF EXISTS office_all_location_audit_log ON public.location_audit_log;
CREATE POLICY office_all_location_audit_log ON public.location_audit_log
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) IN ( SELECT people.auth_id FROM people WHERE (people.status = 'active'::text))));

-- merch_order_items
DROP POLICY IF EXISTS "Auth users manage merch_order_items" ON public.merch_order_items;
CREATE POLICY "Auth users manage merch_order_items" ON public.merch_order_items
  AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

-- merch_orders
DROP POLICY IF EXISTS "Auth users manage merch_orders" ON public.merch_orders;
CREATE POLICY "Auth users manage merch_orders" ON public.merch_orders
  AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

-- merch_product_variants
DROP POLICY IF EXISTS "Auth users manage merch_product_variants" ON public.merch_product_variants;
CREATE POLICY "Auth users manage merch_product_variants" ON public.merch_product_variants
  AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

-- merch_products
DROP POLICY IF EXISTS "Auth users manage merch_products" ON public.merch_products;
CREATE POLICY "Auth users manage merch_products" ON public.merch_products
  AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

-- merch_shops
DROP POLICY IF EXISTS "Auth users manage merch_shops" ON public.merch_shops;
CREATE POLICY "Auth users manage merch_shops" ON public.merch_shops
  AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

-- message_attachments
DROP POLICY IF EXISTS attachments_delete ON public.message_attachments;
CREATE POLICY attachments_delete ON public.message_attachments
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM (messages m
    JOIN people tm ON ((tm.auth_id = (SELECT auth.uid()))))
    WHERE ((m.id = message_attachments.message_id) AND ((m.sender_id = tm.id) OR has_permission('admin'::text))))));

DROP POLICY IF EXISTS attachments_insert ON public.message_attachments;
CREATE POLICY attachments_insert ON public.message_attachments
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1 FROM people
    WHERE ((people.auth_id = (SELECT auth.uid())) AND (people.status = 'active'::text)))));

DROP POLICY IF EXISTS attachments_select ON public.message_attachments;
CREATE POLICY attachments_select ON public.message_attachments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM people
    WHERE ((people.auth_id = (SELECT auth.uid())) AND (people.status = 'active'::text)))));

-- messages
DROP POLICY IF EXISTS messages_delete ON public.messages;
CREATE POLICY messages_delete ON public.messages
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((sender_id IN ( SELECT people.id FROM people
    WHERE (people.auth_id = (SELECT auth.uid())))) OR has_permission('admin'::text)));

DROP POLICY IF EXISTS messages_update ON public.messages;
CREATE POLICY messages_update ON public.messages
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((sender_id IN ( SELECT people.id FROM people
    WHERE (people.auth_id = (SELECT auth.uid())))) OR has_permission('admin'::text)));

-- payments
DROP POLICY IF EXISTS portal_payments_read ON public.payments;
CREATE POLICY portal_payments_read ON public.payments
  AS PERMISSIVE FOR SELECT TO public
  USING (((invoice_id IN ( SELECT i.id FROM invoices i
    WHERE (i.client_id IN ( SELECT cc.client_id FROM client_contacts cc
      WHERE (cc.email = ((SELECT auth.jwt()) ->> 'email'::text)))))) OR has_permission('admin'::text) OR has_permission('sales'::text)));

-- press_release_log
DROP POLICY IF EXISTS press_log_admin_or_editorial_read ON public.press_release_log;
CREATE POLICY press_log_admin_or_editorial_read ON public.press_release_log
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_admin() OR (EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Publisher'::team_role, 'Content Editor'::team_role])))))));

-- print_runs
DROP POLICY IF EXISTS "production updates print_runs" ON public.print_runs;
CREATE POLICY "production updates print_runs" ON public.print_runs
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Layout Designer'::team_role, 'Publisher'::team_role]))))));

DROP POLICY IF EXISTS "production writes print_runs" ON public.print_runs;
CREATE POLICY "production writes print_runs" ON public.print_runs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Layout Designer'::team_role, 'Publisher'::team_role]))))));

-- printer_publications
DROP POLICY IF EXISTS "publisher writes printer_publications" ON public.printer_publications;
CREATE POLICY "publisher writes printer_publications" ON public.printer_publications
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Publisher'::team_role, 'Layout Designer'::team_role]))))));

-- printers
DROP POLICY IF EXISTS "publisher deletes printers" ON public.printers;
CREATE POLICY "publisher deletes printers" ON public.printers
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Publisher'::team_role, 'Layout Designer'::team_role]))))));

DROP POLICY IF EXISTS "publisher updates printers" ON public.printers;
CREATE POLICY "publisher updates printers" ON public.printers
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Publisher'::team_role, 'Layout Designer'::team_role]))))));

DROP POLICY IF EXISTS "publisher writes printers" ON public.printers;
CREATE POLICY "publisher writes printers" ON public.printers
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1 FROM people tm
    WHERE ((tm.auth_id = (SELECT auth.uid())) AND (tm.role = ANY (ARRAY['Publisher'::team_role, 'Layout Designer'::team_role]))))));

-- quickbooks_tokens
DROP POLICY IF EXISTS "Service role full access" ON public.quickbooks_tokens;
CREATE POLICY "Service role full access" ON public.quickbooks_tokens
  AS PERMISSIVE FOR ALL TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

-- route_gps_track
-- driver_insert_own_gps WITH CHECK had a paren mismatch in the agent-generated
-- output (7 opens vs 6 closes). Fixed: added closing paren before the trailing
-- semicolon to match the parallel driver_read_own_gps USING balance.
DROP POLICY IF EXISTS driver_insert_own_gps ON public.route_gps_track;
CREATE POLICY driver_insert_own_gps ON public.route_gps_track
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text)));

DROP POLICY IF EXISTS driver_read_own_gps ON public.route_gps_track;
CREATE POLICY driver_read_own_gps ON public.route_gps_track
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text)));

DROP POLICY IF EXISTS office_read_all_gps ON public.route_gps_track;
CREATE POLICY office_read_all_gps ON public.route_gps_track
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) IN ( SELECT people.auth_id FROM people WHERE (people.status = 'active'::text))));

-- route_instances
DROP POLICY IF EXISTS driver_read_own_instances ON public.route_instances;
CREATE POLICY driver_read_own_instances ON public.route_instances
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text)));

DROP POLICY IF EXISTS driver_update_own_instances ON public.route_instances;
CREATE POLICY driver_update_own_instances ON public.route_instances
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text)));

DROP POLICY IF EXISTS office_all_route_instances ON public.route_instances;
CREATE POLICY office_all_route_instances ON public.route_instances
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) IN ( SELECT people.auth_id FROM people WHERE (people.status = 'active'::text))));

-- route_stops
DROP POLICY IF EXISTS driver_insert_own_route_stops ON public.route_stops;
CREATE POLICY driver_insert_own_route_stops ON public.route_stops
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((route_id IN ( SELECT route_instances.route_template_id FROM route_instances
    WHERE (((route_instances.driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text)) AND (route_instances.status = ANY (ARRAY['scheduled'::text, 'sms_sent'::text, 'in_progress'::text]))))));

DROP POLICY IF EXISTS driver_read_own_route_stops ON public.route_stops;
CREATE POLICY driver_read_own_route_stops ON public.route_stops
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((route_id IN ( SELECT route_instances.route_template_id FROM route_instances
    WHERE (((route_instances.driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text)) AND (route_instances.status = ANY (ARRAY['scheduled'::text, 'sms_sent'::text, 'in_progress'::text]))))));

DROP POLICY IF EXISTS office_all_route_stops ON public.route_stops;
CREATE POLICY office_all_route_stops ON public.route_stops
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) IN ( SELECT people.auth_id FROM people WHERE (people.status = 'active'::text))));

-- stop_confirmations
DROP POLICY IF EXISTS driver_write_own_confirmations ON public.stop_confirmations;
CREATE POLICY driver_write_own_confirmations ON public.stop_confirmations
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((route_instance_id IN ( SELECT route_instances.id FROM route_instances
    WHERE ((route_instances.driver_id)::text = (((SELECT current_setting('request.jwt.claims'::text, true))::json) ->> 'driver_id'::text)))));

DROP POLICY IF EXISTS office_all_stop_confirmations ON public.stop_confirmations;
CREATE POLICY office_all_stop_confirmations ON public.stop_confirmations
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) IN ( SELECT people.auth_id FROM people WHERE (people.status = 'active'::text))));

-- support_admin_journal
DROP POLICY IF EXISTS support_journal_self_insert ON public.support_admin_journal;
CREATE POLICY support_journal_self_insert ON public.support_admin_journal
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = ( SELECT people.id FROM people WHERE (people.auth_id = (SELECT auth.uid())) LIMIT 1)));

DROP POLICY IF EXISTS support_journal_self_select ON public.support_admin_journal;
CREATE POLICY support_journal_self_select ON public.support_admin_journal
  AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = ( SELECT people.id FROM people WHERE (people.auth_id = (SELECT auth.uid())) LIMIT 1)));

DROP POLICY IF EXISTS support_journal_self_update ON public.support_admin_journal;
CREATE POLICY support_journal_self_update ON public.support_admin_journal
  AS PERMISSIVE FOR UPDATE TO public
  USING ((user_id = ( SELECT people.id FROM people WHERE (people.auth_id = (SELECT auth.uid())) LIMIT 1)));

-- thread_reads
DROP POLICY IF EXISTS thread_reads_self ON public.thread_reads;
CREATE POLICY thread_reads_self ON public.thread_reads
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = ( SELECT people.id FROM people WHERE (people.auth_id = (SELECT auth.uid())))))
  WITH CHECK ((user_id = ( SELECT people.id FROM people WHERE (people.auth_id = (SELECT auth.uid())))));

COMMIT;
