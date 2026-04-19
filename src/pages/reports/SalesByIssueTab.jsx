import { useMemo, useState } from "react";
import { Z, COND, DISPLAY, FS, FW, SP } from "../../lib/theme";
import { GlassCard, GlassStat, DataTable, Sel, SolidTabs, Inp } from "../../components/ui";
import { fmtCurrencyWhole as fmtCurrency } from "../../lib/formatters";

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

const SalesByIssueTab = ({ sales = [], pubs = [], issues = [], clients = [] }) => {
  const [preset, setPreset] = useState("last_12");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [pubFilter, setPubFilter] = useState("all");
  const [status, setStatus] = useState("Closed");

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
  // "No issue" rows (shouldn't happen for display_print per migration 028, but
  // safe for other product types) roll up under a synthetic issue bucket.
  const rows = useMemo(() => {
    const map = new Map();
    filtered.forEach(s => {
      const adSize = (s.size || "").trim() || "—";
      const key = `${s.publication || ""}|${s.issueId || "_none"}|${adSize}`;
      const existing = map.get(key);
      if (existing) {
        existing.gross += Number(s.amount || 0);
      } else {
        map.set(key, {
          key,
          pubId: s.publication,
          issueId: s.issueId || null,
          adSize,
          gross: Number(s.amount || 0),
        });
      }
    });
    const out = [...map.values()].map(r => {
      const pub = pubById[r.pubId];
      const iss = r.issueId ? issueById[r.issueId] : null;
      return {
        ...r,
        pubName: pub?.name || "(unknown pub)",
        pubColor: pub?.color || Z.tm,
        issueLabel: iss?.label || (r.issueId ? "(missing issue)" : "(ad-hoc)"),
        issueDate: iss?.date || "",
      };
    });
    // Default sort: issueDate desc, then publication, then ad size.
    out.sort((a, b) =>
      b.issueDate.localeCompare(a.issueDate) ||
      a.pubName.localeCompare(b.pubName) ||
      a.adSize.localeCompare(b.adSize)
    );
    return out;
  }, [filtered, pubById, issueById]);

  const headline = useMemo(() => {
    const totalGross = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);
    const pubsTouched = new Set(filtered.map(s => s.publication)).size;
    const issuesTouched = new Set(filtered.map(s => s.issueId).filter(Boolean)).size;
    return { totalGross, pubsTouched, issuesTouched, dealCount: filtered.length };
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
      {from && to && (
        <div style={{ marginTop: 10, fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
          {from} → {to} · filtered by issue date
        </div>
      )}
    </GlassCard>

    {/* Headline */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
      <GlassStat label="Gross Sales" value={fmtCurrency(headline.totalGross)} />
      <GlassStat label="Transactions" value={headline.dealCount.toLocaleString()} />
      <GlassStat label="Issues" value={headline.issuesTouched.toLocaleString()} />
      <GlassStat label="Publications" value={headline.pubsTouched.toLocaleString()} />
    </div>

    {/* Table */}
    <GlassCard style={{ padding: SP.cardPad }}>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, marginBottom: 12 }}>
        Sales by publication × issue × size
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND }}>
          No sales match the current filters.
        </div>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Publication</th>
              <th>Issue</th>
              <th>Issue Date</th>
              <th>Ad Size</th>
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
                <td style={{ color: Z.tx }}>{r.issueLabel}</td>
                <td style={{ color: Z.tm, fontVariantNumeric: "tabular-nums" }}>{r.issueDate || "—"}</td>
                <td style={{ color: Z.td }}>{r.adSize}</td>
                <td style={{ textAlign: "right", fontFamily: DISPLAY, fontWeight: FW.heavy, color: Z.tx, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(r.gross)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${Z.bd}` }}>
              <td style={{ fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>Total</td>
              <td colSpan={3} />
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
