-- ============================================================
-- 159 — May 2026 Paso Robles Magazine editorial run list
--
-- Imports the editorial lineup from the printed run sheet
-- (Editorial Run List-Paso Robles Magazine.csv, May 1, 2026)
-- into `stories`, scoped to the existing PRM May issue.
--
-- Cross-pub items (also running in Atascadero News Magazine
-- on the same date) link to the ANM May issue via
-- also_in_issue_ids — the link-not-clone pattern from
-- migration 090, so edits propagate and we don't double-count.
--
-- Idempotent: per-row NOT EXISTS guard on (title, print_issue_id),
-- so re-running the migration is a no-op once seeded.
-- ============================================================

DO $$
DECLARE
  v_prm text;
  v_anm text;
  r record;
BEGIN
  SELECT id INTO v_prm
    FROM issues
   WHERE pub_id = 'pub-paso-robles-magazine' AND date = '2026-05-01'
   LIMIT 1;

  SELECT id INTO v_anm
    FROM issues
   WHERE pub_id = 'pub-atascadero-news-maga' AND date = '2026-05-01'
   LIMIT 1;

  IF v_prm IS NULL THEN
    RAISE EXCEPTION 'May 2026 PRM issue (pub-paso-robles-magazine @ 2026-05-01) not found in issues table';
  END IF;

  IF v_anm IS NULL THEN
    RAISE NOTICE 'May 2026 ANM issue not found — cross-pub stories will import without sibling link';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      -- title, page, word_limit, has_images, also_anm
      ('Vets Marathon Story',                              8,  NULL::int, false, false),
      ('CONTENTS',                                         10, NULL,      false, false),
      ('PUB LETTER',                                       12, NULL,      false, false),
      ('Main Street',                                      14, 563,       true,  false),
      ('Natural Alternative',                              15, 342,       false, true),
      ('PRAHS',                                            16, 491,       true,  false),
      ('Shift N Gears',                                    17, 395,       false, true),
      ('Templeton: Templeton Library 1st Saturday Sale',   18, 501,       false, false),
      ('Celebrating Moms',                                 20, 463,       true,  true),
      ('Best of the West',                                 22, 877,       true,  true),
      ('Golden State Car Show',                            24, 687,       true,  true),
      ('Memorial Day',                                     26, 864,       true,  true),
      ('Spotlight: First Call Plumbing',                   28, 269,       true,  true),
      ('Paso Chamber',                                     29, 400,       false, false),
      ('Firefly Goodbye',                                  30, 781,       true,  false),
      ('Specs By Kyla Moves',                              32, 880,       true,  true),
      ('SLOCO',                                            34, 535,       false, true),
      ('Behind the Badge',                                 36, 565,       true,  false),
      ('County-Clerk Forum',                               38, 1162,      true,  true),
      ('Farm Bureau Women',                                40, 528,       true,  true),
      ('PRWCA',                                            42, 474,       true,  false),
      ('Farm Stand',                                       43, 804,       false, false),
      ('''Hop To It'' (Story & Photos) Story Format **',   44, 915,       true,  false),
      ('Event: Cop Marathon',                              46, 209,       false, false),
      ('May Calendar',                                     47, NULL,      false, true),
      ('Worship Directory',                                48, NULL,      false, false),
      ('Last Word: ECHO Empty Bowls',                      50, 654,       true,  true),
      ('Back Cover',                                       52, NULL,      false, false)
    ) AS t(title, page, word_limit, has_images, also_anm)
  LOOP
    INSERT INTO stories (
      title, author, author_name, status,
      publication_id, site_id,
      print_issue_id, issue_id,
      page, category,
      word_limit, has_images,
      also_in_issue_ids,
      web_status, print_status,
      priority
    )
    SELECT
      r.title,
      '13 Stars Manager', '13 Stars Manager', 'Ready',
      'pub-paso-robles-magazine', 'pub-paso-robles-magazine',
      v_prm, v_prm,
      r.page, 'News',
      r.word_limit, r.has_images,
      CASE WHEN r.also_anm AND v_anm IS NOT NULL
           THEN ARRAY[v_anm]
           ELSE '{}'::text[] END,
      'none', 'none',
      'normal'
    WHERE NOT EXISTS (
      SELECT 1 FROM stories s
       WHERE s.title = r.title
         AND s.print_issue_id = v_prm
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
