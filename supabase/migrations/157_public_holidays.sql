-- May Sim P0.3 — Holiday-aware deadline shifts
--
-- The system treats every Monday as a normal Monday. Memorial Day
-- (Mon 5/25) silently surprises Camille because the 5/28 PRP/AN
-- editorial deadline gets compressed from a normal Mon→Tue→Wed→Thu
-- ladder into a Fri-only crunch. R1 in the May risk register: 70%
-- probability the 5/28 issue ships late if this gap stays open.
--
-- Lookup table for civic holidays. Empty observed_by_pubs[] means
-- every publication observes the holiday; populated array overrides
-- to a subset (e.g. trade publications that don't observe a regional
-- holiday). Renderers compute shifted-deadline at display time;
-- nothing mutates the underlying issue.ed_deadline / ad_deadline.

CREATE TABLE IF NOT EXISTS public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  label text NOT NULL,
  observed_by_pubs uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_holidays_date ON public_holidays(holiday_date);

ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_holidays_read ON public_holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY public_holidays_admin ON public_holidays FOR ALL TO authenticated
  USING (has_permission('admin')) WITH CHECK (has_permission('admin'));

-- Seed: US federal holidays 2026-2027. Observed dates (when the
-- holiday lands on a weekend) are what the team actually skips, so
-- 7/3/2026 (observed) replaces 7/4/2026 (Saturday). Source: OPM
-- federal holiday schedule.
INSERT INTO public_holidays (holiday_date, label) VALUES
  ('2026-01-01', 'New Year''s Day'),
  ('2026-01-19', 'Martin Luther King Jr. Day'),
  ('2026-02-16', 'Presidents'' Day'),
  ('2026-05-25', 'Memorial Day'),
  ('2026-06-19', 'Juneteenth'),
  ('2026-07-03', 'Independence Day (observed)'),
  ('2026-09-07', 'Labor Day'),
  ('2026-10-12', 'Columbus Day'),
  ('2026-11-11', 'Veterans Day'),
  ('2026-11-26', 'Thanksgiving'),
  ('2026-12-25', 'Christmas Day'),
  ('2027-01-01', 'New Year''s Day'),
  ('2027-01-18', 'Martin Luther King Jr. Day'),
  ('2027-02-15', 'Presidents'' Day'),
  ('2027-05-31', 'Memorial Day'),
  ('2027-06-18', 'Juneteenth (observed)'),
  ('2027-07-05', 'Independence Day (observed)'),
  ('2027-09-06', 'Labor Day'),
  ('2027-10-11', 'Columbus Day'),
  ('2027-11-11', 'Veterans Day'),
  ('2027-11-25', 'Thanksgiving'),
  ('2027-12-24', 'Christmas Day (observed)')
ON CONFLICT DO NOTHING;
