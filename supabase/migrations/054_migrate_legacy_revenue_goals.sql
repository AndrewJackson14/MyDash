-- Migration 054: carry legacy issues.revenue_goal forward into the
-- canonical commission_issue_goals table so the Financials cascade has
-- data to allocate.
--
-- Background: commission_issue_goals is the source of truth going forward
-- (the Goals subtab in Publications writes here). In production it was
-- empty at migration 053 time because all prior goal data lived in
-- issues.revenue_goal. This migration copies those values across, and
-- the issue_goal_rebuild trigger (migration 051) then fires for each
-- insert and populates issue_goal_allocations automatically.
--
-- issues.revenue_goal is deliberately left in place. The rebuild function
-- continues to fall back to it (coalesce(cig.goal, i.revenue_goal, 0)),
-- so any other code path that sets revenue_goal directly still cascades.

insert into public.commission_issue_goals (issue_id, publication_id, goal)
select i.id, i.pub_id, i.revenue_goal
from public.issues i
left join public.commission_issue_goals cig on cig.issue_id = i.id
where coalesce(i.revenue_goal, 0) > 0
  and cig.id is null;

-- Freeze allocations for issues already sent to press. Migration 053
-- tried to do this, but at that point commission_issue_goals was empty
-- so no allocations existed yet. After the insert above the rebuild
-- trigger has populated them; we freeze the ones whose parent issue
-- is already past press so share-% changes don't retroactively rewrite
-- historical attribution.
update public.issue_goal_allocations iga
set is_frozen = true, updated_at = now()
from public.issues i
where iga.issue_id = i.id
  and i.sent_to_press_at is not null
  and iga.is_frozen = false;
