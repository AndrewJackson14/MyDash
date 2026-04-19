-- Migration 079: Tighten ad_placements read RLS (audit WS-2)
--
-- The original policy from migration 070 was `for select using (true)` —
-- which allowed any authenticated user (and any anon caller) to read every
-- placement, including paused/expired ones, competitor creative URLs, and
-- the full flight schedule.
--
-- New shape:
--   * anon (StellarPress serving ads on the public web): can see only rows
--     where is_active = true. Deactivated/expired placements no longer leak.
--   * authenticated (MyDash users): can see everything. The UI already
--     scopes by site.publication_id; this just makes the policy explicit
--     instead of "anyone reading anything for any reason."
--
-- A future migration can tighten the authenticated branch further once a
-- per-rep jurisdiction model lands for ad_placements (the same pattern the
-- jurisdiction hook uses for sales/clients).

drop policy if exists "ad_placements_read" on ad_placements;

create policy "ad_placements_read_anon"
  on ad_placements for select
  to anon
  using (is_active = true);

create policy "ad_placements_read_authed"
  on ad_placements for select
  to authenticated
  using (true);
