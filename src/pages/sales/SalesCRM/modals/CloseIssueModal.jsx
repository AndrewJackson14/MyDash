import { Z, FS, FW, Ri } from "../../../../lib/theme";
import { Btn, Modal, Sel } from "../../../../components/ui";
import { cn as cnHelper, pn as pnHelper, tn as tnHelper } from "../SalesCRM.helpers";

// Close-time issue picker — every display_print sale must belong to an
// issue (DB CHECK constraint added in migration 028). When a sale is
// moved to Closed without one, this modal forces the salesperson to
// pick before finalizeClose runs.
//
// Wave 2: extracted from SalesCRM monolith. closeIssueModal carries
// { saleId, pubId } | null; the parent owns finalizeClose.
export default function CloseIssueModal({
  closeIssueModal, setCloseIssueModal,
  closeIssueChoice, setCloseIssueChoice,
  sales, issues, today, clientsById, pubs, team,
  finalizeClose,
}) {
  const cn = (id) => cnHelper(id, clientsById);
  const pn = (id) => pnHelper(id, pubs);
  const tn = (id) => tnHelper(id, team);

  return (
    <Modal
      open={!!closeIssueModal}
      onClose={() => setCloseIssueModal(null)}
      title="Pick an issue to close into"
      width={480}
    >
      {closeIssueModal && (() => {
        const targetSale = sales.find(x => x.id === closeIssueModal.saleId);
        const pubName = pn(closeIssueModal.pubId);
        const candidateIssues = (issues || [])
          .filter(i => i.pubId === closeIssueModal.pubId && i.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date));
        const selectedIssue = closeIssueChoice ? candidateIssues.find(i => i.id === closeIssueChoice) : null;
        const repName = targetSale?.assignedTo ? tn(targetSale.assignedTo) : null;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>
              {targetSale ? `${cn(targetSale.clientId)} — ${pubName} ${targetSale.size || ""}` : pubName}
            </div>
            {candidateIssues.length === 0 ? (
              <div style={{ padding: 12, background: Z.bg, borderRadius: Ri, color: Z.tm, fontSize: FS.sm }}>
                No upcoming issues for {pubName}. Add one in Publications first, then come back to close this sale.
              </div>
            ) : (
              <Sel
                label="Issue"
                value={closeIssueChoice}
                onChange={e => setCloseIssueChoice(e.target.value)}
                options={[
                  { value: "", label: "Select an issue..." },
                  ...candidateIssues.map(i => ({ value: i.id, label: `${i.label} — ${i.date}` })),
                ]}
              />
            )}

            {/* Wave 3 Task 3.8 — preview revenue + commission impact
                before the rep clicks Confirm. Commission preview is
                advisory ("calculated on close") because the actual
                commission row is created server-side by the close
                trigger and depends on tier rules + payment status.
                Showing the precise number would require a separate
                preview RPC; for now we surface the inputs and let the
                rep verify the rep + amount are correct. */}
            {selectedIssue && targetSale && (
              <div style={{
                padding: 12,
                background: Z.ss || Z.sa,
                border: `1px solid ${Z.ac}30`,
                borderRadius: Ri,
                fontSize: FS.sm,
                color: Z.tx,
                lineHeight: 1.5,
              }}>
                <div>
                  Closing <span style={{ fontWeight: FW.heavy }}>${(targetSale.amount || 0).toLocaleString()}</span> into{" "}
                  <span style={{ fontWeight: FW.heavy }}>{pubName}</span> issue dated{" "}
                  <span style={{ fontWeight: FW.heavy }}>{selectedIssue.date}</span>.
                </div>
                {repName && (
                  <div style={{ marginTop: 4, color: Z.tm, fontSize: FS.xs }}>
                    Commission credits to <span style={{ color: Z.tx, fontWeight: FW.bold }}>{repName}</span> · calculated on close (tier rules + payment status apply).
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn v="cancel" sm onClick={() => setCloseIssueModal(null)}>Cancel</Btn>
              <Btn
                sm
                disabled={!closeIssueChoice}
                onClick={() => {
                  const saleId = closeIssueModal.saleId;
                  const issueId = closeIssueChoice;
                  setCloseIssueModal(null);
                  finalizeClose(saleId, issueId);
                }}
              >Close into issue</Btn>
            </div>
          </div>
        );
      })()}
    </Modal>
  );
}
