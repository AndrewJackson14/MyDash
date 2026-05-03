import { Z, FS, FW, R } from "../../../../lib/theme";
import { Btn } from "../../../../components/ui";

// Stack of two top-of-page alert bars: Credit Hold + Renewal Due.
// Each renders only when its condition is active. Styling is intentionally
// loud — these are blockers production needs to see.
export default function Alerts({
  vc, clientStatus, activeContracts,
  setClients, persist, appData,
  onOpenProposal, fmtD,
}) {
  return (
    <>
      {vc.creditHold && (
        <div style={{ padding: "12px 16px", background: `${Z.da}12`, border: `1px solid ${Z.da}40`, borderRadius: R, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.da }}>Credit Hold Active</div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>
              {vc.creditHoldReason || "Production is blocked for this client."} Ad projects will not auto-create on sale close. Flatplan placement will warn.
            </div>
          </div>
          <Btn sm v="secondary" onClick={() => {
            setClients(cl => cl.map(c => c.id === vc.id ? { ...c, creditHold: false, creditHoldReason: null } : c));
            persist(() => appData.updateClient(vc.id, { creditHold: false, creditHoldReason: null }));
          }}>Clear Hold</Btn>
        </div>
      )}

      {clientStatus === "Renewal" && (
        <div style={{ padding: "12px 16px", background: `${Z.wa}15`, border: `1px solid ${Z.wa}40`, borderRadius: R, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.wa }}>Renewal Due</div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>
              {vc.contractEndDate ? `Contract expires ${fmtD(vc.contractEndDate)}` : "This client is due for renewal."}
              {activeContracts.length > 0 && ` · Current: ${activeContracts[0].name} ($${(activeContracts[0].totalValue || 0).toLocaleString()})`}
            </div>
          </div>
          <Btn sm onClick={() => { if (onOpenProposal) onOpenProposal(vc.id); }}>Create Renewal Proposal</Btn>
        </div>
      )}
    </>
  );
}
