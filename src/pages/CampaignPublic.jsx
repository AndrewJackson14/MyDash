// ============================================================
// CampaignPublic — public /r/:token shell. Extracts the token
// from the URL and hands off to CampaignReport in public mode,
// which fetches via the get_campaign_report RPC (no auth).
// ============================================================
import { Z, COND, FS, FW, DISPLAY } from "../lib/theme";
import CampaignReport from "../components/CampaignReport";

export default function CampaignPublic() {
  const token = window.location.pathname.replace(/^\/r\//, "").split("?")[0].split("/")[0];

  return (
    <div style={{
      minHeight: "100vh",
      background: Z.bg,
      padding: "20px 16px 40px",
      color: Z.tx,
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Small branded header — no login bar, no navigation, reads
            like a standalone report page the advertiser can bookmark. */}
        <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${Z.bd}` }}>
          <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>13 Stars Media</div>
          <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
            Campaign performance report
          </div>
        </div>

        {token
          ? <CampaignReport mode="public" shareToken={token} />
          : <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontFamily: COND }}>Missing report token.</div>}
      </div>
    </div>
  );
}
