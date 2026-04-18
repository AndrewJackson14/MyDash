-- Per-contact "Relationship Notes" distinct from the general account-level
-- notes stored on clients.notes. Each contact gets their own free-text
-- field on the ClientProfile page so reps can capture contact-specific
-- intel (preferred channel, family details, best time to call, etc.)
-- without polluting the general account notes.
alter table public.client_contacts
  add column if not exists notes text;

comment on column public.client_contacts.notes is
  'Per-contact relationship notes, scoped to this individual contact. The general account-level notes still live on clients.notes.';
