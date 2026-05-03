import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../../../../lib/theme";
import { Btn, Card, Sel } from "../../../../components/ui";
import { CONTACT_ROLES } from "../../../../constants";

// Left column of the two-column layout — Relationship Notes, Client
// Intelligence (metrics + spending pattern + product adoption + revenue
// by pub), Client Satisfaction (surveys), Contacts (per-contact edit).
export default function LeftColumn({
  vc, closedCS, activeCS, avgDeal, yearsAsClient,
  lastAdDate, lastContractDate, firstSaleDate,
  monthlySpend, maxMonthSpend, monthNames, peakMonth, quietMonth,
  hasPrint, hasDigital, hasSponsored, cS,
  revByPub, maxPubRev,
  surveys, avgScore,
  appData, persist, updClient, updCt, flushCt,
  onOpenEditClient, fmtD,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Relationship Notes */}
      <Card style={{ borderLeft: `3px solid ${Z.wa}` }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Relationship Notes</div>
        <textarea
          value={vc.notes || ""}
          onChange={e => updClient("notes", e.target.value)}
          placeholder="Personal notes — preferences, interests, family, best time to call, how they like to be contacted, what matters to them..."
          style={{ width: "100%", minHeight: 120, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: 10, color: Z.tx, fontSize: FS.md, outline: "none", resize: "vertical", fontFamily: "'Source Sans 3',sans-serif", lineHeight: 1.5, boxSizing: "border-box" }}
        />
      </Card>

      {/* Client Intelligence */}
      <Card>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Client Intelligence</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
          {[
            { label: "Total Ads", value: closedCS.length },
            { label: "Avg Deal", value: `$${avgDeal.toLocaleString()}` },
            { label: "Years", value: yearsAsClient > 0 ? yearsAsClient : "New" },
            { label: "Active Deals", value: activeCS.length },
          ].map(m => (
            <div key={m.label} style={{ textAlign: "center", padding: 16, background: Z.bg, borderRadius: Ri }}>
              <div style={{ fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{m.value}</div>
              <div style={{ fontSize: 9, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[
            { label: "Last Ad Placed", value: fmtD(lastAdDate) },
            { label: "Last Contract Signed", value: fmtD(lastContractDate) },
            { label: "First Purchase", value: fmtD(firstSaleDate) },
          ].map(d => (
            <div key={d.label} style={{ padding: 16, background: Z.bg, borderRadius: Ri }}>
              <div style={{ fontSize: 9, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>{d.label}</div>
              <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx, marginTop: 2 }}>{d.value}</div>
            </div>
          ))}
        </div>
        {closedCS.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Spending Pattern</div>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 50 }}>
              {monthlySpend.map((v, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: "100%", background: v > 0 ? (i === peakMonth ? Z.ac : Z.as) : Z.bg, borderRadius: Ri, height: `${Math.max(4, (v / maxMonthSpend) * 40)}px`, transition: "height 0.3s" }} />
                  <span style={{ fontSize: 8, color: i === peakMonth ? Z.ac : Z.td, fontWeight: i === peakMonth ? 800 : 400 }}>{monthNames[i]}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 4 }}>Peak: <span style={{ fontWeight: FW.bold, color: Z.ac }}>{monthNames[peakMonth]}</span>{monthlySpend[quietMonth] === 0 && <span> · Quiet: <span style={{ fontWeight: FW.bold, color: Z.wa }}>{monthNames[quietMonth]}</span></span>}</div>
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Product Adoption</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "Print Ads", active: hasPrint },
              { label: "Digital/Web", active: hasDigital },
              { label: "Sponsored Content", active: hasSponsored },
              { label: "Newsletter", active: cS.some(s => s.productType === "newsletter") },
              { label: "E-Blast", active: cS.some(s => s.productType === "eblast") },
              { label: "Creative Services", active: cS.some(s => s.productType === "creative") },
            ].map(p => (
              <span key={p.label} style={{ fontSize: FS.xs, fontWeight: FW.bold, padding: "3px 10px", borderRadius: Ri, background: p.active ? Z.as : Z.bg, color: p.active ? Z.ac : Z.td, border: `1px solid ${p.active ? Z.ac : Z.bd}` }}>
                {p.active ? "✓ " : ""}{p.label}
              </span>
            ))}
          </div>
        </div>
        {revByPub.length > 0 && (
          <div>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Revenue by Publication</div>
            {revByPub.map(r => (
              <div key={r.pub.id} style={{ marginBottom: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{r.pub.name}</span>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac }}>${r.rev.toLocaleString()}</span>
                </div>
                <div style={{ height: 4, background: Z.bg, borderRadius: Ri, marginTop: 2 }}>
                  <div style={{ height: "100%", borderRadius: Ri, width: `${(r.rev / maxPubRev) * 100}%`, background: Z.tm }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Client Satisfaction */}
      <Card style={{ borderLeft: `3px solid ${avgScore && avgScore >= 4 ? Z.su : avgScore && avgScore >= 3 ? Z.wa : avgScore ? Z.da : Z.bd}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Client Satisfaction</div>
          {avgScore && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: FS.title, fontWeight: FW.black, color: avgScore >= 4 ? Z.su : avgScore >= 3 ? Z.wa : Z.da, fontFamily: DISPLAY }}>{avgScore}</span>
              <span style={{ fontSize: FS.xs, color: Z.td }}>/5 avg ({surveys.length} survey{surveys.length !== 1 ? "s" : ""})</span>
            </div>
          )}
        </div>
        {surveys.length === 0
          ? <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.base, background: Z.bg, borderRadius: Ri }}>No survey responses yet. Surveys auto-send 7 days after ad publication.</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {surveys.slice(0, 5).map((sv, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
                <div>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{sv.publication} — {sv.issue || "Ad Survey"}</div>
                  <div style={{ fontSize: FS.xs, color: Z.tm }}>{fmtD(sv.date)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map(n => <span key={n} style={{ fontSize: FS.md, color: n <= (sv.overallScore || 0) ? Z.tx : Z.bd }}>★</span>)}
                </div>
              </div>
            ))}
          </div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.sm, color: Z.tm, cursor: "pointer" }}>
            <input type="checkbox" checked={vc.surveyAutoSend !== false} onChange={e => updClient("surveyAutoSend", e.target.checked)} />
            Auto-send surveys (7 days after pub)
          </label>
        </div>
      </Card>

      {/* Contacts */}
      <Card style={{ borderLeft: `3px solid ${Z.ac}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Contacts</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => persist(() => appData.insertClientContact(vc.id, { name: "", email: "", phone: "", role: "Other" }))} style={{ background: "none", border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", color: Z.ac, fontSize: FS.sm, fontWeight: FW.bold, padding: "5px 10px", minHeight: 28 }}>+ Add</button>
            {onOpenEditClient && <button onClick={() => onOpenEditClient(vc)} style={{ background: "none", border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", color: Z.tm, fontSize: FS.sm, fontWeight: FW.semi, padding: "5px 10px", minHeight: 28 }}>Edit</button>}
          </div>
        </div>
        {(vc.contacts || []).map((ct, idx) => (
          <div key={ct.id || idx} style={{ background: Z.bg, borderRadius: R, padding: 16, marginBottom: 4 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
              <Sel value={ct.role} onChange={e => { updCt(idx, "role", e.target.value); flushCt(idx, { role: e.target.value }); }} options={CONTACT_ROLES.map(r => ({ value: r, label: r }))} style={{ padding: "2px 24px 2px 6px", textTransform: "uppercase" }} />
              {idx === 0 && <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.wa, background: Z.ws, padding: "1px 5px", borderRadius: Ri }}>PRIMARY</span>}
            </div>
            <input value={ct.name} onChange={e => updCt(idx, "name", e.target.value)} onBlur={e => flushCt(idx, { name: e.target.value })} placeholder="Name" style={{ display: "block", width: "100%", background: "none", border: "none", color: Z.tx, fontSize: FS.md, fontWeight: FW.semi, fontFamily: COND, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 10, fontSize: FS.sm, color: Z.tm }}><span>{ct.email}</span>{ct.phone && <span>· {ct.phone}</span>}</div>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Relationship Notes</div>
              <textarea
                value={ct.notes || ""}
                onChange={e => updCt(idx, "notes", e.target.value)}
                onBlur={e => flushCt(idx, { notes: e.target.value })}
                placeholder="Preferred channel, family, interests, best time to call…"
                style={{ width: "100%", minHeight: 56, background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: 8, color: Z.tx, fontSize: FS.sm, outline: "none", resize: "vertical", fontFamily: "'Source Sans 3',sans-serif", lineHeight: 1.4, boxSizing: "border-box" }}
              />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
