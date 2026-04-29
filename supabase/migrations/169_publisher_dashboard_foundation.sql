-- 169_publisher_dashboard_foundation.sql
-- Build Order step 1 for the Publisher Dashboard spec.
-- 1. Extend activity_log with the spec's wider shape (entity link + metadata).
-- 2. Add publications.abbreviation so the press timeline strip can render
--    the 3-letter pub codes the spec calls for (PRP, ANM, MTC...).
-- 3. Create the three publisher views the dashboard reads from.
-- 4. Add log_activity RPC as the canonical write path for the new schema.
--    Existing direct INSERTs into activity_log keep working — RLS not
--    tightened in this migration. Follow-up will retrofit logActivity()
--    in useAppData.jsx to call this RPC, then tighten RLS to RPC-only.

-- ────────────────────────────────────────────────────────────────────
-- 1. activity_log — additive columns (nullable, back-compat)
-- ────────────────────────────────────────────────────────────────────
-- Note: production schema diverged from migration 001 via hand-applied
-- SQL editor changes (untracked). Actual columns:
--   id, type, client_id, client_name, sale_id, detail, actor_id,
--   actor_name, created_at
-- Migration 001 said `text` and `user_id`; production has `detail` and
-- `actor_id`. Below uses the actual production column names.
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS entity_table   text,
  ADD COLUMN IF NOT EXISTS entity_id      uuid,
  ADD COLUMN IF NOT EXISTS summary        text,
  ADD COLUMN IF NOT EXISTS metadata       jsonb,
  ADD COLUMN IF NOT EXISTS publication_id text REFERENCES publications(id);

-- Backfill summary from existing detail column so reads work uniformly.
UPDATE activity_log
SET summary = detail
WHERE summary IS NULL AND detail IS NOT NULL;

