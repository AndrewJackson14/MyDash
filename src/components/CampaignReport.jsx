// ============================================================
// CampaignReport — analytics dashboard for a single newsletter
// or eBlast send. One component serves two surfaces:
//
//   mode="internal" — rendered inline inside NewsletterPage, the
//     team sees everything plus Share + Download PDF buttons.
//   mode="public"   — rendered at /r/:token (no auth). Fed via
//     get_campaign_report(uuid) RPC so the advertiser sees the
//     same visual report without any table access.
//
// The two modes differ only in: fetch path, what they render in
// the top-right toolbar, and internal-only notes.
// ============================================================
import { useState, useEffect, useMemo, useCallback } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Btn, GlassCard } from "./ui";
import { supabase } from "../lib/supabase";
import { fmtDate, fmtTime } from "../lib/formatters";
import { TokenAdminMenu } from "./TokenAdminMenu";

// ─── Small helpers ──────────────────────────────────────────
const pct = (num, denom) => (denom > 0 ? Math.round((num / denom) * 1000) / 10 : 0);
const fmtPct = (v) => `${v.toFixed(1)}%`;
const fmtNum = (v) => (v || 0).toLocaleString();

// Color tokens for the stat cards — paired with Z theme so they
// look right in light + dark mode without inline dark overrides.
const STAT_COLORS = {
  sent:      Z.ac,
  delivered: Z.su,
  opens:     "#0EA5E9",
  clicks:    "#8B5CF6",
  bounces:   Z.wa,
  complaints: Z.da,
};

