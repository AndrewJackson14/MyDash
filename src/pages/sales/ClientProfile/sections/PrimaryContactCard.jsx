import { Z, COND, FS, FW } from "../../../../lib/theme";
import { Btn, Card, Ic } from "../../../../components/ui";

const serif = "'Playfair Display',Georgia,serif";

// Surfaces the main contact's full details (name, role, email, phone)
// at the top so a rep can reach them immediately without scrolling to
// the Contacts card. Prompts to add one when missing.
export default function PrimaryContactCard({ vc, primaryContact, onOpenEditClient }) {
  return (
    <Card style={{ borderLeft: `3px solid ${Z.ac}`, marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Primary Contact</div>
          {primaryContact.name ? <>
            <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: serif }}>{primaryContact.name}</div>
            {primaryContact.role && <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tm, fontFamily: COND, marginTop: 2 }}>{primaryContact.role}</div>}
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              {primaryContact.email && <a href={`mailto:${primaryContact.email}`} style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.ac, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><Ic.mail size={12} /> {primaryContact.email}</a>}
              {primaryContact.phone && <a href={`tel:${primaryContact.phone}`} style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.ac, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><Ic.phone size={12} /> {primaryContact.phone}</a>}
              {!primaryContact.email && !primaryContact.phone && <span style={{ fontSize: FS.sm, color: Z.td, fontStyle: "italic" }}>No email or phone set</span>}
            </div>
          </> : <div style={{ fontSize: FS.sm, color: Z.td, fontStyle: "italic" }}>No primary contact set. Add one in the Contacts card below.</div>}
        </div>
        {onOpenEditClient && <Btn sm v="ghost" onClick={() => onOpenEditClient(vc)}>Edit</Btn>}
      </div>
    </Card>
  );
}
