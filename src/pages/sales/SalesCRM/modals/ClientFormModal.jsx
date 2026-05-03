import { useState } from "react";
import { Z, COND, FS, FW, Ri, R, CARD } from "../../../../lib/theme";
import { Btn, Inp, Modal, Sel, FilterPillStrip, Ic } from "../../../../components/ui";
import { CONTACT_ROLES } from "../../../../constants";
import { LEAD_SOURCES } from "../../constants";

// New / edit client modal. ec === null means "new" → POST insertClient;
// otherwise PATCH updateClient. Form state lives in the parent so the
// post-save list refresh logic can clear it consistently.
//
// Wave 3 Task 3.13 — fields are bucketed into 4 collapsible groups
// (Basics, Contacts, Billing, Notes). Default-open: Basics. Reps can
// jump straight to billing without scrolling past 16 unrelated fields.
//
// Why accordions instead of a stepper: Sales reps frequently need to
// edit one field on an existing client without retracing every step.
// Accordions let them open exactly the section they care about, and
// "Edit Client" mode opens with all groups collapsed so they can pick.
function GroupHeader({ icon, label, open, onToggle, hint }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: "100%",
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        background: open ? Z.sa : "transparent",
        border: `1px solid ${Z.bd}`,
        borderRadius: open ? `${Ri}px ${Ri}px 0 0` : Ri,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ color: Z.tm, display: "inline-flex" }}>{icon}</span>
      <span style={{ flex: 1, fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      {hint && <span style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND }}>{hint}</span>}
      <span style={{ color: Z.td, fontSize: FS.xs }}>{open ? "▼" : "▶"}</span>
    </button>
  );
}

function GroupBody({ open, children }) {
  if (!open) return null;
  return (
    <div style={{ border: `1px solid ${Z.bd}`, borderTop: "none", borderRadius: `0 0 ${Ri}px ${Ri}px`, padding: CARD.pad, background: Z.bg }}>
      {children}
    </div>
  );
}

