import { Z, COND, ACCENT, FS, FW, Ri, R, CARD } from "../../../../lib/theme";
import { Btn, EmptyState, GlassCard, Ic, cardSurface } from "../../../../components/ui";
import { fmtTimeRelative } from "../../../../lib/formatters";
import { PIPELINE, PIPELINE_COLORS, actInfo } from "../../constants";
import { cn as cnHelper, pn as pnHelper, actLabel as actLabelHelper } from "../SalesCRM.helpers";
import SaleCard from "./SaleCard";

// Pipeline tab — kanban + goals + alerts + today's actions + activity feed.
// SaleCard is the only memo'd card and dispatches a single onAction(kind,
// sale, extra?) instead of separate per-button callbacks. The wrapping
// onCardAction in the parent translates kind → handler.
//
// Wave 2: extracted from SalesCRM monolith. The Closed column still groups
// by contractId (one card per contract, click → contracts page) and is
// rendered inline because it's structurally different from the other lanes.
export default function PipelineTab({
  // Sales / data
  activeSales, sales, contracts, clients, issues,
  pubs, salespersonPubAssignments, dropdownPubs, adInquiries,
  recentPublishedIssueIds, todaysActions, activityLog,
  proofReadyMap, dragSaleId, setDragSaleId,
  clientsById,
  // Date helpers
  today, dateColor,
  // Action label helpers (from parent — they pull from actInfo)
  actIcon, actVerb,
  // Handlers
  onCardAction, openOpp, moveToStage, handleAct,
  navTo, setTab, onNavigate,
  loadInquiries, inquiriesLoaded,
}) {
  const cn = (id) => cnHelper(id, clientsById);
  const pn = (id) => pnHelper(id, pubs);
  const actLabel = (s) => actLabelHelper(s);

  return (
    <>
      {/* Salesperson Goal Progress */}
      {(() => {
        const myAssignments = (salespersonPubAssignments || []).filter(a => a.isActive);
        if (!myAssignments.length) return null;
        const goalRows = dropdownPubs.map(pub => {
          const assignment = myAssignments.find(a => a.publicationId === pub.id);
          if (!assignment) return null;
          const ni = issues.find(i => i.pubId === pub.id && i.date >= today);
          if (!ni) return null;
          const pubGoal = ni.revenueGoal != null ? ni.revenueGoal : (pub.defaultRevenueGoal || 0);
          if (!pubGoal) return null;
          const myPct = Number(assignment.percentage || 0) / 100;
          const myGoal = Math.round(pubGoal * myPct);
          const myRev = sales.filter(s => s.issueId === ni.id && s.status === "Closed").reduce((sum, s) => sum + (s.amount || 0), 0);
          const pct = myGoal > 0 ? Math.min(100, Math.round((myRev / myGoal) * 100)) : 0;
          return { pub, issue: ni, myGoal, myRev, pct, myPct };
        }).filter(Boolean);
        if (!goalRows.length) return null;
        return (
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            {goalRows.map(g => (
              <div key={g.pub.id} style={{ flex: "1 1 120px", padding: "8px 12px", background: Z.bg === "#08090D" ? "rgba(140,150,165,0.06)" : "rgba(255,255,255,0.25)", backdropFilter: "blur(16px)", borderRadius: R, border: `1px solid ${Z.bd}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND, marginBottom: 4 }}>
                  <span>{g.pub.name.replace(/^The /, "").split(" ").slice(0, 2).join(" ")}</span>
                  <span style={{ color: g.pct > 100 ? ACCENT.blue : g.pct >= 80 ? Z.go : g.pct >= 50 ? Z.wa : Z.da }}>{g.pct}%</span>
                </div>
                <div style={{ height: 4, background: Z.sa, borderRadius: Ri, marginBottom: 3 }}>
                  <div style={{ height: "100%", borderRadius: Ri, width: `${Math.min(g.pct, 100)}%`, background: g.pct > 100 ? ACCENT.blue : g.pct >= 80 ? Z.go : g.pct >= 50 ? Z.wa : Z.da, transition: "width 0.3s" }} />
                </div>
                <div style={{ fontSize: FS.micro, color: Z.td }}>${Math.round(g.myRev / 1000)}K / ${Math.round(g.myGoal / 1000)}K goal</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Inquiries + Renewals inline alerts */}
      {(() => {
        const newInqs = (adInquiries || []).filter(i => i.status === "new");
        const urgentRens = (clients || []).filter(c => (c.status === "Renewal" || c.status === "Lapsed") && c.contractEndDate && c.contractEndDate <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
        if (newInqs.length === 0 && urgentRens.length === 0) return null;
        return (
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {newInqs.length > 0 && (
              <div onClick={() => { if (loadInquiries && !inquiriesLoaded) loadInquiries(); setTab("Inquiries"); }} style={{ flex: 1, padding: "8px 14px", background: Z.da + "10", borderRadius: Ri, cursor: "pointer" }}>
                <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.da }}>{newInqs.length} new inquir{newInqs.length > 1 ? "ies" : "y"}</span>
                <span style={{ fontSize: FS.xs, color: Z.tm, marginLeft: 8 }}>Hot leads — respond now</span>
              </div>
            )}
            {urgentRens.length > 0 && (
              <div onClick={() => navTo("Renewals")} style={{ flex: 1, padding: "8px 14px", background: Z.wa + "10", borderLeft: `3px solid ${Z.wa}`, borderRadius: Ri, cursor: "pointer" }} title="Open Renewals tab">
                <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.wa }}>{urgentRens.length} renewal{urgentRens.length > 1 ? "s" : ""} expiring soon</span>
                <span style={{ fontSize: FS.xs, color: Z.tm, marginLeft: 8 }}>{urgentRens.slice(0, 3).map(c => c.name).join(", ")} · click to open Renewals →</span>
              </div>
            )}
          </div>
        );
      })()}

      {activeSales.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="No deals in your pipeline yet"
          body="Time to prospect — start with a new opportunity."
          action={<Btn onClick={openOpp}><Ic.plus size={13} /> New Opportunity</Btn>}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
          {PIPELINE.map(stage => {
            // Closed column groups by contractId — one card per contract,
            // click → contracts page. Structurally different from sale cards
            // so it's rendered inline rather than via SaleCard.
            if (stage === "Closed") {
              const contractSaleMap = {};
              activeSales.forEach(s => {
                if (s.contractId) {
                  if (!contractSaleMap[s.contractId]) contractSaleMap[s.contractId] = [];
                  contractSaleMap[s.contractId].push(s);
                }
              });
              const closedContracts = (contracts || [])
                .filter(c => contractSaleMap[c.id])
                .map(c => ({
                  contract: c,
                  sales: contractSaleMap[c.id],
                  orderCount: contractSaleMap[c.id].length,
                  totalValue: c.totalValue || contractSaleMap[c.id].reduce((s, x) => s + (x.amount || 0), 0),
                }))
                .sort((a, b) => (b.contract.startDate || "").localeCompare(a.contract.startDate || ""));
              const stRev = closedContracts.reduce((sm, x) => sm + (x.totalValue || 0), 0);
              return (
                <div key={stage} style={{ background: Z.bg === "#08090D" ? "rgba(140,150,165,0.06)" : "rgba(255,255,255,0.25)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: R, padding: CARD.pad, border: `1px solid ${Z.bd}`, display: "flex", flexDirection: "column", minHeight: 100 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 4px 6px", borderBottom: `2px solid ${PIPELINE_COLORS[stage]}` }}>
                    <span style={{ fontSize: FS.sm, fontWeight: FW.black, color: PIPELINE_COLORS[stage] }}>{stage}</span>
                    <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td }}>{closedContracts.length}{stRev > 0 ? ` · $${(stRev / 1000).toFixed(0)}K` : ""}</span>
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginTop: 8, overflowY: "auto", maxHeight: 420 }}>
                    {closedContracts.slice(0, 8).map(({ contract: c, orderCount, totalValue }) => (
                      <div key={c.id} onClick={() => onNavigate?.("contracts")} style={{ ...cardSurface(), borderRadius: R, padding: CARD.pad, cursor: "pointer" }} title="Open Contracts page">
                        <div style={{ fontWeight: FW.semi, color: Z.ac, fontSize: FS.md, marginBottom: 2, fontFamily: COND }}>{cn(c.clientId)}</div>
                        <div style={{ color: Z.tm, fontSize: FS.sm, marginBottom: 2 }}>{c.name || "Contract"}</div>
                        <div style={{ fontWeight: FW.black, color: Z.su, fontSize: FS.base }}>${Number(totalValue || 0).toLocaleString()}</div>
                        <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 2 }}>{orderCount} order{orderCount > 1 ? "s" : ""}{c.startDate ? ` · ${c.startDate}` : ""}</div>
                      </div>
                    ))}
                    {closedContracts.length > 8 && <div style={{ fontSize: FS.xs, color: Z.td, textAlign: "center", padding: 4 }}>+ {closedContracts.length - 8} more</div>}
                  </div>
                </div>
              );
            }
            const ss = activeSales.filter(s => {
              if (stage === "Follow-up") return s.status === "Closed" && s.issueId && recentPublishedIssueIds.has(s.issueId);
              return s.status === stage;
            });
            const stRev = ss.reduce((s, x) => s + (x.amount || 0), 0);
            return (
              <div
                key={stage}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragSaleId) { moveToStage(dragSaleId, stage); setDragSaleId(null); } }}
                style={{ background: Z.bg === "#08090D" ? "rgba(140,150,165,0.06)" : "rgba(255,255,255,0.25)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: R, padding: CARD.pad, border: `1px solid ${Z.bd}`, display: "flex", flexDirection: "column", minHeight: 100 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 4px 6px", borderBottom: `2px solid ${PIPELINE_COLORS[stage]}` }}>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.black, color: PIPELINE_COLORS[stage] }}>{stage}</span>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td }}>{ss.length}{stRev > 0 ? ` · $${(stRev / 1000).toFixed(0)}K` : ""}</span>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginTop: 8, overflowY: "auto", maxHeight: 420 }}>
                  {ss.slice(0, 8).map(s => (
                    <SaleCard
                      key={s.id}
                      sale={s}
                      stage={stage}
                      clientName={cn(s.clientId)}
                      pubName={pn(s.publication)}
                      proofReady={!!(s.contractId && proofReadyMap[s.contractId])}
                      dateColor={dateColor}
                      actLabel={actLabel}
                      actIcon={actIcon}
                      onAction={onCardAction}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TODAY'S ACTIONS + ACTIVITY */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <GlassCard>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <h4 style={{ margin: 0, fontSize: FS.md, fontWeight: FW.black, color: Z.tx }}>My Actions</h4>
            <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: todaysActions.length > 0 ? Z.da : Z.su }}>{todaysActions.length}</span>
          </div>
          {todaysActions.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: Z.su, fontSize: FS.base }}>All caught up!</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto" }}>
              {todaysActions.slice(0, 10).map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{cn(s.clientId)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: FS.sm, color: Z.tx }}>
                      <span>{actIcon(s)}</span>
                      <span style={{ fontWeight: FW.semi }}>{actLabel(s)}</span>
                      {s.nextActionDate < today && <span style={{ color: Z.da, fontWeight: FW.heavy }}>ACTION NEEDED</span>}
                    </div>
                  </div>
                  <button onClick={() => handleAct(s.id)} style={{ padding: "6px 12px", borderRadius: Ri, border: `1px solid ${(actInfo(s.nextAction)?.color || Z.ac)}40`, background: `${actInfo(s.nextAction)?.color || Z.ac}10`, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.heavy, color: actInfo(s.nextAction)?.color || Z.ac }}>{actVerb(s)}</button>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND, marginBottom: 6 }}>Recent Activity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Wave 4 Tasks 4.6 + 4.2 — entries are buttons (keyboard
                navigable) that route to the client. Time uses
                fmtTimeRelative so each entry reads "9m ago" instead
                of a raw ISO string. The Ic.arrowRight prefix mirrors
                the activity-direction visual. */}
            {activityLog.slice(0, 6).map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => { if (a.clientId) navTo("Clients", a.clientId); }}
                disabled={!a.clientId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 6px",
                  borderRadius: Ri,
                  background: "transparent",
                  border: "none",
                  borderBottom: `1px solid ${Z.bd}15`,
                  cursor: a.clientId ? "pointer" : "default",
                  textAlign: "left",
                  color: Z.tx,
                  fontFamily: "inherit",
                  minHeight: 36,
                }}
                onMouseEnter={e => { if (a.clientId) e.currentTarget.style.background = Z.sa; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                title={a.clientName ? `Open ${a.clientName}` : undefined}
              >
                <Ic.arrowRight size={11} color={Z.tm} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.clientName}</div>
                  <div style={{ fontSize: FS.xs, color: Z.tm, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.text}</div>
                </div>
                <span style={{ fontSize: FS.xs, color: Z.td, flexShrink: 0, fontFamily: COND }}>{fmtTimeRelative(a.time)}</span>
              </button>
            ))}
            {activityLog.length === 0 && <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No recent activity</div>}
          </div>
        </GlassCard>
      </div>
    </>
  );
}
