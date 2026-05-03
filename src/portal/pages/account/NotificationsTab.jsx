// Notifications tab — checkbox grid persisted via
// update_notification_preferences RPC. Spec §5.9.
//
// v1 only stores preferences. Actual notification dispatch on event
// triggers is v2 (notify-portal-event Edge Function in spec §4.2).
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { usePortal } from "../../lib/portalContext";
import { C, sx } from "../../lib/portalUi";

const PREF_FIELDS = [
  { key: "proposal_status",       label: "Proposal status updates",
    detail: "When a proposal is sent, signed, declined, or converted." },
  { key: "invoice_posted",        label: "Invoices posted",
    detail: "When a new invoice is issued or paid." },
  { key: "ad_project_milestones", label: "Ad project milestones",
    detail: "Creative ready, proof requested, ad goes live." },
  { key: "marketing",             label: "13 Stars news + offers",
    detail: "Industry insights, special pricing, launches." },
];

const DEFAULT_PREFS = {
  proposal_status: true,
  invoice_posted: true,
  ad_project_milestones: true,
  marketing: false,
};

export default function NotificationsTab({ clientId }) {
  const { session } = usePortal();
  const [prefs,    setPrefs]    = useState(null);
  const [original, setOriginal] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    if (!clientId || !session?.user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase
        .from("client_contacts")
        .select("notification_preferences")
        .eq("client_id", clientId)
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (e) { setError(e.message); return; }
      const p = { ...DEFAULT_PREFS, ...(data?.notification_preferences || {}) };
      setPrefs(p);
      setOriginal(p);
    })();
    return () => { cancelled = true; };
  }, [clientId, session?.user?.id]);

  const dirty = prefs && original && PREF_FIELDS.some((f) => prefs[f.key] !== original[f.key]);

  const save = async () => {
    setError(null); setSaved(false); setSaving(true);
    const { error: e } = await supabase.rpc("update_notification_preferences", {
      p_client_id: clientId, p_preferences: prefs,
    });
    setSaving(false);
    if (e) { setError(e.message || "Couldn't save."); return; }
    setOriginal(prefs);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (error && !prefs) return <ErrCard body={error} />;
  if (!prefs)          return <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{
      background: "#fff", border: `1px solid ${C.rule}`,
      borderRadius: 8, padding: 16,
    }}>
      {error && <div style={sx.err}>{error}</div>}

      {PREF_FIELDS.map((f) => (
        <label key={f.key} style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "14px 0",
          borderTop: `1px solid ${C.rule}`,
          cursor: "pointer",
        }}>
          <input
            type="checkbox"
            checked={!!prefs[f.key]}
            onChange={(e) => setPrefs((p) => ({ ...p, [f.key]: e.target.checked }))}
            style={{ marginTop: 3, accentColor: C.ac, cursor: "pointer" }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{f.label}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{f.detail}</div>
          </div>
        </label>
      ))}

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.rule}`, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={save}
          disabled={saving || !dirty}
          style={{ ...sx.btn(saving || !dirty), width: "auto", padding: "10px 18px", fontSize: 13 }}
        >{saving ? "Saving…" : "Save changes"}</button>
        {saved && <span style={{ fontSize: 12, color: C.ok, fontWeight: 600 }}>Saved ✓</span>}
        {!dirty && !saved && <span style={{ fontSize: 12, color: C.muted }}>Up to date</span>}
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: C.cap, lineHeight: 1.5 }}>
        v1 stores your choice. Notification emails on these events ship in v2.
      </div>
    </div>
  );
}

function ErrCard({ body }) {
  return <div style={{
    padding: 16, background: "#FEF2F2",
    border: "1px solid #FECACA", borderRadius: 8,
    color: C.err, fontSize: 13,
  }}>{body}</div>;
}
