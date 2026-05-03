-- 195_fix_activity_invoice_status_case.sql
--
-- Mig 194's get_client_activity compared invoice status with the
-- string literal 'Paid' (capitalized). Production's invoice_status
-- enum is lowercase: draft / sent / partially_paid / paid / overdue
-- / void. Comparison never matched, so the invoice_paid event type
-- never appeared in the feed.
--
-- This migration is just the corrected get_client_activity
-- definition; everything else from mig 194 stays.
CREATE OR REPLACE FUNCTION public.get_client_activity(
  p_client_id uuid,
  p_limit     int DEFAULT 50
)
RETURNS TABLE (
  event_at      timestamptz,
  event_type    text,
  context_type  text,
  context_id    uuid,
  title         text,
  detail        jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT user_can_access_client(p_client_id) THEN RAISE EXCEPTION 'access_denied'; END IF;
  RETURN QUERY
  WITH events AS (
    SELECT p.awaiting_review_at, 'proposal_submitted'::text, 'proposal'::text, p.id,
           'Proposal submitted'::text,
           jsonb_build_object('total', p.total,
             'pub_count', (SELECT count(DISTINCT publication_id) FROM proposal_lines WHERE proposal_id = p.id))
      FROM proposals p WHERE p.client_id = p_client_id AND p.awaiting_review_at IS NOT NULL
    UNION ALL
    SELECT p.sent_at, 'proposal_sent'::text, 'proposal'::text, p.id,
           'Proposal sent for your review'::text, jsonb_build_object('total', p.total)
      FROM proposals p WHERE p.client_id = p_client_id AND p.sent_at IS NOT NULL
    UNION ALL
    SELECT p.signed_at, 'proposal_signed'::text, 'proposal'::text, p.id,
           'Contract signed'::text, jsonb_build_object('total', p.total)
      FROM proposals p WHERE p.client_id = p_client_id AND p.signed_at IS NOT NULL
    UNION ALL
    SELECT p.converted_at, 'proposal_converted'::text, 'proposal'::text, p.id,
           'Ad project started'::text, jsonb_build_object('total', p.total)
      FROM proposals p WHERE p.client_id = p_client_id AND p.converted_at IS NOT NULL
    UNION ALL
    SELECT ap.created_at, 'ad_project_created'::text, 'ad_project'::text, ap.id,
           'Ad project created'::text, jsonb_build_object('status', ap.status)
      FROM ad_projects ap WHERE ap.client_id = p_client_id
    UNION ALL
    SELECT i.issue_date::timestamptz, 'invoice_issued'::text, 'invoice'::text, i.id,
           'Invoice ' || coalesce(i.invoice_number, '#' || substring(i.id::text, 1, 8)) || ' issued',
           jsonb_build_object('amount', i.total)
      FROM invoices i WHERE i.client_id = p_client_id AND i.issue_date IS NOT NULL
    UNION ALL
    SELECT i.updated_at, 'invoice_paid'::text, 'invoice'::text, i.id,
           'Invoice ' || coalesce(i.invoice_number, '#' || substring(i.id::text, 1, 8)) || ' paid',
           jsonb_build_object('amount', (i.total - coalesce(i.balance_due, 0)))
      FROM invoices i WHERE i.client_id = p_client_id AND i.status::text = 'paid'
  )
  SELECT * FROM events ORDER BY event_at DESC NULLS LAST LIMIT p_limit;
END $$;
