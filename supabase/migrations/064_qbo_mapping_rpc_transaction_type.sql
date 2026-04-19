-- Migration 064: Patch the 3 RPCs that INSERT INTO invoice_lines so they
-- populate transaction_type (NOT NULL + FK to qbo_account_mapping since
-- migration 063). Without this, any proposal-to-contract conversion, auto-
-- invoice generation, or legal-notice billing would fail on the FK insert.
--
-- Functions touched:
--   * convert_proposal_to_contract — all lines are display_print sales, so
--     every insert_line gets 'display_ad'. The lump-sum branch (no sale_id)
--     gets the same since it's still a display-ad contract being invoiced.
--   * generate_pending_invoices — iterates Closed sales in magazine/newspaper
--     pubs. Today 100% are product_type='display_print'; hardcode 'display_ad'
--     to keep the RPC simple. If we ever invoice web/classified/legal through
--     this function, it'll need a CASE on the inner sales SELECT.
--   * mint_legal_notice_invoice — legal-notice trigger; always
--     'newspaper_svc_legal_notice'.
--
-- nm_bulk_insert_invoice_lines already populates transaction_type (hardcoded
-- 'display_ad'), no change.

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
      INSERT INTO invoice_lines (invoice_id, sale_id, description, quantity, unit_price, total, transaction_type)
      VALUES (v_inv_id, v_sale_id,
        COALESCE(v_line.pub_name, v_line.pub_name_lookup, '') || ' ' ||
        COALESCE(v_line.issue_label, '') || ' — ' || COALESCE(v_line.ad_size, ''),
        1, v_line.price, v_line.price, 'display_ad');
      v_invoices_created := v_invoices_created + 1;
    ELSIF v_payment_terms = 'per_issue' AND v_pub_type = 'Special Publication' AND v_line.price > 0 THEN
      v_issue_date := COALESCE(v_line.issue_date, v_proposal.date, CURRENT_DATE);
      INSERT INTO invoices (
        client_id, invoice_number, status, issue_date, due_date, total, balance_due
      ) VALUES (
        v_proposal.client_id, next_invoice_number(v_client_code),
        'draft', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', v_line.price, v_line.price
      ) RETURNING id INTO v_inv_id;
      INSERT INTO invoice_lines (invoice_id, sale_id, description, quantity, unit_price, total, transaction_type)
      VALUES (v_inv_id, v_sale_id,
        COALESCE(v_line.pub_name, v_line.pub_name_lookup, '') || ' ' ||
        COALESCE(v_line.issue_label, '') || ' — ' || COALESCE(v_line.ad_size, ''),
        1, v_line.price, v_line.price, 'display_ad');
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
    INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total, transaction_type)
    VALUES (v_inv_id, v_proposal.name || ' — Full payment', 1, v_total_value, v_total_value, 'display_ad');
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

