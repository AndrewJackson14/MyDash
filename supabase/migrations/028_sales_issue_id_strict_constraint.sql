-- 028_sales_issue_id_strict_constraint.sql
--
-- Enforces the product-type invariant on sales.issue_id:
--   - display_print sales MUST belong to an issue
--   - non-print sales MUST NOT have an issue_id
--
-- The second clause is a forward-looking guarantee: when web ads,
-- directory listings, or other non-print product types ship, they'll
-- use their own scheduling model (run start/end dates, placement
-- slots, etc.) rather than the issue FK. This prevents a future
-- "mixed model" where some web ads live under issues and some don't.
--
-- Prerequisite: the full sales backfill (done manually against live
-- DB on 2026-04-15) has already assigned issue_id to every existing
-- display_print row. The CHECK would reject any rows otherwise.

alter table public.sales
  add constraint sales_issue_id_by_product_type
  check (
    (product_type = 'display_print' and issue_id is not null)
    or
    (product_type <> 'display_print' and issue_id is null)
  );

notify pgrst, 'reload schema';
