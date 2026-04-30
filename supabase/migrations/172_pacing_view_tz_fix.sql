-- 172_pacing_view_tz_fix.sql
-- Fix: publisher_issue_pacing_view used CURRENT_DATE for days_to_deadline
-- and the upcoming-window filter. CURRENT_DATE resolves to the database
-- server's local date — UTC on Supabase — which is up to a day ahead of
-- the user's perceived date in PT/PDT for several hours each day.
-- Symptom: an issue pressing "tomorrow" (PT) showed "2D" in the Publisher
-- dashboard, and its pacing target row picked the 2-day curve waypoint
-- (90%) instead of the 1-day waypoint (95%).
--
-- Switch to a Pacific-timezone date so the view matches user perception.
-- All publications are PT operations; if MyDash ever expands beyond
-- this region, swap to a per-pub timezone column and join here.

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
  GREATEST(0, (i.date - (now() AT TIME ZONE 'America/Los_Angeles')::date))
                                                   AS days_to_deadline
FROM issues i
JOIN publications p ON p.id = i.pub_id
LEFT JOIN sales s ON s.issue_id = i.id
WHERE i.date >= (now() AT TIME ZONE 'America/Los_Angeles')::date
  AND i.date <= (now() AT TIME ZONE 'America/Los_Angeles')::date + INTERVAL '7 days'
  AND i.sent_to_press_at IS NULL
GROUP BY i.id, p.id;

COMMENT ON VIEW publisher_issue_pacing_view IS
  'Issue cards grid source — issues hitting press in the next 7 days. days_to_deadline computed against America/Los_Angeles current date so it matches user-perceived "today".';

-- publisher_alerts also uses CURRENT_DATE for the deadline_critical and
-- awaiting_signoff branches. Same fix — re-create with TZ-aware dates.
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
WHERE i.date BETWEEN (now() AT TIME ZONE 'America/Los_Angeles')::date
                 AND (now() AT TIME ZONE 'America/Los_Angeles')::date + INTERVAL '1 day'
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
    'days_to_press', i.date - (now() AT TIME ZONE 'America/Los_Angeles')::date
  )                                                AS metadata,
  i.date::timestamptz                              AS occurred_at
FROM issues i
JOIN publications p ON p.id = i.pub_id
WHERE i.date BETWEEN (now() AT TIME ZONE 'America/Los_Angeles')::date
                 AND (now() AT TIME ZONE 'America/Los_Angeles')::date + INTERVAL '7 days'
  AND i.publisher_signoff_at IS NULL
  AND i.sent_to_press_at IS NULL

UNION ALL

SELECT
  'escalation'                                     AS alert_type,
  'warning'                                        AS severity,
  tn.id::text                                      AS source_id,
  'team_notes'                                     AS source_table,
  NULL                                             AS publication_id,
  COALESCE(left(tn.message, 80), 'Escalation')     AS summary,
  jsonb_build_object('from_user', tn.from_user, 'note_id', tn.id) AS metadata,
  tn.created_at                                    AS occurred_at
FROM team_notes tn
WHERE tn.context_type = 'escalation'
  AND tn.created_at >= now() - INTERVAL '24 hours'
  AND COALESCE(tn.is_read, false) = false;

GRANT SELECT ON publisher_issue_pacing_view TO authenticated;
GRANT SELECT ON publisher_alerts TO authenticated;
