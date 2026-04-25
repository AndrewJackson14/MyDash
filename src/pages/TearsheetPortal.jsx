// ============================================================
// TearsheetPortal — public, no-auth tearsheet view for advertisers.
// Reached at /tearsheet/<token>. Token comes from sales.tearsheet_token
// (auto-generated on every sale row). Reads via the get_tearsheet
// SECURITY DEFINER RPC so we don't have to open up sales/print_runs
// to anon RLS.
//
// Same standalone-shell pattern as ProofApproval.jsx — own theme
// constants, own header/footer, no app sidebar.
// ============================================================
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fmtDateLong as fmtDate } from "../lib/formatters";

const C = {
  bg: "#F6F7F9", sf: "#FFFFFF", tx: "#0D0F14", tm: "#525E72", td: "#8994A7",
  bd: "#E2E6ED", ac: "#2563EB", go: "#16A34A", da: "#DC2626", wa: "#D97706",
  sa: "#F1F3F6",
};

export default function TearsheetPortal() {
  const token = window.location.pathname.split("/tearsheet/")[1];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) { setError("Invalid tearsheet link."); setLoading(false); return; }
    (async () => {
      try {
        const { data: row, error: rpcErr } = await supabase.rpc("get_tearsheet", { p_token: token });
        if (rpcErr) throw rpcErr;
        if (!row) {
          setError("This tearsheet link is invalid or has expired.");
          setLoading(false);
          return;
        }
        setData(row);
      } catch (err) {
        console.error("Tearsheet load error:", err);
        setError("Couldn't load this tearsheet. Try again later or contact your sales rep.");
      }
      setLoading(false);
    })();
  }, [token]);

  if (loading) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ textAlign: "center", padding: 60, color: C.tm }}>Loading tearsheet…</div>
      </div>
    </div>
  );

  if (error || !data) return (
    <div style={styles.page}>
      <div style={{ ...styles.card, textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Tearsheet not available</div>
        <div style={{ fontSize: 14, color: C.tm }}>{error || "This link is invalid or the issue hasn't been printed yet."}</div>
      </div>
    </div>
  );

  const pdfReady = !!data.tearsheet_pdf_url;
  const accent = data.pub_primary_color || C.tx;

  return (
    <div style={styles.page}>
      {/* Header — branded by publication */}
      <div style={{ ...styles.header, borderBottom: `3px solid ${accent}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: 960, margin: "0 auto" }}>
          {data.pub_logo_url
            ? <img src={data.pub_logo_url} alt={data.pub_name || ""} style={{ height: 36, maxWidth: 160, objectFit: "contain" }} />
            : <div style={{
                width: 36, height: 36, borderRadius: 4,
                background: accent, color: "#FFFFFF",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 900, fontSize: 16,
              }}>{(data.pub_name || "13").charAt(0).toUpperCase()}</div>}
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.tx }}>{data.pub_name || "13 Stars Media"}</div>
            <div style={{ fontSize: 12, color: C.tm }}>Tearsheet · {data.client_name}</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={styles.body}>
        <div style={styles.metaRow}>
          <div>
            <div style={styles.metaLabel}>Issue</div>
            <div style={styles.metaValue}>{data.issue_label || data.issue_date}</div>
          </div>
          <div>
            <div style={styles.metaLabel}>Page</div>
            <div style={styles.metaValue}>{data.page}</div>
          </div>
          {data.ad_size && (
            <div>
              <div style={styles.metaLabel}>Size</div>
              <div style={styles.metaValue}>{data.ad_size}</div>
            </div>
          )}
          {data.shipped_at && (
            <div>
              <div style={styles.metaLabel}>Press date</div>
              <div style={styles.metaValue}>{fmtDate(String(data.shipped_at).slice(0, 10))}</div>
            </div>
          )}
        </div>

        {pdfReady ? (
          <>
            <div style={styles.heroPanel}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
                  Your ad on page {data.page}
                </div>
                <a
                  href={data.tearsheet_pdf_url}
                  download
                  style={{
                    display: "inline-block", background: accent, color: "#FFFFFF",
                    textDecoration: "none", padding: "10px 22px", borderRadius: 8,
                    fontWeight: 700, fontSize: 14,
                  }}
                >
                  ↓ Download PDF
                </a>
              </div>
              <iframe
                src={data.tearsheet_pdf_url}
                style={{ width: "100%", height: 720, border: "none", borderRadius: 6, background: C.sa }}
                title={`Page ${data.page} tearsheet`}
              />
            </div>

            <div style={styles.shareRow}>
              <span style={{ fontSize: 13, color: C.tm }}>Share this tearsheet:</span>
              <input
                readOnly
                value={typeof window !== "undefined" ? window.location.href : ""}
                onFocus={e => e.target.select()}
                style={{ flex: 1, padding: "8px 12px", border: `1px solid ${C.bd}`, borderRadius: 6, background: C.sf, color: C.tx, fontSize: 12, fontFamily: "ui-monospace, monospace" }}
              />
              <button
                onClick={() => navigator.clipboard?.writeText(window.location.href)}
                style={{ padding: "8px 14px", border: `1px solid ${C.bd}`, borderRadius: 6, background: C.sf, color: C.tx, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Copy link
              </button>
            </div>
          </>
        ) : (
          <div style={{ ...styles.heroPanel, textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🖨️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.tx, marginBottom: 8 }}>
              Tearsheet coming soon
            </div>
            <div style={{ fontSize: 14, color: C.tm, lineHeight: 1.55, maxWidth: 480, margin: "0 auto" }}>
              {data.shipped_at
                ? `${data.pub_name} ${data.issue_label || ""} went to press on ${fmtDate(String(data.shipped_at).slice(0, 10))}. Per-page tearsheets are still being generated — check back shortly.`
                : `${data.pub_name} ${data.issue_label || ""} hasn't gone to press yet. We'll have your tearsheet ready once the issue ships.`}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span>© {new Date().getFullYear()} 13 Stars Media Group</span>
        <span style={{ color: C.td }}>·</span>
        <span>Powered by MyDash</span>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh", background: C.bg,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    display: "flex", flexDirection: "column",
  },
  header: {
    padding: "20px 28px", background: C.sf,
  },
  body: {
    flex: 1, padding: "28px 24px", maxWidth: 960, width: "100%",
    margin: "0 auto", boxSizing: "border-box",
    display: "flex", flexDirection: "column", gap: 18,
  },
  metaRow: {
    display: "flex", flexWrap: "wrap", gap: 24,
    padding: "16px 20px", background: C.sf,
    border: `1px solid ${C.bd}`, borderRadius: 8,
  },
  metaLabel: {
    fontSize: 10, fontWeight: 700, color: C.td,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 16, fontWeight: 700, color: C.tx, marginTop: 2,
  },
  heroPanel: {
    padding: 20, background: C.sf,
    border: `1px solid ${C.bd}`, borderRadius: 8,
  },
  shareRow: {
    display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
    background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8, flexWrap: "wrap",
  },
  footer: {
    padding: "20px 28px", textAlign: "center", fontSize: 11, color: C.tm,
    borderTop: `1px solid ${C.bd}`, display: "flex", justifyContent: "center", gap: 8,
  },
  card: {
    maxWidth: 500, margin: "80px auto", background: C.sf,
    borderRadius: 12, border: `1px solid ${C.bd}`, overflow: "hidden",
  },
};
