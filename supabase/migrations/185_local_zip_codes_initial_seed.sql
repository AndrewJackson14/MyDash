-- ============================================================
-- 185_local_zip_codes_initial_seed.sql
--
-- Seeds local_zip_codes for 6 pubs with strong subscriber-zip
-- signal. Triggers the 10% local-zip discount in
-- calculate_proposal_totals_for_self_serve when a customer's
-- billing zip matches their pub's local list. Until this seed,
-- the table was empty and the discount never fired.
--
-- Methodology: aggregated subscribers.zip (5-digit truncated) per
-- pub, took zips with subscriber count ≥ ~10% of the pub's top zip.
-- Audit ran 2026-05-01 against subscribers table.
--
-- Six pubs (Malibu Magazine, What To Do Malibu, Morro Bay Life,
-- Santa Ynez Valley Star, Calabasas Style, California Mid-State Fair)
-- have no subscriber-zip data and are deliberately excluded — they
-- need publisher input. Discount won't fire for those pubs until
-- they're seeded; same as today.
--
-- Idempotent via ON CONFLICT (site_id, zip_code) DO NOTHING — but
-- there's no unique index yet, so add one before INSERT to make
-- the no-op behavior real on re-runs.
-- ============================================================

BEGIN;

-- Unique index so re-applying is a no-op and so the publisher UI
-- (when it ships) can use upsert cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS local_zip_codes_site_zip_uniq
  ON local_zip_codes (site_id, zip_code);

INSERT INTO local_zip_codes (site_id, zip_code, label) VALUES
  -- Atascadero News (top zip 93422 with 998 subs)
  ('pub-atascadero-news',      '93422', 'Atascadero'),
  ('pub-atascadero-news',      '93423', 'Atascadero PO'),
  ('pub-atascadero-news',      '93465', 'Templeton'),

  -- Paso Robles Press (top zip 93446 with 686 subs)
  ('pub-paso-robles-press',    '93446', 'Paso Robles'),
  ('pub-paso-robles-press',    '93465', 'Templeton'),
  ('pub-paso-robles-press',    '93447', 'Paso Robles East'),

  -- Malibu Times (top zip 90265 with 38 subs)
  ('pub-the-malibu-times',     '90265', 'Malibu'),

  -- Paso Robles Magazine (top zip 93446 with 30 subs)
  ('pub-paso-robles-magazine', '93446', 'Paso Robles'),
  ('pub-paso-robles-magazine', '93447', 'Paso Robles East'),
  ('pub-paso-robles-magazine', '93422', 'Atascadero'),

  -- Atascadero News Magazine (low signal — 7 subs in 93422)
  ('pub-atascadero-news-maga', '93422', 'Atascadero'),

  -- Central Coast Living (low signal — 6 subs in 93401, 5 in 93420)
  ('pub-central-coast-living', '93401', 'San Luis Obispo'),
  ('pub-central-coast-living', '93420', 'Arroyo Grande')
ON CONFLICT (site_id, zip_code) DO NOTHING;

COMMIT;
