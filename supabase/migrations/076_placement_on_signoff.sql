-- Migration 076: Auto-create ad_placements on digital ad_project sign-off (Phase 5)
--
-- When an ad_project for a digital sale transitions to status='signed_off',
-- the trigger inserts an ad_placements row so the ad goes live on the site.
-- Print projects fall out of the function with no action — they continue
-- to follow the existing flatplan placement flow.
--
-- Edge cases handled:
--   * Sale not digital (no digital_product_id) → no-op
--   * Digital product has no zone_id wired → no-op + WARNING (operator must
--     pick a zone in MySites before placements can serve)
--   * Flight dates missing on sale → no-op + WARNING (would fail ad_placements
--     NOT NULL constraint on start_date/end_date)
--   * No proof yet → placement still created with NULL creative_url; operator
--     attaches creative later in MySites Dashboard
--   * Re-trigger on subsequent updates: only fires when status moves INTO
--     signed_off (old != signed_off). UPSERT on (ad_project_id) keeps it
--     idempotent if a project is un-signed and re-signed.

create or replace function create_placement_on_digital_approval()
returns trigger
language plpgsql
security definer
as $$
declare
  sale_row  sales%rowtype;
  product_row digital_ad_products%rowtype;
  latest_proof_url text;
begin
  -- Only act on a transition INTO signed_off.
  if new.status is distinct from 'signed_off' then return new; end if;
  if old.status = 'signed_off' then return new; end if;

  select * into sale_row from sales where id = new.sale_id;
  if not found then return new; end if;

  -- Print sales: nothing to do — flatplan placement is the print equivalent.
  if sale_row.digital_product_id is null then return new; end if;

  -- Required: the sale's flight window.
  if sale_row.flight_start_date is null or sale_row.flight_end_date is null then
    raise warning 'Skipping ad_placement: sale % missing flight_start/end_date', sale_row.id;
    return new;
  end if;

  select * into product_row from digital_ad_products where id = sale_row.digital_product_id;
  if not found then
    raise warning 'Skipping ad_placement: digital_product % not found for sale %', sale_row.digital_product_id, sale_row.id;
    return new;
  end if;

  if product_row.zone_id is null then
    raise warning 'Skipping ad_placement: product % has no zone_id wired (set zone in MySites before sign-off)', product_row.id;
    return new;
  end if;

  -- Latest proof URL is the ad's creative. NULL is acceptable — operator
  -- can paste a URL in MySites if no proof was uploaded.
  select proof_url into latest_proof_url
  from ad_proofs where project_id = new.id order by version desc nulls last limit 1;

  insert into ad_placements (
    ad_zone_id, ad_project_id, sale_id, client_id,
    creative_url, click_url, alt_text,
    start_date, end_date, is_active,
    activated_at
  ) values (
    product_row.zone_id, new.id, new.sale_id, new.client_id,
    latest_proof_url, new.click_url, new.alt_text,
    sale_row.flight_start_date, sale_row.flight_end_date, true,
    now()
  )
  on conflict (ad_project_id)
  do update set
    creative_url = excluded.creative_url,
    click_url = excluded.click_url,
    alt_text = excluded.alt_text,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    is_active = true,
    deactivated_at = null,
    deactivated_by = null,
    activated_at = now();

  return new;
end;
$$;

-- ad_project_id index is non-unique by default; enforce one placement per
-- project so ON CONFLICT works cleanly. Existing data: zero rows in
-- ad_placements (table created in mig 070, no signoffs yet), so this is
-- safe.
create unique index if not exists idx_ad_placements_project_unique
  on ad_placements(ad_project_id) where ad_project_id is not null;

drop trigger if exists tr_ad_project_signoff_creates_placement on ad_projects;
create trigger tr_ad_project_signoff_creates_placement
  after update on ad_projects
  for each row
  execute function create_placement_on_digital_approval();
