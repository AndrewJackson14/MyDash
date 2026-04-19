import { useEffect, useMemo, useState } from "react";
import { Z, COND, DISPLAY, FS, FW, SP, Ri } from "../../lib/theme";
import { GlassCard, GlassStat, DataTable, Sel, SolidTabs, Inp, FilterPillStrip } from "../../components/ui";
import { fmtCurrencyWhole as fmtCurrency } from "../../lib/formatters";

const VIEW_OPTIONS = [
  { value: "size", label: "By Ad Size" },
  { value: "client", label: "By Client" },
];

// Color map for ad_project.status — green when creative is done, amber in-flight,
// blue for not-started (brief), muted fallback.
const AD_STATUS_COLOR = {
  brief:         { bg: "rgba(59,130,246,0.15)", fg: "#3b82f6" },
  awaiting_art:  { bg: "rgba(59,130,246,0.15)", fg: "#3b82f6" },
  designing:     { bg: "rgba(212,137,14,0.18)", fg: "#D4890E" },
  proof_sent:    { bg: "rgba(212,137,14,0.18)", fg: "#D4890E" },
  revising:      { bg: "rgba(212,137,14,0.18)", fg: "#D4890E" },
  approved:      { bg: "rgba(0,163,0,0.18)",    fg: "#00a300" },
  signed_off:    { bg: "rgba(0,163,0,0.18)",    fg: "#00a300" },
  placed:        { bg: "rgba(0,163,0,0.18)",    fg: "#00a300" },
};

// Color map for invoices.status.
const INV_STATUS_COLOR = {
  draft:           { bg: "rgba(140,150,165,0.18)", fg: "#8A95A8" },
  sent:            { bg: "rgba(59,130,246,0.15)",  fg: "#3b82f6" },
  partially_paid:  { bg: "rgba(212,137,14,0.18)",  fg: "#D4890E" },
  overdue:         { bg: "rgba(224,80,80,0.15)",   fg: "#E05050" },
  paid:            { bg: "rgba(0,163,0,0.18)",     fg: "#00a300" },
  void:            { bg: "rgba(140,150,165,0.18)", fg: "#8A95A8" },
};

const StatusPill = ({ value, colorMap }) => {
  if (!value) return <span style={{ color: Z.tm, fontFamily: COND }}>—</span>;
  if (value === "mixed") {
    return <span style={{ color: Z.tm, fontSize: FS.sm, fontFamily: COND, fontStyle: "italic" }}>mixed</span>;
  }
  const c = colorMap[value] || { bg: "rgba(140,150,165,0.18)", fg: Z.tm };
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: Ri,
      background: c.bg, color: c.fg, fontSize: 10, fontWeight: FW.bold,
      fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.3,
      whiteSpace: "nowrap",
    }}>{value.replace(/_/g, " ")}</span>
  );
};

const RANGE_PRESETS = [
  { value: "this_month", label: "This Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "ytd", label: "YTD" },
  { value: "last_12", label: "Last 12 Months" },
  { value: "custom", label: "Custom" },
];

const STATUS_OPTIONS = [
  { value: "Closed", label: "Closed" },
  { value: "Pipeline", label: "Pipeline" },
  { value: "all", label: "All" },
];

// Pipeline = any sale whose status represents an opportunity rather than a booked deal.
// Anything other than 'Closed' or 'Cancelled' counts.
const isPipeline = (s) => s.status !== "Closed" && s.status !== "Cancelled";

const today = () => new Date();
const iso = (d) => d.toISOString().slice(0, 10);

const rangeBounds = (preset, customFrom, customTo) => {
  const now = today();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (preset === "this_month") {
    return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  }
  if (preset === "this_quarter") {
    const q = Math.floor(m / 3);
    return { from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)) };
  }
  if (preset === "ytd") {
    return { from: `${y}-01-01`, to: iso(now) };
  }
  if (preset === "last_12") {
    const start = new Date(y, m - 11, 1);
    return { from: iso(start), to: iso(now) };
  }
  return { from: customFrom || "", to: customTo || "" };
};

