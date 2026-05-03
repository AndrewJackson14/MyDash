import { Z, COND, FS, FW, Ri, INV } from "../../../../lib/theme";
import { Btn } from "../../../../components/ui";

const serif = "'Playfair Display',Georgia,serif";

// Profile header — name, status, credit-hold toggle, industry tags,
// lifetime spend, last-contact, interested-pubs, lapsed-reason flag.
// Compact: avatar + everything beside it.
export default function HeaderCard({
  vc, primaryContact, clientStatus, stColor,
  vcIndustries, daysSinceContact, comms, pubs,
  setClients, persist, appData,
  fmtD,
}) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{
        width: 56, height: 56, borderRadius: Ri,
        background: `hsl(${Math.abs([...(vc.name || "")].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360}, 45%, 40%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: FS.title, fontWeight: FW.black, color: INV.light, flexShrink: 0,
      }}>{(vc.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2)}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: FS.xxl, fontWeight: FW.black, color: Z.tx, fontFamily: serif }}>{primaryContact.name || vc.name}</h2>
          <span style={{ display: "inline-flex", padding: "3px 10px", borderRadius: Ri, fontSize: FS.xs, fontWeight: FW.heavy, background: stColor.bg, color: stColor.text, letterSpacing: 0.5, textTransform: "uppercase" }}>{clientStatus}</span>
          <button
            type="button"
            onClick={async () => {
              const hold = !vc.creditHold;
              let reason = null;
              if (hold) {
                reason = window.prompt("Credit hold reason (e.g. 60+ days past due, bounced payment):");
                if (reason === null) return;
              }
              setClients(cl => cl.map(c => c.id === vc.id ? { ...c, creditHold: hold, creditHoldReason: reason } : c));
              persist(() => appData.updateClient(vc.id, { creditHold: hold, creditHoldReason: reason }));
            }}
            title={vc.creditHold ? (vc.creditHoldReason ? `Credit Hold — ${vc.creditHoldReason}. Click to release.` : "Credit Hold Active — click to release") : "Toggle Credit Hold"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 10px", borderRadius: Ri, cursor: "pointer",
              fontSize: FS.xs, fontWeight: FW.heavy, fontFamily: COND,
              letterSpacing: 0.5, textTransform: "uppercase",
              background: vc.creditHold ? Z.da : "transparent",
              color: vc.creditHold ? INV.light : Z.td,
              border: `1px solid ${vc.creditHold ? Z.da : Z.bd}`,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            Credit Hold
          </button>
        </div>
        <div style={{ fontSize: 15, fontWeight: FW.semi, color: Z.tm, fontFamily: COND, marginTop: 1 }}>{vc.name}{primaryContact.name ? ` · ${primaryContact.role || "Contact"}` : ""}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          {vcIndustries.length > 0 && vcIndustries.map(ind => <span key={ind} style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.pu, background: Z.pu + "14", padding: "2px 8px", borderRadius: Ri }}>{ind}</span>)}
          {vcIndustries.length === 0 && <span style={{ fontSize: FS.micro, fontWeight: FW.semi, color: Z.td, background: Z.sa, padding: "2px 8px", borderRadius: Ri }}>No industry set</span>}
          {vc.leadSource && <span style={{ fontSize: FS.micro, fontWeight: FW.semi, color: Z.tm, background: Z.sa, padding: "2px 8px", borderRadius: Ri }}>via {vc.leadSource}</span>}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          {vc.totalSpend > 0 && <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.ac }}>Lifetime: ${vc.totalSpend?.toLocaleString()}</span>}
          {daysSinceContact !== null && <span style={{ fontSize: FS.base, color: daysSinceContact > 14 ? Z.da : daysSinceContact > 7 ? Z.wa : Z.ac, fontWeight: FW.bold }}>Last touch: {daysSinceContact === 0 ? "today" : daysSinceContact + "d ago"} ({comms[0]?.type})</span>}
          {daysSinceContact === null && <span style={{ fontSize: FS.base, color: Z.da, fontWeight: FW.bold }}>No contact logged</span>}
        </div>
        {(vc.interestedPubs || []).length > 0 && (
          <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 6 }}>
            <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginRight: 2 }}>Interested:</span>
            {(vc.interestedPubs || []).map(pid => {
              const pub = pubs.find(p => p.id === pid);
              return pub ? <span key={pid} style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.tx, background: Z.sa, padding: "2px 6px", borderRadius: Ri }}>{pub.name.split(" ").map(w => w[0]).join("")}</span> : null;
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Flag:</span>
          <select
            value={vc.lapsedReason || ""}
            onChange={e => {
              const v = e.target.value || null;
              setClients(cl => cl.map(c => c.id === vc.id ? { ...c, lapsedReason: v } : c));
              persist(() => appData.updateClient(vc.id, { lapsedReason: v }));
            }}
            style={{ background: vc.lapsedReason ? Z.wa + "15" : Z.bg, border: `1px solid ${vc.lapsedReason ? Z.wa : Z.bd}`, borderRadius: Ri, padding: "3px 8px", color: vc.lapsedReason ? Z.wa : Z.td, fontSize: FS.xs, fontWeight: FW.semi, fontFamily: COND, cursor: "pointer", outline: "none" }}
          >
            <option value="">Not flagged</option>
            <option value="out_of_business">Out of Business</option>
            <option value="moved">Moved Out of Area</option>
            <option value="out_of_market">Out of Market</option>
            <option value="duplicate">Duplicate</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
    </div>
  );
}
