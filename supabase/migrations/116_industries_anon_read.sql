-- Anon needs to read industries (id + name only) to populate the
-- industry dropdown in the self-serve "New Details" step. Markup % is
-- not exposed via this policy — it's only consumed server-side by
-- calculate_booking_totals.
DROP POLICY IF EXISTS industries_anon_read ON industries;
CREATE POLICY industries_anon_read ON industries FOR SELECT TO anon USING (true);