// ─── SVG Timeseries Chart ──────────────────────────────────
// Two-line chart of opens + clicks per hour over the first 48h.
// No chart library: the repo already rolls SVG bespoke (Analytics.jsx),
// keeping the pattern avoids bundle bloat for one chart.
function EngagementChart({ timeseries }) {
  const data = timeseries || [];
  const maxY = Math.max(1, ...data.map(d => Math.max(d.opens || 0, d.clicks || 0)));
  const W = 760, H = 220, PX = 36, PY = 20;
  const xFor = (h) => PX + (h / 47) * (W - PX - 12);
  const yFor = (v) => H - PY - (v / maxY) * (H - PY - 12);
  const path = (key) => data.map((d, i) =>
    `${i === 0 ? "M" : "L"}${xFor(d.hour_offset).toFixed(1)},${yFor(d[key] || 0).toFixed(1)}`
  ).join(" ");

  const yTicks = [0, Math.ceil(maxY / 2), maxY];
  const xTicks = [0, 6, 12, 18, 24, 30, 36, 42];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {yTicks.map(t => (
        <g key={t}>
          <line x1={PX} x2={W - 12} y1={yFor(t)} y2={yFor(t)} stroke={Z.bd} strokeDasharray="2,3" />
          <text x={PX - 6} y={yFor(t) + 4} textAnchor="end" fontSize="10" fill={Z.td} fontFamily="-apple-system,sans-serif">{t}</text>
        </g>
      ))}
      {xTicks.map(h => (
        <text key={h} x={xFor(h)} y={H - 4} textAnchor="middle" fontSize="10" fill={Z.td} fontFamily="-apple-system,sans-serif">
          {h === 0 ? "Sent" : `${h}h`}
        </text>
      ))}
      <path d={path("opens")} fill="none" stroke={STAT_COLORS.opens} strokeWidth="2" />
      <path d={path("clicks")} fill="none" stroke={STAT_COLORS.clicks} strokeWidth="2" />
      {data.filter(d => (d.opens || 0) > 0).map((d, i) => (
        <circle key={`o-${i}`} cx={xFor(d.hour_offset)} cy={yFor(d.opens)} r="2.5" fill={STAT_COLORS.opens} />
      ))}
      {data.filter(d => (d.clicks || 0) > 0).map((d, i) => (
        <circle key={`c-${i}`} cx={xFor(d.hour_offset)} cy={yFor(d.clicks)} r="2.5" fill={STAT_COLORS.clicks} />
      ))}
    </svg>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: R, border: `1px solid ${Z.bd}`, background: Z.sf, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: FW.black, color: color || Z.tx, fontFamily: DISPLAY, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function CampaignReport({ mode = "internal", draftId = null, shareToken = null, onBack = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recipientRows, setRecipientRows] = useState([]); // internal only
  const [copied, setCopied] = useState(false);

  // ─── Load ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "public") {
        const { data: report, error: rpcErr } = await supabase.rpc("get_campaign_report", { p_token: shareToken });
        if (rpcErr) throw rpcErr;
        if (!report) { setError("Report not found or link revoked."); setLoading(false); return; }
        setData(report);
      } else {
        // Internal: server-side aggregation via get_campaign_stats RPC.
        // Replaces the old "fetch all email_sends + count in JS" pattern
        // that silently capped at 1000 rows on PostgREST.
        const { data: report, error: rpcErr } = await supabase.rpc("get_campaign_stats", { p_draft_id: draftId, p_recipients_limit: 50 });
        if (rpcErr) throw rpcErr;
        if (!report) { setError("Draft not found."); setLoading(false); return; }
        setRecipientRows(report.recipients || []);
        setData({ draft: report.draft, stats: report.stats, timeseries: report.timeseries });
      }
    } catch (e) {
      setError(e.message || "Failed to load report");
    }
    setLoading(false);
  }, [mode, draftId, shareToken]);

  useEffect(() => { load(); }, [load]);

  // ─── Share link (internal only) ──────────────────────────
  const shareUrl = useMemo(() => {
    if (mode !== "internal" || !data?.draft?.share_token) return "";
    return `${window.location.origin}/r/${data.draft.share_token}`;
  }, [mode, data]);

  const copyShareLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ─── Render ──────────────────────────────────────────────
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontFamily: COND }}>Loading report…</div>;
  if (error)   return <div style={{ padding: 40, textAlign: "center", color: Z.da, fontFamily: COND }}>{error}</div>;
  if (!data)   return null;

  const { draft, stats, timeseries } = data;
  const openRate = pct(stats.unique_opens, stats.total_sent);
  const clickRate = pct(stats.unique_clicks, stats.total_sent);
  const deliveredRate = pct(stats.delivered + stats.unique_opens, stats.total_sent); // SES Delivery events may lag; counting opens guarantees lower-bound
  const bounceRate = pct(stats.bounces, stats.total_sent);

  return (
    <div className="campaign-report" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Print stylesheet — removes chrome + widens content when user
          chooses File → Print (or Cmd-P) → Save as PDF. */}
      <style>{`
        @media print {
          body, html { background: #fff !important; }
          .campaign-report .no-print { display: none !important; }
          .campaign-report { padding: 20px !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {onBack && <button onClick={onBack} className="no-print" style={{ background: "none", border: "none", color: Z.ac, fontSize: FS.sm, fontFamily: COND, fontWeight: FW.bold, cursor: "pointer", padding: 0, marginBottom: 6 }}>← Back to History</button>}
          <div style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>
            {draft.draft_type === "eblast" ? "eBlast Campaign" : "Newsletter"} · {draft.publication_name}
          </div>
          <h1 style={{ margin: "2px 0 4px", fontSize: 24, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, lineHeight: 1.2 }}>{draft.subject}</h1>
          {draft.advertiser_name && <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>For {draft.advertiser_name}</div>}
          <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>
            {draft.sent_at ? `Sent ${fmtDate(draft.sent_at.slice(0, 10))} at ${fmtTime(draft.sent_at)}` : "Not yet sent"}
            {draft.status && draft.status !== "sent" && (
              <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: Ri, background: Z.wa + "22", color: Z.wa, fontWeight: FW.bold, textTransform: "uppercase", fontSize: 10 }}>{draft.status}</span>
            )}
          </div>
        </div>

        {/* Actions — internal only */}
        {mode === "internal" && (
          <div className="no-print" style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            <Btn sm v="ghost" onClick={() => window.print()}>Download PDF</Btn>
            <Btn sm onClick={copyShareLink} title={shareUrl}>{copied ? "✓ Copied!" : "Copy Share Link"}</Btn>
            {draft?.id && (
              <TokenAdminMenu
                table="newsletter_drafts"
                idValue={draft.id}
                tokenColumn="share_token"
                expiresAt={draft.share_token_expires_at}
                revokedAt={draft.share_token_revoked_at}
                onChange={(patch) => setData(prev => prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev)}
              />
            )}
          </div>
        )}
      </div>

      {/* Headline stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <StatCard label="Recipients" value={fmtNum(stats.total_sent)} color={STAT_COLORS.sent} />
        <StatCard label="Opens" value={fmtNum(stats.unique_opens)} sub={`${fmtPct(openRate)} open rate`} color={STAT_COLORS.opens} />
        <StatCard label="Clicks" value={fmtNum(stats.unique_clicks)} sub={`${fmtPct(clickRate)} click rate`} color={STAT_COLORS.clicks} />
        <StatCard label="Bounces" value={fmtNum(stats.bounces)} sub={`${fmtPct(bounceRate)} bounce rate`} color={STAT_COLORS.bounces} />
        {stats.complaints > 0 && <StatCard label="Complaints" value={fmtNum(stats.complaints)} color={STAT_COLORS.complaints} />}
      </div>

      {/* Engagement chart */}
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Engagement — first 48 hours</div>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}><span style={{ display: "inline-block", width: 10, height: 3, background: STAT_COLORS.opens, marginRight: 4, verticalAlign: "middle" }}></span>Opens</span>
            <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}><span style={{ display: "inline-block", width: 10, height: 3, background: STAT_COLORS.clicks, marginRight: 4, verticalAlign: "middle" }}></span>Clicks</span>
          </div>
        </div>
        <EngagementChart timeseries={timeseries} />
        <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 6, fontStyle: "italic" }}>
          Time from send. Each point shows unique opens / clicks per hour.
        </div>
      </GlassCard>

      {/* Total interactions summary */}
      <GlassCard>
        <div style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontFamily: COND }}>Interaction Totals</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div>
            <div style={{ fontSize: FS.xs, color: Z.td, fontFamily: COND }}>Total opens (all hits)</div>
            <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx }}>{fmtNum(stats.total_opens)}</div>
            <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{stats.unique_opens > 0 ? `${(stats.total_opens / stats.unique_opens).toFixed(1)} avg per opener` : "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: FS.xs, color: Z.td, fontFamily: COND }}>Total clicks (all hits)</div>
            <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx }}>{fmtNum(stats.total_clicks)}</div>
            <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{stats.unique_clicks > 0 ? `${(stats.total_clicks / stats.unique_clicks).toFixed(1)} avg per clicker` : "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: FS.xs, color: Z.td, fontFamily: COND }}>Click-to-open rate</div>
            <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx }}>{stats.unique_opens > 0 ? fmtPct(pct(stats.unique_clicks, stats.unique_opens)) : "—"}</div>
            <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>Of those who opened</div>
          </div>
        </div>
      </GlassCard>

      {/* Per-recipient breakdown — internal only */}
      {mode === "internal" && recipientRows.length > 0 && (
        <GlassCard className="no-print">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Per-recipient activity</div>
            <div style={{ fontSize: FS.xs, color: Z.td, fontFamily: COND }}>Top 50 by last activity · internal only</div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm }}>
              <thead>
                <tr>
                  {["Recipient", "Status", "Sent", "Opened", "Clicked", "Activity"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.6, borderBottom: `1px solid ${Z.bd}`, fontFamily: COND }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...recipientRows]
                  .sort((a, b) => {
                    const la = new Date(a.last_clicked_at || a.last_opened_at || a.sent_at || 0).getTime();
                    const lb = new Date(b.last_clicked_at || b.last_opened_at || b.sent_at || 0).getTime();
                    return lb - la;
                  })
                  .slice(0, 50)
                  .map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${Z.bd}30` }}>
                      <td style={{ padding: "5px 10px", color: Z.tx, fontFamily: COND }}>{r.recipient_email}</td>
                      <td style={{ padding: "5px 10px" }}>
                        <span style={{ fontSize: 10, fontWeight: FW.bold, color: r.status === "sent" || r.status === "delivered" ? Z.su : r.status === "bounced" || r.status === "complained" ? Z.da : Z.tm, textTransform: "uppercase", fontFamily: COND }}>{r.status}</span>
                      </td>
                      <td style={{ padding: "5px 10px", color: Z.tm, fontSize: FS.xs, fontFamily: COND }}>{r.sent_at ? fmtTime(r.sent_at) : "—"}</td>
                      <td style={{ padding: "5px 10px", color: r.first_opened_at ? STAT_COLORS.opens : Z.td, fontWeight: r.first_opened_at ? FW.bold : FW.normal, fontFamily: COND }}>{r.open_count || 0}</td>
                      <td style={{ padding: "5px 10px", color: r.first_clicked_at ? STAT_COLORS.clicks : Z.td, fontWeight: r.first_clicked_at ? FW.bold : FW.normal, fontFamily: COND }}>{r.click_count || 0}</td>
                      <td style={{ padding: "5px 10px", color: Z.tm, fontSize: FS.xs, fontFamily: COND }}>
                        {r.last_clicked_at ? `Clicked ${fmtTime(r.last_clicked_at)}` :
                         r.last_opened_at  ? `Opened ${fmtTime(r.last_opened_at)}`  : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Public-mode footer */}
      {mode === "public" && (
        <div style={{ marginTop: 14, padding: "12px 16px", borderTop: `1px solid ${Z.bd}`, textAlign: "center", fontSize: FS.xs, color: Z.td, fontFamily: COND }}>
          Report for {draft.advertiser_name || draft.publication_name}.
          Delivered via MyDash · {new Date().getFullYear()}.
        </div>
      )}
    </div>
  );
}
