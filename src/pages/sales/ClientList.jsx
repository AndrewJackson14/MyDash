import { useState, useMemo, memo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, CARD, TBL, INV } from "../../lib/theme";
import { Ic, Badge, Btn, Sel, SB, SolidTabs, GlassCard, glass } from "../../components/ui";
import { computeClientStatus, CLIENT_STATUS_COLORS } from "./constants";

const fmtK = (n) => n >= 10000 ? "$" + Math.round(n / 1000) + "K" : "$" + (n || 0).toLocaleString();
const daysAgo = (d) => { if (!d) return null; return Math.floor((new Date() - new Date(d)) / 86400000); };
const daysLabel = (n) => { if (n === null) return "—"; if (n === 0) return "Today"; if (n <= 30) return n + "d ago"; if (n <= 365) return Math.round(n / 30) + "mo ago"; return Math.round(n / 365 * 10) / 10 + "yr"; };

const STATUS_ORDER = { Renewal: 0, Active: 1, Lead: 2, Lapsed: 3 };
const today = new Date().toISOString().slice(0, 10);

const ClientRow = memo(({ client, data, nextAction, onSelect }) => {
  const c = client;
  const d = data || {};
  const na = nextAction;
  const lastDays = daysAgo(d.lastSale);
  const stColor = CLIENT_STATUS_COLORS[c.status] || CLIENT_STATUS_COLORS.Lead;
  const trend = d.thisYear > 0 && d.lastYear > 0 ? (d.thisYear >= d.lastYear * 1.1 ? "up" : d.thisYear <= d.lastYear * 0.9 ? "down" : "flat") : null;
  const recencyColor = lastDays === null ? Z.td : lastDays <= 30 ? Z.go : lastDays <= 90 ? Z.tx : lastDays <= 180 ? Z.wa : Z.da;
  const actionOverdue = na?.date && na.date < today;

  return <tr onClick={() => onSelect(c.id)} style={{ cursor: "pointer", borderBottom: `1px solid ${Z.bd}20` }}
    onMouseEnter={e => e.currentTarget.style.background = Z.sa}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
    <td style={{ padding: TBL.cellPad }}>
      <div style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.tx, lineHeight: 1.2 }}>{c.name}</div>
      {c.contacts?.[0]?.name && <div style={{ fontSize: FS.sm, color: Z.tm }}>{c.contacts[0].name}</div>}
    </td>
    <td style={{ padding: TBL.cellPad }}>
      <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: Ri, fontSize: FS.micro, fontWeight: FW.heavy, background: stColor.bg, color: stColor.text, textTransform: "uppercase" }}>{c.status}</span>
    </td>
    <td style={{ padding: TBL.cellPad, color: recencyColor, fontWeight: FW.semi, fontSize: FS.sm }}>
      {daysLabel(lastDays)}
    </td>
    <td style={{ padding: TBL.cellPad, textAlign: "right" }}>
      <span style={{ fontWeight: FW.heavy, color: Z.tx }}>{fmtK(d.spend || 0)}</span>
      {trend && <span style={{ marginLeft: 4, fontSize: FS.micro, color: trend === "up" ? Z.go : trend === "down" ? Z.da : Z.tm }}>{trend === "up" ? "▲" : trend === "down" ? "▼" : "—"}</span>}
    </td>
    <td style={{ padding: TBL.cellPad, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>
      {d.pubSet?.size || 0}
    </td>
    <td style={{ padding: TBL.cellPad }}>
      {na ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: actionOverdue ? Z.da : Z.tx }}>
            {typeof na.action === "object" ? na.action.label : na.status}
          </span>
          {actionOverdue && <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.da, textTransform: "uppercase" }}>overdue</span>}
        </div>
      ) : (
        <span style={{ fontSize: FS.sm, color: Z.td }}>—</span>
      )}
    </td>
  </tr>;
});

const PAGE_SIZE = 50;

