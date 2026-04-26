-- ============================================================
-- Migration 161 — Proposal Wizard intake assets + RPC re-tag
--
-- Spec: proposal-wizard-spec.md §9 (originally numbered 160 in the
-- spec, but 160_section_persistence.sql shipped first — bumped to 161).
--
-- Two changes:
--   1. media_assets.source_proposal_id: tracks reference photos and
--      brief assets uploaded during the wizard's Brief step (Step 6).
--      Category 'proposal_intake' marks them in the client profile;
--      source_proposal_id keeps a hard link back to the originating
--      proposal so we can re-tag on conversion without scanning.
--
--   2. convert_proposal_to_contract: after ad_projects are created
--      for the new contract, re-tag any proposal_intake assets to
--      the FIRST ad_project (oldest created_at). Designers see the
--      reference photos automatically in the new ad_project queue
--      without a separate "attach files" step.
--
-- Why first ad_project (not all):
--   Multi-line proposals create one ad_project per line, but the
--   intake reference photos describe the OVERALL ad concept, not
--   per-issue variants. Tagging all of them would duplicate; tagging
--   the first gives the designer a single place to find them. They
--   can re-share to siblings via the existing asset panel if needed.
-- ============================================================

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS source_proposal_id uuid
  REFERENCES proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_assets_source_proposal
  ON media_assets(source_proposal_id)
  WHERE source_proposal_id IS NOT NULL;

COMMENT ON COLUMN media_assets.source_proposal_id IS
  'Set when the asset was uploaded via the proposal wizard Brief step. On contract conversion, convert_proposal_to_contract re-tags these to the first ad_project of the new contract.';

COMMENT ON COLUMN media_assets.category IS
  'Asset category — general | obituary | story | ad_brief | proposal_intake | tearsheet | etc. Wizard reference uploads use proposal_intake.';

