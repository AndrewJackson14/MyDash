-- 135_jen_p0.sql
--
-- Jen (Ad Designer) P0 — four blockers from the production walkthrough.
-- See Production/JEN_AD_DESIGNER_BUILD_SPEC.md for the full punch list.
--
-- This single migration captures the schema deltas applied across
-- 2026-04-25 for P0.1 / P0.3 / P0.4 (P0.2 is pure code + edge function).

-- ── P0.1: backfill module_permissions for existing Ad Designers ──
UPDATE team_members
SET module_permissions = ARRAY['dashboard','calendar','adprojects','medialibrary','creative_jobs','stories','flatplan','performance']
WHERE role = 'Ad Designer';

-- ── P0.2: ad_proofs send tracking ────────────────────────────
ALTER TABLE ad_proofs
  ADD COLUMN IF NOT EXISTS sent_to_client_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_client_by uuid REFERENCES team_members(id);

-- ── P0.3: revision charge billing flags ──────────────────────
ALTER TABLE ad_projects
  ADD COLUMN IF NOT EXISTS revision_charges_billed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revision_charges_billed_at timestamptz,
  ADD COLUMN IF NOT EXISTS asset_request_sent_at timestamptz;

-- Treat existing signed-off projects with charges as already billed
-- to prevent retroactive double-billing on the next press-send for
-- any historical issue. P2.24 surfaces these for Cami to chase
-- manually if she wants to retroactively bill.
UPDATE ad_projects
SET revision_charges_billed = true
WHERE status = 'signed_off' AND revision_charges > 0 AND NOT revision_charges_billed;

-- ── P0.4: public client-upload notification policy ───────────
-- The /upload/{token} page is unauthenticated; when a client drops
-- files we want to ping the designer via team_notes. Allow that
-- one specific anon insert shape.
DROP POLICY IF EXISTS "team_notes_public_client_upload" ON team_notes;
CREATE POLICY "team_notes_public_client_upload"
  ON team_notes FOR INSERT TO anon, authenticated
  WITH CHECK (
    from_user IS NULL
    AND to_user IS NOT NULL
    AND context_type = 'ad_project'
  );
