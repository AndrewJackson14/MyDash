// Team tab — list contacts, invite (with magic link via
// send-portal-setup-email), revoke. Spec §5.9.
//
// Inviter must have an "advertising" or "billing" role per the RPC's
// regex check. UI hides the action buttons when the current user
// doesn't have permission, but the RPC re-validates on the server
// regardless.
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { usePortal } from "../../lib/portalContext";
import { C, sx, isValidEmail } from "../../lib/portalUi";

const ROLE_OPTIONS = [
  { value: "advertising",          label: "Advertising" },
  { value: "billing",              label: "Billing" },
  { value: "advertising,billing",  label: "Advertising + Billing" },
  { value: "read-only",            label: "Read-only" },
];

export default function TeamTab({ clientId }) {
  const { session, accessibleClients } = usePortal();
  const [contacts, setContacts] = useState(null);
  const [error,    setError]    = useState(null);
  const [busyId,   setBusyId]   = useState(null);
  const [showInvite, setShowInvite] = useState(false);

  const myAuth = session?.user?.id;
  const myContact = (accessibleClients || []).find((c) => c.clientId === clientId);
  const canManage = !!myContact && /advertising|billing/i.test(myContact.contactRole || "");

  const reload = async () => {
    setContacts(null);
    const { data, error: e } = await supabase
      .from("client_contacts")
      .select("id, name, email, role, title, is_primary, auth_user_id, portal_revoked_at, created_at")
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (e) { setError(e.message); setContacts([]); return; }
    setContacts(data || []);
  };

  useEffect(() => { if (clientId) reload(); }, [clientId]);

  const handleRevoke = async (contactId) => {
    if (!confirm("Revoke portal access for this contact? They'll keep their data but can't sign in.")) return;
    setBusyId(contactId);
    const { error: e } = await supabase.rpc("revoke_client_contact", { p_contact_id: contactId });
    setBusyId(null);
    if (e) { alert(e.message || "Couldn't revoke."); return; }
    reload();
  };

  if (error)    return <ErrCard body={error} />;
  if (!contacts) return <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.muted }}>
          {contacts.length} contact{contacts.length === 1 ? "" : "s"}
        </div>
        {canManage && (
          <button onClick={() => setShowInvite(true)} style={{
            ...sx.btn(false), width: "auto", padding: "8px 14px", fontSize: 13,
          }}>+ Invite contact</button>
        )}
      </div>

      <div style={{
        background: "#fff", border: `1px solid ${C.rule}`,
        borderRadius: 8, overflow: "hidden",
      }}>
        {contacts.map((c, i) => (
          <ContactRow
            key={c.id} c={c}
            isFirst={i === 0}
            isMe={!!myAuth && c.auth_user_id === myAuth}
            canManage={canManage}
            busy={busyId === c.id}
            onRevoke={() => handleRevoke(c.id)}
          />
        ))}
      </div>

      {showInvite && (
        <InviteModal
          clientId={clientId}
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); reload(); }}
        />
      )}
    </div>
  );
}

function ContactRow({ c, isFirst, isMe, canManage, busy, onRevoke }) {
  const isRevoked = !!c.portal_revoked_at;
  const isLinked  = !!c.auth_user_id && !isRevoked;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 14px",
      borderTop: isFirst ? "none" : `1px solid ${C.rule}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, display: "flex", alignItems: "center", gap: 6 }}>
          {c.name || "—"}
          {isMe && <span style={meBadge}>you</span>}
          {c.is_primary && <span style={primaryBadge}>primary</span>}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          {c.email}{c.title ? ` · ${c.title}` : ""}
        </div>
        <div style={{ fontSize: 11, color: C.cap, marginTop: 4 }}>
          {c.role || "—"}
          {" · "}
          {isRevoked ? <span style={{ color: C.err }}>revoked</span>
            : isLinked ? <span style={{ color: C.ok }}>signed in</span>
            : "invite pending"}
        </div>
      </div>
      {canManage && !isMe && !isRevoked && (
        <button onClick={onRevoke} disabled={busy} style={{
          fontSize: 12, fontWeight: 600,
          color: C.err, background: "transparent",
          border: `1px solid ${C.rule}`, borderRadius: 6,
          padding: "6px 10px",
          cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
        }}>{busy ? "…" : "Revoke"}</button>
      )}
    </div>
  );
}

function InviteModal({ clientId, onClose, onInvited }) {
  const [name,  setName]  = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [role,  setRole]  = useState("advertising");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setErr(null);
    if (!name.trim()) return setErr("Name is required.");
    if (!isValidEmail(email)) return setErr("Enter a valid email.");
    setSubmitting(true);

    const { data, error } = await supabase.rpc("invite_client_contact", {
      p_client_id: clientId,
      p_email: email.trim().toLowerCase(),
      p_name:  name.trim(),
      p_role:  role,
      p_title: title.trim() || null,
    });
    if (error) { setErr(error.message || "Invite failed."); setSubmitting(false); return; }

    // Fire the magic-link email (D5: fire-and-forget)
    if (data?.token_id) {
      try {
        await supabase.functions.invoke("send-portal-setup-email", {
          body: { token_id: data.token_id, kind: "team_invite" },
        });
      } catch (e) {
        console.warn("[team] send-portal-setup-email failed:", e);
      }
    }
    setSubmitting(false);
    onInvited();
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Invite a contact</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          We'll email them a sign-in link.
        </div>

        {err && <div style={sx.err}>{err}</div>}

        <label style={sx.label}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...sx.input, marginBottom: 12 }} />

        <label style={sx.label}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...sx.input, marginBottom: 12 }} />

        <label style={sx.label}>Title (optional)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...sx.input, marginBottom: 12 }} />

        <label style={sx.label}>Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...sx.input, marginBottom: 16 }}>
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} disabled={submitting} style={{ ...sx.btnGhost, flex: 1 }}>Cancel</button>
          <button onClick={submit} disabled={submitting || !name || !email}
            style={{ ...sx.btn(submitting || !name || !email), flex: 1 }}
          >{submitting ? "Sending…" : "Send invite"}</button>
        </div>
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

const meBadge = {
  fontSize: 10, fontWeight: 700, color: C.ac,
  background: "#DBEAFE", padding: "2px 6px", borderRadius: 4,
};
const primaryBadge = {
  fontSize: 10, fontWeight: 700, color: C.muted,
  background: "#F3F4F6", padding: "2px 6px", borderRadius: 4,
};
const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(13, 15, 20, 0.4)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 16, zIndex: 50,
};
const modalStyle = {
  maxWidth: 420, width: "100%",
  background: "#fff", borderRadius: 12,
  padding: 20,
};
