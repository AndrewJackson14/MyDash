import { Z, COND, DISPLAY, FS, FW, R } from "../../../../lib/theme";
import { Badge, GlassCard, cardSurface } from "../../../../components/ui";
import { fmtTimeRelative } from "../../../../lib/formatters";
import { cn as cnHelper } from "../SalesCRM.helpers";

// Proposals list view — left rail of the Proposals tab. Click a row to
// open <ProposalDetail>. The wider tab also has a viewPropId-driven
// detail mode; the parent picks which one to render based on viewPropId.
//
// Wave 2: extracted from SalesCRM monolith. Helper propPubNames lives
// here because it only matters in the proposals list/detail.
export const propPubNames = (p) => [...new Set((p.lines || []).map(l => l.pubName))].join(", ");

export default function ProposalsTab({
  proposals, propStatus, propSearch, clientsById, setViewPropId,
}) {
  const cn = (id) => cnHelper(id, clientsById);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* METRICS BAR */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 4 }}>
        {[
          ["Proposed", "$" + (proposals.filter(p => p.status === "Sent" || p.status === "Under Review").reduce((s, p) => s + (p.total || 0), 0) / 1000).toFixed(0) + "K"],
          ["Signed", "$" + (proposals.filter(p => p.status === "Signed & Converted").reduce((s, p) => s + (p.total || 0), 0) / 1000).toFixed(0) + "K"],
          ["Conversion", Math.round(proposals.filter(p => p.status === "Signed & Converted").length / Math.max(1, proposals.filter(p => p.status !== "Draft").length) * 100) + "%"],
          ["Avg Deal", "$" + Math.round(proposals.filter(p => p.total > 0).reduce((s, p) => s + p.total, 0) / Math.max(1, proposals.filter(p => p.total > 0).length)).toLocaleString()],
        ].map(([l, v]) => (
          <div key={l} style={{ ...cardSurface(), borderRadius: R, padding: "10px 14px" }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div>
          </div>
        ))}
      </div>
      {(() => {
        let fp = [...proposals].sort((a, b) => (b.date || b.sentAt || "").localeCompare(a.date || a.sentAt || ""));
        if (propStatus === "all") fp = fp.filter(p => p.status !== "Cancelled");
        else fp = fp.filter(p => p.status === propStatus);
        if (propSearch) {
          const q = propSearch.toLowerCase();
          fp = fp.filter(p => (p.name || "").toLowerCase().includes(q) || cn(p.clientId).toLowerCase().includes(q) || propPubNames(p).toLowerCase().includes(q));
        }
        return fp.length === 0 ? (
          <GlassCard style={{ textAlign: "center", padding: 24, color: Z.td }}>No proposals match filters</GlassCard>
        ) : fp.map(p => (
          <div key={p.id} onClick={() => setViewPropId(p.id)} style={{ ...cardSurface(), borderRadius: R, padding: 16, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>
                  {p.source === "self_serve" && <span title="Self-serve submission" style={{ marginRight: 6 }}>🛒</span>}
                  {p.name}
                </span>
                <div style={{ fontSize: FS.sm, color: Z.tm }}>{cn(p.clientId)} · {p.lines.length} items</div>
                <div style={{ fontSize: FS.sm, color: Z.ac }}>{propPubNames(p)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su }}>${p.total.toLocaleString()}</span>
                <Badge status={p.status} small />
                {p.sentAt && (
                  <span title={`Sent ${new Date(p.sentAt).toLocaleString()}${p.sentTo?.length ? `\nTo: ${p.sentTo.join(", ")}` : ""}`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 3,
                      padding: "2px 7px", borderRadius: 10,
                      fontSize: FS.micro, fontWeight: FW.heavy, fontFamily: COND,
                      textTransform: "uppercase", letterSpacing: 0.4,
                      background: Z.ss, color: Z.go, whiteSpace: "nowrap",
                    }}>{`✔ Sent ${fmtTimeRelative(p.sentAt)}`}</span>
                )}
              </div>
            </div>
          </div>
        ));
      })()}
    </div>
  );
}
