-- ============================================================
-- Ad Inquiries — Inbound advertiser leads from StellarPress
-- ============================================================

-- Inquiry status enum
create type inquiry_status as enum ('new', 'contacted', 'converted', 'dismissed');

-- Match confidence enum
create type match_confidence as enum ('exact', 'probable', 'none');

-- ============================================================
-- AD INQUIRIES TABLE
-- ============================================================
create table ad_inquiries (
  id            uuid primary key default extensions.uuid_generate_v4(),
  site_id       uuid,  -- sites is a view, no FK constraint
  client_id     uuid references clients(id) on delete set null,
  match_confidence match_confidence default 'none',
  match_reason  text default '',
  confirmed     boolean default false,
  status        inquiry_status default 'new',

  -- Contact info
  name          text not null,
  email         text not null,
  phone         text default '',
  business_name text default '',
  website       text default '',

  -- Interest details
  ad_types      text[] default '{}',
  preferred_zones text[] default '{}',
  budget_range  text default '',
  desired_start date,
  message       text default '',
  how_heard     text default '',

  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- RLS — Allow anon inserts from StellarPress, restrict reads
-- ============================================================
alter table ad_inquiries enable row level security;

-- Anon users can insert (StellarPress frontend)
create policy "anon_insert_ad_inquiries"
  on ad_inquiries for insert
  to anon
  with check (true);

-- Authenticated team members can read all
create policy "team_read_ad_inquiries"
  on ad_inquiries for select
  to authenticated
  using (true);

-- Authenticated team members can update (status, confirmed, client_id)
create policy "team_update_ad_inquiries"
  on ad_inquiries for update
  to authenticated
  using (true);

-- ============================================================
-- REALTIME — Push inquiry updates to MyDash
-- ============================================================
alter publication supabase_realtime add table ad_inquiries;

-- ============================================================
-- TRIGGER — Auto-match to existing clients & create notifications
-- ============================================================
create or replace function handle_ad_inquiry_insert()
returns trigger as $$
declare
  matched_client_id uuid;
  matched_confidence match_confidence;
  matched_reason text;
  notify_user_id uuid;
  inquiry_domain text;
  contact_row record;
  client_row record;
  team_row record;
  site_name text;
begin
  matched_client_id := null;
  matched_confidence := 'none';
  matched_reason := '';

  -- Get the site name for notification text
  select name into site_name from sites where id = new.site_id;

  -- Extract email domain from inquiry
  inquiry_domain := split_part(new.email, '@', 2);

  -- 1) Exact email match on client_contacts
  select cc.client_id into matched_client_id
    from client_contacts cc
    where lower(cc.email) = lower(new.email)
    limit 1;

  if matched_client_id is not null then
    matched_confidence := 'exact';
    matched_reason := 'email';
  end if;

  -- 2) If no exact email, try exact name match on clients
  if matched_client_id is null then
    select c.id into matched_client_id
      from clients c
      where lower(c.name) = lower(new.business_name)
         or lower(c.name) = lower(new.name)
      limit 1;

    if matched_client_id is not null then
      matched_confidence := 'exact';
      matched_reason := 'name';
    end if;
  end if;

  -- 3) If no exact match, try phone match
  if matched_client_id is null and new.phone <> '' then
    select cc.client_id into matched_client_id
      from client_contacts cc
      where cc.phone <> '' and cc.phone = new.phone
      limit 1;

    if matched_client_id is not null then
      matched_confidence := 'probable';
      matched_reason := 'phone';
    end if;
  end if;

  -- 4) If still no match, try email domain match
  if matched_client_id is null and inquiry_domain <> '' and inquiry_domain not in (
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'protonmail.com', 'me.com', 'live.com', 'msn.com'
  ) then
    select cc.client_id into matched_client_id
      from client_contacts cc
      where split_part(cc.email, '@', 2) = inquiry_domain
      limit 1;

    if matched_client_id is not null then
      matched_confidence := 'probable';
      matched_reason := 'email_domain';
    end if;
  end if;

  -- Update the inquiry row with match results
  new.client_id := matched_client_id;
  new.match_confidence := matched_confidence;
  new.match_reason := matched_reason;

  -- Create notifications
  if matched_client_id is not null then
    -- Notify the assigned rep for this client
    select rep_id into notify_user_id
      from clients where id = matched_client_id;

    if notify_user_id is not null then
      insert into notifications (user_id, type, title, detail, link)
      values (
        notify_user_id,
        'ad_inquiry',
        'Ad inquiry from ' || new.name,
        coalesce(site_name, 'Website') || ' — ' || new.business_name || ' (' || matched_confidence::text || ' match: ' || matched_reason || ')',
        '/sales?tab=inquiries&id=' || new.id
      );
    end if;
  else
    -- No match: notify all Publishers and Admins
    for team_row in
      select id from team_members
      where is_active = true
        and (role in ('Publisher') or 'admin' = any(permissions))
    loop
      insert into notifications (user_id, type, title, detail, link)
      values (
        team_row.id,
        'ad_inquiry',
        'New advertiser inquiry from ' || new.name,
        coalesce(site_name, 'Website') || ' — ' || new.business_name || ' — ' || coalesce(new.budget_range, 'No budget specified'),
        '/sales?tab=inquiries&id=' || new.id
      );
    end loop;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_ad_inquiry_insert
  before insert on ad_inquiries
  for each row
  execute function handle_ad_inquiry_insert();
