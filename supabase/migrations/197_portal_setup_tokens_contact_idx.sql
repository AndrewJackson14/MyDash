-- 197_portal_setup_tokens_contact_idx.sql
-- Mig 194 added portal_setup_tokens with three FKs (client_id,
-- contact_id, proposal_id) and indexes for two of them. The
-- contact_id FK has ON DELETE SET NULL, so deleting a client_contacts
-- row triggers a seq scan to find dependent tokens without this
-- index. Performance advisor flagged it post-deploy.
CREATE INDEX IF NOT EXISTS idx_portal_setup_tokens_contact_id
  ON public.portal_setup_tokens(contact_id)
  WHERE contact_id IS NOT NULL;
