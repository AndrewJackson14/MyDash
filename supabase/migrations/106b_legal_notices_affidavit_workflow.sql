-- ============================================================
-- 106b — Legal Notice Affidavit Workflow main migration.
-- (spec §4.1–4.6, minus the status enum which 106a handles.)
-- ============================================================

-- 4.1 legal_notices — affidavit + delivery columns -----------------
ALTER TABLE legal_notices
  ADD COLUMN IF NOT EXISTS affidavit_status text
    NOT NULL DEFAULT 'not_started'
    CHECK (affidavit_status IN ('not_started','draft','ready','delivered')),
  ADD COLUMN IF NOT EXISTS affidavit_pdf_url text,
  ADD COLUMN IF NOT EXISTS affidavit_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS affidavit_page_count int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS delivery_method text
    CHECK (delivery_method IN ('email','mail','both')),
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_to_email text,
  ADD COLUMN IF NOT EXISTS delivered_to_address_json jsonb,
  ADD COLUMN IF NOT EXISTS delivered_note text,
  ADD COLUMN IF NOT EXISTS file_number text;

COMMENT ON COLUMN legal_notices.affidavit_status IS
  'Sub-status for the affidavit half of the lifecycle. Parallel to the main status enum so the Published → Delivered progression reads as a single pipeline in the UI.';
COMMENT ON COLUMN legal_notices.file_number IS
  'Filer-assigned reference number (e.g. trustee sale TS#, court case #). Optional; populated at intake by the legal clerk.';

-- 4.3 legal_notice_clippings ---------------------------------------
CREATE TABLE IF NOT EXISTS legal_notice_clippings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_notice_id uuid NOT NULL REFERENCES legal_notices(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  edition_id uuid REFERENCES editions(id) ON DELETE SET NULL,
  source_page_number int NOT NULL,
  source_frozen_url text NOT NULL,
  crop_x numeric(7,6) NOT NULL,
  crop_y numeric(7,6) NOT NULL,
  crop_w numeric(7,6) NOT NULL,
  crop_h numeric(7,6) NOT NULL,
  clipping_cdn_url text NOT NULL,
  canvas_page int NOT NULL DEFAULT 1,
  canvas_x numeric(8,2),
  canvas_y numeric(8,2),
  canvas_w numeric(8,2),
  clip_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES team_members(id)
);

CREATE INDEX IF NOT EXISTS idx_lnc_notice ON legal_notice_clippings(legal_notice_id);
CREATE INDEX IF NOT EXISTS idx_lnc_run_date ON legal_notice_clippings(run_date);

ALTER TABLE legal_notice_clippings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lnc_read"  ON legal_notice_clippings;
DROP POLICY IF EXISTS "lnc_write" ON legal_notice_clippings;
CREATE POLICY "lnc_read"  ON legal_notice_clippings FOR SELECT TO authenticated USING (true);
CREATE POLICY "lnc_write" ON legal_notice_clippings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4.4 team_members — signature column ------------------------------
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS signature_uploaded_at timestamptz;

UPDATE team_members
   SET signature_url = 'https://cdn.13stars.media/team-signatures/cami-martin.png',
       signature_uploaded_at = now()
 WHERE name ILIKE 'Cami%Martin%' AND signature_url IS NULL;

-- 4.5 issues — legals page hints -----------------------------------
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS legals_page_start int,
  ADD COLUMN IF NOT EXISTS legals_page_end int;

-- 4.6 Shared CM sequence for PRP + ATN -----------------------------
ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS legal_pub_group text;

UPDATE publications SET legal_pub_group = 'prp_atn'
  WHERE id IN ('pub-paso-robles-press','pub-atascadero-news') AND legal_pub_group IS NULL;
UPDATE publications SET legal_pub_group = 'malibu'
  WHERE id IN ('pub-the-malibu-times','pub-malibu-times') AND legal_pub_group IS NULL;

CREATE TABLE IF NOT EXISTS legal_notice_sequences_v2 (
  pub_group   text NOT NULL,
  year        int  NOT NULL,
  last_number int  NOT NULL DEFAULT 0,
  PRIMARY KEY (pub_group, year)
);

CREATE OR REPLACE FUNCTION public.next_legal_notice_number_v2(
  p_pub_id text, p_year int
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_group text;
  v_num   int;
  v_prefix text;
BEGIN
  SELECT legal_pub_group INTO v_group FROM publications WHERE id = p_pub_id;
  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Publication % has no legal_pub_group', p_pub_id;
  END IF;

  INSERT INTO legal_notice_sequences_v2 (pub_group, year, last_number)
  VALUES (v_group, p_year, 1)
  ON CONFLICT (pub_group, year)
  DO UPDATE SET last_number = legal_notice_sequences_v2.last_number + 1
  RETURNING last_number INTO v_num;

  v_prefix := CASE v_group
    WHEN 'prp_atn' THEN 'CM '
    WHEN 'malibu'  THEN 'MALIBU '
    ELSE ''
  END;

  RETURN v_prefix || v_num::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_legal_notice_number_v2 TO authenticated, service_role;

ALTER TABLE legal_notice_sequences_v2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lns2_read"  ON legal_notice_sequences_v2;
DROP POLICY IF EXISTS "lns2_write" ON legal_notice_sequences_v2;
CREATE POLICY "lns2_read"  ON legal_notice_sequences_v2 FOR SELECT TO authenticated USING (true);
CREATE POLICY "lns2_write" ON legal_notice_sequences_v2 FOR ALL TO service_role  USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
