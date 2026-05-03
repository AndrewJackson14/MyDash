import { Z, COND, FS, FW, Ri } from "../../../../lib/theme";
import { Btn, Card, Ic, Sel } from "../../../../components/ui";
import { COMM_TYPES, COMM_AUTHORS } from "../../../../constants";
import AssetPanel from "../../../../components/AssetPanel";
import { fmtTimeRelative } from "../../../../lib/formatters";
import PortfolioLinkButton from "../components/PortfolioLinkButton";

// Right column (sticky) — Action Center, Communication Timeline,
// Email History, Opportunity, Asset Library. Sticky-positioned so the
// next-step prompt + log-call widget stay visible while scrolling.
export default function RightColumn({
  vc, activeCS, closedCS, comms, daysSinceContact, emailLog,
  clientStatus, lastAdDate, monthlySpend, monthNames, peakMonth,
  avgDeal, peerAvgSpend, peerTopSpend, peerTopSpender, vcIndustries, industryPeers,
  crossSellPubs,
  commForm, setCommForm, addComm,
  bus, pn, currentUser,
  onOpenProposal,
}) {
  // Wave 4 Task 4.3 — every comm logs the actual signed-in rep, not a
  // hardcoded "Account Manager". Falls back only when no user is in
  // session (system writes).
  const authorName = currentUser?.name || "Account Manager";
  const cc = t => ({ Email: Z.tx, Phone: Z.tx, Text: Z.tx, Comment: Z.tm, Survey: Z.tm, Result: Z.tm })[t] || Z.tm;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 20, maxHeight: "calc(100vh - 120px)", overflow: "hidden" }}>

      {/* Action Center */}
      <Card style={{ borderLeft: `3px solid ${daysSinceContact > 7 ? Z.da : Z.ac}`, background: daysSinceContact > 14 ? Z.ds : Z.sf }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Next Step</div>
        {activeCS.length > 0
          ? <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, fontFamily: COND, marginBottom: 8 }}>{activeCS[0].nextAction ? (typeof activeCS[0].nextAction === "string" ? activeCS[0].nextAction : activeCS[0].nextAction?.label || "Follow up") : "Follow up on active deal"}{activeCS[0].nextActionDate ? ` — ${activeCS[0].nextActionDate}` : ""}</div>
          : <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tm, fontFamily: COND, marginBottom: 8 }}>No active deals — time to reach out?</div>}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <Btn sm onClick={() => onOpenProposal(vc.id)}><Ic.send size={11} /> Draft Proposal</Btn>
          {closedCS.length > 0 && <Btn sm v="secondary" onClick={() => { if (bus) bus.emit("invoice.create", { clientId: vc.id, clientName: vc.name }); }}><Ic.invoice size={11} /> Create Invoice</Btn>}
          <Btn sm v="secondary" onClick={() => setCommForm({ type: "Phone", author: authorName, note: "" })}>Log Call</Btn>
          <Btn sm v="secondary" onClick={() => setCommForm({ type: "Email", author: authorName, note: "" })}>Log Email</Btn>
          {vc.portfolioToken && <PortfolioLinkButton client={vc} />}
        </div>
      </Card>

      {/* Communication Timeline */}
      <Card style={{ borderLeft: `3px solid ${Z.pu}`, display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Relationship Timeline ({comms.length})</div>
        <div style={{ background: Z.bg === "#08090D" ? "rgba(140,150,165,0.06)" : "rgba(255,255,255,0.25)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: Ri, padding: 6, marginBottom: 6, border: `1px solid ${Z.bd}` }}>
          <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
            <Sel value={commForm.type} onChange={e => setCommForm(x => ({ ...x, type: e.target.value }))} options={[...COMM_TYPES, "Result", "Survey"].map(t => ({ value: t, label: t }))} style={{ padding: "3px 24px 3px 6px", flex: 1 }} />
            <Sel value={commForm.author} onChange={e => setCommForm(x => ({ ...x, author: e.target.value }))} options={COMM_AUTHORS.map(a => ({ value: a, label: a }))} style={{ padding: "3px 24px 3px 6px", flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            <input
              value={commForm.note}
              onChange={e => setCommForm(x => ({ ...x, note: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") addComm(); }}
              placeholder="What happened..."
              style={{ flex: 1, background: Z.sa, border: "none", borderRadius: Ri, padding: "5px 8px", color: Z.tx, fontSize: FS.base, outline: "none" }}
            />
            <Btn sm onClick={addComm}>Log</Btn>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
          {comms.map(cm => (
            <div key={cm.id} style={{ padding: "10px 14px", borderLeft: `3px solid ${cc(cm.type)}`, background: Z.bg, borderRadius: "0 2px 2px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: cc(cm.type) }}>{cm.type}</span>
                <span style={{ fontSize: FS.xs, color: Z.td }}>{cm.date} · {cm.author}</span>
              </div>
              <div style={{ fontSize: FS.base, color: Z.tx, lineHeight: 1.4, marginTop: 2 }}>{cm.note}</div>
            </div>
          ))}
          {comms.length === 0 && <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.base }}>No communication logged yet</div>}
        </div>
      </Card>

      {/* Email History */}
      <Card style={{ borderLeft: `3px solid ${Z.ac}`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Email History ({emailLog.length})</span>
          {emailLog.length > 0 && <span style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND }}>Newest first</span>}
        </div>
        {emailLog.length === 0 ? (
          <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No emails yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 220, overflowY: "auto" }}>
            {emailLog.map(e => {
              const isInbound = e.direction === "inbound";
              const statusColor = isInbound ? (Z.ac || "var(--action)")
                : e.status === "sent" ? Z.go
                  : e.status === "failed" ? Z.da
                    : e.status === "draft" ? Z.wa
                      : Z.td;
              const typeLabel = isInbound ? "← inbound" : (e.type || "email").replace(/_/g, " ");
              const counterparty = isInbound ? (e.from_email || "(unknown sender)") : e.to_email;
              return (
                <div key={e.id} style={{ padding: "7px 10px", background: isInbound ? (Z.ac || "var(--action)") + "08" : Z.bg, borderRadius: Ri, borderLeft: `2px solid ${statusColor}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: statusColor, textTransform: "uppercase", letterSpacing: 0.5 }}>{typeLabel}</span>
                    <span style={{ fontSize: FS.micro, color: Z.td }}>{fmtTimeRelative(e.created_at)}</span>
                  </div>
                  <div style={{ fontSize: FS.sm, color: Z.tx, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.subject || "(no subject)"}</div>
                  <div style={{ fontSize: FS.micro, color: Z.tm, marginTop: 1 }}>
                    {isInbound ? "from " : ""}{counterparty}
                    {!isInbound && e.status && e.status !== "sent" && <span style={{ color: statusColor, fontWeight: FW.bold, marginLeft: 6, textTransform: "uppercase" }}>· {e.status}</span>}
                  </div>
                  {e.error_message && <div style={{ fontSize: FS.micro, color: Z.da, marginTop: 2 }}>{e.error_message}</div>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Opportunity */}
      <Card style={{ borderLeft: `3px solid ${Z.or || Z.wa}`, flexShrink: 0 }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Opportunity</div>
        {(() => {
          const signals = [];
          if (clientStatus === "Renewal") signals.push({ text: "Last ordered ad runs within 30 days — renewal conversation is now", color: Z.da, icon: "🔥" });
          if (clientStatus === "Lapsed") {
            const daysSinceLast = lastAdDate ? Math.floor((new Date() - new Date(lastAdDate)) / 86400000) : null;
            signals.push({ text: `No future ads ordered${daysSinceLast ? ` · last ad ${daysSinceLast}d ago` : ""} — re-engage`, color: Z.wa, icon: "⏰" });
          }
          if (closedCS.length > 0 && monthlySpend[peakMonth] > 0) {
            const now = new Date().getMonth();
            const monthsUntilPeak = (peakMonth - now + 12) % 12;
            if (monthsUntilPeak > 0 && monthsUntilPeak <= 2) signals.push({ text: `Peak spending month (${monthNames[peakMonth]}) approaching — pitch now`, color: Z.ac, icon: "📈" });
          }
          if (avgDeal > 0 && avgDeal < peerAvgSpend * 0.6 && peerAvgSpend > 0) signals.push({ text: `Spending below industry avg — room to grow`, color: Z.wa, icon: "💡" });
          return signals.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              {signals.map((sig, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 14px", background: sig.color + "10", borderRadius: Ri, border: `1px solid ${sig.color}30` }}>
                  <span style={{ flexShrink: 0 }}>{sig.icon}</span>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: sig.color, lineHeight: 1.3 }}>{sig.text}</span>
                </div>
              ))}
            </div>
          ) : null;
        })()}
        {vcIndustries.length > 0 && industryPeers.length > 0 && (
          <div style={{ padding: 16, background: Z.bg, borderRadius: Ri, marginBottom: 10 }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Industry Benchmark ({vcIndustries[0]})</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: Z.td, textTransform: "uppercase" }}>Peer Avg Spend</div>
                <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: (vc.totalSpend || 0) >= peerAvgSpend ? Z.su : Z.wa }}>${peerAvgSpend.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: Z.td, textTransform: "uppercase" }}>Top in Category</div>
                <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.ac }}>${peerTopSpend.toLocaleString()}</div>
                {peerTopSpender && <div style={{ fontSize: FS.micro, color: Z.tm }}>{peerTopSpender.name}</div>}
              </div>
            </div>
            <div style={{ fontSize: FS.xs, color: (vc.totalSpend || 0) >= peerAvgSpend ? Z.su : Z.wa, fontWeight: FW.bold, marginTop: 4 }}>{(vc.totalSpend || 0) >= peerAvgSpend ? "Above industry average" : `$${(peerAvgSpend - (vc.totalSpend || 0)).toLocaleString()} below average`}</div>
          </div>
        )}
        {activeCS.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Active Pipeline ({activeCS.length})</div>
            {activeCS.map(s => (
              <div key={s.id} style={{ padding: "4px 0", borderBottom: `1px solid ${Z.bd}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{pn(s.publication)} · {s.type}</span>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac }}>${(s.amount || 0).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {crossSellPubs.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Not Yet Advertising In</div>
            {crossSellPubs.slice(0, 4).map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
                <div style={{ width: 4, height: 14, borderRadius: Ri, background: Z.tm }} />
                <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{p.name}</span>
                <span style={{ fontSize: FS.micro, color: Z.tm }}>{p.circ?.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Asset Library */}
      {vc?.clientCode && (
        <Card style={{ marginTop: 10 }}>
          <AssetPanel path={`clients/${vc.clientCode}/assets`} title="Asset Library" clientId={vc.id} category="client_logo" />
        </Card>
      )}
    </div>
  );
}