-- ─── RPC patch ─────────────────────────────────────────────
-- Re-defines the function from migration 075 with a single new
-- block at the end of the loop body that re-tags intake assets.
-- search_path hardening from 108b is re-applied via SET clause.
CREATE OR REPLACE FUNCTION public.convert_proposal_to_contract(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
declare
  v_proposal proposals%rowtype;
  v_contract_id uuid;
  v_line record;
  v_sale_id uuid;
  v_contract_line_id uuid;
  v_sales_created int := 0;
  v_contract_lines_created int := 0;
  v_ad_projects_created int := 0;
  v_invoices_created int := 0;
  v_delivery_schedules_created int := 0;
  v_intake_assets_retagged int := 0;
  v_total_value numeric := 0;
  v_start_date date;
  v_end_date date;
  v_now timestamptz := now();
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
  v_is_digital boolean;
  v_product_type product_type;
  v_next_run timestamptz;
  v_first_ad_project_id uuid;
begin
  select * into v_proposal from proposals where id = p_proposal_id;
  if not found then return jsonb_build_object('error', 'Proposal not found'); end if;
  if v_proposal.status not in ('Sent', 'Approved/Signed') then
    return jsonb_build_object('error', 'Proposal must be Sent. Current: ' || v_proposal.status);
  end if;
  if v_proposal.contract_id is not null then
    return jsonb_build_object('error', 'Already converted to contract ' || v_proposal.contract_id);
  end if;

  -- Mixed-shape guard: every line must be EITHER print (issue_id) OR digital
  -- (digital_product_id + flight_start_date + flight_end_date).
  if exists (
    select 1 from proposal_lines pl
    where pl.proposal_id = p_proposal_id
      and pl.issue_id is null
      and (pl.digital_product_id is null or pl.flight_start_date is null or pl.flight_end_date is null)
  ) then
    return jsonb_build_object(
      'error',
      'Every proposal line must be EITHER scheduled to a print issue OR have a digital product + flight start/end dates.'
    );
  end if;

  select name, client_code into v_client_name, v_client_code from clients where id = v_proposal.client_id;
  v_client_code := coalesce(v_client_code, 'X0000');

  -- Date span: print uses issue_date, digital uses flight_start/end. Take the
  -- union span across both so the contract bookends the actual delivery window.
  select
    least(min(pl.issue_date), min(pl.flight_start_date)),
    greatest(max(pl.issue_date), max(pl.flight_end_date))
  into v_start_date, v_end_date
  from proposal_lines pl where pl.proposal_id = p_proposal_id;
  v_start_date := coalesce(v_start_date, v_proposal.date, current_date);
  v_end_date := coalesce(v_end_date, v_start_date + (coalesce(v_proposal.term_months, 1) * interval '1 month'));

  select coalesce(sum(pl.price), 0) into v_total_value from proposal_lines pl where pl.proposal_id = p_proposal_id;
  if v_proposal.discount_pct > 0 then
    v_total_value := v_total_value * (1 - v_proposal.discount_pct / 100.0);
  end if;

  v_payment_terms := case when v_proposal.pay_plan then 'monthly' else 'per_issue' end;
  v_term_months := coalesce(v_proposal.term_months, 1);
  v_monthly := coalesce(v_proposal.monthly, 0);
  v_art_source := coalesce(v_proposal.art_source, 'we_design');

  insert into contracts (
    client_id, name, status, start_date, end_date,
    total_value, total_paid, discount_pct, payment_terms,
    assigned_to, notes, is_synthetic, proposal_id,
    charge_day, monthly_amount
  ) values (
    v_proposal.client_id, v_proposal.name, 'active',
    v_start_date, v_end_date, v_total_value, 0,
    coalesce(v_proposal.discount_pct, 0), v_payment_terms,
    v_proposal.assigned_to,
    'Converted from proposal on ' || to_char(v_now, 'YYYY-MM-DD'),
    false, p_proposal_id,
    coalesce(v_proposal.charge_day, 1),
    case when v_proposal.pay_plan then v_monthly else null end
  ) returning id into v_contract_id;

  for v_line in
    select pl.*,
           p.name as pub_name_lookup,
           p.type::text as pub_type_lookup,
           i.label as issue_label_lookup,
           dap.product_type as digital_product_type,
           dap.name as digital_product_name
    from proposal_lines pl
    left join publications p on p.id = pl.publication_id
    left join issues i on i.id = pl.issue_id
    left join digital_ad_products dap on dap.id = pl.digital_product_id
    where pl.proposal_id = p_proposal_id
    order by coalesce(pl.issue_date, pl.flight_start_date) nulls last, pl.sort_order
  loop
    v_is_digital := v_line.digital_product_id is not null;

    if v_is_digital then
      v_product_type := case
        when v_line.digital_product_type in ('web_ad','newsletter_sponsor','eblast','social_sponsor')
          then v_line.digital_product_type::product_type
        else 'web_ad'::product_type
      end;
    else
      v_product_type := 'display_print'::product_type;
    end if;

    insert into contract_lines (
      contract_id, publication_id, ad_size, rate, quantity, line_total,
      digital_product_id, flight_start_date, flight_end_date, flight_months
    ) values (
      v_contract_id, v_line.publication_id,
      coalesce(v_line.ad_size, v_line.digital_product_name),
      v_line.price, 1, v_line.price,
      v_line.digital_product_id, v_line.flight_start_date, v_line.flight_end_date, v_line.flight_months
    ) returning id into v_contract_line_id;
    v_contract_lines_created := v_contract_lines_created + 1;

    insert into sales (
      client_id, publication_id, issue_id, ad_type, ad_size, ad_width, ad_height,
      amount, status, date, closed_at,
      proposal_id, proposal_line_id, contract_id, contract_line_id, product_type,
      digital_product_id, flight_start_date, flight_end_date, flight_months,
      assigned_to
    ) values (
      v_proposal.client_id, v_line.publication_id, v_line.issue_id,
      coalesce(v_line.pub_name, v_line.pub_name_lookup, ''),
      coalesce(v_line.ad_size, v_line.digital_product_name),
      coalesce(v_line.ad_width, 0), coalesce(v_line.ad_height, 0),
      v_line.price, 'Closed'::sale_status,
      coalesce(v_line.issue_date, v_line.flight_start_date, v_proposal.date, current_date), v_now,
      p_proposal_id, v_line.id, v_contract_id, v_contract_line_id, v_product_type,
      case when v_is_digital then v_line.digital_product_id end,
      case when v_is_digital then v_line.flight_start_date end,
      case when v_is_digital then v_line.flight_end_date end,
      case when v_is_digital then v_line.flight_months end,
      v_proposal.assigned_to
    ) returning id into v_sale_id;
    v_sales_created := v_sales_created + 1;

    v_pub_type := coalesce(v_line.pub_type_lookup, 'Magazine');

    if v_is_digital and v_payment_terms = 'per_issue' and v_line.price > 0 then
      insert into invoices (
        client_id, invoice_number, status, issue_date, due_date, total, balance_due
      ) values (
        v_proposal.client_id, next_invoice_number(v_client_code),
        'draft', current_date, coalesce(v_line.flight_start_date, current_date) + interval '30 days', v_line.price, v_line.price
      ) returning id into v_inv_id;
      insert into invoice_lines (invoice_id, sale_id, description, quantity, unit_price, total, transaction_type)
      values (v_inv_id, v_sale_id,
        coalesce(v_line.pub_name, v_line.pub_name_lookup, '') || ' — ' || coalesce(v_line.digital_product_name, 'Digital') ||
          case when v_line.flight_start_date is not null and v_line.flight_end_date is not null
               then ' (' || to_char(v_line.flight_start_date, 'Mon DD') || ' – ' || to_char(v_line.flight_end_date, 'Mon DD, YYYY') || ')'
               else '' end,
        1, v_line.price, v_line.price, 'web_ad');
      v_invoices_created := v_invoices_created + 1;
    elsif v_payment_terms = 'monthly' and v_line.price > 0 then
      v_issue_date := coalesce(v_line.issue_date, v_line.flight_start_date, v_proposal.date, current_date);
      insert into invoices (
        client_id, invoice_number, status, issue_date, due_date, total, balance_due
      ) values (
        v_proposal.client_id, next_invoice_number(v_client_code),
        'draft', current_date, v_issue_date + interval '30 days', v_line.price, v_line.price
      ) returning id into v_inv_id;
      insert into invoice_lines (invoice_id, sale_id, description, quantity, unit_price, total, transaction_type)
      values (v_inv_id, v_sale_id,
        coalesce(v_line.pub_name, v_line.pub_name_lookup, '') || ' ' ||
        coalesce(v_line.issue_label, v_line.digital_product_name, '') || ' — ' || coalesce(v_line.ad_size, v_line.digital_product_name, ''),
        1, v_line.price, v_line.price, case when v_is_digital then 'web_ad' else 'display_ad' end);
      v_invoices_created := v_invoices_created + 1;
    elsif not v_is_digital and v_payment_terms = 'per_issue' and v_pub_type = 'Special Publication' and v_line.price > 0 then
      v_issue_date := coalesce(v_line.issue_date, v_proposal.date, current_date);
      insert into invoices (
        client_id, invoice_number, status, issue_date, due_date, total, balance_due
      ) values (
        v_proposal.client_id, next_invoice_number(v_client_code),
        'draft', current_date, current_date + interval '30 days', v_line.price, v_line.price
      ) returning id into v_inv_id;
      insert into invoice_lines (invoice_id, sale_id, description, quantity, unit_price, total, transaction_type)
      values (v_inv_id, v_sale_id,
        coalesce(v_line.pub_name, v_line.pub_name_lookup, '') || ' ' ||
        coalesce(v_line.issue_label, '') || ' — ' || coalesce(v_line.ad_size, ''),
        1, v_line.price, v_line.price, 'display_ad');
      v_invoices_created := v_invoices_created + 1;
    end if;

    v_pub_name := coalesce(v_line.pub_name_lookup, '');
    insert into message_threads (type, title, participants)
    values ('ad_project',
      'Ad: ' || coalesce(v_client_name, '') || ' — ' || v_pub_name || ' ' ||
        coalesce(v_line.ad_size, v_line.digital_product_name, '') ||
        case when v_is_digital and v_line.flight_start_date is not null
             then ' (' || to_char(v_line.flight_start_date, 'Mon DD') || ' – ' || to_char(coalesce(v_line.flight_end_date, v_line.flight_start_date), 'Mon DD') || ')'
             when v_line.issue_label_lookup is not null then ' (' || v_line.issue_label_lookup || ')'
             else '' end,
      case when v_proposal.assigned_to is not null then array[v_proposal.assigned_to] else '{}'::uuid[] end
    ) returning id into v_thread_id;

    insert into ad_projects (
      sale_id, client_id, publication_id, issue_id, ad_size, art_source,
      salesperson_id, source_contract_id, source_proposal_id, status, thread_id
    ) values (
      v_sale_id, v_proposal.client_id, v_line.publication_id, v_line.issue_id,
      case when v_is_digital then null else v_line.ad_size end,
      v_art_source,
      v_proposal.assigned_to, v_contract_id, p_proposal_id,
      case when v_art_source = 'camera_ready' then 'awaiting_art' else 'brief' end, v_thread_id
    );
    v_ad_projects_created := v_ad_projects_created + 1;

    if v_is_digital and v_proposal.delivery_report_cadence is not null then
      v_next_run := case v_proposal.delivery_report_cadence
        when 'weekly'        then (v_line.flight_start_date::timestamptz + interval '7 days')
        when 'monthly'       then (v_line.flight_start_date::timestamptz + interval '1 month')
        when 'end_of_flight' then (v_line.flight_end_date::timestamptz + interval '1 day')
        when 'annual'        then (v_line.flight_start_date::timestamptz + interval '12 months')
        else (v_line.flight_start_date::timestamptz + interval '1 month')
      end;
      insert into delivery_report_schedules (sale_id, contact_id, cadence, next_run_at, is_active)
      values (v_sale_id, v_proposal.delivery_report_contact_id, v_proposal.delivery_report_cadence, v_next_run, true)
      on conflict (sale_id) do update set
        cadence = excluded.cadence,
        contact_id = excluded.contact_id,
        next_run_at = excluded.next_run_at,
        is_active = true,
        updated_at = now();
      v_delivery_schedules_created := v_delivery_schedules_created + 1;
    end if;
  end loop;

  -- Re-tag any proposal_intake media_assets uploaded during the wizard
  -- Brief step to the first ad_project for this contract. Designers see
  -- reference photos in the ad_project queue without a separate attach
  -- step. Filter on ad_project_id IS NULL so we never overwrite an asset
  -- already tagged to a downstream project.
  select id into v_first_ad_project_id
  from ad_projects
  where source_contract_id = v_contract_id
  order by created_at asc, id asc
  limit 1;

  if v_first_ad_project_id is not null then
    update media_assets
       set ad_project_id = v_first_ad_project_id,
           updated_at = now()
     where source_proposal_id = p_proposal_id
       and ad_project_id is null;
    GET DIAGNOSTICS v_intake_assets_retagged = ROW_COUNT;
  end if;

  if v_payment_terms not in ('per_issue', 'monthly') and v_total_value > 0 then
    insert into invoices (
      client_id, invoice_number, status, issue_date, due_date, total, balance_due
    ) values (
      v_proposal.client_id, next_invoice_number(v_client_code),
      'draft', current_date, current_date + interval '30 days', v_total_value, v_total_value
    ) returning id into v_inv_id;
    insert into invoice_lines (invoice_id, description, quantity, unit_price, total, transaction_type)
    values (v_inv_id, v_proposal.name || ' — Full payment', 1, v_total_value, v_total_value, 'display_ad');
    v_invoices_created := v_invoices_created + 1;
  end if;

  update proposals set
    status = 'Signed & Converted', contract_id = v_contract_id,
    converted_at = v_now, signed_at = coalesce(signed_at, v_now),
    history = coalesce(history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('event', 'signed', 'date', v_now, 'detail', 'Client signed proposal'),
      jsonb_build_object('event', 'converted', 'date', v_now, 'detail',
        'Signed & converted. ' || v_sales_created || ' sales, ' || v_invoices_created || ' invoices, ' ||
        v_ad_projects_created || ' ad projects, ' || v_delivery_schedules_created || ' delivery schedules, ' ||
        v_intake_assets_retagged || ' intake assets re-tagged.')
    )
  where id = p_proposal_id;

  update clients set status = 'Active', last_art_source = v_art_source
  where id = v_proposal.client_id;

  return jsonb_build_object(
    'success', true, 'contract_id', v_contract_id, 'proposal_id', p_proposal_id,
    'contract_lines_created', v_contract_lines_created, 'sales_created', v_sales_created,
    'ad_projects_created', v_ad_projects_created, 'invoices_created', v_invoices_created,
    'delivery_schedules_created', v_delivery_schedules_created,
    'intake_assets_retagged', v_intake_assets_retagged,
    'total_value', v_total_value, 'start_date', v_start_date, 'end_date', v_end_date
  );
end;
$function$;

NOTIFY pgrst, 'reload schema';