CREATE OR REPLACE FUNCTION public.generate_pending_invoices(p_mode text DEFAULT 'all'::text, p_target_month date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_lead_days int;
  v_invoices_created int := 0;
  v_invoices_updated int := 0;
  v_lines_added int := 0;
  v_total_amount numeric := 0;
  v_month_start date;
  v_month_end date;
  v_due_date date;
  v_row record;
  v_inv_id uuid;
  v_sale record;
BEGIN
  SELECT magazine_lead_days INTO v_lead_days FROM org_settings LIMIT 1;
  v_lead_days := COALESCE(v_lead_days, 30);

  IF p_mode IN ('magazine', 'all') THEN
    FOR v_row IN
      SELECT DISTINCT s.client_id
      FROM sales s
      JOIN publications p ON p.id = s.publication_id
      LEFT JOIN invoice_lines il ON il.sale_id = s.id
      WHERE s.status = 'Closed'
        AND p.type = 'Magazine'
        AND s.date BETWEEN CURRENT_DATE AND CURRENT_DATE + v_lead_days
        AND il.id IS NULL
    LOOP
      SELECT i.id INTO v_inv_id
      FROM invoices i
      WHERE i.client_id = v_row.client_id
        AND i.status = 'draft'
        AND i.locked_at IS NULL
        AND i.notes LIKE '%auto-gen:magazine%'
      LIMIT 1;

      IF v_inv_id IS NULL THEN
        INSERT INTO invoices (client_id, invoice_number, status, issue_date, due_date, subtotal, total, balance_due, billing_schedule, notes)
        VALUES (
          v_row.client_id,
          next_invoice_number(),
          'draft'::invoice_status,
          CURRENT_DATE,
          CURRENT_DATE + INTERVAL '30 days',
          0, 0, 0,
          'per_issue'::billing_schedule,
          'auto-gen:magazine ' || to_char(CURRENT_DATE, 'YYYY-MM-DD')
        ) RETURNING id INTO v_inv_id;
        v_invoices_created := v_invoices_created + 1;
      ELSE
        v_invoices_updated := v_invoices_updated + 1;
      END IF;

      FOR v_sale IN
        SELECT s.id, s.amount, s.date, s.ad_size, p.name AS pub_name
        FROM sales s
        JOIN publications p ON p.id = s.publication_id
        LEFT JOIN invoice_lines il ON il.sale_id = s.id
        WHERE s.client_id = v_row.client_id
          AND s.status = 'Closed'
          AND p.type = 'Magazine'
          AND s.date BETWEEN CURRENT_DATE AND CURRENT_DATE + v_lead_days
          AND il.id IS NULL
        ORDER BY s.date, p.name
      LOOP
        INSERT INTO invoice_lines (invoice_id, sale_id, description, quantity, unit_price, total, publication_id, transaction_type)
        VALUES (
          v_inv_id,
          v_sale.id,
          v_sale.pub_name || ' ' || to_char(v_sale.date, 'FMMonth DD, YYYY') || ' — ' || COALESCE(v_sale.ad_size, 'Ad'),
          1, v_sale.amount, v_sale.amount, NULL, 'display_ad'
        );
        v_lines_added := v_lines_added + 1;
        v_total_amount := v_total_amount + v_sale.amount;
      END LOOP;

      UPDATE invoices SET
        subtotal = (SELECT COALESCE(SUM(total), 0) FROM invoice_lines WHERE invoice_id = v_inv_id),
        total = (SELECT COALESCE(SUM(total), 0) FROM invoice_lines WHERE invoice_id = v_inv_id),
        balance_due = (SELECT COALESCE(SUM(total), 0) FROM invoice_lines WHERE invoice_id = v_inv_id)
      WHERE id = v_inv_id;
    END LOOP;
  END IF;

  IF p_mode IN ('newspaper', 'all') THEN
    v_month_start := date_trunc('month', p_target_month)::date;
    v_month_end := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
    v_due_date := v_month_end;

    FOR v_row IN
      SELECT DISTINCT s.client_id, s.publication_id, p.name AS pub_name
      FROM sales s
      JOIN publications p ON p.id = s.publication_id
      LEFT JOIN invoice_lines il ON il.sale_id = s.id
      WHERE s.status = 'Closed'
        AND p.type = 'Newspaper'
        AND s.date BETWEEN v_month_start AND v_month_end
        AND il.id IS NULL
    LOOP
      SELECT i.id INTO v_inv_id
      FROM invoices i
      WHERE i.client_id = v_row.client_id
        AND i.status = 'draft'
        AND i.locked_at IS NULL
        AND i.issue_date = v_month_start
        AND i.notes LIKE '%auto-gen:newspaper:' || v_row.publication_id || '%'
      LIMIT 1;

      IF v_inv_id IS NULL THEN
        INSERT INTO invoices (client_id, invoice_number, status, issue_date, due_date, subtotal, total, balance_due, billing_schedule, notes)
        VALUES (
          v_row.client_id,
          next_invoice_number(),
          'draft'::invoice_status,
          v_month_start,
          v_due_date,
          0, 0, 0,
          'per_issue'::billing_schedule,
          'auto-gen:newspaper:' || v_row.publication_id || ' ' || v_row.pub_name || ' ' || to_char(v_month_start, 'YYYY-MM')
        ) RETURNING id INTO v_inv_id;
        v_invoices_created := v_invoices_created + 1;
      ELSE
        v_invoices_updated := v_invoices_updated + 1;
      END IF;

      FOR v_sale IN
        SELECT s.id, s.amount, s.date, s.ad_size
        FROM sales s
        LEFT JOIN invoice_lines il ON il.sale_id = s.id
        WHERE s.client_id = v_row.client_id
          AND s.publication_id = v_row.publication_id
          AND s.status = 'Closed'
          AND s.date BETWEEN v_month_start AND v_month_end
          AND il.id IS NULL
        ORDER BY s.date
      LOOP
        INSERT INTO invoice_lines (invoice_id, sale_id, description, quantity, unit_price, total, publication_id, transaction_type)
        VALUES (
          v_inv_id,
          v_sale.id,
          v_row.pub_name || ' ' || to_char(v_sale.date, 'FMMonth DD, YYYY') || ' — ' || COALESCE(v_sale.ad_size, 'Ad'),
          1, v_sale.amount, v_sale.amount, v_row.publication_id, 'display_ad'
        );
        v_lines_added := v_lines_added + 1;
        v_total_amount := v_total_amount + v_sale.amount;
      END LOOP;

      UPDATE invoices SET
        subtotal = (SELECT COALESCE(SUM(total), 0) FROM invoice_lines WHERE invoice_id = v_inv_id),
        total = (SELECT COALESCE(SUM(total), 0) FROM invoice_lines WHERE invoice_id = v_inv_id),
        balance_due = (SELECT COALESCE(SUM(total), 0) FROM invoice_lines WHERE invoice_id = v_inv_id)
      WHERE id = v_inv_id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'mode', p_mode,
    'invoices_created', v_invoices_created,
    'invoices_updated', v_invoices_updated,
    'lines_added', v_lines_added,
    'total_amount', v_total_amount,
    'ran_at', now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mint_legal_notice_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_inv_id uuid;
  v_inv_number text;
  v_client clients%ROWTYPE;
BEGIN
  IF NEW.status = 'billed' AND (OLD.status IS NULL OR OLD.status <> 'billed') THEN
    IF NEW.client_id IS NULL OR NEW.total_amount IS NULL OR NEW.total_amount <= 0 THEN
      RETURN NEW;
    END IF;

    SELECT * INTO v_client FROM clients WHERE id = NEW.client_id;

    v_inv_number := COALESCE(v_client.invoice_prefix, 'LN') || '-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 4);

    INSERT INTO invoices (invoice_number, client_id, status, billing_schedule, issue_date, due_date, subtotal, total, balance_due, notes)
    VALUES (
      v_inv_number, NEW.client_id, 'sent', 'lump_sum',
      CURRENT_DATE, CURRENT_DATE + 30,
      NEW.total_amount, NEW.total_amount, NEW.total_amount,
      'Legal notice: ' || COALESCE(NEW.title, 'Untitled') || ' (' || NEW.total_runs || ' runs)'
    )
    RETURNING id INTO v_inv_id;

    INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total, sort_order, transaction_type)
    VALUES (
      v_inv_id,
      'Legal Notice: ' || COALESCE(NEW.title, '') || ' — ' || COALESCE(NEW.type::text, '') || ' (' || NEW.total_runs || ' runs @ $' || NEW.rate_per_run || '/run)',
      NEW.total_runs, NEW.rate_per_run, NEW.total_amount, 1, 'newspaper_svc_legal_notice'
    );

    INSERT INTO notifications (title, type, link)
    VALUES ('Invoice auto-created for legal notice: ' || COALESCE(NEW.title, ''), 'system', '/billing');
  END IF;
  RETURN NEW;
END;
$function$;
