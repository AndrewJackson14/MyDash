-- ============================================================
-- Subscriber Notification — Alert Office Admin on new signups
-- ============================================================

create or replace function handle_subscriber_insert()
returns trigger as $$
declare
  team_row record;
  sub_name text;
begin
  sub_name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  if sub_name = '' then sub_name := coalesce(new.email, 'Unknown'); end if;

  -- Notify Office Manager, Office Administrator, and Publisher roles
  for team_row in
    select id from team_members
    where is_active = true
      and (role in ('Office Manager', 'Office Administrator', 'Publisher') or 'admin' = any(permissions))
  loop
    insert into notifications (user_id, type, title, detail, link)
    values (
      team_row.id,
      'new_subscriber',
      'New subscriber: ' || sub_name,
      coalesce(new.type::text, 'digital') || ' — ' || coalesce(new.email, 'no email') || ' — $' || coalesce(new.amount_paid::text, '0'),
      '/circulation'
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_subscriber_insert
  after insert on subscribers
  for each row
  execute function handle_subscriber_insert();
