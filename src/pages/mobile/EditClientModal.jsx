// EditClientModal — quick edits to the basics that go stale in the
// field (typo in the name, primary contact phone changed, etc).
// Anything more involved (status, billing address, multiple contacts,
// industry tags, scorecard) stays on desktop.
import { useState } from "react";
import { TOKENS, SURFACE, INK, ACCENT } from "./mobileTokens";

export default function EditClientModal({ client, onClose, onSave }) {
  const [name, setName] = useState(client.name || "");
  const [contactName, setContactName] = useState(client.contacts?.[0]?.name || "");
  const [contactEmail, setContactEmail] = useState(client.contacts?.[0]?.email || "");
  const [contactPhone, setContactPhone] = useState(client.contacts?.[0]?.phone || "");
  const [billingEmail, setBillingEmail] = useState(client.billing_email || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (saving || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Merge edits into the existing primary contact (don't blow away
      // role + extra fields the desktop captures).
      const existingContacts = Array.isArray(client.contacts) ? client.contacts : [];
      const primary = existingContacts[0] || {};
      const updatedContacts = [
        { ...primary, name: contactName.trim(), email: contactEmail.trim(), phone: contactPhone.trim() },
        ...existingContacts.slice(1),
      ];
      await onSave({
        name: name.trim(),
        billing_email: billingEmail.trim(),
        contacts: updatedContacts,
      });
      onClose();
    } catch (e) {
      setError(String(e?.message ?? e));
      setSaving(false);
    }
  };

  return <div style={{ position: "fixed", inset: 0, zIndex: 110, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.55)" }}>
    <div onClick={onClose} style={{ flex: 1 }} />
    <div style={{
      background: SURFACE.elevated,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom: "env(safe-area-inset-bottom)",
      maxHeight: "92vh", overflowY: "auto",
    }}>
      <div style={{ width: 40, height: 4, background: TOKENS.rule, borderRadius: 2, margin: "12px auto 4px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px 4px" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>Edit basics</div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: TOKENS.muted, fontSize: 14, fontWeight: 600, padding: 4 }}>Cancel</button>
      </div>

      <div style={{ padding: "8px 18px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Client name">
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} autoFocus />
        </Field>
        <Field label="Primary contact name">
          <input value={contactName} onChange={e => setContactName(e.target.value)} style={inputStyle} autoComplete="name" />
        </Field>
        <Field label="Primary contact email">
          <input type="email" inputMode="email" autoComplete="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Primary contact phone">
          <input type="tel" inputMode="tel" autoComplete="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Billing email (for invoices + receipts)">
          <input type="email" inputMode="email" value={billingEmail} onChange={e => setBillingEmail(e.target.value)} style={inputStyle} />
        </Field>

        {error && <div style={{ padding: "10px 12px", background: TOKENS.urgent + "12", borderRadius: 8, color: TOKENS.urgent, fontSize: 13 }}>{error}</div>}

        <button
          onClick={submit}
          disabled={saving || !name.trim()}
          style={{
            width: "100%", padding: "14px", minHeight: 52,
            background: saving || !name.trim() ? TOKENS.rule : ACCENT,
            color: saving || !name.trim() ? TOKENS.muted : "#FFFFFF",
            border: "none", borderRadius: 10,
            fontSize: 16, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
            marginTop: 4,
          }}
        >{saving ? "Saving…" : "Save"}</button>
        <div style={{ fontSize: 11, color: TOKENS.muted, textAlign: "center" }}>
          For status, billing address, multiple contacts, and tags — open the desktop client profile.
        </div>
      </div>
    </div>
  </div>;
}

function Field({ label, children }) {
  return <div>
    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>{label}</label>
    {children}
  </div>;
}

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "12px 14px", minHeight: 48,
  fontSize: 16, color: INK,
  background: SURFACE.alt, border: `1px solid ${TOKENS.rule}`,
  borderRadius: 10, outline: "none",
  fontFamily: "inherit",
};
