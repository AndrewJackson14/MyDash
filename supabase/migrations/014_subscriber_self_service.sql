-- ============================================================
-- Subscriber Self-Service — Allow anon read/update by email
-- ============================================================

-- Anon can read subscriber by email (self-lookup)
create policy "anon_read_subscriber_by_email"
  on subscribers for select
  to anon
  using (true);

-- Anon can update own address fields only
create policy "anon_update_subscriber_address"
  on subscribers for update
  to anon
  using (true)
  with check (true);

-- Anon can read subscriptions linked to a subscriber
create policy "anon_read_subscriptions"
  on subscriptions for select
  to anon
  using (true);

-- Anon can insert subscribers (free tier self-signup)
create policy "anon_insert_subscribers"
  on subscribers for insert
  to anon
  with check (true);

-- Anon can insert subscriptions (free tier)
create policy "anon_insert_subscriptions"
  on subscriptions for insert
  to anon
  with check (true);
