// ActivityTargetsAdmin — Hayley-only UI for tuning per-role targets
// without redeploying. Reads / writes activity_targets directly;
// RLS gates writes to Publisher role.
//
// The seeded targets from migration 170 land here as starting values.
// Hayley adjusts numbers, toggles active, edits notes — that's it.
// Adding new metrics or pacing-curve definitions is out of scope for
// v1 (stays in the migration).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri } from "../../lib/theme";
import { supabase, isOnline } from "../../lib/supabase";
import { usePageHeader } from "../../contexts/PageHeaderContext";

const PRETTY_LABELS = {
  phone_calls:        "Calls / day",
  emails_sent:        "Emails / day",
  meetings_held:      "Meetings / day",
  proposals_sent:     "Proposals sent / day",
  contracts_signed:   "Contracts signed / day",
  pipeline_value_added: "Pipeline added ($/day)",
  stories_edited:     "Stories edited / day",
  stories_published:  "Stories published / day",
  invoices_issued_within_24h_of_issue_close: "On-time invoicing (% / week)",
  ar_followups_completed: "A/R follow-ups / week",
  subscriptions_processed: "Subscriptions processed / week",
  queue_completion_pct: "Queue completion (curve)",
};

const ROLE_LABELS = {
  "sales-rep":        "Sales Reps",
  "ad-designer":      "Ad Designer",
  "layout-designer":  "Layout Designer",
  "content-editor":   "Content Editor",
  "office-admin":     "Office Administrator",
};

export default function ActivityTargetsAdmin({ isActive }) {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Activity Targets" }], title: "Activity Targets" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);

  const [targets, setTargets] = useState([]);
  const [drafts, setDrafts] = useState({});  // id → { target_value, active, notes }
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isOnline()) { setLoading(false); return; }
    const { data, error: e } = await supabase
      .from("activity_targets")
      .select("*")
      .order("role", { ascending: true })
      .order("metric_name", { ascending: true });
    if (e) { setError(e.message); setLoading(false); return; }
    setTargets(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const out = {};
    for (const t of targets) {
      const role = t.role;
      if (!out[role]) out[role] = [];
      out[role].push(t);
    }
    return out;
  }, [targets]);

  const draftFor = (id) => drafts[id] || {};
  const setDraft = (id, key, value) => {
    setDrafts(d => ({ ...d, [id]: { ...d[id], [key]: value } }));
  };

  const save = async (t) => {
    const draft = drafts[t.id];
    if (!draft) return;
    setSavingId(t.id);
    setError(null);
    const updates = {};
    if ("target_value" in draft) {
      updates.target_value = draft.target_value === "" ? null : Number(draft.target_value);
    }
    if ("active" in draft) updates.active = draft.active;
    if ("notes"  in draft) updates.notes  = draft.notes;
    const { error: e } = await supabase.from("activity_targets").update(updates).eq("id", t.id);
    if (e) { setError(e.message); setSavingId(null); return; }
    setTargets(prev => prev.map(x => x.id === t.id ? { ...x, ...updates } : x));
    setDrafts(d => { const n = { ...d }; delete n[t.id]; return n; });
    setSavingId(null);
  };

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>
        Activity Targets
      </div>
      <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND, maxWidth: 720 }}>
        Per-role daily / weekly goals that drive each user's "Today's Targets"
        progress card. Pacing-curve targets (designers) are configured at
        migration time — the count and dollar targets here are tunable.
      </div>

      {error && (
        <div style={{
          padding: "8px 12px", borderRadius: Ri,
          background: Z.da + "18", color: Z.da, fontSize: FS.sm,
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: Z.tm }}>Loading…</div>
      ) : (
        Object.entries(grouped).map(([role, list]) => (
          <div key={role} style={{
            background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: R, padding: 16,
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{
              fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td,
              textTransform: "uppercase", letterSpacing: 1, fontFamily: COND,
            }}>
              {ROLE_LABELS[role] || role}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {list.map(t => {
                const isCurve = t.target_type === "queue_pacing_curve";
                const draft = draftFor(t.id);
                const dirty = Object.keys(draft).length > 0;
                const valueShown = "target_value" in draft ? draft.target_value : (t.target_value ?? "");
                const activeShown = "active" in draft ? draft.active : t.active;
                const notesShown = "notes" in draft ? draft.notes : (t.notes || "");
                return (
                  <div key={t.id} style={{
                    background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: 12,
                    display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 120px 80px minmax(180px, 2fr) 100px",
                    gap: 12, alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: FS.sm, color: Z.tx, fontWeight: FW.semi, fontFamily: COND }}>
                        {PRETTY_LABELS[t.metric_name] || t.metric_name}
                      </div>
                      <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>
                        {t.target_type.replace(/_/g, " ")}
                      </div>
                    </div>
                    {isCurve ? (
                      <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>
                        curve config (migration only)
                      </div>
                    ) : (
                      <input
                        type="number"
                        value={valueShown ?? ""}
                        onChange={e => setDraft(t.id, "target_value", e.target.value)}
                        style={inputStyle}
                      />
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: FS.xs, color: Z.tm, fontFamily: COND, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={activeShown}
                        onChange={e => setDraft(t.id, "active", e.target.checked)}
                      />
                      Active
                    </label>
                    <input
                      type="text"
                      value={notesShown}
                      onChange={e => setDraft(t.id, "notes", e.target.value)}
                      placeholder="optional notes"
                      style={inputStyle}
                    />
                    <button
                      onClick={() => save(t)}
                      disabled={!dirty || savingId === t.id}
                      style={{
                        padding: "8px 12px",
                        background: dirty ? Z.ac : Z.bd,
                        color: dirty ? Z.bg : Z.tm,
                        border: "none", borderRadius: Ri,
                        fontSize: FS.xs, fontWeight: FW.bold, fontFamily: COND,
                        cursor: dirty ? "pointer" : "default",
                      }}
                    >{savingId === t.id ? "Saving…" : "Save"}</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const inputStyle = {
  padding: "8px 10px",
  background: Z.sa,
  border: `1px solid ${Z.bd}`,
  borderRadius: Ri,
  fontSize: FS.sm, color: Z.tx,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
