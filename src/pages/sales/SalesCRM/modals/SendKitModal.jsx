import { Z, FS, FW, Ri } from "../../../../lib/theme";
import { Btn, Modal, TA, Ic } from "../../../../components/ui";

// Send Rate Cards modal — fired from OpportunityModal's "Rate Cards"
// CTA. Pre-Wave-4 this was an inline sub-mode inside OpportunityModal,
// which made the parent modal switch chrome (title, layout, buttons)
// based on a flag. Splitting it: the Opportunity surface is now a
// single-purpose form; this modal is its own dedicated send flow.
//
// The success state ("Sent!") stays here too — it's the natural tail
// of this modal, not the Opportunity form.
export default function SendKitModal({
  open, onClose,
  opp,
  oppKitPubs, setOppKitPubs,
  oppKitMsg, setOppKitMsg,
  oppKitSent,
  dropdownPubs,
  sendKit,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={oppKitSent ? "Sent!" : "Send Rate Cards"}
      width={560}
    >
      {oppKitSent ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", padding: 16 }}>
          <Ic.check size={28} color={Z.su} />
          <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>Sent to {opp.company}!</div>
          <Btn v="secondary" onClick={onClose}>Close</Btn>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 5 }}>
            {dropdownPubs.map(p => (
              <button
                key={p.id}
                onClick={() => setOppKitPubs(k => k.includes(p.id) ? k.filter(x => x !== p.id) : [...k, p.id])}
                style={{ padding: "10px 14px", borderRadius: Ri, border: `1px solid ${Z.bg === "#08090D" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}`, background: oppKitPubs.includes(p.id) ? Z.as : Z.bg, cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: oppKitPubs.includes(p.id) ? Z.ac : Z.tx }}>{p.name}</div>
              </button>
            ))}
          </div>
          <TA label="Message" value={oppKitMsg} onChange={e => setOppKitMsg(e.target.value)} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn v="secondary" onClick={onClose}>Cancel</Btn>
            <Btn disabled={oppKitPubs.length === 0} onClick={sendKit}><Ic.mail size={12} /> Send</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