const ClientList = ({ clients, sales, pubs, issues, proposals, sr, setSr, fPub, onSelectClient }) => {
  const [statusFilter, setStatusFilter] = useState("active"); // active | renewal | lead | lapsed | all
  const [sortCol, setSortCol] = useState("spend");
  const [sortDir, setSortDir] = useState("desc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const today = new Date().toISOString().slice(0, 10);
  const pubMap = useMemo(() => { const m = {}; (pubs || []).forEach(p => { m[p.id] = p.name; }); return m; }, [pubs]);
  const pn = id => pubMap[id] || "";

  // Pre-compute per-client sales data
  const clientData = useMemo(() => {
    const thisYearStart = new Date().getFullYear() + "-01-01";
    const lastYearStart = (new Date().getFullYear() - 1) + "-01-01";
    const map = {};
    (sales || []).forEach(s => {
      if (s.status !== "Closed" && s.status !== "Follow-up") return;
      if (!map[s.clientId]) map[s.clientId] = { spend: 0, count: 0, lastSale: "", pubSet: new Set(), thisYear: 0, lastYear: 0 };
      const d = map[s.clientId];
      const amt = s.amount || 0;
      d.spend += amt;
      d.count++;
      if (s.date > d.lastSale) d.lastSale = s.date;
      if (s.publication) d.pubSet.add(s.publication);
      if (s.date >= thisYearStart) d.thisYear += amt;
      else if (s.date >= lastYearStart) d.lastYear += amt;
    });
    return map;
  }, [sales]);

  // Pre-compute next actions per client from open pipeline sales
  const nextActions = useMemo(() => {
    const map = {};
    (sales || []).forEach(s => {
      if (["Closed", "Follow-up"].includes(s.status)) return;
      if (!map[s.clientId] || s.nextActionDate < map[s.clientId].date) {
        map[s.clientId] = { status: s.status, action: s.nextAction, date: s.nextActionDate, saleId: s.id };
      }
    });
    return map;
  }, [sales]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = { Active: 0, Renewal: 0, Lead: 0, Lapsed: 0 };
    (clients || []).forEach(c => { if (counts[c.status] !== undefined) counts[c.status]++; });
    return counts;
  }, [clients]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = (clients || []).filter(c => {
      // When actively searching, ignore status filter — search all clients
      if (!sr) {
        if (statusFilter === "active") { if (c.status !== "Active") return false; }
        else if (statusFilter === "renewal") { if (c.status !== "Renewal") return false; }
        else if (statusFilter === "lead") { if (c.status !== "Lead") return false; }
        else if (statusFilter === "lapsed") { if (c.status !== "Lapsed") return false; }
      }
      if (sr && !(c.name || "").toLowerCase().includes(sr.toLowerCase())) return false;
      if (fPub && fPub !== "all") {
        const d = clientData[c.id];
        if (!d || !d.pubSet.has(fPub)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const da = clientData[a.id] || {};
      const db = clientData[b.id] || {};
      const na = nextActions[a.id];
      const nb = nextActions[b.id];
      let cmp = 0;
      if (sortCol === "name") cmp = (a.name || "").localeCompare(b.name || "");
      else if (sortCol === "status") cmp = (STATUS_ORDER[a.status] || 9) - (STATUS_ORDER[b.status] || 9);
      else if (sortCol === "spend") cmp = (da.spend || 0) - (db.spend || 0);
      else if (sortCol === "lastAd") cmp = (da.lastSale || "").localeCompare(db.lastSale || "");
      else if (sortCol === "pubs") cmp = (da.pubSet?.size || 0) - (db.pubSet?.size || 0);
      else if (sortCol === "action") cmp = (na?.date || "z").localeCompare(nb?.date || "z");
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [clients, clientData, nextActions, statusFilter, sr, fPub, sortCol, sortDir]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "name" ? "asc" : "desc"); }
  };
  const sortArrow = (col) => sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const ThCol = ({ col, children, align }) => (
    <th onClick={() => toggleSort(col)} style={{
      padding: TBL.cellPad, textAlign: align || "left", fontWeight: TBL.headerWeight,
      color: sortCol === col ? Z.tx : Z.td, fontSize: TBL.headerSize, textTransform: "uppercase",
      letterSpacing: 0.5, borderBottom: `1px solid ${Z.bd}`, cursor: "pointer", userSelect: "none",
      fontFamily: COND, whiteSpace: "nowrap",
    }}>{children}{sortArrow(col)}</th>
  );

  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {/* Status filter tabs */}
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {[
        { key: "active", label: "Active", count: statusCounts.Active },
        { key: "renewal", label: "Renewal", count: statusCounts.Renewal },
        { key: "lead", label: "Leads", count: statusCounts.Lead },
        { key: "lapsed", label: "Lapsed", count: statusCounts.Lapsed },
        { key: "all", label: "All", count: (clients || []).length },
      ].map(t => (
        <button key={t.key} onClick={() => setStatusFilter(t.key)} style={{
          padding: "5px 14px", borderRadius: Ri, border: "none",
          background: statusFilter === t.key ? Z.go : "transparent",
          color: statusFilter === t.key ? INV.light : Z.td,
          cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, fontFamily: COND, whiteSpace: "nowrap",
        }}>{t.label} <span style={{ opacity: 0.7 }}>({t.count})</span></button>
      ))}
    </div>

    <div style={{ fontSize: FS.sm, color: Z.td }}>{filtered.length} client{filtered.length !== 1 ? "s" : ""}</div>

    {filtered.length === 0 ? (
      <GlassCard style={{ textAlign: "center", padding: 24, color: Z.td }}>No clients match your filters.</GlassCard>
    ) : (
      <div style={{ ...glass(), borderRadius: R, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: TBL.bodySize, fontFamily: COND }}>
            <thead>
              <tr>
                <ThCol col="name">Client</ThCol>
                <ThCol col="status">Status</ThCol>
                <ThCol col="lastAd">Last Ad</ThCol>
                <ThCol col="spend" align="right">Revenue</ThCol>
                <ThCol col="pubs" align="center">Pubs</ThCol>
                <ThCol col="action">Next Action</ThCol>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, visibleCount).map(c => (
                <ClientRow key={c.id} client={c} data={clientData[c.id]} nextAction={nextActions[c.id]} onSelect={onSelectClient} />
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > visibleCount && <div style={{ padding: 10, textAlign: "center" }}><button onClick={() => setVisibleCount(v => v + PAGE_SIZE)} style={{ background: "none", border: `1px solid ${Z.bd}`, borderRadius: R, padding: "6px 16px", color: Z.tm, fontSize: FS.sm, fontWeight: FW.semi, cursor: "pointer" }}>Show more ({filtered.length - visibleCount} remaining)</button></div>}
      </div>
    )}
  </div>;
};

export default ClientList;
