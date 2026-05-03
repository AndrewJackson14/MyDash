import { Z, FS, FW, Ri } from "../../../../lib/theme";
import { Btn, Inp, Modal, Sel, TA, Ic } from "../../../../components/ui";
import { COMPANY } from "../../../../constants";
import { OPP_SOURCES } from "../SalesCRM.constants";

// Opportunity wizard — three views switched by oppSendKit / oppKitSent:
//   1. base — company/contact/source/notes form (default)
//   2. sendKit (oppSendKit=true) — pick pubs, send rate cards
//   3. sent confirmation (oppKitSent=true) — "Sent to X!" + close
//
// Wave 2: extracted as-is. State + handlers stay in the parent because
// saveOpp / sendKit / oppToProposal share helpers (insertClient,
// updateSale, addComm) that are wired up in useSalesCRM.
export default function OpportunityModal({
  open, onClose,
  opp, setOpp,
  oppSendKit, setOppSendKit,
  oppKitSent,
  oppKitPubs, setOppKitPubs,
  oppKitMsg, setOppKitMsg,
  editOppId, sales, clients, dropdownPubs,
  saveOpp, sendKit, oppToProposal,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={oppKitSent ? "Sent!" : oppSendKit ? "Send Rate Cards" : editOppId ? "Opportunity" : "New Opportunity"}
      width={560}
    >
      {oppKitSent ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", padding: 16 }}>
          <Ic.check size={28} color={Z.su} />
          <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>Sent to {opp.company}!</div>
          <Btn v="secondary" onClick={onClose}>Close</Btn>
        </div>
      ) : oppSendKit ? (
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
            <Btn v="secondary" onClick={() => setOppSendKit(false)}>Back</Btn>
            <Btn disabled={oppKitPubs.length === 0} onClick={sendKit}><Ic.mail size={12} /> Send</Btn>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Inp label="Company" data-opp-company value={opp.company} onChange={e => setOpp(x => ({ ...x, company: e.target.value }))} />
          {!editOppId && opp.company.length > 1 && clients.filter(c => (c.name || "").toLowerCase().includes(opp.company.toLowerCase())).slice(0, 3).map(c => (
            <button
              key={c.id}
              onClick={() => setOpp(x => ({ ...x, company: c.name, contact: c.contacts?.[0]?.name || "", email: c.contacts?.[0]?.email || "", phone: c.contacts?.[0]?.phone || "" }))}
              style={{ padding: "6px 12px", background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", fontSize: FS.sm, color: Z.ac, fontWeight: FW.bold, textAlign: "left" }}
            >→ {c.name}</button>
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
            <Btn v="cancel" onClick={() => {
              if (!opp.company) return;
              setOppSendKit(true);
              setOppKitMsg(`Hi ${opp.contact},\n\nRate cards attached.\n\nBest,\n${COMPANY.sales.name}`);
            }}><Ic.mail size={12} /> Rate Cards</Btn>
            <Btn v="cancel" onClick={oppToProposal}><Ic.send size={12} /> Create Proposal</Btn>
            <Btn onClick={() => saveOpp()}>{editOppId ? "Save" : "Create"}</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
