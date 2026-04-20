-- Migration 083: legal_notices.attachments for FBN form upload
--
-- StellarPress's Submit FBN form lets the user attach an image or PDF of
-- the notarized form (sometimes 2 pages). Persist the resulting CDN URLs
-- on the notice row so the legal-notices admin can pull them up alongside
-- the typed body when reviewing.

alter table legal_notices
  add column if not exists attachments text[] not null default '{}'::text[];
