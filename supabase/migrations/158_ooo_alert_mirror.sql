-- May Sim P1.3 — OOO + alert mirroring
--
-- Memorial Day: Cami is OOO Sat 5/23 - Mon 5/25 with no ticket coverage.
-- Currently nothing in the system reroutes the queue. R2 in the risk
-- register: 95% probability of an SLA breach over the long weekend.
--
-- Three columns on team_members + one column on team_notes + a trigger
-- that fires the mirror automatically. No client-side site has to
-- remember the OOO check; every existing team_notes insert path is
-- covered by the trigger.

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS ooo_from date,
  ADD COLUMN IF NOT EXISTS ooo_until date,
  ADD COLUMN IF NOT EXISTS alerts_mirror_to uuid REFERENCES team_members(id) ON DELETE SET NULL;

ALTER TABLE team_notes
  ADD COLUMN IF NOT EXISTS mirrored_from uuid REFERENCES team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_ooo
  ON team_members(ooo_from, ooo_until)
  WHERE ooo_from IS NOT NULL;

-- Mirror trigger: when an incoming team_note is addressed to a member
-- who is OOO today, also insert a copy for that member's designated
-- backup. mirrored_from is set on the copy so the recipient knows it
-- arrived because someone else is out.
CREATE OR REPLACE FUNCTION mirror_ooo_team_notes() RETURNS trigger AS $$
DECLARE
  recipient team_members;
  mirror team_members;
  today_date date := CURRENT_DATE;
BEGIN
  -- Don't mirror a mirror — prevents recursion if backup is also OOO.
  IF NEW.mirrored_from IS NOT NULL OR NEW.to_user IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO recipient FROM team_members WHERE auth_id = NEW.to_user LIMIT 1;
  IF recipient.id IS NULL OR recipient.alerts_mirror_to IS NULL THEN
    RETURN NEW;
  END IF;

  IF recipient.ooo_from IS NULL OR recipient.ooo_until IS NULL THEN
    RETURN NEW;
  END IF;
  IF today_date < recipient.ooo_from OR today_date > recipient.ooo_until THEN
    RETURN NEW;
  END IF;

  SELECT * INTO mirror FROM team_members WHERE id = recipient.alerts_mirror_to LIMIT 1;
  IF mirror.id IS NULL OR mirror.auth_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO team_notes (
    from_user, to_user, message, urgency,
    context_type, context_id, context_page, mirrored_from
  ) VALUES (
    NEW.from_user, mirror.auth_id, NEW.message, COALESCE(NEW.urgency, 'normal'),
    NEW.context_type, NEW.context_id, NEW.context_page, recipient.id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS team_notes_ooo_mirror ON team_notes;
CREATE TRIGGER team_notes_ooo_mirror
  AFTER INSERT ON team_notes
  FOR EACH ROW
  EXECUTE FUNCTION mirror_ooo_team_notes();
