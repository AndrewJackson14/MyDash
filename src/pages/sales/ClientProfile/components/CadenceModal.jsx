import { useState } from "react";
import { Z, COND, FS } from "../../../../lib/theme";
import { Btn, Modal, Sel } from "../../../../components/ui";
import { supabase } from "../../../../lib/supabase";

// CadenceModal — edit a delivery_report_schedules row. Used from the
// Reports tab. If the schedule has no id (a sale that somehow lost its
// schedule), inserts on save instead of updating.
export default function CadenceModal({ schedule, contacts, onClose, onSaved }) {
  const [cadence, setCadence] = useState(schedule.cadence || "monthly");
  const [contactId, setContactId] = useState(schedule.contact_id || "");
  const [isActive, setIsActive] = useState(schedule.is_active !== false);
  const [saving, setSaving] = useState(false);

  // next_run_at recompute on cadence change. Mirrors the convert RPC math.
  const nextRunForCadence = (c) => {
    const base = new Date();
    if (c === "weekly") base.setUTCDate(base.getUTCDate() + 7);
    else if (c === "monthly") base.setUTCMonth(base.getUTCMonth() + 1);
    else if (c === "annual") base.setUTCFullYear(base.getUTCFullYear() + 1);
    else if (c === "end_of_flight") return null;
    return base.toISOString();
  };

  const save = async () => {
    setSaving(true);
    const next_run_at = nextRunForCadence(cadence);
    const updates = {
      cadence,
      contact_id: contactId || null,
      is_active: isActive,
      ...(next_run_at ? { next_run_at } : {}),
      updated_at: new Date().toISOString(),
    };
    if (schedule.id) {
      const { data } = await supabase.from("delivery_report_schedules").update(updates).eq("id", schedule.id).select().single();
      onSaved(data || { ...schedule, ...updates });
    } else {
      const { data } = await supabase.from("delivery_report_schedules").insert({
        sale_id: schedule.sale_id, ...updates,
        next_run_at: next_run_at || new Date().toISOString(),
      }).select().single();
      if (data) onSaved(data);
      else onClose();
    }
    setSaving(false);
  };

  return (
    <Modal open={true} onClose={onClose} title={`Delivery Cadence — ${schedule._saleLabel || "Campaign"}`} width={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ fontSize: FS.xs, fontWeight: 700, color: Z.td, textTransform: "uppercase", display: "block", marginBottom: 6, fontFamily: COND }}>Frequency</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[["weekly", "Weekly"], ["monthly", "Monthly"], ["end_of_flight", "End of flight only"], ["annual", "Annual"]].map(([v, l]) => (
              <button key={v} onClick={() => setCadence(v)} style={{ padding: "5px 12px", borderRadius: 4, border: `1px solid ${cadence === v ? Z.go : Z.bd}`, background: cadence === v ? Z.go + "20" : "transparent", cursor: "pointer", fontSize: FS.base, fontWeight: cadence === v ? 700 : 600, color: cadence === v ? Z.go : Z.tm, fontFamily: COND }}>{l}</button>
            ))}
          </div>
        </div>
        <Sel label="Send To" value={contactId} onChange={e => setContactId(e.target.value)} options={[{ value: "", label: "— Profile only (no email) —" }, ...contacts.map(c => ({ value: c.id || c.email, label: `${c.name} <${c.email}>` }))]} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: FS.base, color: Z.tx }}>
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
          Active (uncheck to pause report generation)
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
