-- 136_jen_p1_batch_a.sql
--
-- Jen P1 Batch A — small, high-leverage fixes that landed together
-- (race-guard pickup, deep-links, calendar role, inline status,
-- realtime, metric fixes, save-status, designer filter). Schema
-- footprint is tiny: one new column. Everything else is code.

-- ── P1.15 / P1.16: stable approval timestamp ─────────────────
-- updated_at moves on every status change + brief edit, so it can't
-- represent "when did this designer mark this approved". approved_at
-- is set in signOff() (designer signoff) and in advanceStatus() when
-- crossing into 'approved'.
ALTER TABLE ad_projects
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Best-effort backfill from updated_at for already-approved rows so
-- existing data shows up in firstProofRate / onTimeRate instead of
-- being silently filtered out (the metric requires non-null
-- approved_at to count a row).
UPDATE ad_projects
SET approved_at = updated_at
WHERE approved_at IS NULL AND status IN ('approved', 'signed_off', 'placed');