-- Indexes for the publisher activity stream queries.
CREATE INDEX IF NOT EXISTS idx_activity_log_pub_date
  ON activity_log(publication_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor_date
  ON activity_log(actor_id, created_at DESC);

COMMENT ON COLUMN activity_log.summary IS
  'Human-readable summary string. Mirrors the legacy `detail` column going forward; both populated during migration window.';
COMMENT ON COLUMN activity_log.entity_table IS
  'Source table of the entity this row describes (proposals, contracts, ad_projects, stories, layout_pages, invoices, notes).';
COMMENT ON COLUMN activity_log.entity_id IS
  'PK of the entity in entity_table.';
COMMENT ON COLUMN activity_log.metadata IS
  'Event-type specific payload (amount, status_from, status_to, etc).';

-- ────────────────────────────────────────────────────────────────────
-- 2. publications.abbreviation — for press timeline cell labels
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS abbreviation text;

-- Seed known pubs. Easy to override per pub via Publications page later.
UPDATE publications SET abbreviation = 'PRP' WHERE id = 'pub-paso-robles-press' AND abbreviation IS NULL;
UPDATE publications SET abbreviation = 'ANM' WHERE id = 'pub-atascadero-news' AND abbreviation IS NULL;
UPDATE publications SET abbreviation = 'MTC' WHERE id = 'pub-the-malibu-times' AND abbreviation IS NULL;

-- Generic fallback: first 3 letters of name, uppercase. Editable later.
UPDATE publications
SET abbreviation = upper(substring(regexp_replace(name, '[^A-Za-z]', '', 'g') FROM 1 FOR 3))
WHERE abbreviation IS NULL;

-- ────────────────────────────────────────────────────────────────────
-- 3a. publisher_issue_pacing_view — issue cards grid source
-- ────────────────────────────────────────────────────────────────────
-- Translates the spec's invented field names to MyDash actuals:
--   spec.contracts.contract_value       → sum(sales.amount) WHERE status='Closed'
--   spec.contracts.status='signed'      → sales.status='Closed'
--   spec.publications.press_deadline_at → issues.date (publish/press date)
--   spec.issue.total_ad_units           → count(sales) for the issue (any status)
--   spec.issue.units_sold               → count(sales) WHERE status='Closed'
--   spec.issue.revenue_target           → coalesce(cig totals, issues.revenue_goal)
-- Goal source mirrors migration 052's issue_goal_rollup_view: prefer
-- commission_issue_goals if any rows exist for the issue, else fall
-- back to issues.revenue_goal.
CREATE OR REPLACE VIEW publisher_issue_pacing_view AS
SELECT
  i.id                                             AS issue_id,
  i.pub_id                                         AS publication_id,
  p.name                                           AS publication_name,
  COALESCE(p.abbreviation, upper(substring(p.name FROM 1 FOR 3))) AS publication_abbrev,
  i.label,
  i.date                                           AS press_date,
  i.ad_deadline,
  COALESCE(
    (SELECT sum(cig.goal)::numeric(12,2)
       FROM commission_issue_goals cig
      WHERE cig.issue_id = i.id),
    i.revenue_goal,
    0
  )                                                AS revenue_target,
  COALESCE(SUM(s.amount) FILTER (WHERE s.status = 'Closed'), 0)::numeric(12,2)
                                                   AS revenue_sold,
  COUNT(s.id) FILTER (WHERE s.status = 'Closed')   AS units_sold,
  COUNT(s.id)                                      AS units_total,
  i.sent_to_press_at,
  i.publisher_signoff_at,
  GREATEST(0, (i.date - CURRENT_DATE))             AS days_to_deadline
FROM issues i
JOIN publications p ON p.id = i.pub_id
LEFT JOIN sales s ON s.issue_id = i.id
WHERE i.date >= CURRENT_DATE
  AND i.date <= CURRENT_DATE + INTERVAL '7 days'
  AND i.sent_to_press_at IS NULL
GROUP BY i.id, p.id;

COMMENT ON VIEW publisher_issue_pacing_view IS
  'Issue cards grid source — issues hitting press in the next 7 days with pacing data.';

-- ────────────────────────────────────────────────────────────────────
-- 3b. publisher_alerts — conditional alert banner source
-- ────────────────────────────────────────────────────────────────────
-- UNION across:
--   - Press deadline within 24h with sold % below 90%
--   - Issues missing publisher_signoff approaching press (7 days)
--   - Recent escalation team_notes (context_type='escalation', last 24h)
--
-- Pacing variance (>10pp behind curve) check is computed in the view too,
-- but the curve waypoints (50/70/85/95) are applied in the JS layer to
-- keep curve config in one place (constants.ts in the spec, but JS here).
-- The view exposes raw days + sold pct so the hook can flag.
CREATE OR REPLACE VIEW publisher_alerts AS
SELECT
  'deadline_critical'                              AS alert_type,
  'critical'                                       AS severity,
  i.id::text                                       AS source_id,
  'issues'                                         AS source_table,
  i.pub_id                                         AS publication_id,
  format('%s — press tomorrow at %s%% sold',
         COALESCE(p.abbreviation, p.name),
         CASE WHEN COALESCE(i.revenue_goal, 0) > 0
              THEN round(100.0 * COALESCE(SUM(s.amount) FILTER (WHERE s.status = 'Closed'), 0)
                              / NULLIF(i.revenue_goal, 0))::text
              ELSE '0' END)                        AS summary,
  jsonb_build_object(
    'issue_id', i.id,
    'press_date', i.date,
    'revenue_sold', COALESCE(SUM(s.amount) FILTER (WHERE s.status = 'Closed'), 0),
    'revenue_target', i.revenue_goal
  )                                                AS metadata,
  i.date::timestamptz                              AS occurred_at
FROM issues i
JOIN publications p ON p.id = i.pub_id
LEFT JOIN sales s ON s.issue_id = i.id
WHERE i.date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day'
  AND i.sent_to_press_at IS NULL
GROUP BY i.id, p.id
HAVING COALESCE(i.revenue_goal, 0) = 0
    OR (COALESCE(SUM(s.amount) FILTER (WHERE s.status = 'Closed'), 0)
        / NULLIF(i.revenue_goal, 0)) < 0.90

UNION ALL

SELECT
  'awaiting_signoff'                               AS alert_type,
  'warning'                                        AS severity,
  i.id::text                                       AS source_id,
  'issues'                                         AS source_table,
  i.pub_id                                         AS publication_id,
  format('%s %s needs your sign-off (press %s)',
         COALESCE(p.abbreviation, p.name),
         i.label,
         to_char(i.date, 'Mon DD'))                AS summary,
  jsonb_build_object(
    'issue_id', i.id,
    'press_date', i.date,
    'days_to_press', i.date - CURRENT_DATE
  )                                                AS metadata,
  i.date::timestamptz                              AS occurred_at
FROM issues i
JOIN publications p ON p.id = i.pub_id
WHERE i.date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
  AND i.publisher_signoff_at IS NULL
  AND i.sent_to_press_at IS NULL

UNION ALL

SELECT
  'escalation'                                     AS alert_type,
  'warning'                                        AS severity,
  tn.id::text                                      AS source_id,
  'team_notes'                                     AS source_table,
  NULL                                             AS publication_id,
  COALESCE(left(tn.message, 80), 'Escalation')    AS summary,
  jsonb_build_object('from_user', tn.from_user, 'note_id', tn.id) AS metadata,
  tn.created_at                                    AS occurred_at
FROM team_notes tn
WHERE tn.context_type = 'escalation'
  AND tn.created_at >= now() - INTERVAL '24 hours'
  AND COALESCE(tn.is_read, false) = false;

COMMENT ON VIEW publisher_alerts IS
  'Conditional alert banner source. UNION of deadline-critical, awaiting-signoff, and escalation team_notes.';

-- ────────────────────────────────────────────────────────────────────
-- 3c. publisher_month_at_a_glance_view — bottom summary card
-- ────────────────────────────────────────────────────────────────────
-- Period: current calendar month, 1st through today.
-- Revenue: closed sales this month.
-- Net: revenue - bills paid this month (rough; bills aren't pub-scoped).
-- AR > 60d: open invoices with due_date older than today - 60 days.
-- Subscribers: active count + net change this month.
CREATE OR REPLACE VIEW publisher_month_at_a_glance_view AS
WITH revenue_mtd AS (
  SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS total
    FROM sales
   WHERE status = 'Closed'
     AND date >= date_trunc('month', CURRENT_DATE)::date
     AND date <= CURRENT_DATE
),
revenue_goal AS (
  -- Sum issue revenue goals for issues publishing this month.
  -- Mirrors the same coalesce pattern as publisher_issue_pacing_view.
  SELECT COALESCE(SUM(
    COALESCE(
      (SELECT sum(cig.goal) FROM commission_issue_goals cig WHERE cig.issue_id = i.id),
      i.revenue_goal,
      0
    )
  ), 0)::numeric(12,2) AS total
    FROM issues i
   WHERE i.date >= date_trunc('month', CURRENT_DATE)::date
     AND i.date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
),
bills_mtd AS (
  SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS total
    FROM bills
   WHERE status IN ('paid', 'partially_paid')
     AND COALESCE(bill_date, created_at::date) >= date_trunc('month', CURRENT_DATE)::date
),
ar_60_plus AS (
  SELECT
    COALESCE(SUM(balance_due), 0)::numeric(12,2) AS total,
    COUNT(DISTINCT client_id)                    AS account_count
    FROM invoices
   WHERE status IN ('sent', 'overdue', 'partially_paid')
     AND due_date IS NOT NULL
     AND due_date < CURRENT_DATE - INTERVAL '60 days'
     AND COALESCE(balance_due, 0) > 0
),
subs_active AS (
  SELECT COUNT(*) AS total
    FROM subscribers
   WHERE status = 'active'
),
subs_net AS (
  SELECT
    COUNT(*) FILTER (WHERE start_date >= date_trunc('month', CURRENT_DATE)::date) -
    COUNT(*) FILTER (WHERE status = 'cancelled' AND
                           COALESCE(updated_at, created_at)::date >= date_trunc('month', CURRENT_DATE)::date)
    AS net_change
    FROM subscribers
)
SELECT
  revenue_mtd.total                                          AS revenue,
  revenue_goal.total                                         AS revenue_goal,
  CASE WHEN revenue_goal.total > 0
       THEN round(100.0 * revenue_mtd.total / revenue_goal.total)::int
       ELSE NULL END                                         AS revenue_pct_of_goal,
  (revenue_mtd.total - bills_mtd.total)::numeric(12,2)       AS net,
  CASE WHEN revenue_mtd.total > 0
       THEN round(100.0 * (revenue_mtd.total - bills_mtd.total) / revenue_mtd.total)::int
       ELSE NULL END                                         AS net_margin_pct,
  ar_60_plus.total                                           AS ar_over_60,
  ar_60_plus.account_count                                   AS ar_over_60_accounts,
  subs_active.total                                          AS subscribers_active,
  subs_net.net_change                                        AS subscribers_net_change
FROM revenue_mtd, revenue_goal, bills_mtd, ar_60_plus, subs_active, subs_net;

COMMENT ON VIEW publisher_month_at_a_glance_view IS
  'Bottom summary card source — 4 metrics for the current calendar month.';

-- ────────────────────────────────────────────────────────────────────
-- 4. log_activity RPC — canonical write path with the new schema
-- ────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can write regardless of caller's RLS, but
-- stamps actor from auth.uid() to prevent spoofing. Existing direct
-- INSERT call sites continue to work via the open insert policy that's
-- still in place — they just don't get the new fields populated.
-- Follow-up commit will migrate logActivity() in useAppData.jsx to call
-- this RPC, then tighten RLS to RPC-only.
CREATE OR REPLACE FUNCTION public.log_activity(
  p_event_type     text,
  p_summary        text,
  p_entity_table   text DEFAULT NULL,
  p_entity_id      uuid DEFAULT NULL,
  p_publication_id text DEFAULT NULL,
  p_client_id      uuid DEFAULT NULL,
  p_client_name    text DEFAULT NULL,
  p_metadata       jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id   uuid;
  v_actor_name text;
  v_id         uuid;
BEGIN
  SELECT id, name INTO v_actor_id, v_actor_name
    FROM team_members
   WHERE auth_id = auth.uid()
   LIMIT 1;

  -- Production columns: detail (legacy text), type, summary, actor_id,
  -- actor_name, client_id, client_name, entity_table, entity_id,
  -- publication_id, metadata. Both `detail` and `summary` written so legacy
  -- readers (SalesCRM activity strip) and new readers (publisher stream)
  -- both see the row.
  INSERT INTO activity_log (
    detail, type, summary,
    actor_id, actor_name, client_id, client_name,
    entity_table, entity_id, publication_id, metadata
  )
  VALUES (
    p_summary, p_event_type, p_summary,
    v_actor_id, v_actor_name, p_client_id, p_client_name,
    p_entity_table, p_entity_id, p_publication_id, p_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_activity(text, text, text, uuid, text, uuid, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.log_activity IS
  'Canonical activity_log writer. Stamps actor_user_id from auth.uid(); writes both legacy (text/type) and new (summary/event_type via type) columns for back-compat.';

-- ────────────────────────────────────────────────────────────────────
-- 5. View grants — publisher views readable to authenticated
-- ────────────────────────────────────────────────────────────────────
-- Inherits RLS from base tables. Verify Publisher's user has SELECT on
-- issues, sales, publications, commission_issue_goals, invoices,
-- subscribers, bills, team_notes (all current under standard
-- authenticated-read policies).
GRANT SELECT ON publisher_issue_pacing_view TO authenticated;
GRANT SELECT ON publisher_alerts TO authenticated;
GRANT SELECT ON publisher_month_at_a_glance_view TO authenticated;
