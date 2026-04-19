-- Migration 068: Extend `sales` for digital flight (Phase 2 of Digital Ad Workflow)
--
-- Digital sales need flight start/end dates and a link back to the digital
-- product catalog so reporting + delivery emails can find the ad on the
-- site. Print sales already use issue_id for the same purpose.
--
-- The CHECK constraint sales_issue_id_by_product_type still enforces:
--   display_print  -> issue_id NOT NULL
--   everything else -> issue_id NULL
-- which leaves digital sales free to use flight_* columns instead.

alter table sales
  add column if not exists flight_start_date  date,
  add column if not exists flight_end_date    date,
  add column if not exists flight_months      int,
  add column if not exists digital_product_id uuid references digital_ad_products(id) on delete set null;

-- "Which digital ads are currently running" — bounded scan by product + flight window.
create index if not exists idx_sales_digital_flight
  on sales(digital_product_id, flight_start_date, flight_end_date)
  where digital_product_id is not null;
