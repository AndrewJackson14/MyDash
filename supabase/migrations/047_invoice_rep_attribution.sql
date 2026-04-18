-- 047_invoice_rep_attribution.sql
--
-- Snapshot rep + contract attribution onto invoices so reports stop
-- depending on clients.rep_id (which mutates when a client is reassigned
-- and silently rewrites historical credit). Sales and contracts already
-- carry assigned_to; this migration closes the loop on invoices and
-- backfills both columns from the existing line→sale→contract chain.
--
-- Adds:
--   invoices.rep_id        -- snapshot of attribution at invoice time
--   invoices.contract_id   -- explicit link (was previously implicit via lines)
--
-- Updates convert_proposal_to_contract() to stamp both columns at insert.
--
-- New RPCs:
--   preview_team_member_work_transfer(from_rep)
--   transfer_team_member_work(from_rep, to_rep, scope flags)
-- These power the Transfer Open Work panel on TeamMemberProfile so an
-- admin can move a deactivated rep's open clients/sales/invoices/
-- contracts to an active rep without touching closed/paid history.

-- ─── 1. Schema ────────────────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS rep_id uuid REFERENCES team_members(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES contracts(id);

CREATE INDEX IF NOT EXISTS idx_invoices_rep ON invoices(rep_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contract ON invoices(contract_id);


-- ─── 2. Backfill contract_id ──────────────────────────────────────────
-- Only set when ALL of the invoice's lines that have a sale_id resolve to
-- the same contract. Mixed-contract invoices (rare) stay NULL.
WITH line_contract AS (
  SELECT il.invoice_id, s.contract_id, SUM(il.total) AS weight
  FROM invoice_lines il
  JOIN sales s ON s.id = il.sale_id
  WHERE s.contract_id IS NOT NULL
  GROUP BY il.invoice_id, s.contract_id
),
single_contract AS (
  -- Postgres has no MIN(uuid); cast to text to aggregate and back to uuid.
  -- The HAVING clause guarantees only one distinct contract per invoice so
  -- the choice of MIN here is safely deterministic.
  SELECT invoice_id, MIN(contract_id::text)::uuid AS contract_id
  FROM line_contract
  GROUP BY invoice_id
  HAVING COUNT(DISTINCT contract_id) = 1
)
UPDATE invoices i
SET contract_id = sc.contract_id
FROM single_contract sc
WHERE sc.invoice_id = i.id
  AND i.contract_id IS NULL;


-- ─── 3. Backfill rep_id ───────────────────────────────────────────────
-- Precedence (first non-null wins):
--   a) majority sales.assigned_to across the invoice's lines (weighted by line total)
--   b) contracts.assigned_to via the contract_id we just set
--   c) clients.rep_id (current state — frozen here, mutations to clients.rep_id
--      after this point will NOT retroactively shift historical attribution)
--   d) invoices.created_by

-- (a) Majority rep across lines
WITH line_rep AS (
  SELECT il.invoice_id, s.assigned_to AS rep_id, SUM(il.total) AS weight
  FROM invoice_lines il
  JOIN sales s ON s.id = il.sale_id
  WHERE s.assigned_to IS NOT NULL
  GROUP BY il.invoice_id, s.assigned_to
),
ranked AS (
  SELECT invoice_id, rep_id,
         ROW_NUMBER() OVER (PARTITION BY invoice_id ORDER BY weight DESC, rep_id) AS rn
  FROM line_rep
)
UPDATE invoices i
SET rep_id = r.rep_id
FROM ranked r
WHERE r.invoice_id = i.id AND r.rn = 1 AND i.rep_id IS NULL;

-- (b) Contract assignee
UPDATE invoices i
SET rep_id = c.assigned_to
FROM contracts c
WHERE i.contract_id = c.id
  AND i.rep_id IS NULL
  AND c.assigned_to IS NOT NULL;

-- (c) Client current rep
UPDATE invoices i
SET rep_id = cl.rep_id
FROM clients cl
WHERE i.client_id = cl.id
  AND i.rep_id IS NULL
  AND cl.rep_id IS NOT NULL;

-- (d) created_by fallback
UPDATE invoices
SET rep_id = created_by
WHERE rep_id IS NULL AND created_by IS NOT NULL;


