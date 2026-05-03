import { Z, COND, FS, FW, Ri, R } from "../../../../lib/theme";
import { Card } from "../../../../components/ui";

// eBlast campaigns linked to the client (newsletter_drafts.draft_type='eblast').
// Surfaces status + open/click rates so the rep can speak to performance.
export default function EblastsCard({ clientEblasts, pn }) {
  if (clientEblasts.length === 0) return null;
  return (
    <Card style={{ borderLeft: `3px solid ${Z.pu}`, marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>eBlast Campaigns</span>
        <span style={{ fontSize: FS.xs, color: Z.td }}>{clientEblasts.length} campaign{clientEblasts.length !== 1 ? "s" : ""}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {clientEblasts.map(e => {
          const openRate = e.recipient_count > 0 ? Math.round((e.open_count / e.recipient_count) * 100) : 0;
          const clickRate = e.recipient_count > 0 ? Math.round((e.click_count / e.recipient_count) * 100) : 0;
          const statusColor = e.status === "sent" ? Z.su : e.status === "failed" ? Z.da : e.status === "approved" ? Z.ac : Z.tm;
          return (
            <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 90px 90px", gap: 10, alignItems: "center", padding: "6px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
              <div>
                <div style={{ fontWeight: FW.bold, color: Z.tx }}>{e.subject || "(no subject)"}</div>
                <div style={{ fontSize: FS.xs, color: Z.td }}>{pn(e.publication_id)}{e.sent_at ? ` · ${e.sent_at.slice(0, 10)}` : ""}</div>
              </div>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: statusColor, textTransform: "uppercase", fontFamily: COND }}>{e.status}</span>
              <span style={{ fontSize: FS.xs, color: Z.tm }}>{(e.recipient_count || 0).toLocaleString()} sent</span>
              <span style={{ fontSize: FS.xs, color: Z.tm }}>{e.status === "sent" ? `${openRate}% open` : "—"}</span>
              <span style={{ fontSize: FS.xs, color: Z.tm }}>{e.status === "sent" ? `${clickRate}% click` : "—"}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
