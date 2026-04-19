-- Migration 078: Boot-query indexes (audit WS-5)
--
-- Two boot-time queries filter on unindexed columns. Sub-second today (small
-- enough tables) but degrades linearly as data grows. Cheap insurance.
--
-- 1. invoices.status — useAppData boot loader filters with .in('status', [...])
-- 2. payments.received_at — useAppData boot loader filters with .gte() to cap
--    to a 24-month window.

create index if not exists idx_invoices_status on invoices(status);
create index if not exists idx_payments_received_at on payments(received_at);
