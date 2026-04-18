-- Add the freelancer rate / availability columns the UI references.
-- The teamSelect query in useAppData.jsx had asked for these for a long
-- time but they had never been added — the SELECT 400'd silently and the
-- whole roster blanked. They were stripped from the query as a stopgap;
-- this migration restores the schema so the UI can wire them back in.
--
-- Storage notes:
--  * rate_type stores a string like per_article / per_shoot / per_route /
--    per_hour / per_project / per_piece / flat. The UI presents
--    specialty-appropriate labels (writer sees "Per Article", photographer
--    sees "Per Shoot", delivery sees "Per Route") but the persisted
--    string is shared across specialties so reporting can group cleanly.
--  * rate_amount is the dollar value paid per the rate_type unit.
--  * availability is one of available | busy | unavailable.
-- All three are nullable — they only matter when is_freelance = true.

alter table public.team_members
  add column if not exists rate_type    text,
  add column if not exists rate_amount  numeric(10, 2),
  add column if not exists availability text;

comment on column public.team_members.rate_type is
  'Freelancer billing unit (per_article, per_shoot, per_route, per_hour, per_project, per_piece, flat). UI labels vary by specialty. NULL for non-freelancers.';
comment on column public.team_members.rate_amount is
  'Freelancer rate value in dollars per rate_type unit. NULL for non-freelancers.';
comment on column public.team_members.availability is
  'Freelancer availability (available, busy, unavailable). NULL for non-freelancers.';
