// ============================================================
// ClientPortfolioPortal — public, no-auth page that aggregates a
// client's entire tearsheet history. Reached at /ads/<token> where
// token is clients.portfolio_token. Reads via the get_client_portfolio
// SECURITY DEFINER RPC.
//
// Same standalone-shell pattern as TearsheetPortal — own theme, own
// header, no app sidebar. Tearsheets group by publication and sort
// most-recent-first within each group.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { fmtDateLong as fmtDate } from "../lib/formatters";

const C = {
  bg: "#F6F7F9", sf: "#FFFFFF", tx: "#0D0F14", tm: "#525E72", td: "#8994A7",
  bd: "#E2E6ED", ac: "#2563EB", go: "#16A34A", da: "#DC2626", wa: "#D97706",
  sa: "#F1F3F6",
};

export default function ClientPortfolioPortal() {
  const token = window.location.pathname.split("/ads/")[1];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pubFilter, setPubFilter] = useState("all");

  useEffect(() => {
    if (!token) { setError("Invalid portfolio link."); setLoading(false); return; }
    (async () => {
      try {
        const { data: row, error: rpcErr } = await supabase.rpc("get_client_portfolio", { p_token: token });
        if (rpcErr) throw rpcErr;
        if (!row) {
          setError("This portfolio link is invalid or has been disabled.");
          setLoading(false);
          return;
        }
        setData(row);
      } catch (err) {
        console.error("Portfolio load error:", err);
        setError("Couldn't load this portfolio. Try again later or contact your sales rep.");
      }
      setLoading(false);
    })();
  }, [token]);

  // Group tearsheets by publication for the filter chips + section
  // headers. Respects most-recent-first within each pub.
  const grouped = useMemo(() => {
    if (!data?.tearsheets) return [];
    const map = new Map();
    for (const t of data.tearsheets) {
      const key = t.pub_id || "_unassigned";
      if (!map.has(key)) {
        map.set(key, {
          pub_id: t.pub_id,
          pub_name: t.pub_name || "Unknown publication",
          pub_logo_url: t.pub_logo_url,
          pub_primary_color: t.pub_primary_color,
          items: [],
        });
      }
      map.get(key).items.push(t);
    }
    return Array.from(map.values()).sort((a, b) => (a.pub_name || "").localeCompare(b.pub_name || ""));
  }, [data]);

  const pubsList = grouped;
  const filteredTearsheets = useMemo(() => {
    if (!data?.tearsheets) return [];
    if (pubFilter === "all") return data.tearsheets;
    return data.tearsheets.filter(t => t.pub_id === pubFilter);
  }, [data, pubFilter]);

  if (loading) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ textAlign: "center", padding: 60, color: C.tm }}>Loading your tearsheets…</div>
      </div>
    </div>
  );

  if (error || !data) return (
    <div style={styles.page}>
      <div style={{ ...styles.card, textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Portfolio not available</div>
        <div style={{ fontSize: 14, color: C.tm }}>{error || "This link is invalid."}</div>
      </div>
    </div>
  );

  const totalCount = data.tearsheets?.length || 0;
  const dateRange = (() => {
    const dates = (data.tearsheets || []).map(t => t.issue_date).filter(Boolean).sort();
    if (dates.length === 0) return null;
    if (dates.length === 1) return fmtDate(dates[0]);
    return `${fmtDate(dates[0])} — ${fmtDate(dates[dates.length - 1])}`;
  })();

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.tx, letterSpacing: -0.3 }}>{data.client_name || "Your portfolio"}</div>
            <div style={{ fontSize: 13, color: C.tm, marginTop: 4 }}>
              {totalCount} tearsheet{totalCount === 1 ? "" : "s"}
              {pubsList.length > 0 && ` · ${pubsList.length} publication${pubsList.length === 1 ? "" : "s"}`}
              {dateRange && ` · ${dateRange}`}
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.td, textTransform: "uppercase", letterSpacing: 1 }}>
            13 Stars Media
          </div>
        </div>
      </div>

      <div style={styles.body}>
        {/* Pub filter chips */}
        {pubsList.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
            <FilterChip
              active={pubFilter === "all"}
              onClick={() => setPubFilter("all")}
              label="All publications"
              count={totalCount}
            />
            {pubsList.map(g => (
              <FilterChip
                key={g.pub_id || "u"}
                active={pubFilter === g.pub_id}
                onClick={() => setPubFilter(g.pub_id)}
                label={g.pub_name}
                count={g.items.length}
                accent={g.pub_primary_color}
              />
            ))}
          </div>
        )}

        {filteredTearsheets.length === 0 ? (
          <div style={{ ...styles.heroPanel, textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🖨️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.tx, marginBottom: 8 }}>No tearsheets yet</div>
            <div style={{ fontSize: 14, color: C.tm, lineHeight: 1.55, maxWidth: 480, margin: "0 auto" }}>
              Once your ads run, the tearsheets will appear here.
            </div>
          </div>
        ) : (
          <div style={styles.grid}>
            {filteredTearsheets.map(t => <TearsheetCard key={t.sale_id} t={t} />)}
          </div>
        )}
      </div>

      <div style={styles.footer}>
        <span>© {new Date().getFullYear()} 13 Stars Media Group</span>
        <span style={{ color: C.td }}>·</span>
        <span>Powered by MyDash</span>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, accent }) {
  const ring = accent || C.tx;
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? ring + "12" : C.sf,
        border: `1px solid ${active ? ring : C.bd}`,
        borderRadius: 999,
        padding: "6px 14px",
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        color: active ? ring : C.tm,
        cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      {count != null && <span style={{ fontSize: 10, color: active ? ring : C.td }}>{count}</span>}
    </button>
  );
}

