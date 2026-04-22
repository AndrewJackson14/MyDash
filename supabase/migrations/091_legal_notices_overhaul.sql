-- ============================================================
-- Migration 091: Legal Notices / FBN overhaul
--
-- Splits FBN semantics from regular legal notices (same table,
-- new `kind` column), adds rich-text body + run-date array, adds
-- per-pub-per-year sequential numbering (TMT26001, PRP26001, …),
-- and adds configurable per-pub flat rates for FBN / Probate /
-- Name Change so admins can adjust them from the publications
-- settings UI.
--
-- No existing legal_notices rows in production (confirmed), so
-- no backfill required.
-- ============================================================

ALTER TABLE legal_notices
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'legal_notice'
    CHECK (kind IN ('legal_notice', 'fbn')),
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS run_dates date[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notice_number text,
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS rate_plan text NOT NULL DEFAULT 'per_char'
    CHECK (rate_plan IN ('per_char', 'probate_flat', 'name_change_flat', 'fbn_flat')),
  ADD COLUMN IF NOT EXISTS flat_rate numeric(8,2);

COMMENT ON COLUMN legal_notices.kind IS
  'Notice category — drives which UI surfaces it appears on. fbn stays hidden from the main Legal Notices page; created from ClientProfile.';
COMMENT ON COLUMN legal_notices.run_dates IS
  'Specific issue dates this notice should appear on. Length determines the run count for billing and the date lines appended to the printed body.';
COMMENT ON COLUMN legal_notices.notice_number IS
  'Rolling identifier in PUB+YY+NNN form (e.g. TMT26001). Allocated per publication per year via next_legal_notice_number().';
COMMENT ON COLUMN legal_notices.rate_plan IS
  'per_char uses legal_rate_per_char × body length × run count. The three flat variants use the matching publications.legal_*_flat × run count.';

CREATE INDEX IF NOT EXISTS idx_legal_notices_notice_number ON legal_notices(notice_number) WHERE notice_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_legal_notices_kind          ON legal_notices(kind);
CREATE INDEX IF NOT EXISTS idx_legal_notices_run_dates     ON legal_notices USING gin (run_dates);

-- ─── Per-pub, per-year legal notice sequence ───────────────
CREATE TABLE IF NOT EXISTS legal_notice_sequences (
  pub_id      text  NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  year        int   NOT NULL,
  last_number int   NOT NULL DEFAULT 0,
  PRIMARY KEY (pub_id, year)
);

COMMENT ON TABLE legal_notice_sequences IS
  'Rolling per-pub-per-year counter for legal_notices.notice_number. Resets to 001 every Jan 1.';

CREATE OR REPLACE FUNCTION public.next_legal_notice_number(p_pub_id text, p_year int)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE v_num int;
BEGIN
  INSERT INTO legal_notice_sequences (pub_id, year, last_number)
  VALUES (p_pub_id, p_year, 1)
  ON CONFLICT (pub_id, year)
  DO UPDATE SET last_number = legal_notice_sequences.last_number + 1
  RETURNING last_number INTO v_num;
  RETURN v_num;
END;
$$;

COMMENT ON FUNCTION public.next_legal_notice_number IS
  'Atomically allocate the next notice_number sequence for a (pub, year). UPSERT + RETURNING is race-safe under concurrent inserts.';

GRANT EXECUTE ON FUNCTION public.next_legal_notice_number TO authenticated, service_role;

ALTER TABLE legal_notice_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legal_seq_read"  ON legal_notice_sequences FOR SELECT TO authenticated USING (true);
CREATE POLICY "legal_seq_write" ON legal_notice_sequences FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- ─── Per-pub pricing for legal notice types ────────────────
ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS legal_rate_per_char    numeric(6,4) DEFAULT 0.055,
  ADD COLUMN IF NOT EXISTS legal_probate_flat     numeric(8,2),
  ADD COLUMN IF NOT EXISTS legal_name_change_flat numeric(8,2),
  ADD COLUMN IF NOT EXISTS legal_fbn_flat         numeric(8,2);

COMMENT ON COLUMN publications.legal_rate_per_char IS
  'Per-character rate for legal notices on the per_char plan. Default 0.055.';
COMMENT ON COLUMN publications.legal_fbn_flat IS
  'Flat rate charged per FBN filing in this publication.';

-- Seed the FBN flat rates confirmed by Hayley (TMT $85, PRP/ATN $60).
UPDATE publications SET legal_fbn_flat =  85 WHERE id = 'pub-the-malibu-times';
UPDATE publications SET legal_fbn_flat =  60 WHERE id = 'pub-paso-robles-press';
UPDATE publications SET legal_fbn_flat =  60 WHERE id = 'pub-atascadero-news';

NOTIFY pgrst, 'reload schema';
