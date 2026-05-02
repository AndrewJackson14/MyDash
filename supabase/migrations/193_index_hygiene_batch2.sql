-- =====================================================================
-- 193_index_hygiene_batch2.sql
-- Foundational performance pass — Batch 2.
--
-- 1. Drop 9 duplicate indexes (verified byte-identical pairs).
--    Keep the version that follows the full-table-name convention.
-- 2. Add 165 missing covering indexes for foreign keys flagged by the
--    Supabase performance advisor (`unindexed_foreign_keys`).
--
-- All adds use IF NOT EXISTS to be idempotent in case the advisor list
-- and live state drift mid-pass.
--
-- Skipped on purpose:
--   - unused_index (121 entries) — dropping indexes Postgres "thinks"
--     are unused can regress queries that just haven't hit prod load
--     yet. Defer to a separate review.
--   - no_primary_key (14 tables) — case-by-case PK design, not a
--     mechanical sweep.
--   - auth_rls_initplan / multiple_permissive_policies / SECURITY
--     DEFINER views — those are Batches 3 & 4.
-- =====================================================================

-- =============================================================
-- 1. Drop duplicate indexes
-- =============================================================
DROP INDEX IF EXISTS public.idx_comm_ledger_period;
DROP INDEX IF EXISTS public.idx_comm_ledger_sale;
-- local_zips_site_zip_unique is the index backing a UNIQUE constraint of
-- the same name. DROP CONSTRAINT removes both. The duplicate
-- local_zip_codes_site_zip_uniq (also UNIQUE, same columns) keeps
-- enforcing uniqueness.
ALTER TABLE public.local_zip_codes DROP CONSTRAINT IF EXISTS local_zips_site_zip_unique;
DROP INDEX IF EXISTS public.idx_nl_drafts_pub;
DROP INDEX IF EXISTS public.idx_nl_subs_pub;
DROP INDEX IF EXISTS public.idx_oe_campaign;
DROP INDEX IF EXISTS public.idx_oe_client;
DROP INDEX IF EXISTS public.idx_proposals_client;
DROP INDEX IF EXISTS public.idx_sales_pub;

-- =============================================================
-- 2. Add covering indexes for unindexed foreign keys
-- =============================================================