export default function ClientFormModal({
  open, onClose,
  ec, cf, setCf,
  pubs, industries,
  saveC,
}) {
  // Default to Basics open — that's where the required field (name)
  // lives. Edit mode of an existing client can collapse all and let
  // the user pick.
  const [openGroup, setOpenGroup] = useState("basics");
  const toggle = (id) => setOpenGroup(openGroup === id ? null : id);

  const contactCount = (cf.contacts || []).filter(c => c.name || c.email).length;
  const hasBilling = !!(cf.billingEmail || cf.billingAddress);
  const hasNotes = !!(cf.notes || "").trim();

  return (
    <Modal open={open} onClose={onClose} title={ec ? "Edit Client" : "New Client"} width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

        {/* BASICS — name, lead source, industry, interested pubs */}
        <div>
          <GroupHeader
            icon={<Ic.user size={13} />}
            label="Basics"
            hint={cf.name ? cf.name : "required"}
            open={openGroup === "basics"}
            onToggle={() => toggle("basics")}
          />
          <GroupBody open={openGroup === "basics"}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
              <Inp label="Company Name" value={cf.name} onChange={e => setCf(x => ({ ...x, name: e.target.value }))} placeholder="Business name" />
              <Sel label="Lead Source" value={cf.leadSource} onChange={e => setCf(x => ({ ...x, leadSource: e.target.value }))} options={[{ value: "", label: "Select source..." }, ...LEAD_SOURCES.map(s => ({ value: s, label: s }))]} />
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Industry</div>
              <FilterPillStrip
                multi
                maxHeight={100}
                value={cf.industries || []}
                onChange={next => setCf(x => ({ ...x, industries: next }))}
                options={industries.map(ind => ({ value: ind.name, label: ind.name, icon: Ic.tag }))}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Interested In</div>
              <FilterPillStrip
                multi
                gap={8}
                value={cf.interestedPubs || []}
                onChange={next => setCf(x => ({ ...x, interestedPubs: next }))}
                options={pubs.map(p => ({ value: p.id, label: p.name, icon: Ic.pub }))}
              />
            </div>
          </GroupBody>
        </div>

        {/* CONTACTS — primary + extras */}
        <div>
          <GroupHeader
            icon={<Ic.users size={13} />}
            label="Contacts"
            hint={contactCount > 0 ? `${contactCount} on file` : "none yet"}
            open={openGroup === "contacts"}
            onToggle={() => toggle("contacts")}
          />
          <GroupBody open={openGroup === "contacts"}>
            {(cf.contacts || []).map((ct, i) => (
              <div key={i} style={{ marginBottom: i < (cf.contacts || []).length - 1 ? 10 : 0, paddingBottom: i < (cf.contacts || []).length - 1 ? 10 : 0, borderBottom: i < (cf.contacts || []).length - 1 ? `1px solid ${Z.bd}` : "none" }}>
                {i > 0 && <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Contact #{i + 1}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                  <Inp label="Name" value={ct.name} onChange={e => setCf(x => ({ ...x, contacts: x.contacts.map((c, j) => j === i ? { ...c, name: e.target.value } : c) }))} placeholder="Full name" />
                  <Sel label="Role" value={ct.role} onChange={e => setCf(x => ({ ...x, contacts: x.contacts.map((c, j) => j === i ? { ...c, role: e.target.value } : c) }))} options={CONTACT_ROLES.map(r => ({ value: r, label: r }))} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Inp label="Email" type="email" value={ct.email} onChange={e => setCf(x => ({ ...x, contacts: x.contacts.map((c, j) => j === i ? { ...c, email: e.target.value } : c) }))} placeholder="email@company.com" />
                  <Inp label="Phone" value={ct.phone} onChange={e => setCf(x => ({ ...x, contacts: x.contacts.map((c, j) => j === i ? { ...c, phone: e.target.value } : c) }))} placeholder="(805) 555-0000" />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 10 }}>
              <Btn v="ghost" onClick={() => setCf(x => ({ ...x, contacts: [...(x.contacts || []), { name: "", email: "", phone: "", role: "Other" }] }))}>+ Add Another Contact</Btn>
            </div>
          </GroupBody>
        </div>

        {/* BILLING — email, ccs, address */}
        <div>
          <GroupHeader
            icon={<Ic.invoice size={13} />}
            label="Billing"
            hint={hasBilling ? "set" : "uses primary contact"}
            open={openGroup === "billing"}
            onToggle={() => toggle("billing")}
          />
          <GroupBody open={openGroup === "billing"}>
            <div style={{ fontSize: FS.micro, color: Z.td, marginBottom: 8 }}>When set, every invoice goes here instead of the proposal recipient. CC fields add up to two additional recipients.</div>
            <Inp label="Billing Email" type="email" value={cf.billingEmail || ""} onChange={e => setCf(x => ({ ...x, billingEmail: e.target.value }))} placeholder="billing@company.com" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
              <Inp label="CC #1" type="email" value={(cf.billingCcEmails || ["", ""])[0] || ""} onChange={e => setCf(x => { const cc = [...((x.billingCcEmails || ["", ""]))]; cc[0] = e.target.value; return { ...x, billingCcEmails: cc }; })} placeholder="ap@company.com" />
              <Inp label="CC #2" type="email" value={(cf.billingCcEmails || ["", ""])[1] || ""} onChange={e => setCf(x => { const cc = [...((x.billingCcEmails || ["", ""]))]; cc[1] = e.target.value; return { ...x, billingCcEmails: cc }; })} placeholder="accountant@company.com" />
            </div>
            <div style={{ fontSize: FS.micro, color: Z.td, marginTop: 12, marginBottom: 6, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: 0.5 }}>Billing Address (for the invoice template + mailed invoices)</div>
            <Inp label="Street" value={cf.billingAddress || ""} onChange={e => setCf(x => ({ ...x, billingAddress: e.target.value }))} placeholder="123 Main St" />
            <div style={{ marginTop: 8 }}>
              <Inp label="Line 2 (Suite, Floor, ATTN)" value={cf.billingAddress2 || ""} onChange={e => setCf(x => ({ ...x, billingAddress2: e.target.value }))} placeholder="Attn: Accounts Payable" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 120px", gap: 10, marginTop: 8 }}>
              <Inp label="City" value={cf.billingCity || ""} onChange={e => setCf(x => ({ ...x, billingCity: e.target.value }))} placeholder="Paso Robles" />
              <Inp label="State" value={cf.billingState || ""} onChange={e => setCf(x => ({ ...x, billingState: e.target.value }))} placeholder="CA" maxLength={2} />
              <Inp label="ZIP" value={cf.billingZip || ""} onChange={e => setCf(x => ({ ...x, billingZip: e.target.value }))} placeholder="93446" />
            </div>
          </GroupBody>
        </div>

        {/* NOTES */}
        <div>
          <GroupHeader
            icon={<Ic.file size={13} />}
            label="Notes"
            hint={hasNotes ? "added" : "optional"}
            open={openGroup === "notes"}
            onToggle={() => toggle("notes")}
          />
          <GroupBody open={openGroup === "notes"}>
            <textarea value={cf.notes || ""} onChange={e => setCf(x => ({ ...x, notes: e.target.value }))} placeholder="First impressions, how you met, what they're looking for, any context for the team..." rows={4} style={{ width: "100%", background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: R, padding: CARD.pad, color: Z.tx, fontSize: FS.base, outline: "none", resize: "vertical", fontFamily: "'Source Sans 3',sans-serif", lineHeight: 1.5, boxSizing: "border-box" }} />
          </GroupBody>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn v="cancel" onClick={onClose}>Cancel</Btn>
          <Btn onClick={saveC} disabled={!cf.name}>{ec ? "Save Changes" : "Create Client"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
