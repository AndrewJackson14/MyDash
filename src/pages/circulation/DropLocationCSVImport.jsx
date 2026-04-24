// Placeholder for the Phase 3 CSV import wizard.
// Phase 2 ships the button + a "coming soon" modal. Phase 3 replaces
// this body with the 5-step wizard (spec §4.2).
import { Z, FS, FW, Ri } from "../../lib/theme";
import { Btn, Modal } from "../../components/ui";

export default function DropLocationCSVImport({ open, onClose }) {
  return <Modal open={open} onClose={onClose} title="Import CSV" width={480}>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ padding: "18px 20px", background: Z.bg, borderRadius: Ri, color: Z.tm, fontSize: FS.sm, lineHeight: 1.5 }}>
        The CSV import wizard (column mapping, validation preview, Mapbox
        geocoding, and batched inserts) lands in Phase 3. The button is
        wired so the tab doesn't render dead affordances.
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn onClick={onClose}>Close</Btn>
      </div>
    </div>
  </Modal>;
}