-- ─── 4. RPC v2: convert_proposal_to_contract ──────────────────────────
-- Same as 029, with rep_id + contract_id stamped on every INSERT INTO invoices.
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
      proposal_id, proposal_line_id, contract_id, contract_line_id, product_type,
      assigned_to
    ) VALUES (
      v_proposal.client_id, v_line.publication_id, v_line.issue_id,
      COALESCE(v_line.pub_name, v_line.pub_name_lookup, ''), v_line.ad_size,
      COALESCE(v_line.ad_width, 0), COALESCE(v_line.ad_height, 0),
      v_line.price, 'Closed'::sale_status,
      COALESCE(v_line.issue_date, v_proposal.date, CURRENT_DATE), v_now,
      p_proposal_id, v_line.id, v_contract_id, v_contract_line_id, 'display_print',
      v_proposal.assigned_to
    ) RETURNING id INTO v_sale_id;
    v_sales_created := v_sales_created + 1;

    v_pub_type := COALESCE(v_line.pub_type_lookup, 'Magazine');
    IF v_payment_terms = 'monthly' AND v_line.price > 0 THEN
      v_issue_date := COALESCE(v_line.issue_date, v_proposal.date, CURRENT_DATE);
      INSERT INTO invoices (
        client_id, invoice_number, status, issue_date, due_date, total, balance_due,
        rep_id, contract_id
      ) VALUES (
        v_proposal.client_id, next_invoice_number(v_client_code),
        'draft', CURRENT_DATE, v_issue_date + INTERVAL '30 days', v_line.price, v_line.price,
        v_proposal.assigned_to, v_contract_id
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
        client_id, invoice_number, status, issue_date, due_date, total, balance_due,
        rep_id, contract_id
      ) VALUES (
        v_proposal.client_id, next_invoice_number(v_client_code),
        'draft', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', v_line.price, v_line.price,
        v_proposal.assigned_to, v_contract_id
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
      client_id, invoice_number, status, issue_date, due_date, total, balance_due,
      rep_id, contract_id
    ) VALUES (
      v_proposal.client_id, next_invoice_number(v_client_code),
      'draft', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', v_total_value, v_total_value,
      v_proposal.assigned_to, v_contract_id
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


-- ─── 5. RPC: preview_team_member_work_transfer ────────────────────────
CREATE OR REPLACE FUNCTION public.preview_team_member_work_transfer(p_from_rep uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
AS $function$
  SELECT jsonb_build_object(
    'clients_open',     (SELECT COUNT(*) FROM clients   WHERE rep_id      = p_from_rep),
    'sales_open',       (SELECT COUNT(*) FROM sales     WHERE assigned_to = p_from_rep AND status <> 'Closed'),
    'invoices_open',    (SELECT COUNT(*) FROM invoices  WHERE rep_id      = p_from_rep AND status IN ('draft','sent','overdue','partially_paid')),
    'contracts_active', (SELECT COUNT(*) FROM contracts WHERE assigned_to = p_from_rep AND status = 'active')
  );
$function$;


-- ─── 6. RPC: transfer_team_member_work ────────────────────────────────
-- Bulk transfer of OPEN work only. Closed sales, paid invoices, and
-- completed/cancelled contracts are deliberately untouched — that's the
-- whole point of the snapshot model.
CREATE OR REPLACE FUNCTION public.transfer_team_member_work(
  p_from_rep   uuid,
  p_to_rep     uuid,
  p_clients    boolean DEFAULT true,
  p_sales      boolean DEFAULT true,
  p_invoices   boolean DEFAULT true,
  p_contracts  boolean DEFAULT true
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_clients   int := 0;
  v_sales     int := 0;
  v_invoices  int := 0;
  v_contracts int := 0;
BEGIN
  IF p_from_rep IS NULL OR p_to_rep IS NULL THEN
    RETURN jsonb_build_object('error', 'from_rep and to_rep are required');
  END IF;
  IF p_from_rep = p_to_rep THEN
    RETURN jsonb_build_object('error', 'from_rep and to_rep must differ');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM team_members WHERE id = p_to_rep AND COALESCE(is_active, true) = true) THEN
    RETURN jsonb_build_object('error', 'Target rep must be an active team member');
  END IF;

  IF p_clients THEN
    UPDATE clients SET rep_id = p_to_rep WHERE rep_id = p_from_rep;
    GET DIAGNOSTICS v_clients = ROW_COUNT;
  END IF;

  IF p_sales THEN
    UPDATE sales SET assigned_to = p_to_rep
    WHERE assigned_to = p_from_rep AND status <> 'Closed';
    GET DIAGNOSTICS v_sales = ROW_COUNT;
  END IF;

  IF p_invoices THEN
    UPDATE invoices SET rep_id = p_to_rep
    WHERE rep_id = p_from_rep
      AND status IN ('draft','sent','overdue','partially_paid');
    GET DIAGNOSTICS v_invoices = ROW_COUNT;
  END IF;

  IF p_contracts THEN
    UPDATE contracts SET assigned_to = p_to_rep
    WHERE assigned_to = p_from_rep AND status = 'active';
    GET DIAGNOSTICS v_contracts = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'clients_transferred',   v_clients,
    'sales_transferred',     v_sales,
    'invoices_transferred',  v_invoices,
    'contracts_transferred', v_contracts
  );
END;
$function$;


-- ─── 7. Grants ────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.preview_team_member_work_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_team_member_work(uuid, uuid, boolean, boolean, boolean, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
