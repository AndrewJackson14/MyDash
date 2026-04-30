// QuickLogModal — modal shell + form switch for the QuickLogButton.
// Two role-aware forms: SalesCallForm and OfficeAdminForm. Generic
// fallback for other roles.

import { useState } from "react";
import { Z, COND, FS, FW, R, Ri } from "../../lib/theme";
import { supabase, isOnline } from "../../lib/supabase";
import { useAppData } from "../../hooks/useAppData";
import SalesCallForm from "./SalesCallForm";
import OfficeAdminForm from "./OfficeAdminForm";

export default function QuickLogModal({ kind, currentUser, onClose }) {
  const appData = useAppData();
  const clients = appData.clients || [];
  const team = appData.team || [];

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (payload) => {
    if (!isOnline()) { setError("Offline — can't log right now."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("log_activity", payload);
      if (rpcErr) throw new Error(rpcErr.message);
      onClose();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(20, 18, 14, 0.45)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{
        background: Z.sa,
        border: `1px solid ${Z.bd}`,
        borderRadius: R,
        width: "100%",
        maxWidth: 460,
        padding: 20,
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{
            fontSize: 18, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND,
          }}>
            {kind === "sales_call" ? "Log call" : kind === "office_admin" ? "Log task / help" : "Log note"}
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: Z.tm, fontSize: FS.sm, fontWeight: FW.bold, fontFamily: COND,
          }}>Close</button>
        </div>

        {kind === "sales_call" && (
          <SalesCallForm clients={clients} onSubmit={submit} submitting={submitting} />
        )}
        {kind === "office_admin" && (
          <OfficeAdminForm clients={clients} team={team} onSubmit={submit} submitting={submitting} />
        )}
        {kind === "comment" && (
          <CommentForm onSubmit={submit} submitting={submitting} />
        )}

        {error && (
          <div style={{
            padding: "8px 10px", borderRadius: Ri,
            background: Z.da + "18", color: Z.da, fontSize: FS.xs, fontFamily: COND,
          }}>{error}</div>
        )}
      </div>
    </div>
  );
}

// ── Generic comment form for non-sales / non-admin roles ──
function CommentForm({ onSubmit, submitting }) {
  const [text, setText] = useState("");
  const handle = () => {
    if (!text.trim()) return;
    onSubmit({
      p_event_type: "comment",
      p_summary: text.trim(),
      p_event_category: "comment",
      p_event_source: "manual",
      p_visibility: "team",
    });
  };
  return (
    <>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        autoFocus
        rows={3}
        placeholder="What's worth noting?"
        style={inputStyle}
      />
      <SubmitRow onClick={handle} disabled={!text.trim() || submitting}>
        {submitting ? "Logging…" : "Log note"}
      </SubmitRow>
    </>
  );
}

export function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{
        fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td,
        textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND,
      }}>{label}</label>
      {children}
    </div>
  );
}

export function SubmitRow({ children, ...rest }) {
  return (
    <button
      {...rest}
      style={{
        marginTop: 4,
        padding: "12px",
        background: rest.disabled ? Z.bd : Z.ac,
        color: rest.disabled ? Z.tm : Z.bg,
        border: "none",
        borderRadius: Ri,
        fontSize: FS.sm, fontWeight: FW.bold,
        fontFamily: COND,
        cursor: rest.disabled ? "default" : "pointer",
      }}
    >{children}</button>
  );
}

export const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "10px 12px",
  background: Z.bg,
  border: `1px solid ${Z.bd}`,
  borderRadius: Ri,
  fontSize: FS.sm, color: Z.tx,
  fontFamily: "inherit",
  outline: "none",
};
