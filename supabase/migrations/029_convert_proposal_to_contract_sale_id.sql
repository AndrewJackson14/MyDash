-- 029_convert_proposal_to_contract_sale_id.sql
--
-- Replaces convert_proposal_to_contract() so that:
--
-- 1) It validates every proposal_line has issue_id before mutating any
--    data. Migration 028's sales CHECK constraint requires non-null
--    issue_id on display_print sales, so a proposal with any unscheduled
--    line must be fixed in the UI before conversion -- we fail early
--    with a clear error instead of letting the constraint fire mid-
--    transaction.
--
-- 2) Contract lines, sales, and ad_projects are now created in one loop
--    per proposal_line instead of two sequential loops. v_sale_id is in
--    scope when we insert the ad_project, so we can populate
--    ad_projects.sale_id -- which migration 027 made NOT NULL + unique.
--
-- Everything else (invoice creation, lump-sum handling, proposal status
-- update, return shape) is unchanged from the prior version.

CREATE OR REPLACE FUNCTION public.convert_proposal_to_contract(p_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_proposal proposals%ROWTYPE;
  v_contract_id uuid;
  v_line RECORD;
  v_sale_id uuid;
  v_contract_line_id uuid;
  v_sales_created int := 0;
  v_contract_lines_created int := 0;
  v_ad_projects_created int := 0;
  v_invoices_created int := 0;
  v_total_value numeric := 0;
  v_start_date date;
  v_end_date date;
  v_now timestamptz := NOW();
  v_thread_id uuid;
  v_art_source text;
  v_client_name text;
  v_client_code text;
  v_pub_name text;
  v_pub_type text;
  v_payment_terms text;
  v_term_months int;
  v_monthly numeric;
  v_inv_id uuid;
  v_issue_date date;
BEGIN
  SELECT * INTO v_proposal FROM proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Proposal not found'); END IF;
  IF v_proposal.status NOT IN ('Sent', 'Approved/Signed') THEN
    RETURN jsonb_build_object('error', 'Proposal must be Sent. Current: ' || v_proposal.status);
  END IF;
  IF v_proposal.contract_id IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Already converted to contract ' || v_proposal.contract_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM proposal_lines pl
    WHERE pl.proposal_id = p_proposal_id AND pl.issue_id IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'error',
      'All proposal lines must be assigned to an issue before conversion. Open the proposal and schedule each line.'
    );
  END IF;

  SELECT name, client_code INTO v_client_name, v_client_code FROM clients WHERE id = v_proposal.client_id;
  v_client_code := COALESCE(v_client_code, 'X0000');

  SELECT MIN(pl.issue_date), MAX(pl.issue_date)
  INTO v_start_date, v_end_date
  FROM proposal_lines pl WHERE pl.proposal_id = p_proposal_id AND pl.issue_date IS NOT NULL;
  v_start_date := COALESCE(v_start_date, v_proposal.date, CURRENT_DATE);
  v_end_date := COALESCE(v_end_date, v_start_date + (COALESCE(v_proposal.term_months, 1) * INTERVAL '1 month'));

  SELECT COALESCE(SUM(pl.price), 0) INTO v_total_value FROM proposal_lines pl WHERE pl.proposal_id = p_proposal_id;
  IF v_proposal.discount_pct > 0 THEN
    v_total_value := v_total_value * (1 - v_proposal.discount_pct / 100.0);
  END IF;

  v_payment_terms := CASE WHEN v_proposal.pay_plan THEN 'monthly' ELSE 'per_issue' END;
  v_term_months := COALESCE(v_proposal.term_months, 1);
  v_monthly := COALESCE(v_proposal.monthly, 0);
  v_art_source := COALESCE(v_proposal.art_source, 'we_design');

  INSERT INTO contracts (
    client_id, name, status, start_date, end_date,
    total_value, total_paid, discount_pct, payment_terms,
    assigned_to, notes, is_synthetic, proposal_id,
    charge_day, monthly_amount
  ) VALUES (
    v_proposal.client_id, v_proposal.name, 'active',
    v_start_date, v_end_date, v_total_value, 0,
    COALESCE(v_proposal.discount_pct, 0), v_payment_terms,
    v_proposal.assigned_to,
    'Converted from proposal on ' || to_char(v_now, 'YYYY-MM-DD'),
    false, p_proposal_id,
    COALESCE(v_proposal.charge_day, 1),
    CASE WHEN v_proposal.pay_plan THEN v_monthly ELSE NULL END
  ) RETURNING id INTO v_contract_id;

  FOR v_line IN
    SELECT pl.*,
           p.name as pub_name_lookup,
           p.type::text as pub_type_lookup,
           i.label as issue_label_lookup
    FROM proposal_lines pl
    LEFT JOIN publications p ON p.id = pl.publication_id
    LEFT JOIN issues i ON i.id = pl.issue_id
    WHERE pl.proposal_id = p_proposal_id
    ORDER BY pl.issue_date NULLS LAST, pl.sort_order
  LOOP
    INSERT INTO contract_lines (
      contract_id, publication_id, ad_size, rate, quantity, line_total
    ) VALUES (
      v_contract_id, v_line.publication_id, v_line.ad_size, v_line.price, 1, v_line.price
    ) RETURNING id INTO v_contract_line_id;
    v_contract_lines_created := v_contract_lines_created + 1;

    INSERT INTO sales (
      client_id, publication_id, issue_id, ad_type, ad_size, ad_width, ad_height,
      amount, status, date, closed_at,
      proposal_id, proposal_line_id, contract_id, contract_line_id, product_type
    ) VALUES (
      v_proposal.client_id, v_line.publication_id, v_line.issue_id,
      COALESCE(v_line.pub_name, v_line.pub_name_lookup, ''), v_line.ad_size,
      COALESCE(v_line.ad_width, 0), COALESCE(v_line.ad_height, 0),
      v_line.price, 'Closed'::sale_status,
      COALESCE(v_line.issue_date, v_proposal.date, CURRENT_DATE), v_now,
      p_proposal_id, v_line.id, v_contract_id, v_contract_line_id, 'display_print'
    ) RETURNING id INTO v_sale_id;
    v_sales_created := v_sales_created + 1;

    v_pub_type := COALESCE(v_line.pub_type_lookup, 'Magazine');
    IF v_payment_terms = 'monthly' AND v_line.price > 0 THEN
      v_issue_date := COALESCE(v_line.issue_date, v_proposal.date, CURRENT_DATE);
      INSERT INTO invoices (
        client_id, invoice_number, status, issue_date, due_date, total, balance_due
      ) VALUES (
        v_proposal.client_id, next_invoice_number(v_client_code),
        'draft', CURRENT_DATE, v_issue_date + INTERVAL '30 days', v_line.price, v_line.price
      ) RETURNING id INTO v_inv_id;
      INSERT INTO invoice_lines (invoice_id, sale_id, description, quantity, unit_price, total)
      VALUES (v_inv_id, v_sale_id,
        COALESCE(v_line.pub_name, v_line.pub_name_lookup, '') || ' ' ||
        COALESCE(v_line.issue_label, '') || ' — ' || COALESCE(v_line.ad_size, ''),
        1, v_line.price, v_line.price);
      v_invoices_created := v_invoices_created + 1;
    ELSIF v_payment_terms = 'per_issue' AND v_pub_type = 'Special Publication' AND v_line.price > 0 THEN
      v_issue_date := COALESCE(v_line.issue_date, v_proposal.date, CURRENT_DATE);
      INSERT INTO invoices (
        client_id, invoice_number, status, issue_date, due_date, total, balance_due
      ) VALUES (
        v_proposal.client_id, next_invoice_number(v_client_code),
        'draft', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', v_line.price, v_line.price
      ) RETURNING id INTO v_inv_id;
      INSERT INTO invoice_lines (invoice_id, sale_id, description, quantity, unit_price, total)
      VALUES (v_inv_id, v_sale_id,
        COALESCE(v_line.pub_name, v_line.pub_name_lookup, '') || ' ' ||
        COALESCE(v_line.issue_label, '') || ' — ' || COALESCE(v_line.ad_size, ''),
        1, v_line.price, v_line.price);
      v_invoices_created := v_invoices_created + 1;
    END IF;

    v_pub_name := COALESCE(v_line.pub_name_lookup, '');
    INSERT INTO message_threads (type, title, participants)
    VALUES ('ad_project',
      'Ad: ' || COALESCE(v_client_name, '') || ' — ' || v_pub_name || ' ' || COALESCE(v_line.ad_size, '') ||
        CASE WHEN v_line.issue_label_lookup IS NOT NULL THEN ' (' || v_line.issue_label_lookup || ')' ELSE '' END,
      CASE WHEN v_proposal.assigned_to IS NOT NULL THEN ARRAY[v_proposal.assigned_to] ELSE '{}'::uuid[] END
    ) RETURNING id INTO v_thread_id;

    INSERT INTO ad_projects (
      sale_id, client_id, publication_id, issue_id, ad_size, art_source,
      salesperson_id, source_contract_id, source_proposal_id, status, thread_id
    ) VALUES (
      v_sale_id, v_proposal.client_id, v_line.publication_id, v_line.issue_id,
      v_line.ad_size, v_art_source,
      v_proposal.assigned_to, v_contract_id, p_proposal_id,
      CASE WHEN v_art_source = 'camera_ready' THEN 'awaiting_art' ELSE 'brief' END, v_thread_id
    );
    v_ad_projects_created := v_ad_projects_created + 1;
  END LOOP;

  IF v_payment_terms NOT IN ('per_issue', 'monthly') AND v_total_value > 0 THEN
    INSERT INTO invoices (
      client_id, invoice_number, status, issue_date, due_date, total, balance_due
    ) VALUES (
      v_proposal.client_id, next_invoice_number(v_client_code),
      'draft', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', v_total_value, v_total_value
    ) RETURNING id INTO v_inv_id;
    INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total)
    VALUES (v_inv_id, v_proposal.name || ' — Full payment', 1, v_total_value, v_total_value);
    v_invoices_created := v_invoices_created + 1;
  END IF;

  UPDATE proposals SET
    status = 'Signed & Converted', contract_id = v_contract_id,
    converted_at = v_now, signed_at = COALESCE(signed_at, v_now),
    history = COALESCE(history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('event', 'signed', 'date', v_now, 'detail', 'Client signed proposal'),
      jsonb_build_object('event', 'converted', 'date', v_now, 'detail',
        'Signed & converted. ' || v_sales_created || ' sales, ' || v_invoices_created || ' invoices, ' || v_ad_projects_created || ' ad projects.')
    )
  WHERE id = p_proposal_id;

  UPDATE clients SET status = 'Active', last_art_source = v_art_source
  WHERE id = v_proposal.client_id;

  RETURN jsonb_build_object(
    'success', true, 'contract_id', v_contract_id, 'proposal_id', p_proposal_id,
    'contract_lines_created', v_contract_lines_created, 'sales_created', v_sales_created,
    'ad_projects_created', v_ad_projects_created, 'invoices_created', v_invoices_created,
    'total_value', v_total_value, 'start_date', v_start_date, 'end_date', v_end_date
  );
END;
$function$;

notify pgrst, 'reload schema';