const SalesByIssueTab = ({ sales = [], pubs = [], issues = [], clients = [], invoices = [], adProjects = [], loadAdProjects }) => {
  // Lazy-load ad_projects on mount. loadAdProjects no-ops if already loaded.
  useEffect(() => { if (loadAdProjects) loadAdProjects(); }, [loadAdProjects]);

  // saleId → ad_project.status lookup. ad_projects are snake_case from the *
  // select in useAppData.loadAdProjects.
  const adStatusBySaleId = useMemo(() => {
    const m = new Map();
    (adProjects || []).forEach(p => { if (p.sale_id && p.status) m.set(p.sale_id, p.status); });
    return m;
  }, [adProjects]);

  // saleId → invoice.status. invoices[].lines is pre-loaded with skinny
  // {id, saleId, publicationId} rows per useAppData.
  const invStatusBySaleId = useMemo(() => {
    const m = new Map();
    (invoices || []).forEach(inv => {
      (inv.lines || []).forEach(l => { if (l.saleId) m.set(l.saleId, inv.status); });
    });
    return m;
  }, [invoices]);

  const [preset, setPreset] = useState("last_12");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [pubFilter, setPubFilter] = useState("all");
  const [status, setStatus] = useState("Closed");
  const [view, setView] = useState("size");

  const { from, to } = useMemo(
    () => rangeBounds(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const pubById = useMemo(() => Object.fromEntries(pubs.map(p => [p.id, p])), [pubs]);
  const issueById = useMemo(() => Object.fromEntries(issues.map(i => [i.id, i])), [issues]);
  const clientById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients]);

  const pubOptions = useMemo(() => {
    const active = new Set(sales.map(s => s.publication).filter(Boolean));
    return [{ value: "all", label: "All publications" },
      ...pubs.filter(p => active.has(p.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => ({ value: p.id, label: p.name }))];
  }, [sales, pubs]);

  // Filter the raw sales against date (via issue date when available, else sale date),
  // status toggle, and publication filter.
  const filtered = useMemo(() => {
    return sales.filter(s => {
      // status
      if (status === "Closed" && s.status !== "Closed") return false;
      if (status === "Pipeline" && !isPipeline(s)) return false;

      // publication filter
      if (pubFilter !== "all" && s.publication !== pubFilter) return false;

      // date filter — prefer issue date as the "when the ad runs" mental model
      const iss = s.issueId ? issueById[s.issueId] : null;
      const dateKey = iss?.date || s.date;
      if (!dateKey) return false;
      if (from && dateKey < from) return false;
      if (to && dateKey > to) return false;

      return true;
    });
  }, [sales, status, pubFilter, from, to, issueById]);

  // Aggregate: (publication, issueId, adSize) → sum(amount).
  // Status columns (ad_project + invoice) collapse to a single value when all
  // sales in the bucket share it, otherwise "mixed". Empty = "—" via render.
  const rows = useMemo(() => {
    const map = new Map();
    filtered.forEach(s => {
      const adSize = (s.size || "").trim() || "—";
      const key = `${s.publication || ""}|${s.issueId || "_none"}|${adSize}`;
      const existing = map.get(key);
      const adStatus = adStatusBySaleId.get(s.id) || null;
      const invStatus = invStatusBySaleId.get(s.id) || null;
      if (existing) {
        existing.gross += Number(s.amount || 0);
        existing._adStatuses.add(adStatus);
        existing._invStatuses.add(invStatus);
      } else {
        map.set(key, {
          key,
          pubId: s.publication,
          issueId: s.issueId || null,
          adSize,
          gross: Number(s.amount || 0),
          _adStatuses: new Set([adStatus]),
          _invStatuses: new Set([invStatus]),
        });
      }
    });
    const collapse = (set) => {
      const vals = [...set].filter(Boolean);
      if (vals.length === 0) return null;
      if (vals.length === 1 && set.size === 1) return vals[0];
      // More than one distinct status, or a mix of set+null → mixed.
      return vals.length > 1 || set.size > vals.length ? "mixed" : vals[0];
    };
    const out = [...map.values()].map(r => {
      const pub = pubById[r.pubId];
      const iss = r.issueId ? issueById[r.issueId] : null;
      return {
        key: r.key,
        pubId: r.pubId,
        issueId: r.issueId,
        adSize: r.adSize,
        gross: r.gross,
        pubName: pub?.name || "(unknown pub)",
        pubColor: pub?.color || Z.tm,
        issueLabel: iss?.label || (r.issueId ? "(missing issue)" : "(ad-hoc)"),
        issueDate: iss?.date || "",
        adStatus: collapse(r._adStatuses),
        invStatus: collapse(r._invStatuses),
      };
    });
    // Default sort: issueDate desc, then publication, then ad size.
    out.sort((a, b) =>
      b.issueDate.localeCompare(a.issueDate) ||
      a.pubName.localeCompare(b.pubName) ||
      a.adSize.localeCompare(b.adSize)
    );
    return out;
  }, [filtered, pubById, issueById, adStatusBySaleId, invStatusBySaleId]);

  // By-client view: one row per sale (order), enriched with client + issue.
  const clientRows = useMemo(() => {
    const out = filtered.map(s => {
      const pub = pubById[s.publication];
      const iss = s.issueId ? issueById[s.issueId] : null;
      const client = clientById[s.clientId];
      return {
        id: s.id,
        pubId: s.publication,
        pubName: pub?.name || "(unknown pub)",
        pubColor: pub?.color || Z.tm,
        issueLabel: iss?.label || (s.issueId ? "(missing issue)" : "(ad-hoc)"),
        issueDate: iss?.date || s.date || "",
        clientName: client?.name || "(unknown client)",
        adSize: (s.size || "").trim() || "—",
        amount: Number(s.amount || 0),
        status: s.status,
        adStatus: adStatusBySaleId.get(s.id) || null,
        invStatus: invStatusBySaleId.get(s.id) || null,
      };
    });
    out.sort((a, b) =>
      b.issueDate.localeCompare(a.issueDate) ||
      a.pubName.localeCompare(b.pubName) ||
      a.clientName.localeCompare(b.clientName) ||
      a.adSize.localeCompare(b.adSize)
    );
    return out;
  }, [filtered, pubById, issueById, clientById, adStatusBySaleId, invStatusBySaleId]);

  const headline = useMemo(() => {
    const totalGross = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);
    const pubsTouched = new Set(filtered.map(s => s.publication)).size;
    const issuesTouched = new Set(filtered.map(s => s.issueId).filter(Boolean)).size;
    const clientsTouched = new Set(filtered.map(s => s.clientId).filter(Boolean)).size;
    return { totalGross, pubsTouched, issuesTouched, clientsTouched, dealCount: filtered.length };
  }, [filtered]);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Filter row */}
    <GlassCard style={{ padding: "14px 18px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <div style={{ minWidth: 170 }}>
          <Sel label="Range" value={preset} onChange={e => setPreset(e.target.value)} options={RANGE_PRESETS} />
        </div>
        {preset === "custom" && <>
          <div style={{ minWidth: 140 }}>
            <Inp label="From" type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          </div>
          <div style={{ minWidth: 140 }}>
            <Inp label="To" type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        </>}
        <div style={{ minWidth: 200 }}>
          <Sel label="Publication" value={pubFilter} onChange={e => setPubFilter(e.target.value)} options={pubOptions} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: Z.td, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND }}>Status</div>
          <SolidTabs options={STATUS_OPTIONS} active={status} onChange={setStatus} />
        </div>
      </div>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: FS.sm, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>View:</span>
        <FilterPillStrip options={VIEW_OPTIONS} value={view} onChange={setView} />
        {from && to && (
          <span style={{ marginLeft: "auto", fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
            {from} → {to} · filtered by issue date
          </span>
        )}
      </div>
    </GlassCard>

    {/* Headline */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
      <GlassStat label="Gross Sales" value={fmtCurrency(headline.totalGross)} />
      <GlassStat label="Transactions" value={headline.dealCount.toLocaleString()} />
      <GlassStat label="Issues" value={headline.issuesTouched.toLocaleString()} />
      <GlassStat
        label={view === "client" ? "Clients" : "Publications"}
        value={(view === "client" ? headline.clientsTouched : headline.pubsTouched).toLocaleString()}
      />
    </div>

    {/* Table — body swaps based on selected view */}
    <GlassCard style={{ padding: SP.cardPad }}>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, marginBottom: 12 }}>
        {view === "client"
          ? "Sales by client × issue"
          : "Sales by publication × issue × size"}
      </div>
      {(view === "size" ? rows.length : clientRows.length) === 0 ? (
        <div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND }}>
          No sales match the current filters.
        </div>
      ) : view === "size" ? (
        <DataTable>
          <thead>
            <tr>
              <th>Publication</th>
              <th>Issue Date</th>
              <th>Ad Size</th>
              <th>Ad Status</th>
              <th>Invoice Status</th>
              <th style={{ textAlign: "right" }}>Gross</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key}>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: r.pubColor, flexShrink: 0 }} />
                    <span style={{ fontWeight: FW.heavy, color: Z.tx }}>{r.pubName}</span>
                  </span>
                </td>
                <td style={{ color: Z.tm, fontVariantNumeric: "tabular-nums" }}>{r.issueDate || "—"}</td>
                <td style={{ color: Z.td }}>{r.adSize}</td>
                <td><StatusPill value={r.adStatus} colorMap={AD_STATUS_COLOR} /></td>
                <td><StatusPill value={r.invStatus} colorMap={INV_STATUS_COLOR} /></td>
                <td style={{ textAlign: "right", fontFamily: DISPLAY, fontWeight: FW.heavy, color: Z.tx, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(r.gross)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${Z.bd}` }}>
              <td style={{ fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>Total</td>
              <td colSpan={4} />
              <td style={{ textAlign: "right", fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(headline.totalGross)}
              </td>
            </tr>
          </tbody>
        </DataTable>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Publication</th>
              <th>Issue Date</th>
              <th>Client</th>
              <th>Ad Size</th>
              <th>Ad Status</th>
              <th>Invoice Status</th>
              <th style={{ textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {clientRows.map(r => (
              <tr key={r.id}>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: r.pubColor, flexShrink: 0 }} />
                    <span style={{ fontWeight: FW.heavy, color: Z.tx }}>{r.pubName}</span>
                  </span>
                </td>
                <td style={{ color: Z.tm, fontVariantNumeric: "tabular-nums" }}>{r.issueDate || "—"}</td>
                <td style={{ color: Z.tx, fontWeight: FW.semi }}>{r.clientName}</td>
                <td style={{ color: Z.td }}>{r.adSize}</td>
                <td><StatusPill value={r.adStatus} colorMap={AD_STATUS_COLOR} /></td>
                <td><StatusPill value={r.invStatus} colorMap={INV_STATUS_COLOR} /></td>
                <td style={{ textAlign: "right", fontFamily: DISPLAY, fontWeight: FW.heavy, color: Z.tx, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(r.amount)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${Z.bd}` }}>
              <td style={{ fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>Total</td>
              <td colSpan={5} />
              <td style={{ textAlign: "right", fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(headline.totalGross)}
              </td>
            </tr>
          </tbody>
        </DataTable>
      )}
    </GlassCard>
  </div>;
};

export default SalesByIssueTab;
