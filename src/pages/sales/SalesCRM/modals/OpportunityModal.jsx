import { Z, FS, FW, Ri } from "../../../../lib/theme";
import { Btn, Inp, Modal, Sel, TA, Ic } from "../../../../components/ui";
import { COMPANY } from "../../../../constants";
import { OPP_SOURCES } from "../SalesCRM.constants";

// Opportunity new/edit form — single-purpose since Wave 4. The
// "Send rate cards" flow that used to be a sub-mode here is now
// SendKitModal, opened when the rep clicks the Rate Cards button.
//
// State + handlers stay in the parent because saveOpp / oppToProposal
// share helpers (insertClient, updateSale, addComm) wired up there.
export default function OpportunityModal({
  open, onClose,
  opp, setOpp,
  setOppSendKit, setOppKitMsg,
  editOppId, sales, clients,
  saveOpp, oppToProposal,
}) {
  const openSendKit = () => {
    if (!opp.company) return;
    // Default the message before flipping the SendKit modal open so the
    // rep arrives with a populated draft they can edit before sending.
    setOppKitMsg(`Hi ${opp.contact},\n\nRate cards attached.\n\nBest,\n${COMPANY.sales.name}`);
    setOppSendKit(true);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editOppId ? "Opportunity" : "New Opportunity"}
      width={560}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="Company" data-opp-company value={opp.company} onChange={e => setOpp(x => ({ ...x, company: e.target.value }))} />
        {!editOppId && opp.company.length > 1 && clients.filter(c => (c.name || "").toLowerCase().includes(opp.company.toLowerCase())).slice(0, 3).map(c => (
          <button
            key={c.id}
            onClick={() => setOpp(x => ({ ...x, company: c.name, contact: c.contacts?.[0]?.name || "", email: c.contacts?.[0]?.email || "", phone: c.contacts?.[0]?.phone || "" }))}
            style={{ padding: "6px 12px", background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", fontSize: FS.sm, color: Z.ac, fontWeight: FW.bold, textAlign: "left", display: "inline-flex", alignItems: "center", gap: 6 }}
          ><Ic.arrowRight size={11} /> {c.name}</button>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Inp label="Contact" value={opp.contact} onChange={e => setOpp(x => ({ ...x, contact: e.target.value }))} />
          <Sel label="Source" value={opp.source} onChange={e => setOpp(x => ({ ...x, source: e.target.value }))} options={OPP_SOURCES} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Inp label="Email" value={opp.email} onChange={e => setOpp(x => ({ ...x, email: e.target.value }))} />
          <Inp label="Phone" value={opp.phone} onChange={e => setOpp(x => ({ ...x, phone: e.target.value }))} />
        </div>
        {editOppId && (() => {
          const s = sales.find(x => x.id === editOppId);
          const n = s?.oppNotes || [];
          return n.length > 0 && (
            <div style={{ background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}`, padding: 16, maxHeight: 90, overflowY: "auto" }}>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Activity Log</div>
              {n.slice().reverse().map(x => (
                <div key={x.id} style={{ padding: "3px 0", fontSize: FS.sm, color: Z.tx, borderBottom: `1px solid ${Z.bd}` }}>
                  {x.text} <span style={{ color: Z.td }}>{x.date}</span>
                </div>
              ))}
            </div>
          );
        })()}
        <TA label="Add Note" value={opp.notes} onChange={e => setOpp(x => ({ ...x, notes: e.target.value }))} placeholder="Notes..." />
        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={onClose}>Cancel</Btn>
          <Btn v="cancel" onClick={openSendKit}><Ic.mail size={12} /> Rate Cards</Btn>
          <Btn v="cancel" onClick={oppToProposal}><Ic.send size={12} /> Create Proposal</Btn>
          <Btn onClick={() => saveOpp()}>{editOppId ? "Save" : "Create"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
