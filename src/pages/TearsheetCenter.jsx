// ============================================================
// TearsheetCenter — Anthony Phase 5j. The "press day after" surface.
// Anthony uploads to the printer's FTP (outside MyDash); after the
// issue runs, Cami/Sales drop tearsheet PDFs/JPGs against each
// closed sale's ad.
//
// Solves the case-by-case curation friction: instead of opening
// each ClientProfile one at a time, see every closed sale grouped
// by issue with its tearsheet status, filter by pub/issue/status,
// and upload inline.
//
// Reuses the upload-tearsheet edge function from P5i.
// ============================================================
import { useState, useMemo, useEffect, useRef } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri, ACCENT } from "../lib/theme";
import { Btn, Sel, SB, glass as glassStyle, PageHeader } from "../components/ui";
import { supabase, EDGE_FN_URL } from "../lib/supabase";
import { fmtDateShort as fmtDate } from "../lib/formatters";
import SendTearsheetModal from "../components/SendTearsheetModal";
import { usePageHeader } from "../contexts/PageHeaderContext";

const STATUS_FILTERS = [
  { value: "missing", label: "Missing" },
  { value: "uploaded", label: "Uploaded" },
  { value: "all", label: "All" },
];

export default function TearsheetCenter({ isActive, currentUser, sales, setSales, clients, pubs, issues }) {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Tearsheets" }], title: "Tearsheets" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);

  const [pubFilter, setPubFilter] = useState("all");
  const [issueFilter, setIssueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("missing");
  const [search, setSearch] = useState("");
  const [collapsedIssues, setCollapsedIssues] = useState(new Set());

  const cn = (id) => (clients || []).find(c => c.id === id)?.name || "—";
  const pn = (id) => (pubs || []).find(p => p.id === id)?.name || "—";

  // Sales eligible for tearsheets: closed, has a page, has an issue
  const eligible = useMemo(() => {
    return (sales || []).filter(s => s.status === "Closed" && s.page && s.issueId);
  }, [sales]);

  // Apply pub/issue/status/search filters
  const filtered = useMemo(() => {
    let list = eligible;
    if (pubFilter !== "all") list = list.filter(s => s.publication === pubFilter);
    if (issueFilter !== "all") list = list.filter(s => s.issueId === issueFilter);
    if (statusFilter === "missing") list = list.filter(s => !s.tearsheetUrl);
    if (statusFilter === "uploaded") list = list.filter(s => !!s.tearsheetUrl);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(s => {
        const c = cn(s.clientId).toLowerCase();
        const p = pn(s.publication).toLowerCase();
        return c.includes(q) || p.includes(q) || (s.size || "").toLowerCase().includes(q);
      });
    }
    return list;
  }, [eligible, pubFilter, issueFilter, statusFilter, search, clients, pubs]);

  // Group by issueId; sort issues by date desc; sort sales within
  // by page asc.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const s of filtered) {
      if (!map.has(s.issueId)) map.set(s.issueId, []);
      map.get(s.issueId).push(s);
    }
    const arr = Array.from(map.entries()).map(([issueId, items]) => {
      const issue = (issues || []).find(i => i.id === issueId);
      return {
        issueId,
        issue,
        pubName: pn(issue?.pubId),
        items: items.sort((a, b) => (a.page || 0) - (b.page || 0)),
      };
    });
    arr.sort((a, b) => (b.issue?.date || "").localeCompare(a.issue?.date || ""));
    return arr;
  }, [filtered, issues, pubs]);

  // Issues actually appearing in eligible (for the issue picker —
  // narrows to relevant issues only, not the full schedule)
  const issuesInScope = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const s of eligible) {
      if (pubFilter !== "all" && s.publication !== pubFilter) continue;
      if (seen.has(s.issueId)) continue;
      seen.add(s.issueId);
      const iss = (issues || []).find(i => i.id === s.issueId);
      if (iss) out.push(iss);
    }
    out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return out;
  }, [eligible, pubFilter, issues]);

  const totalEligible = eligible.length;
  const totalUploaded = eligible.filter(s => s.tearsheetUrl).length;
  const totalMissing = totalEligible - totalUploaded;

  if (!isActive) return null;

  const glass = { ...glassStyle(), borderRadius: R, padding: "16px 18px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 28 }}>
      <PageHeader title="Tearsheet Center" />

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <StatTile label="Missing tearsheets" value={totalMissing} color={totalMissing > 0 ? Z.wa : Z.go} />
        <StatTile label="Uploaded" value={totalUploaded} color={Z.go} />
        <StatTile label="Total ads" value={totalEligible} color={Z.tm} />
      </div>

      {/* Filters */}
      <div style={glass}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <SB value={search} onChange={setSearch} placeholder="Search client, pub, size…" />
          <Sel
            value={pubFilter}
            onChange={e => { setPubFilter(e.target.value); setIssueFilter("all"); }}
            options={[
              { value: "all", label: "All publications" },
              ...(pubs || []).filter(p => p.isActive !== false).map(p => ({ value: p.id, label: p.name })),
            ]}
          />
          <Sel
            value={issueFilter}
            onChange={e => setIssueFilter(e.target.value)}
            options={[
              { value: "all", label: "All issues" },
              ...issuesInScope.slice(0, 60).map(i => ({ value: i.id, label: `${pn(i.pubId)} ${i.label || fmtDate(i.date)}` })),
            ]}
          />
          <div style={{ display: "flex", gap: 4 }}>
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                style={{
                  padding: "5px 12px", borderRadius: Ri, border: "none", cursor: "pointer",
                  fontSize: FS.xs, fontWeight: statusFilter === f.value ? FW.bold : 500,
                  background: statusFilter === f.value ? Z.tx + "12" : "transparent",
                  color: statusFilter === f.value ? Z.tx : Z.tm,
                  fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.4,
                }}
              >{f.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Issue groups */}
      {grouped.length === 0 ? (
        <div style={{ ...glass, textAlign: "center", padding: 60, color: Z.tm }}>
          {statusFilter === "missing"
            ? "✨ Every eligible ad has a tearsheet. Nice work."
            : "No matches for the current filters."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {grouped.map(g => {
            const collapsed = collapsedIssues.has(g.issueId);
            const missingCount = g.items.filter(s => !s.tearsheetUrl).length;
            return (
              <div key={g.issueId} style={glass}>
                <div
                  onClick={() => setCollapsedIssues(prev => {
                    const next = new Set(prev);
                    if (next.has(g.issueId)) next.delete(g.issueId);
                    else next.add(g.issueId);
                    return next;
                  })}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: collapsed ? 0 : 12 }}
                >
                  <div>
                    <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>
                      {collapsed ? "▸" : "▾"} {g.pubName} {g.issue?.label || fmtDate(g.issue?.date)}
                    </div>
                    <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
                      {g.issue?.date ? `Press ${fmtDate(g.issue.date)} · ` : ""}
                      {g.items.length} ad{g.items.length === 1 ? "" : "s"}
                      {missingCount > 0 && ` · `}
                      {missingCount > 0 && <span style={{ color: Z.wa, fontWeight: FW.bold }}>{missingCount} missing</span>}
                      {missingCount === 0 && g.items.length > 0 && <span style={{ color: Z.go, fontWeight: FW.bold }}>· all uploaded ✓</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {missingCount === 0 && g.items.length > 0 && (
                      <span style={{ fontSize: 18, color: Z.go }}>✓</span>
                    )}
                  </div>
                </div>

                {!collapsed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {g.items.map(s => (
                      <SaleRow
                        key={s.id}
                        sale={s}
                        client={(clients || []).find(c => c.id === s.clientId)}
                        clientName={cn(s.clientId)}
                        setSales={setSales}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, color }) {
  return (
    <div style={{ ...glassStyle(), borderRadius: R, padding: "14px 18px" }}>
      <div style={{ fontSize: 28, fontWeight: FW.black, color, fontFamily: DISPLAY }}>{value}</div>
      <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2, fontFamily: COND }}>{label}</div>
    </div>
  );
}

function SaleRow({ sale, client, clientName, setSales }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [sendOpen, setSendOpen] = useState(false);
  const inputRef = useRef(null);
  const hasTearsheet = !!sale.tearsheetUrl;

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (uploading) return;
    setUploading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("not signed in");
      const form = new FormData();
      form.append("sale_id", sale.id);
      form.append("file", file);
      const res = await fetch(`${EDGE_FN_URL}/upload-tearsheet`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || `upload failed: ${res.status}`);
      if (typeof setSales === "function") {
        setSales(prev => prev.map(x => x.id === sale.id ? {
          ...x,
          tearsheetUrl: out.tearsheet_url,
          tearsheetFilename: out.filename,
          tearsheetKind: out.kind,
          tearsheetUploadedAt: new Date().toISOString(),
        } : x));
      }
    } catch (err) {
      console.error("Tearsheet upload failed:", err);
      setError(err.message || "upload failed");
      setTimeout(() => setError(null), 4000);
    }
    setUploading(false);
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 10px", background: Z.bg, borderRadius: Ri,
      borderLeft: `2px solid ${hasTearsheet ? Z.go : Z.wa}`,
    }}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic"
        onChange={onPick}
        style={{ display: "none" }}
      />
      <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tm, fontFamily: COND, width: 36, flexShrink: 0, textAlign: "right" }}>
        p{sale.page}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div title={clientName} style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {clientName}
        </div>
        <div style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND }}>
          {sale.size || sale.type || "Ad"}
          {sale.amount ? ` · $${(sale.amount || 0).toLocaleString()}` : ""}
          {sale.tearsheetUploadedAt && ` · uploaded ${fmtDate(sale.tearsheetUploadedAt.slice(0, 10))}`}
        </div>
      </div>
      {error && <span style={{ fontSize: FS.micro, color: Z.da, fontFamily: COND, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{error}</span>}
      {hasTearsheet && (
        <>
          <a
            href={sale.tearsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: FS.micro, color: Z.ac, textDecoration: "none", fontFamily: COND, fontWeight: FW.semi }}
          >
            {sale.tearsheetKind === "image" ? "🖼" : "📄"} View ↗
          </a>
          <button
            onClick={() => setSendOpen(true)}
            title="Email tearsheet link to client"
            style={{ background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "3px 8px", cursor: "pointer", fontSize: FS.xs, color: Z.ac, fontFamily: COND }}
          >
            ✉ Send
          </button>
        </>
      )}
      <Btn
        sm
        v={hasTearsheet ? "secondary" : "primary"}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{ flexShrink: 0, fontSize: FS.xs }}
      >
        {uploading ? "Uploading…" : hasTearsheet ? "↺ Replace" : "⤴ Upload"}
      </Btn>
      {sendOpen && (
        <SendTearsheetModal client={client} sale={sale} onClose={() => setSendOpen(false)} />
      )}
    </div>
  );
}
