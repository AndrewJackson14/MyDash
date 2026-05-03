import { useState } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri } from "../../../../lib/theme";
import { Card, EntityLink, Ic } from "../../../../components/ui";
import TearsheetCell from "../components/TearsheetCell";

// Purchase timeline — contracts, standalone ads, orphan proposals
// grouped by year. Year-level toggles + per-contract toggles for
// drilldown. A proposal appears here only if it didn't convert to a
// contract OR the contract it became was later cancelled (so there's
// unfulfilled commitment to revisit).
export default function PurchaseTimelineCard({
  vc, sales, setSales,
  timelineYears, clientProposals, closedCS, clientContracts, totalRevenue,
  pn, nav, onNavTo, onSetViewPropId,
}) {
  const currentYear = new Date().toISOString().slice(0, 4);
  const [expandedYears, setExpandedYears] = useState(() => new Set([currentYear]));
  const [expandedContracts, setExpandedContracts] = useState(() => new Set());
  const toggleYear = (y) => setExpandedYears(s => { const n = new Set(s); n.has(y) ? n.delete(y) : n.add(y); return n; });
  const toggleContract = (id) => setExpandedContracts(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (timelineYears.length === 0 && clientProposals.length === 0) return null;

  return (
    <Card style={{ borderLeft: `3px solid ${Z.ac}`, marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Purchase Timeline</span>
        <span style={{ fontSize: FS.xs, color: Z.td }}>{closedCS.length} ad{closedCS.length !== 1 ? "s" : ""} · {clientContracts.length} contract{clientContracts.length !== 1 ? "s" : ""} · ${totalRevenue.toLocaleString()} lifetime</span>
      </div>
      {timelineYears.length === 0 && <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm, background: Z.bg, borderRadius: Ri }}>No purchase history yet</div>}
      {timelineYears.map(yr => {
        const open = expandedYears.has(yr.year);
        return (
          <div key={yr.year} style={{ marginBottom: 8 }}>
            <button onClick={() => toggleYear(yr.year)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", textAlign: "left" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-flex", color: Z.tm, width: 10 }}>{open ? <Ic.chevronDown size={11} /> : <Ic.chevronRight size={11} />}</span>
                <span style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{yr.year}</span>
                <span style={{ fontSize: FS.xs, color: Z.td, marginLeft: 8 }}>
                  {yr.contracts.length > 0 && `${yr.contracts.length} contract${yr.contracts.length !== 1 ? "s" : ""} · `}
                  {yr.adCount} ad{yr.adCount !== 1 ? "s" : ""}
                  {yr.proposals.length > 0 && ` · ${yr.proposals.length} proposal${yr.proposals.length !== 1 ? "s" : ""}`}
                </span>
              </span>
              <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.ac, fontFamily: DISPLAY }}>${yr.total.toLocaleString()}</span>
            </button>

            {open && (
              <div style={{ padding: "8px 0 0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
                {/* Contracts */}
                {yr.contracts.map(ct => {
                  const ctOpen = expandedContracts.has(ct.id);
                  const stColor = ct.status === "active" ? (Z.su || "#22C55E") : ct.status === "cancelled" ? Z.da : Z.tm;
                  return (
                    <div key={ct.id} style={{ background: Z.bg, border: `1px solid ${ct.status === "active" ? stColor + "40" : Z.bd}`, borderRadius: Ri, overflow: "hidden" }}>
                      <button onClick={() => toggleContract(ct.id)}
                        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: Z.tx }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ display: "inline-flex", color: Z.tm, width: 10 }}>{ctOpen ? <Ic.chevronDown size={11} /> : <Ic.chevronRight size={11} />}</span>
                            <Ic.handshake size={11} color={Z.tm} />
                            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{ct.name}</span>
                            <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: stColor, background: stColor + "15", padding: "1px 6px", borderRadius: Ri, textTransform: "uppercase", letterSpacing: 0.3 }}>{ct.status}</span>
                          </div>
                          <div style={{ fontSize: FS.xs, color: Z.tm, marginLeft: 27 }}>{ct.startDate || "?"} → {ct.endDate || "?"}{ct.lines?.length > 0 && ` · ${ct.lines.map(ln => `${pn(ln.pubId)} ${ln.adSize}×${ln.quantity}`).join(" · ")}`}</div>
                          {ct.totalValue > 0 && <div style={{ marginTop: 6, marginLeft: 27, marginRight: 0 }}>
                            <div style={{ height: 5, background: Z.sa, borderRadius: Ri, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${ct.pct}%`, background: ct.pct >= 100 ? (Z.su || "#22C55E") : ct.status === "cancelled" ? Z.da : Z.ac, transition: "width 0.3s" }} />
                            </div>
                            <div style={{ fontSize: FS.micro, color: Z.td, marginTop: 2 }}>${ct.fulfilled.toLocaleString()} of ${(ct.totalValue || 0).toLocaleString()} delivered · {ct.pct}%</div>
                          </div>}
                        </div>
                        <div style={{ textAlign: "right", paddingLeft: 10 }}>
                          <div style={{ fontSize: FS.sm, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>${(ct.totalValue || 0).toLocaleString()}</div>
                        </div>
                      </button>
                      {ctOpen && ct.ads.length > 0 && (
                        <div style={{ padding: "0 14px 10px 41px", display: "flex", flexDirection: "column", gap: 2, borderTop: `1px solid ${Z.bd}` }}>
                          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 0 2px" }}>Ads under this contract ({ct.ads.length})</div>
                          {ct.ads.map(a => (
                            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: FS.xs, color: Z.tm, borderBottom: `1px solid ${Z.bd}20` }}>
                              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ color: Z.td, width: 72 }}>
                                  {a.issueId && a.publication
                                    ? <EntityLink onClick={nav.toFlatplan(a.publication, a.issueId)} muted>{a.date || "—"}</EntityLink>
                                    : (a.date || "—")}
                                </span>
                                <span style={{ color: Z.tx, fontWeight: FW.semi }}>
                                  {a.publication
                                    ? <EntityLink onClick={nav.toIssueDesign(a.publication, a.issueId)}>{pn(a.publication)}</EntityLink>
                                    : pn(a.publication)}
                                </span>
                                <span>
                                  <EntityLink onClick={nav.toAdProjectForSale(a.id)} muted noUnderline>{a.size || a.type || "Ad"}</EntityLink>
                                </span>
                              </span>
                              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <TearsheetCell sale={a} client={vc} setSales={setSales} />
                                <span style={{ fontWeight: FW.heavy, color: Z.tx, minWidth: 70, textAlign: "right" }}>${(a.amount || 0).toLocaleString()}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {ctOpen && ct.ads.length === 0 && <div style={{ padding: "4px 14px 10px 41px", fontSize: FS.micro, color: Z.td, borderTop: `1px solid ${Z.bd}` }}>No ads fulfilled yet against this contract.</div>}
                    </div>
                  );
                })}

                {/* Standalone ads */}
                {yr.standaloneSales.length > 0 && (
                  <div style={{ marginTop: yr.contracts.length > 0 ? 4 : 0 }}>
                    <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, paddingLeft: 4 }}>Standalone Ad Orders ({yr.standaloneSales.length})</div>
                    <div style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "4px 10px" }}>
                      {yr.standaloneSales.map(a => (
                        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: FS.xs, borderBottom: `1px solid ${Z.bd}20` }}>
                          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <Ic.tag size={10} color={Z.td} />
                            <span style={{ color: Z.td, width: 72 }}>
                              {a.issueId && a.publication
                                ? <EntityLink onClick={nav.toFlatplan(a.publication, a.issueId)} muted>{a.date || "—"}</EntityLink>
                                : (a.date || "—")}
                            </span>
                            <span style={{ color: Z.tx, fontWeight: FW.semi }}>
                              {a.publication
                                ? <EntityLink onClick={nav.toIssueDesign(a.publication, a.issueId)}>{pn(a.publication)}</EntityLink>
                                : pn(a.publication)}
                            </span>
                            <span style={{ color: Z.tm }}>
                              <EntityLink onClick={nav.toAdProjectForSale(a.id)} muted noUnderline>{a.size || a.type || "Ad"}</EntityLink>
                            </span>
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <TearsheetCell sale={a} setSales={setSales} />
                            <span style={{ fontWeight: FW.heavy, color: Z.tx, minWidth: 70, textAlign: "right" }}>${(a.amount || 0).toLocaleString()}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Orphan / reappeared proposals */}
                {yr.proposals.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, paddingLeft: 4 }}>Proposals ({yr.proposals.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {yr.proposals.map(p => (
                        <div key={p.id} onClick={() => { if (onNavTo) onNavTo("Proposals"); if (onSetViewPropId) setTimeout(() => onSetViewPropId(p.id), 50); }}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: p.status === "Draft" ? Z.wa + "10" : Z.bg, border: `1px solid ${p.status === "Draft" ? Z.wa + "40" : Z.bd}`, borderRadius: Ri, cursor: "pointer" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                            <Ic.file size={11} color={Z.tm} />
                            <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                            <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase" }}>{p.status}</span>
                            {p._reappeared && <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.da, background: Z.da + "15", padding: "1px 6px", borderRadius: Ri }}>Contract cancelled</span>}
                          </div>
                          <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac }}>${(p.total || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