-- activity_log
CREATE INDEX IF NOT EXISTS idx_activity_log_client_id          ON public.activity_log(client_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_related_user_id    ON public.activity_log(related_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_sale_id            ON public.activity_log(sale_id);

-- ad_bookings / ad_inquiries / ad_placements / ad_projects / ad_proofs / ad_sizes
CREATE INDEX IF NOT EXISTS idx_ad_bookings_approved_by         ON public.ad_bookings(approved_by);
CREATE INDEX IF NOT EXISTS idx_ad_inquiries_client_id          ON public.ad_inquiries(client_id);
CREATE INDEX IF NOT EXISTS idx_ad_inquiries_converted_by       ON public.ad_inquiries(converted_by);
CREATE INDEX IF NOT EXISTS idx_ad_placements_activated_by      ON public.ad_placements(activated_by);
CREATE INDEX IF NOT EXISTS idx_ad_placements_client_id         ON public.ad_placements(client_id);
CREATE INDEX IF NOT EXISTS idx_ad_placements_deactivated_by    ON public.ad_placements(deactivated_by);
CREATE INDEX IF NOT EXISTS idx_ad_projects_salesperson_id      ON public.ad_projects(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_ad_projects_source_contract_id  ON public.ad_projects(source_contract_id);
CREATE INDEX IF NOT EXISTS idx_ad_projects_source_proposal_id  ON public.ad_projects(source_proposal_id);
CREATE INDEX IF NOT EXISTS idx_ad_projects_thread_id           ON public.ad_projects(thread_id);
CREATE INDEX IF NOT EXISTS idx_ad_proofs_saved_by              ON public.ad_proofs(saved_by);
CREATE INDEX IF NOT EXISTS idx_ad_proofs_sent_to_client_by     ON public.ad_proofs(sent_to_client_by);
CREATE INDEX IF NOT EXISTS idx_ad_sizes_pub_id                 ON public.ad_sizes(pub_id);

-- article_revisions / article_tags
CREATE INDEX IF NOT EXISTS idx_article_revisions_author_id     ON public.article_revisions(author_id);
CREATE INDEX IF NOT EXISTS idx_article_revisions_story_id      ON public.article_revisions(story_id);
CREATE INDEX IF NOT EXISTS idx_article_tags_tag_id             ON public.article_tags(tag_id);

-- briefing_configs / calendar_events / categories / classified_*
CREATE INDEX IF NOT EXISTS idx_briefing_configs_user_id        ON public.briefing_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by      ON public.calendar_events(created_by);
CREATE INDEX IF NOT EXISTS idx_calendar_events_issue_id        ON public.calendar_events(issue_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_publication_id  ON public.calendar_events(publication_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id            ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_classified_ads_client_id        ON public.classified_ads(client_id);
CREATE INDEX IF NOT EXISTS idx_classified_ads_publication_id   ON public.classified_ads(publication_id);
CREATE INDEX IF NOT EXISTS idx_classified_rates_pub_id         ON public.classified_rates(pub_id);

-- client_sales_summary / clients
CREATE INDEX IF NOT EXISTS idx_client_sales_summary_publication_id ON public.client_sales_summary(publication_id);
CREATE INDEX IF NOT EXISTS idx_clients_rep_id                  ON public.clients(rep_id);

-- commission_payouts / commission_rates
CREATE INDEX IF NOT EXISTS idx_commission_payouts_approved_by  ON public.commission_payouts(approved_by);
CREATE INDEX IF NOT EXISTS idx_commission_rates_publication_id ON public.commission_rates(publication_id);
CREATE INDEX IF NOT EXISTS idx_commission_rates_salesperson_id ON public.commission_rates(salesperson_id);

-- communications
CREATE INDEX IF NOT EXISTS idx_communications_author_id        ON public.communications(author_id);

-- contract_imports / contract_lines / contracts
CREATE INDEX IF NOT EXISTS idx_contract_imports_reviewed_by              ON public.contract_imports(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_contract_lines_competitor_client_id       ON public.contract_lines(competitor_client_id);
CREATE INDEX IF NOT EXISTS idx_contract_lines_digital_product_id         ON public.contract_lines(digital_product_id);
CREATE INDEX IF NOT EXISTS idx_contract_lines_placement_id               ON public.contract_lines(placement_id);
CREATE INDEX IF NOT EXISTS idx_contract_lines_publication_id             ON public.contract_lines(publication_id);
CREATE INDEX IF NOT EXISTS idx_contracts_assigned_to                     ON public.contracts(assigned_to);

-- conversation_*
CREATE INDEX IF NOT EXISTS idx_conversation_messages_sender_id           ON public.conversation_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversation_read_cursors_member_id       ON public.conversation_read_cursors(member_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by                  ON public.conversations(created_by);

-- creative_jobs / credit_memos / cross_published_stories
CREATE INDEX IF NOT EXISTS idx_creative_jobs_assigned_to                 ON public.creative_jobs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_creative_jobs_client_id                   ON public.creative_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_memos_applied_to_invoice_id        ON public.credit_memos(applied_to_invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_memos_client_id                    ON public.credit_memos(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_memos_invoice_id                   ON public.credit_memos(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_memos_sale_id                      ON public.credit_memos(sale_id);
CREATE INDEX IF NOT EXISTS idx_cross_published_stories_origin_site_id    ON public.cross_published_stories(origin_site_id);
CREATE INDEX IF NOT EXISTS idx_cross_published_stories_target_site_id    ON public.cross_published_stories(target_site_id);

-- delivery_* / digital_ad_products / driver_*
CREATE INDEX IF NOT EXISTS idx_delivery_report_schedules_contact_id      ON public.delivery_report_schedules(contact_id);
CREATE INDEX IF NOT EXISTS idx_delivery_reports_contact_id               ON public.delivery_reports(contact_id);
CREATE INDEX IF NOT EXISTS idx_digital_ad_products_zone_id               ON public.digital_ad_products(zone_id);
CREATE INDEX IF NOT EXISTS idx_driver_messages_sender_team_member_id     ON public.driver_messages(sender_team_member_id);
CREATE INDEX IF NOT EXISTS idx_driver_routes_default_driver_id           ON public.driver_routes(default_driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_routes_driver_id                   ON public.driver_routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_routes_publication_id              ON public.driver_routes(publication_id);

-- drop_location_pubs / editions / editorial_permissions
CREATE INDEX IF NOT EXISTS idx_drop_location_pubs_publication_id         ON public.drop_location_pubs(publication_id);
CREATE INDEX IF NOT EXISTS idx_editions_issue_id                         ON public.editions(issue_id);
CREATE INDEX IF NOT EXISTS idx_editions_publication_id                   ON public.editions(publication_id);
CREATE INDEX IF NOT EXISTS idx_editorial_permissions_publication_id      ON public.editorial_permissions(publication_id);

-- email_log / email_templates
CREATE INDEX IF NOT EXISTS idx_email_log_sent_by                         ON public.email_log(sent_by);
CREATE INDEX IF NOT EXISTS idx_email_templates_created_by                ON public.email_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_email_templates_publication_id            ON public.email_templates(publication_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_updated_by                ON public.email_templates(updated_by);

-- flatplan_*
CREATE INDEX IF NOT EXISTS idx_flatplan_page_layouts_uploaded_by         ON public.flatplan_page_layouts(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_flatplan_page_status_completed_by         ON public.flatplan_page_status(completed_by);
CREATE INDEX IF NOT EXISTS idx_flatplan_placeholders_legal_notice_id     ON public.flatplan_placeholders(legal_notice_id);
CREATE INDEX IF NOT EXISTS idx_flatplan_placeholders_sale_id             ON public.flatplan_placeholders(sale_id);

-- gmail_message_links / google_tokens
CREATE INDEX IF NOT EXISTS idx_gmail_message_links_linked_by             ON public.gmail_message_links(linked_by);
CREATE INDEX IF NOT EXISTS idx_gmail_message_links_thread_id             ON public.gmail_message_links(thread_id);
CREATE INDEX IF NOT EXISTS idx_google_tokens_team_member_id              ON public.google_tokens(team_member_id);

-- invoice_lines / invoices
CREATE INDEX IF NOT EXISTS idx_invoice_lines_issue_id                    ON public.invoice_lines(issue_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_publication_id              ON public.invoice_lines(publication_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id                        ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by                       ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_proposal_id                      ON public.invoices(proposal_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale_id                          ON public.invoices(sale_id);

-- issue_*
CREATE INDEX IF NOT EXISTS idx_issue_goals_issue_id                      ON public.issue_goals(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_proof_annotations_author_id         ON public.issue_proof_annotations(author_id);
CREATE INDEX IF NOT EXISTS idx_issue_proof_annotations_resolved_by       ON public.issue_proof_annotations(resolved_by);
CREATE INDEX IF NOT EXISTS idx_issue_proofs_approved_by                  ON public.issue_proofs(approved_by);
CREATE INDEX IF NOT EXISTS idx_issue_proofs_uploaded_by                  ON public.issue_proofs(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_issues_publisher_signoff_by               ON public.issues(publisher_signoff_by);

-- legal_*
CREATE INDEX IF NOT EXISTS idx_legal_notice_clippings_created_by         ON public.legal_notice_clippings(created_by);
CREATE INDEX IF NOT EXISTS idx_legal_notice_clippings_edition_id         ON public.legal_notice_clippings(edition_id);
CREATE INDEX IF NOT EXISTS idx_legal_notice_issues_issue_id              ON public.legal_notice_issues(issue_id);
CREATE INDEX IF NOT EXISTS idx_legal_notice_issues_legal_notice_id       ON public.legal_notice_issues(legal_notice_id);
CREATE INDEX IF NOT EXISTS idx_legal_notice_issues_publication_id        ON public.legal_notice_issues(publication_id);
CREATE INDEX IF NOT EXISTS idx_legal_notices_affidavit_sent_by           ON public.legal_notices(affidavit_sent_by);
CREATE INDEX IF NOT EXISTS idx_legal_notices_client_id                   ON public.legal_notices(client_id);
CREATE INDEX IF NOT EXISTS idx_legal_notices_invoice_sent_by             ON public.legal_notices(invoice_sent_by);

-- location_audit_log / mailing_lists / media_assets / merch_*
CREATE INDEX IF NOT EXISTS idx_location_audit_log_actor_team_member_id   ON public.location_audit_log(actor_team_member_id);
CREATE INDEX IF NOT EXISTS idx_mailing_lists_issue_id                    ON public.mailing_lists(issue_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_ad_project_id                ON public.media_assets(ad_project_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_legal_notice_id              ON public.media_assets(legal_notice_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_sale_id                      ON public.media_assets(sale_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_uploaded_by                  ON public.media_assets(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_merch_order_items_order_id                ON public.merch_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_merch_order_items_product_id              ON public.merch_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_merch_order_items_variant_id              ON public.merch_order_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_merch_orders_client_id                    ON public.merch_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_merch_orders_shop_id                      ON public.merch_orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_merch_product_variants_product_id         ON public.merch_product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_merch_shops_client_id                     ON public.merch_shops(client_id);

-- messages / my_priorities / newsletter_drafts
CREATE INDEX IF NOT EXISTS idx_messages_sender_id                        ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_my_priorities_added_by                    ON public.my_priorities(added_by);
CREATE INDEX IF NOT EXISTS idx_my_priorities_client_id                   ON public.my_priorities(client_id);
CREATE INDEX IF NOT EXISTS idx_my_priorities_highlighted_by              ON public.my_priorities(highlighted_by);
CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_approved_by             ON public.newsletter_drafts(approved_by);
CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_created_by              ON public.newsletter_drafts(created_by);
CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_template_id             ON public.newsletter_drafts(template_id);

-- outreach_*
CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_created_by             ON public.outreach_campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_outreach_entries_assigned_to              ON public.outreach_entries(assigned_to);

-- page_stories / payments / people
CREATE INDEX IF NOT EXISTS idx_page_stories_story_id                     ON public.page_stories(story_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id                       ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_recorded_by                      ON public.payments(recorded_by);
CREATE INDEX IF NOT EXISTS idx_people_alerts_mirror_to                   ON public.people(alerts_mirror_to);

-- press_release_log / print_*
CREATE INDEX IF NOT EXISTS idx_press_release_log_publication_assigned    ON public.press_release_log(publication_assigned);
CREATE INDEX IF NOT EXISTS idx_press_release_log_story_id                ON public.press_release_log(story_id);
CREATE INDEX IF NOT EXISTS idx_print_placements_base_size_id             ON public.print_placements(base_size_id);
CREATE INDEX IF NOT EXISTS idx_print_runs_printer_id                     ON public.print_runs(printer_id);
CREATE INDEX IF NOT EXISTS idx_print_runs_shipped_by                     ON public.print_runs(shipped_by);
CREATE INDEX IF NOT EXISTS idx_printer_contacts_publication_id           ON public.printer_contacts(publication_id);

-- proposal_drafting_log / proposal_lines / proposals
CREATE INDEX IF NOT EXISTS idx_proposal_drafting_log_inquiry_id          ON public.proposal_drafting_log(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_proposal_lines_competitor_client_id       ON public.proposal_lines(competitor_client_id);
CREATE INDEX IF NOT EXISTS idx_proposal_lines_digital_product_id         ON public.proposal_lines(digital_product_id);
CREATE INDEX IF NOT EXISTS idx_proposal_lines_issue_id                   ON public.proposal_lines(issue_id);
CREATE INDEX IF NOT EXISTS idx_proposal_lines_placement_id               ON public.proposal_lines(placement_id);
CREATE INDEX IF NOT EXISTS idx_proposal_lines_publication_id             ON public.proposal_lines(publication_id);
CREATE INDEX IF NOT EXISTS idx_proposals_assigned_to                     ON public.proposals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_proposals_contract_id                     ON public.proposals(contract_id);
CREATE INDEX IF NOT EXISTS idx_proposals_created_by                      ON public.proposals(created_by);
CREATE INDEX IF NOT EXISTS idx_proposals_delivery_report_contact_id      ON public.proposals(delivery_report_contact_id);
CREATE INDEX IF NOT EXISTS idx_proposals_industry_id                     ON public.proposals(industry_id);

-- provider_usage / quickbooks_tokens / route_*
CREATE INDEX IF NOT EXISTS idx_provider_usage_pub_id                     ON public.provider_usage(pub_id);
CREATE INDEX IF NOT EXISTS idx_quickbooks_tokens_connected_by            ON public.quickbooks_tokens(connected_by);
CREATE INDEX IF NOT EXISTS idx_route_instances_issue_id                  ON public.route_instances(issue_id);
CREATE INDEX IF NOT EXISTS idx_route_instances_publication_id            ON public.route_instances(publication_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_drop_location_id              ON public.route_stops(drop_location_id);

-- sales / salesperson_pub_shares
CREATE INDEX IF NOT EXISTS idx_sales_contract_line_id                    ON public.sales(contract_line_id);
CREATE INDEX IF NOT EXISTS idx_sales_issue_id                            ON public.sales(issue_id);
CREATE INDEX IF NOT EXISTS idx_sales_tearsheet_uploaded_by               ON public.sales(tearsheet_uploaded_by);
CREATE INDEX IF NOT EXISTS idx_salesperson_pub_shares_publication_id     ON public.salesperson_pub_shares(publication_id);

-- service_tickets
CREATE INDEX IF NOT EXISTS idx_service_tickets_assigned_to               ON public.service_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_service_tickets_client_id                 ON public.service_tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_service_tickets_escalated_to              ON public.service_tickets(escalated_to);
CREATE INDEX IF NOT EXISTS idx_service_tickets_publication_id            ON public.service_tickets(publication_id);

-- social_*
CREATE INDEX IF NOT EXISTS idx_social_accounts_connected_by              ON public.social_accounts(connected_by);
CREATE INDEX IF NOT EXISTS idx_social_posts_story_id                     ON public.social_posts(story_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_archived_approved_by         ON public.social_posts_archived(approved_by);
CREATE INDEX IF NOT EXISTS idx_social_posts_archived_posted_by           ON public.social_posts_archived(posted_by);

-- stop_confirmations
CREATE INDEX IF NOT EXISTS idx_stop_confirmations_publication_id         ON public.stop_confirmations(publication_id);

-- stories (8 missing FK indexes)
CREATE INDEX IF NOT EXISTS idx_stories_approved_for_print_by             ON public.stories(approved_for_print_by);
CREATE INDEX IF NOT EXISTS idx_stories_approved_for_web_by               ON public.stories(approved_for_web_by);
CREATE INDEX IF NOT EXISTS idx_stories_assigned_by                       ON public.stories(assigned_by);
CREATE INDEX IF NOT EXISTS idx_stories_author_id                         ON public.stories(author_id);
CREATE INDEX IF NOT EXISTS idx_stories_category_id                       ON public.stories(category_id);
CREATE INDEX IF NOT EXISTS idx_stories_edited_by                         ON public.stories(edited_by);
CREATE INDEX IF NOT EXISTS idx_stories_editor_id                         ON public.stories(editor_id);
CREATE INDEX IF NOT EXISTS idx_stories_syndicated_from                   ON public.stories(syndicated_from);

-- story_activity / story_publications
CREATE INDEX IF NOT EXISTS idx_story_activity_performed_by               ON public.story_activity(performed_by);
CREATE INDEX IF NOT EXISTS idx_story_publications_issue_id               ON public.story_publications(issue_id);
CREATE INDEX IF NOT EXISTS idx_story_publications_publication_id         ON public.story_publications(publication_id);

-- subscribers / subscriptions
CREATE INDEX IF NOT EXISTS idx_subscribers_publication_id                ON public.subscribers(publication_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_renewed_from                ON public.subscriptions(renewed_from);

-- team_notes / thread_reads / ticket_comments / web_ad_rates
CREATE INDEX IF NOT EXISTS idx_team_notes_mirrored_from                  ON public.team_notes(mirrored_from);
CREATE INDEX IF NOT EXISTS idx_thread_reads_user_id                      ON public.thread_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_author_id                 ON public.ticket_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id                 ON public.ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_web_ad_rates_pub_id                       ON public.web_ad_rates(pub_id);
