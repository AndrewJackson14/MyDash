-- Phase 5 follow-up: triggers the original Phase 1 schema missed.
-- Spec v1.1 §6.4 ("Update route_instance.completed_stops counter via
-- SQL trigger") and §6.7 ("driver_pay_amount auto-fills from
-- route.flat_fee on completion") — caught during the driver smoke
-- test when counters didn't move after stop_confirmations inserts.

-- ── 1. Stop counters ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_route_instance_counters() RETURNS TRIGGER AS $$
DECLARE
  target_id UUID;
BEGIN
  target_id := COALESCE(NEW.route_instance_id, OLD.route_instance_id);
  UPDATE route_instances SET
    completed_stops = (
      SELECT COUNT(*) FROM stop_confirmations
      WHERE route_instance_id = target_id
        AND status IN ('delivered', 'partial')
    ),
    skipped_stops = (
      SELECT COUNT(*) FROM stop_confirmations
      WHERE route_instance_id = target_id
        AND status = 'skipped'
    ),
    updated_at = now()
  WHERE id = target_id;
  RETURN NULL; -- AFTER trigger, no NEW rewrite
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_stop_confirmations_counters ON stop_confirmations;
CREATE TRIGGER trg_stop_confirmations_counters
AFTER INSERT OR UPDATE OR DELETE ON stop_confirmations
FOR EACH ROW EXECUTE FUNCTION sync_route_instance_counters();

-- ── 2. Auto-pay fields when status flips to 'complete' ────────────
-- Pulls flat_fee from the template. Leaves driver_pay_amount alone if
-- the caller pre-set it (allows manual overrides from UI later).
CREATE OR REPLACE FUNCTION fill_route_instance_on_complete() RETURNS TRIGGER AS $$
DECLARE
  template_fee NUMERIC(10,2);
BEGIN
  IF NEW.status = 'complete' AND (OLD.status IS NULL OR OLD.status <> 'complete') THEN
    IF NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
    IF NEW.driver_pay_amount IS NULL THEN
      SELECT flat_fee INTO template_fee FROM driver_routes WHERE id = NEW.route_template_id;
      NEW.driver_pay_amount := template_fee;
    END IF;
    IF NEW.driver_pay_status IS NULL THEN NEW.driver_pay_status := 'pending'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_route_instance_complete ON route_instances;
CREATE TRIGGER trg_route_instance_complete
BEFORE UPDATE ON route_instances
FOR EACH ROW EXECUTE FUNCTION fill_route_instance_on_complete();
