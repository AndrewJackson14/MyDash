-- ============================================================
-- Migration 107 — gate ad_placement activation on start_date.
--
-- Before today: the create_placement_on_digital_approval trigger set
-- is_active=true the moment a designer signed off, regardless of the
-- sale's flight_start_date. An ad signed off a week early ran a week
-- early.
--
-- After: same trigger, but is_active is now (start_date <= today AND
-- end_date >= today). A new daily pg_cron job activates rows whose
-- start_date has arrived. The existing 'deactivate-expired-placements'
-- cron at 03:00 UTC keeps handling the end-of-flight side.
-- ============================================================

CREATE OR REPLACE FUNCTION create_placement_on_digital_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sale_row  sales%ROWTYPE;
  product_row digital_ad_products%ROWTYPE;
  latest_proof_url text;
  v_should_activate boolean;
BEGIN
  IF new.status IS DISTINCT FROM 'signed_off' THEN RETURN new; END IF;
  IF old.status = 'signed_off' THEN RETURN new; END IF;

  SELECT * INTO sale_row FROM sales WHERE id = new.sale_id;
  IF NOT FOUND THEN RETURN new; END IF;

  IF sale_row.digital_product_id IS NULL THEN RETURN new; END IF;

  IF sale_row.flight_start_date IS NULL OR sale_row.flight_end_date IS NULL THEN
    RAISE WARNING 'Skipping ad_placement: sale % missing flight_start/end_date', sale_row.id;
    RETURN new;
  END IF;

  SELECT * INTO product_row FROM digital_ad_products WHERE id = sale_row.digital_product_id;
  IF NOT FOUND THEN
    RAISE WARNING 'Skipping ad_placement: digital_product % not found for sale %', sale_row.digital_product_id, sale_row.id;
    RETURN new;
  END IF;

  IF product_row.zone_id IS NULL THEN
    RAISE WARNING 'Skipping ad_placement: product % has no zone_id wired (set zone in MySites before sign-off)', product_row.id;
    RETURN new;
  END IF;

  SELECT proof_url INTO latest_proof_url
    FROM ad_proofs WHERE project_id = new.id
    ORDER BY version DESC NULLS LAST LIMIT 1;

  v_should_activate := (sale_row.flight_start_date <= CURRENT_DATE
                        AND sale_row.flight_end_date >= CURRENT_DATE);

  INSERT INTO ad_placements (
    ad_zone_id, ad_project_id, sale_id, client_id,
    creative_url, click_url, alt_text,
    start_date, end_date, is_active,
    activated_at
  ) VALUES (
    product_row.zone_id, new.id, new.sale_id, new.client_id,
    latest_proof_url, new.click_url, new.alt_text,
    sale_row.flight_start_date, sale_row.flight_end_date,
    v_should_activate,
    CASE WHEN v_should_activate THEN now() ELSE NULL END
  )
  ON CONFLICT (ad_project_id)
  DO UPDATE SET
    creative_url = EXCLUDED.creative_url,
    click_url = EXCLUDED.click_url,
    alt_text = EXCLUDED.alt_text,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    is_active = v_should_activate,
    deactivated_at = NULL,
    deactivated_by = NULL,
    activated_at = CASE WHEN v_should_activate THEN now() ELSE NULL END;

  RETURN new;
END;
$$;

SELECT cron.schedule(
  'activate-due-placements',
  '15 3 * * *',
  $$
  UPDATE ad_placements
     SET is_active = true,
         activated_at = COALESCE(activated_at, now())
   WHERE is_active = false
     AND deactivated_at IS NULL
     AND start_date <= CURRENT_DATE
     AND end_date >= CURRENT_DATE;
  $$
);
