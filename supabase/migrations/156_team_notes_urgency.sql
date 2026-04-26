-- May Sim P0.4 — Urgency lane on team_notes
--
-- Today every team_note hits NotificationPopover at the same visual
-- weight, so a publisher-signoff request looks identical to a generic
-- "great work" message. The May 6 simulation surfaced a 35-minute
-- response latency on a press-deadline blocker because of this.
--
-- Three tiers:
--   normal   — default; existing behavior, auto-dismiss 8s
--   urgent   — amber border, auto-dismiss extended to 16s
--   blocking — red border, no auto-dismiss until acknowledged
--
-- Senders set urgency at compose time (or via system code paths like
-- publisher-signoff escalation). Default 'normal' keeps every existing
-- insert site working unchanged.

ALTER TABLE team_notes
  ADD COLUMN IF NOT EXISTS urgency text DEFAULT 'normal'
    CHECK (urgency IN ('normal', 'urgent', 'blocking'));

CREATE INDEX IF NOT EXISTS idx_team_notes_urgency_to
  ON team_notes(to_user, urgency, is_read)
  WHERE urgency != 'normal' AND is_read = false;
