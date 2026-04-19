-- Migration 072: Inquiry conversion tracking (Phase 2 of Digital Ad Workflow)
--
-- When a rep clicks "Convert to Draft Sale" on an Inquiries tab row, we
-- create a sales row pre-filled from inquiry fields and link the inquiry
-- back to the sale. These columns surface the link in both directions:
-- the inquiry shows what it became, the sale (via lookup) shows where
-- it came from.

alter table ad_inquiries
  add column if not exists converted_sale_id uuid references sales(id) on delete set null,
  add column if not exists converted_by      uuid references team_members(id),
  add column if not exists converted_at      timestamptz;

create index if not exists idx_ad_inquiries_converted_sale
  on ad_inquiries(converted_sale_id) where converted_sale_id is not null;
