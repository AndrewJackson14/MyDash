-- ============================================================
-- 180_people_unification_finalize.sql
--
-- Finalizes the people-unification work started in 179. Rewrites
-- every stored function that referenced team_members to query
-- `people` instead, then drops the sync trigger from 179 and
-- finally drops team_members itself.
--
-- 17 functions rewritten:
--   approve_booking                 reject_booking
--   calculate_sale_commission       stamp_contract_imports_uploaded_by
--   get_current_team_member         tg_email_log_to_activity
--   handle_ad_inquiry_insert        transfer_team_member_work
--   handle_subscriber_insert        unread_counts_for_threads
--   has_permission                  user_has_any_permission
--   is_admin                        user_has_site_access
--   log_activity                    my_team_member_id
--   mirror_ooo_team_notes
--
-- Column renames applied where they appear in function bodies:
--   tm.name        → p.display_name
--   tm.is_active   → p.status = 'active'
--   team_members%ROWTYPE → people%ROWTYPE
-- All other column names (role, auth_id, permissions, assigned_pubs,
-- global_role, commission_trigger, commission_default_rate,
-- alerts_mirror_to, ooo_*, etc.) are identical on the new table.
--
-- This migration MUST land in the same deploy cycle as 179. See
-- 179's header for the deployment-order rationale.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- Section 1: Trivial rewrites — change `team_members` → `people`
-- only. Bodies keep working unchanged.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_current_team_member()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM people WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_team_member_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM people WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM people
    WHERE auth_id = auth.uid()
      AND (permissions @> ARRAY[perm] OR permissions @> ARRAY['admin'])
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM people
    WHERE auth_id = auth.uid()
      AND 'admin' = ANY(permissions)
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_any_permission(perms text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM people
    WHERE auth_id = auth.uid()
      AND (
        permissions @> ARRAY['admin']
        OR permissions && perms
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.stamp_contract_imports_uploaded_by()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.uploaded_by IS NULL THEN
    SELECT id INTO NEW.uploaded_by FROM people WHERE auth_id = auth.uid() LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Section 2: Column-rename rewrites — `tm.name` → `p.display_name`,
-- `tm.is_active` → `p.status = 'active'`.
-- ────────────────────────────────────────────────────────────

-- user_has_site_access — was: tm.is_active = true. New: status = 'active'.
CREATE OR REPLACE FUNCTION public.user_has_site_access(p_site_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM people p
    WHERE p.auth_id = auth.uid()
      AND p.status = 'active'
      AND (
        p.global_role = 'super_admin'
        OR p_site_id = ANY(p.assigned_pubs)
      )
  );
$$;

-- transfer_team_member_work — used COALESCE(is_active, true) = true.
-- The migration also tightens the role check: target must be a current
-- staff/contractor person (active) — not just "any people row".
CREATE OR REPLACE FUNCTION public.transfer_team_member_work(
  p_from_rep uuid, p_to_rep uuid,
  p_clients   boolean DEFAULT true,
  p_sales     boolean DEFAULT true,
  p_invoices  boolean DEFAULT true,
  p_contracts boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
  IF NOT EXISTS (
    SELECT 1 FROM people WHERE id = p_to_rep AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('error', 'Target rep must be an active person');
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
$$;

-- unread_counts_for_threads — checks sender_name against team_members.name.
-- Renamed to people.display_name.
CREATE OR REPLACE FUNCTION public.unread_counts_for_threads(
  p_thread_ids uuid[], p_user_id uuid
)
RETURNS TABLE(thread_id uuid, unread_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.thread_id, COUNT(*)::int AS unread_count
  FROM messages m
  WHERE m.thread_id = ANY(p_thread_ids)
    AND m.created_at > COALESCE(
      (SELECT last_read_at FROM thread_reads tr
        WHERE tr.thread_id = m.thread_id AND tr.user_id = p_user_id),
      '1970-01-01'::timestamptz
    )
    AND m.sender_name IS DISTINCT FROM (
      SELECT display_name FROM people WHERE id = p_user_id
    )
  GROUP BY m.thread_id;
$$;


-- ────────────────────────────────────────────────────────────
-- Section 3: Trigger / RPC rewrites — read display_name and check
-- status = 'active'.
-- ────────────────────────────────────────────────────────────

-- handle_ad_inquiry_insert — fires on ad_inquiries INSERT, picks
-- admin-tagged people to notify. team_members.is_active = true →
-- people.status = 'active'.
CREATE OR REPLACE FUNCTION public.handle_ad_inquiry_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  matched_client_id uuid;
  matched_confidence match_confidence;
  matched_reason text;
  notify_user_id uuid;
  inquiry_domain text;
  team_row record;
  site_name text;
BEGIN
  matched_client_id := null;
  matched_confidence := 'none';
  matched_reason := '';

  SELECT s.name INTO site_name FROM sites s WHERE s.id = NEW.site_id;
  inquiry_domain := split_part(NEW.email, '@', 2);

  -- 1) Exact email match on client_contacts
  SELECT cc.client_id INTO matched_client_id
    FROM client_contacts cc
    WHERE lower(cc.email) = lower(NEW.email)
    LIMIT 1;
  IF matched_client_id IS NOT NULL THEN
    matched_confidence := 'exact';
    matched_reason := 'email';
  END IF;

  -- 2) Exact name match on clients
  IF matched_client_id IS NULL THEN
    SELECT c.id INTO matched_client_id
      FROM clients c
      WHERE lower(c.name) = lower(NEW.business_name)
         OR lower(c.name) = lower(NEW.name)
      LIMIT 1;
    IF matched_client_id IS NOT NULL THEN
      matched_confidence := 'exact';
      matched_reason := 'name';
    END IF;
  END IF;

  -- 3) Phone match
  IF matched_client_id IS NULL AND NEW.phone <> '' THEN
    SELECT cc.client_id INTO matched_client_id
      FROM client_contacts cc
      WHERE cc.phone <> '' AND cc.phone = NEW.phone
      LIMIT 1;
    IF matched_client_id IS NOT NULL THEN
      matched_confidence := 'probable';
      matched_reason := 'phone';
    END IF;
  END IF;

  -- 4) Email domain match (excluding common providers)
  IF matched_client_id IS NULL AND inquiry_domain <> '' AND inquiry_domain NOT IN (
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'icloud.com', 'protonmail.com', 'me.com', 'live.com', 'msn.com'
  ) THEN
    SELECT cc.client_id INTO matched_client_id
      FROM client_contacts cc
      WHERE split_part(cc.email, '@', 2) = inquiry_domain
      LIMIT 1;
    IF matched_client_id IS NOT NULL THEN
      matched_confidence := 'probable';
      matched_reason := 'email_domain';
    END IF;
  END IF;

  NEW.client_id := matched_client_id;
  NEW.match_confidence := matched_confidence;
  NEW.match_reason := matched_reason;

  -- Create notifications
  IF matched_client_id IS NOT NULL THEN
    SELECT rep_id INTO notify_user_id FROM clients WHERE id = matched_client_id;
    IF notify_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, detail, link)
      VALUES (
        notify_user_id,
        'ad_inquiry',
        'Ad inquiry from ' || NEW.name,
        COALESCE(site_name, 'Website') || ' — ' || NEW.business_name
          || ' (' || matched_confidence::text || ' match: ' || matched_reason || ')',
        '/sales?tab=inquiries&id=' || NEW.id
      );
    END IF;
  ELSE
    FOR team_row IN
      SELECT id FROM people
      WHERE status = 'active'
        AND (role = 'Publisher' OR 'admin' = ANY(permissions))
    LOOP
      INSERT INTO notifications (user_id, type, title, detail, link)
      VALUES (
        team_row.id,
        'ad_inquiry',
        'New advertiser inquiry from ' || NEW.name,
        COALESCE(site_name, 'Website') || ' — ' || NEW.business_name
          || ' — ' || COALESCE(NEW.budget_range, 'No budget specified'),
        '/sales?tab=inquiries&id=' || NEW.id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- handle_subscriber_insert — same shape. The 'Office Manager' role
-- was dropped in migration 178 (people-unification predecessor),
-- so this rewrite drops the legacy check too.
CREATE OR REPLACE FUNCTION public.handle_subscriber_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  team_row record;
  sub_name text;
BEGIN
  sub_name := trim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
  IF sub_name = '' THEN sub_name := COALESCE(NEW.email, 'Unknown'); END IF;

  FOR team_row IN
    SELECT id FROM people
    WHERE status = 'active'
      AND (role IN ('Office Administrator', 'Publisher')
           OR 'admin' = ANY(permissions))
  LOOP
    INSERT INTO notifications (user_id, type, title, detail, link)
    VALUES (
      team_row.id,
      'new_subscriber',
      'New subscriber: ' || sub_name,
      COALESCE(NEW.type::text, 'digital') || ' — '
        || COALESCE(NEW.email, 'no email') || ' — $'
        || COALESCE(NEW.amount_paid::text, '0'),
      '/circulation'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- log_activity — actor lookup against team_members → people.
-- The CASE block mapping team_role labels to spec slugs is preserved
-- as-is; legacy enum values (Sales Manager, Managing Editor, etc.)
-- are kept in the CASE for forward-compatibility if those values
-- ever come back. They never match in current data.
CREATE OR REPLACE FUNCTION public.log_activity(
  p_event_type      text,
  p_summary         text,
  p_event_category  text DEFAULT 'transition',
  p_event_source    text DEFAULT 'mydash',
  p_entity_table    text DEFAULT NULL,
  p_entity_id       uuid DEFAULT NULL,
  p_entity_summary  text DEFAULT NULL,
  p_publication_id  text DEFAULT NULL,
  p_client_id       uuid DEFAULT NULL,
  p_client_name     text DEFAULT NULL,
  p_related_user_id uuid DEFAULT NULL,
  p_metadata        jsonb DEFAULT NULL,
  p_visibility      text DEFAULT 'team',
  p_detail          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_id   uuid;
  v_actor_name text;
  v_actor_role text;
  v_id         uuid;
BEGIN
  SELECT id, display_name, role
    INTO v_actor_id, v_actor_name, v_actor_role
    FROM people
   WHERE auth_id = auth.uid()
   LIMIT 1;

  INSERT INTO activity_log (
    type, summary, detail,
    event_category, event_source,
    actor_id, actor_name, actor_role,
    client_id, client_name,
    entity_table, entity_id, entity_summary,
    publication_id, related_user_id,
    metadata, visibility
  )
  VALUES (
    p_event_type, p_summary, COALESCE(p_detail, p_summary),
    p_event_category, p_event_source,
    v_actor_id, v_actor_name,
    CASE v_actor_role
      WHEN 'Publisher'            THEN 'publisher'
      WHEN 'Editor-in-Chief'      THEN 'editor-in-chief'
      WHEN 'Salesperson'          THEN 'sales-rep'
      WHEN 'Sales Manager'        THEN 'sales-rep'
      WHEN 'Ad Designer'          THEN 'ad-designer'
      WHEN 'Layout Designer'      THEN 'layout-designer'
      WHEN 'Production Manager'   THEN 'layout-designer'
      WHEN 'Content Editor'       THEN 'content-editor'
      WHEN 'Managing Editor'      THEN 'content-editor'
      WHEN 'Office Administrator' THEN 'office-admin'
      WHEN 'Office Manager'       THEN 'office-admin'
      WHEN 'Finance'              THEN 'office-admin'
      ELSE NULL
    END,
    p_client_id, p_client_name,
    p_entity_table, p_entity_id, p_entity_summary,
    p_publication_id, p_related_user_id,
    p_metadata, p_visibility
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- tg_email_log_to_activity — same actor lookup; team_members → people
-- with display_name rename.
CREATE OR REPLACE FUNCTION public.tg_email_log_to_activity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_id    uuid;
  v_actor_name  text;
  v_actor_role  text;
  v_actor_slug  text;
  v_client_name text;
  v_event_type  text;
  v_summary     text;
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.direction = 'outbound' AND NEW.sent_by IS NOT NULL THEN
    SELECT id, display_name, role
      INTO v_actor_id, v_actor_name, v_actor_role
      FROM people
     WHERE id = NEW.sent_by
     LIMIT 1;
  END IF;

  v_actor_slug := CASE v_actor_role
    WHEN 'Publisher'            THEN 'publisher'
    WHEN 'Editor-in-Chief'      THEN 'editor-in-chief'
    WHEN 'Salesperson'          THEN 'sales-rep'
    WHEN 'Sales Manager'        THEN 'sales-rep'
    WHEN 'Ad Designer'          THEN 'ad-designer'
    WHEN 'Layout Designer'      THEN 'layout-designer'
    WHEN 'Production Manager'   THEN 'layout-designer'
    WHEN 'Content Editor'       THEN 'content-editor'
    WHEN 'Managing Editor'      THEN 'content-editor'
    WHEN 'Office Administrator' THEN 'office-admin'
    WHEN 'Office Manager'       THEN 'office-admin'
    WHEN 'Finance'              THEN 'office-admin'
    ELSE NULL
  END;

  SELECT name INTO v_client_name FROM clients WHERE id = NEW.client_id LIMIT 1;

  IF NEW.direction = 'outbound' THEN
    v_event_type := 'email_sent';
    v_summary := format('Sent email to %s', COALESCE(v_client_name, 'client'));
  ELSE
    v_event_type := 'email_received';
    v_summary := format('Received email from %s',
                        COALESCE(v_client_name, NEW.from_email, 'client'));
  END IF;

  INSERT INTO activity_log (
    type, summary, detail,
    event_category, event_source,
    actor_id, actor_name, actor_role,
    client_id, client_name,
    entity_table, entity_id,
    metadata, visibility,
    created_at
  ) VALUES (
    v_event_type, v_summary, NEW.subject,
    'effort', 'gmail',
    v_actor_id, v_actor_name, v_actor_slug,
    NEW.client_id, v_client_name,
    'email_log', NEW.id::uuid,
    jsonb_build_object(
      'gmail_message_id', NEW.gmail_message_id,
      'from_email',       NEW.from_email,
      'subject',          NEW.subject,
      'direction',        NEW.direction
    ),
    'team',
    COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'tg_email_log_to_activity: % %', SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Section 4: ROWTYPE rewrites — `team_members%ROWTYPE` declared
-- variables become `people%ROWTYPE`. Column references inside the
-- function bodies must still match.
-- ────────────────────────────────────────────────────────────

-- mirror_ooo_team_notes — declared variables of team_members%ROWTYPE.
-- Switch to people%ROWTYPE; references to alerts_mirror_to / ooo_*
-- columns work as-is (same names on people).
CREATE OR REPLACE FUNCTION public.mirror_ooo_team_notes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  recipient  people%ROWTYPE;
  mirror     people%ROWTYPE;
  today_date date := CURRENT_DATE;
BEGIN
  IF NEW.mirrored_from IS NOT NULL OR NEW.to_user IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO recipient FROM people WHERE auth_id = NEW.to_user LIMIT 1;
  IF recipient.id IS NULL OR recipient.alerts_mirror_to IS NULL THEN
    RETURN NEW;
  END IF;

  IF recipient.ooo_from IS NULL OR recipient.ooo_until IS NULL THEN
    RETURN NEW;
  END IF;
  IF today_date < recipient.ooo_from OR today_date > recipient.ooo_until THEN
    RETURN NEW;
  END IF;

  SELECT * INTO mirror FROM people WHERE id = recipient.alerts_mirror_to LIMIT 1;
  IF mirror.id IS NULL OR mirror.auth_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO team_notes (
    from_user, to_user, message, urgency,
    context_type, context_id, context_page, mirrored_from
  ) VALUES (
    NEW.from_user, mirror.auth_id, NEW.message, COALESCE(NEW.urgency, 'normal'),
    NEW.context_type, NEW.context_id, NEW.context_page, recipient.id
  );

  RETURN NEW;
END;
$$;

-- calculate_sale_commission — uses RECORD type (not %ROWTYPE) for
-- the team member row, so only the SELECT changes. commission_*
-- columns exist on people too.
CREATE OR REPLACE FUNCTION public.calculate_sale_commission(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_sale  sales%ROWTYPE;
  v_issue issues%ROWTYPE;
  v_tm    RECORD;
  v_rate  numeric;
  v_commission     numeric;
  v_trigger        text;
  v_issue_published boolean;
  v_invoice_paid   boolean;
  v_status         text;
  v_period         text;
  v_pt             text;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Sale not found'); END IF;
  IF v_sale.status != 'Closed' THEN
    RETURN jsonb_build_object('error', 'Sale not Closed');
  END IF;

  v_pt := COALESCE(v_sale.product_type::text, 'display_print');

  IF v_pt IN ('classified', 'legal_notice') THEN
    DELETE FROM commission_ledger WHERE sale_id = p_sale_id;
    RETURN jsonb_build_object('success', true, 'skipped', true,
                              'reason', 'non-commissionable product type');
  END IF;

  IF v_sale.assigned_to IS NULL THEN
    DELETE FROM commission_ledger WHERE sale_id = p_sale_id;
    RETURN jsonb_build_object('success', true, 'skipped', true,
                              'reason', 'no rep assigned');
  END IF;

  SELECT * INTO v_tm FROM people WHERE id = v_sale.assigned_to;
  IF NOT FOUND THEN
    DELETE FROM commission_ledger WHERE sale_id = p_sale_id;
    RETURN jsonb_build_object('success', true, 'skipped', true,
                              'reason', 'rep not in people');
  END IF;

  v_trigger := COALESCE(v_tm.commission_trigger, 'both');

  v_issue_published := false;
  IF v_sale.issue_id IS NOT NULL THEN
    SELECT * INTO v_issue FROM issues WHERE id = v_sale.issue_id;
    v_issue_published := v_issue.date IS NOT NULL AND v_issue.date <= CURRENT_DATE;
  END IF;

  v_invoice_paid := EXISTS (
    SELECT 1 FROM invoice_lines il
    JOIN invoices inv ON inv.id = il.invoice_id
    WHERE il.sale_id = p_sale_id AND inv.status = 'paid'
  );

  -- Rate lookup chain (product_type compared as text)
  SELECT rate INTO v_rate FROM commission_rates
   WHERE salesperson_id = v_sale.assigned_to
     AND publication_id = v_sale.publication_id
     AND product_type::text = v_pt
   LIMIT 1;
  IF v_rate IS NULL THEN
    SELECT rate INTO v_rate FROM commission_rates
     WHERE salesperson_id = v_sale.assigned_to
       AND publication_id = v_sale.publication_id
       AND (product_type IS NULL OR product_type::text = '')
     LIMIT 1;
  END IF;
  IF v_rate IS NULL THEN
    SELECT rate INTO v_rate FROM commission_rates
     WHERE salesperson_id = v_sale.assigned_to
       AND (publication_id IS NULL OR publication_id = '')
       AND (product_type IS NULL OR product_type::text = '')
     LIMIT 1;
  END IF;
  v_rate := COALESCE(v_rate, v_tm.commission_default_rate, 20);

  v_commission := v_sale.amount * (v_rate / 100);

  v_status := 'pending';
  IF    v_trigger = 'invoice_paid'    AND v_invoice_paid    THEN v_status := 'earned';
  ELSIF v_trigger = 'issue_published' AND v_issue_published THEN v_status := 'earned';
  ELSIF v_trigger = 'both' AND v_invoice_paid AND v_issue_published THEN v_status := 'earned';
  END IF;

  v_period := to_char(v_sale.date::date, 'YYYY-MM');

  INSERT INTO commission_ledger (
    sale_id, salesperson_id, publication_id, issue_id, client_id,
    sale_amount, share_pct, commission_rate, commission_amount,
    total_amount, status, issue_published, invoice_paid,
    earned_at, period
  ) VALUES (
    p_sale_id, v_sale.assigned_to, v_sale.publication_id, v_sale.issue_id, v_sale.client_id,
    v_sale.amount, 100, v_rate, v_commission,
    v_commission, v_status, v_issue_published, v_invoice_paid,
    CASE WHEN v_status = 'earned' THEN NOW() ELSE NULL END, v_period
  )
  ON CONFLICT (sale_id, salesperson_id) DO UPDATE SET
    publication_id    = EXCLUDED.publication_id,
    issue_id          = EXCLUDED.issue_id,
    sale_amount       = EXCLUDED.sale_amount,
    share_pct         = EXCLUDED.share_pct,
    commission_rate   = EXCLUDED.commission_rate,
    commission_amount = EXCLUDED.commission_amount,
    total_amount      = EXCLUDED.total_amount,
    status            = CASE WHEN commission_ledger.status = 'paid'
                             THEN 'paid' ELSE EXCLUDED.status END,
    issue_published   = EXCLUDED.issue_published,
    invoice_paid      = EXCLUDED.invoice_paid,
    earned_at         = CASE
                          WHEN EXCLUDED.status = 'earned'
                            AND commission_ledger.earned_at IS NULL THEN NOW()
                          ELSE commission_ledger.earned_at
                        END,
    updated_at        = NOW();

  RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id,
                            'amount', v_commission, 'status', v_status);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Section 5: ad_bookings RPCs — these still target the legacy
-- ad_bookings table (which has 0 rows and is being phased out by
-- self-serve-to-proposal-spec Phase F). The rewrite here changes
-- only the team_members reference; ad_bookings cleanup is a
-- separate migration.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_booking(
  p_booking_id uuid, p_rep_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_booking ad_bookings%ROWTYPE;
  v_team_id UUID;
  v_new_status ad_booking_status;
BEGIN
  SELECT id INTO v_team_id FROM people WHERE auth_id = auth.uid() LIMIT 1;

  SELECT * INTO v_booking FROM ad_bookings WHERE id = p_booking_id;
  IF v_booking IS NULL THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  IF v_booking.status NOT IN ('submitted','approved') THEN
    RAISE EXCEPTION 'cannot_approve_status_%', v_booking.status;
  END IF;

  v_new_status := 'approved';
  IF v_booking.run_start_date IS NOT NULL THEN
    IF v_booking.run_start_date > CURRENT_DATE THEN
      v_new_status := 'scheduled';
    ELSIF v_booking.run_start_date <= CURRENT_DATE
          AND (v_booking.run_end_date IS NULL OR v_booking.run_end_date >= CURRENT_DATE)
          AND v_booking.creative_status = 'client_approved' THEN
      v_new_status := 'live';
    END IF;
  END IF;

  UPDATE ad_bookings SET
    status = v_new_status,
    approved_by = v_team_id,
    approved_at = now(),
    rep_notes = COALESCE(NULLIF(trim(p_rep_notes), ''), rep_notes)
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('booking_id', p_booking_id, 'new_status', v_new_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_booking(
  p_booking_id uuid, p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_team_id UUID;
BEGIN
  IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;
  SELECT id INTO v_team_id FROM people WHERE auth_id = auth.uid() LIMIT 1;

  UPDATE ad_bookings SET
    status = 'rejected',
    rejection_reason = trim(p_rejection_reason),
    approved_by = v_team_id,
    approved_at = now()
  WHERE id = p_booking_id
    AND status IN ('submitted','approved','scheduled');

  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found_or_already_terminal'; END IF;

  RETURN jsonb_build_object('booking_id', p_booking_id, 'new_status', 'rejected');
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Section 6: Verify — every public function should now be free of
-- team_members references. If any survive, surface them.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  rec record;
  cnt int := 0;
BEGIN
  FOR rec IN
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc LIKE '%team_members%'
      AND proname NOT IN ('tg_team_members_sync_to_people')
  LOOP
    cnt := cnt + 1;
    RAISE WARNING '[180] Function still references team_members: %', rec.proname;
  END LOOP;
  IF cnt > 0 THEN
    RAISE EXCEPTION '[180] % function(s) still reference team_members; aborting before drop', cnt;
  END IF;
  RAISE NOTICE '[180] All public functions clean of team_members references.';
END $$;


-- ────────────────────────────────────────────────────────────
-- Section 7: Drop the sync trigger from 179 + the team_members
-- table itself.
-- ────────────────────────────────────────────────────────────
DROP TRIGGER  IF EXISTS team_members_sync_to_people ON team_members;
DROP FUNCTION IF EXISTS public.tg_team_members_sync_to_people();
DROP TABLE    IF EXISTS team_members CASCADE;


NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  ppl_count    bigint;
  fn_count     bigint;
  table_exists boolean;
BEGIN
  SELECT count(*) INTO ppl_count FROM people;
  SELECT count(*) INTO fn_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc LIKE '%team_members%';
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'team_members')
    INTO table_exists;

  RAISE NOTICE '[180] Finalize complete:';
  RAISE NOTICE '[180]   people rows: %', ppl_count;
  RAISE NOTICE '[180]   functions still mentioning team_members: % (expected 0)', fn_count;
  RAISE NOTICE '[180]   team_members table exists: % (expected false)', table_exists;
END $$;

COMMIT;