function TearsheetCard({ t }) {
  const accent = t.pub_primary_color || C.ac;
  const portalUrl = `/tearsheet/${t.tearsheet_token}`;
  const pdfReady = !!t.tearsheet_pdf_url;
  // P5i — manual uploads include a kind hint so we preview images
  // inline; auto-split / unset rows fall back to PDF rendering.
  const inferredKind = t.tearsheet_kind
    || (t.tearsheet_pdf_url && /\.(jpe?g|png|webp|gif|avif|heic)(\?|$)/i.test(t.tearsheet_pdf_url) ? "image" : "pdf");
  const isImage = inferredKind === "image";
  return (
    <div style={{
      background: C.sf, border: `1px solid ${C.bd}`,
      borderRadius: 10, overflow: "hidden",
      borderTop: `3px solid ${accent}`,
      display: "flex", flexDirection: "column",
    }}>
      {/* Image preview thumbnail when available */}
      {isImage && pdfReady && (
        <a href={portalUrl} style={{ display: "block", background: C.sa, borderBottom: `1px solid ${C.bd}` }}>
          <img
            src={t.tearsheet_pdf_url}
            alt={`Page ${t.page}`}
            loading="lazy"
            style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
          />
        </a>
      )}
      <div style={{ padding: "14px 16px", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.td, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {t.pub_name}
            </div>
            <div title={t.issue_label || ""} style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {t.issue_label || (t.issue_date ? fmtDate(t.issue_date) : "Issue")}
            </div>
            {t.issue_date && t.issue_label && (
              <div style={{ fontSize: 11, color: C.tm, marginTop: 2 }}>{fmtDate(t.issue_date)}</div>
            )}
          </div>
          <div style={{
            fontSize: 14, fontWeight: 800, color: accent,
            padding: "4px 10px", background: accent + "12",
            borderRadius: 6, flexShrink: 0,
          }}>
            p{t.page}
          </div>
        </div>
        {t.ad_size && (
          <div style={{ fontSize: 11, color: C.tm, marginBottom: 8 }}>
            {t.ad_size}
          </div>
        )}
      </div>
      <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.bd}`, background: C.sa, display: "flex", gap: 6 }}>
        <a
          href={portalUrl}
          style={{ flex: 1, textAlign: "center", padding: "6px 10px", background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, fontSize: 12, fontWeight: 600, color: C.tx, textDecoration: "none" }}
        >
          View
        </a>
        {pdfReady ? (
          <a
            href={t.tearsheet_pdf_url}
            download
            style={{ flex: 1, textAlign: "center", padding: "6px 10px", background: accent, border: `1px solid ${accent}`, borderRadius: 6, fontSize: 12, fontWeight: 700, color: "#fff", textDecoration: "none" }}
          >
            ↓ {isImage ? "Image" : "PDF"}
          </a>
        ) : (
          <span style={{ flex: 1, textAlign: "center", padding: "6px 10px", border: `1px dashed ${C.bd}`, borderRadius: 6, fontSize: 11, color: C.td }}>
            Coming soon
          </span>
        )}
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
    padding: "24px 28px", background: C.sf, borderBottom: `1px solid ${C.bd}`,
  },
  body: {
    flex: 1, padding: "24px", maxWidth: 1080, width: "100%",
    margin: "0 auto", boxSizing: "border-box",
    display: "flex", flexDirection: "column", gap: 14,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: 12,
  },
  heroPanel: {
    padding: 20, background: C.sf,
    border: `1px solid ${C.bd}`, borderRadius: 10,
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
