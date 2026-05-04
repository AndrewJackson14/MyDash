-- 213 — Simplify ad_projects lifecycle
--
-- Two changes per the Sales+Design audit:
--
-- 1. Rename status='signed_off' → status='ready_for_press'. Plain
--    English for ops: the ad is now eligible to enter print/digital
--    placement. Trigger 076 (auto-create ad_placements on digital
--    sign-off) is rebound to the new value in the same migration —
--    without this, digital ads would never auto-publish on the
--    salesperson's confirmation click.
--
-- 2. Drop status='approved' from active flow. The "designer signed
--    off" stage is gone — only client-confirmation by the salesperson
--    moves a project from proof_sent → ready_for_press. Existing rows
--    sitting at 'approved' get migrated to 'proof_sent' so the
--    salesperson can complete the new confirmation step. (Their
--    existing designer_signoff_at timestamp is preserved on the row;
--    nothing is lost, just re-presented.)
--
-- No CHECK constraint exists on ad_projects.status (verified against
-- the migration history), so this is a pure data + trigger update —
-- no schema change required.

UPDATE ad_projects SET status = 'ready_for_press' WHERE status = 'signed_off';
UPDATE ad_projects SET status = 'proof_sent' WHERE status = 'approved';

-- Replace mig 076's trigger function. Same logic; just listens for the
-- new status value. ON CONFLICT clause keeps re-fires idempotent.
create or replace function create_placement_on_digital_approval()
returns trigger
language plpgsql
security definer
as $$
declare
  sale_row    sales%rowtype;
  product_row digital_ad_products%rowtype;
  latest_proof_url text;
begin
  if new.status is distinct from 'ready_for_press' then return new; end if;
  if old.status = 'ready_for_press' then return new; end if;

  select * into sale_row from sales where id = new.sale_id;
  if not found then return new; end if;

  -- Print sales: nothing to do — flatplan placement is the print equivalent.
  if sale_row.digital_product_id is null then return new; end if;

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
    creative_url   = excluded.creative_url,
    click_url      = excluded.click_url,
    alt_text       = excluded.alt_text,
    start_date     = excluded.start_date,
    end_date       = excluded.end_date,
    is_active      = true,
    deactivated_at = null,
    deactivated_by = null,
    activated_at   = now();

  return new;
end;
$$;

-- Trigger binding is unchanged — the function name is the same,
-- so the existing tr_ad_project_signoff_creates_placement trigger
-- picks up the rebound function automatically. (Drop+recreate kept
-- here for safety in case the trigger was dropped manually.)
drop trigger if exists tr_ad_project_signoff_creates_placement on ad_projects;
create trigger tr_ad_project_signoff_creates_placement
  after update on ad_projects
  for each row
  execute function create_placement_on_digital_approval();
