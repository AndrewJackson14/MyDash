-- ============================================================
-- 108b — Pin search_path on the 69 functions the advisor flagged
-- as `function_search_path_mutable`. ALTER FUNCTION ... SET
-- search_path = public, pg_temp prevents a maliciously-shadowed
-- table/operator from taking over a SECURITY DEFINER function via
-- an unqualified reference.
-- ============================================================
DO $$
DECLARE fn text;
DECLARE sig text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'apply_payment_to_invoices',
    'articles_view_delete', 'articles_view_insert', 'articles_view_update',
    'auto_apply_credit', 'auto_publish_story',
    'calculate_sale_commission', 'cancel_contract',
    'convert_proposal_to_contract', 'create_placement_on_digital_approval',
    'deactivate_expired_placements', 'generate_client_code',
    'generate_pending_invoices', 'get_current_team_member',
    'get_dashboard_stats', 'handle_ad_inquiry_insert',
    'handle_subscriber_insert', 'handle_updated_at',
    'has_permission', 'increment_redirect_hit',
    'invoices_auto_mark_paid', 'is_admin',
    'log_story_activity', 'media_view_insert', 'media_view_update',
    'mint_legal_notice_invoice', 'my_team_member_id',
    'next_invoice_number', 'next_legal_notice_number',
    'next_legal_notice_number_v2',
    'nm_append_credit_notes', 'nm_apply_pdf_batch',
    'nm_bulk_insert_clients', 'nm_bulk_insert_digital_sales',
    'nm_bulk_insert_invoice_lines', 'nm_bulk_insert_invoices',
    'nm_bulk_insert_payments', 'nm_bulk_insert_sales',
    'nm_bulk_insert_web_rates', 'nm_bulk_update_invoice_status',
    'nm_create_standalone_invoices', 'nm_insert_partial_payments',
    'nm_load_nl', 'nm_load_orders_stage', 'nm_load_payments_stage',
    'nm_load_price_fix',
    'preview_team_member_work_transfer',
    'rebuild_issue_goal_allocations',
    'recalculate_all_commissions',
    'search_story_embeddings',
    'set_client_code', 'set_qbo_mapping_updated_at',
    'set_thread_expiry_on_press',
    'sites_view_update',
    'stories_mark_corrected_after_publish',
    'stories_sync_flags_to_legacy_status',
    'sync_story_jump_from_page', 'sync_story_site_id',
    'sync_story_web_status',
    'touch_updated_at', 'track_story_edits',
    'transfer_team_member_work',
    'trg_freeze_allocations', 'trg_issue_goal_changed', 'trg_share_changed',
    'update_bills_updated_at', 'update_newsletter_templates_updated_at',
    'update_updated_at',
    'user_has_any_permission'
  ])
  LOOP
    FOR sig IN
      SELECT pg_get_function_identity_arguments(p.oid)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = fn
    LOOP
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp', fn, sig);
    END LOOP;
  END LOOP;
END $$;
