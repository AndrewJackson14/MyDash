-- Migration 052: rollup views for the Financials Reports pages.
-- Everything derives from issue-level goals (commission_issue_goals.goal
-- with issues.revenue_goal as legacy fallback) plus issue_goal_allocations
-- for the salesperson cascade. No view stores state — all recompute on read.
--
-- Schema-fix versus spec: sales.publication_id is the real column
-- (not sales.publication); views below reference it correctly.

-- Publication x month goals (source: issue-level goals rolled up by month)
create or replace view public.publication_monthly_goals as
select
  i.pub_id as publication_id,
  to_char(i.date, 'YYYY-MM') as period,
  sum(coalesce(cig.goal, i.revenue_goal, 0))::numeric(12,2) as goal_amount,
  count(i.id) as issue_count
from public.issues i
left join public.commission_issue_goals cig on cig.issue_id = i.id
where i.date is not null
group by i.pub_id, to_char(i.date, 'YYYY-MM');

-- Publication x year goals
create or replace view public.publication_annual_goals as
select
  publication_id,
  substring(period from 1 for 4) as year,
  sum(goal_amount)::numeric(14,2) as goal_amount,
  sum(issue_count) as issue_count
from public.publication_monthly_goals
group by publication_id, substring(period from 1 for 4);

-- Company x month goals
create or replace view public.company_monthly_goals as
select
  period,
  sum(goal_amount)::numeric(14,2) as goal_amount
from public.publication_monthly_goals
group by period;

-- Company x year goals
create or replace view public.company_annual_goals as
select
  year,
  sum(goal_amount)::numeric(14,2) as goal_amount
from public.publication_annual_goals
group by year;

-- Salesperson x publication x month goals (via issue_goal_allocations)
create or replace view public.salesperson_monthly_goals as
select
  iga.salesperson_id,
  iga.publication_id,
  to_char(i.date, 'YYYY-MM') as period,
  sum(iga.allocated_goal)::numeric(12,2) as goal_amount
from public.issue_goal_allocations iga
join public.issues i on i.id = iga.issue_id
where i.date is not null
group by iga.salesperson_id, iga.publication_id, to_char(i.date, 'YYYY-MM');

-- Salesperson x publication x year goals
create or replace view public.salesperson_annual_goals as
select
  salesperson_id,
  publication_id,
  substring(period from 1 for 4) as year,
  sum(goal_amount)::numeric(14,2) as goal_amount
from public.salesperson_monthly_goals
group by salesperson_id, publication_id, substring(period from 1 for 4);

-- Actuals: publication x month revenue (closed sales).
create or replace view public.publication_monthly_revenue as
select
  s.publication_id,
  to_char(s.date, 'YYYY-MM') as period,
  sum(s.amount)::numeric(14,2) as actual_revenue,
  count(*) as deal_count
from public.sales s
where s.status = 'Closed'
  and s.date is not null
  and s.publication_id is not null
group by s.publication_id, to_char(s.date, 'YYYY-MM');

-- Actuals: salesperson x month revenue via commission_ledger (share %).
create or replace view public.salesperson_monthly_revenue as
select
  cl.salesperson_id,
  cl.publication_id,
  to_char(s.date, 'YYYY-MM') as period,
  sum(cl.sale_amount * cl.share_pct / 100.0)::numeric(14,2) as actual_revenue
from public.commission_ledger cl
join public.sales s on s.id = cl.sale_id
where s.status = 'Closed'
  and s.date is not null
group by cl.salesperson_id, cl.publication_id, to_char(s.date, 'YYYY-MM');
