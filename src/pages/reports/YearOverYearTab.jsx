import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Z, COND, DISPLAY, FS, FW, R, SP } from "../../lib/theme";
import { GlassCard, GlassStat, DataTable, Sel, SolidTabs } from "../../components/ui";
import { fmtCurrencyWhole as fmtCurrency } from "../../lib/formatters";
import { deltaColor, deltaArrow } from "./comparisonColors";
import RefreshPill from "./RefreshPill";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const pctChange = (cur, prev) => {
  if (!prev) return cur > 0 ? null : 0; // null → n/a (no basis)
  return ((cur - prev) / prev) * 100;
};

const fmt$ = (n) => (n == null ? "—" : fmtCurrency(n));

// Sum rows matching a predicate, keyed by publication_id.
const sumBy = (rows, predicate) =>
  rows.reduce((acc, r) => (predicate(r) ? acc + Number(r.actual_revenue || 0) : acc), 0);

const YearOverYearTab = ({ pubs }) => {
  const now = useMemo(() => new Date(), []);
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth(); // 0-indexed

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [rev, setRev] = useState([]); // raw rows from publication_monthly_revenue
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const inflight = useRef(false);

  const [granularity, setGranularity] = useState("ytd"); // month | quarter | ytd | trailing12
  const [curYear, setCurYear] = useState(String(thisYear));
  const [cmpYear, setCmpYear] = useState(String(thisYear - 1));
  const [pubFilter, setPubFilter] = useState("all");
  const [selMonth, setSelMonth] = useState(thisMonth); // for granularity=month
  const [selQuarter, setSelQuarter] = useState(Math.floor(thisMonth / 3)); // for granularity=quarter

  // Fetch full range. View is tiny (~700 rows at 7 yrs × 5 pubs × 12 months).
  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true); setErr(null);
    const { data, error } = await supabase
      .from("publication_monthly_revenue")
      .select("publication_id, period, actual_revenue, deal_count");
    inflight.current = false;
    if (error) {
      setErr(error.message || "Failed to load revenue data.");
      setLoading(false);
      return;
    }
    setRev(data || []);
    setLastFetchedAt(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refetch when tab/window regains focus — cheap way to stay fresh without subscriptions.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [load]);

  // Year options: only years with non-zero revenue, newest first.
  const yearOptions = useMemo(() => {
    const totals = {};
    rev.forEach(r => {
      const y = r.period?.slice(0, 4);
      if (!y) return;
      totals[y] = (totals[y] || 0) + Number(r.actual_revenue || 0);
    });
    return Object.entries(totals)
      .filter(([, sum]) => sum > 0)
      .map(([y]) => y)
      .sort()
      .reverse();
  }, [rev]);

  // If defaults are missing from options (e.g. fresh install), snap to first option.
  useEffect(() => {
    if (!yearOptions.length) return;
    if (!yearOptions.includes(curYear)) setCurYear(yearOptions[0]);
    if (!yearOptions.includes(cmpYear)) setCmpYear(yearOptions[1] || yearOptions[0]);
  }, [yearOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active publication filter list: publications that actually appear in rev.
  const pubOptions = useMemo(() => {
    const active = new Set(rev.map(r => r.publication_id));
    const byId = Object.fromEntries((pubs || []).map(p => [p.id, p]));
    const opts = [...active]
      .filter(id => byId[id])
      .map(id => ({ value: id, label: byId[id].name }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "all", label: "All publications" }, ...opts];
  }, [rev, pubs]);

  // Rows scoped to the selected publication filter only.
  const scopedRev = useMemo(
    () => (pubFilter === "all" ? rev : rev.filter(r => r.publication_id === pubFilter)),
    [rev, pubFilter]
  );

  // Window definition per granularity. Returns predicate (row → bool) keyed on year.
  // For granularity='month', the window is the single selected month.
  // 'quarter' → 3 months. 'ytd' → Jan..thisMonth if viewing current year, else Jan..Dec.
  // 'trailing12' → 12 months ending at thisMonth for current year; prior 12 for comparison.
  const windowMonths = (year, gran) => {
    const y = Number(year);
    if (gran === "month") return [{ year: y, month: selMonth }];
    if (gran === "quarter") {
      const start = selQuarter * 3;
      return [0, 1, 2].map(i => ({ year: y, month: start + i }));
    }
    if (gran === "ytd") {
      const endMonth = y === thisYear ? thisMonth : 11;
      return Array.from({ length: endMonth + 1 }, (_, m) => ({ year: y, month: m }));
    }
    if (gran === "trailing12") {
      // For the "current" side, trailing 12 ends at thisMonth of curYear (even if
      // curYear is historical — in that case it's Jan–Dec of that year).
      const endDate = y === thisYear ? new Date(thisYear, thisMonth, 1) : new Date(y, 11, 1);
      const arr = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
        arr.push({ year: d.getFullYear(), month: d.getMonth() });
      }
      return arr;
    }
    return [];
  };

  // For Trailing 12 comparison, shift the curYear window back 12 months.
  const trailing12Cmp = () => {
    const endDate = Number(curYear) === thisYear ? new Date(thisYear, thisMonth, 1) : new Date(Number(curYear), 11, 1);
    const arr = [];
    for (let i = 23; i >= 12; i--) {
      const d = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
      arr.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return arr;
  };

  const sumForWindow = (rows, window) => {
    const periods = new Set(window.map(w => `${w.year}-${String(w.month + 1).padStart(2, "0")}`));
    return sumBy(rows, r => periods.has(r.period));
  };

  const curWindow = useMemo(() => windowMonths(curYear, granularity), [curYear, granularity, selMonth, selQuarter, thisMonth, thisYear]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmpWindow = useMemo(
    () => (granularity === "trailing12" ? trailing12Cmp() : windowMonths(cmpYear, granularity)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cmpYear, granularity, selMonth, selQuarter, curYear, thisMonth, thisYear]
  );

  const curTotal = useMemo(() => sumForWindow(scopedRev, curWindow), [scopedRev, curWindow]);
  const cmpTotal = useMemo(() => sumForWindow(scopedRev, cmpWindow), [scopedRev, cmpWindow]);

  const deltaAbs = curTotal - cmpTotal;
  const deltaPct = pctChange(curTotal, cmpTotal);

  // Monthly grid (always 12 months for the two selected years, regardless of granularity).
  const monthlyGrid = useMemo(() => {
    const keyFor = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
    return MONTHS_SHORT.map((short, m) => {
      const curP = keyFor(curYear, m);
      const cmpP = keyFor(cmpYear, m);
      const cur = sumBy(scopedRev, r => r.period === curP);
      const cmp = sumBy(scopedRev, r => r.period === cmpP);
      const curDeals = scopedRev
        .filter(r => r.period === curP)
        .reduce((a, r) => a + Number(r.deal_count || 0), 0);
      return { month: short, monthIdx: m, cur, cmp, curDeals, d$: cur - cmp, dPct: pctChange(cur, cmp) };
    });
  }, [scopedRev, curYear, cmpYear]);

  const monthlyTotal = useMemo(() => {
    const cur = monthlyGrid.reduce((a, r) => a + r.cur, 0);
    const cmp = monthlyGrid.reduce((a, r) => a + r.cmp, 0);
    return { cur, cmp, d$: cur - cmp, dPct: pctChange(cur, cmp) };
  }, [monthlyGrid]);

  // Per-publication breakdown for the active window (respects granularity).
  const perPub = useMemo(() => {
    const byId = Object.fromEntries((pubs || []).map(p => [p.id, p]));
    const curPeriods = new Set(curWindow.map(w => `${w.year}-${String(w.month + 1).padStart(2, "0")}`));
    const cmpPeriods = new Set(cmpWindow.map(w => `${w.year}-${String(w.month + 1).padStart(2, "0")}`));
    const pubIds = new Set(scopedRev.map(r => r.publication_id));
    const rows = [...pubIds].map(id => {
      const cur = sumBy(rev, r => r.publication_id === id && curPeriods.has(r.period));
      const cmp = sumBy(rev, r => r.publication_id === id && cmpPeriods.has(r.period));
      return {
        id,
        name: byId[id]?.name || id,
        cur, cmp,
        d$: cur - cmp,
        dPct: pctChange(cur, cmp),
      };
    });
    rows.sort((a, b) => b.cur - a.cur);
    return rows;
  }, [rev, scopedRev, curWindow, cmpWindow, pubs]);

  // Window label text — e.g. "2026 YTD", "Q2 2026", "Apr 2026", "Trailing 12 (May '25 – Apr '26)"
  const labelFor = (year, window) => {
    if (granularity === "ytd") return `${year} YTD`;
    if (granularity === "month") return `${MONTHS_SHORT[selMonth]} ${year}`;
    if (granularity === "quarter") return `${QUARTERS[selQuarter]} ${year}`;
    if (granularity === "trailing12") {
      if (!window.length) return `Trailing 12 · ${year}`;
      const s = window[0], e = window[window.length - 1];
      const sY = String(s.year).slice(2);
      const eY = String(e.year).slice(2);
      return `T12 · ${MONTHS_SHORT[s.month]} '${sY} – ${MONTHS_SHORT[e.month]} '${eY}`;
    }
    return String(year);
  };

  // -------- Render --------
  if (loading && !rev.length) {
    return <GlassCard style={{ padding: 24 }}>
      <div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND }}>Loading reports…</div>
    </GlassCard>;
  }
  if (err && !rev.length) {
    return <GlassCard style={{ padding: 24 }}>
      <div style={{ fontSize: FS.base, color: Z.da, fontFamily: COND }}>Unable to load report data. {err}</div>
    </GlassCard>;
  }
  if (!yearOptions.length) {
    return <GlassCard style={{ padding: 24 }}>
      <div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND }}>No revenue data available yet.</div>
    </GlassCard>;
  }

  const dPctColor = deltaColor(deltaPct);
  const dPctArrow = deltaArrow(deltaPct);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Filter row */}
    <GlassCard style={{ padding: "14px 18px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <div style={{ minWidth: 140 }}>
          <Sel label="Current year" value={curYear} onChange={e => setCurYear(e.target.value)} options={yearOptions} />
        </div>
        <div style={{ fontSize: FS.sm, color: Z.tm, paddingBottom: 11, fontFamily: COND }}>vs.</div>
        <div style={{ minWidth: 140 }}>
          <Sel label="Comparison year" value={cmpYear} onChange={e => setCmpYear(e.target.value)} options={yearOptions} />
        </div>
        <div style={{ minWidth: 200 }}>
          <Sel label="Publication" value={pubFilter} onChange={e => setPubFilter(e.target.value)} options={pubOptions} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: Z.td, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND }}>View</div>
          <SolidTabs
            options={[
              { value: "month", label: "Month" },
              { value: "quarter", label: "Quarter" },
              { value: "ytd", label: "YTD" },
              { value: "trailing12", label: "Trailing 12" },
            ]}
            active={granularity}
            onChange={setGranularity}
          />
        </div>
      </div>
      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        <RefreshPill lastFetchedAt={lastFetchedAt} onRefresh={load} loading={loading} />
      </div>
      {granularity === "month" && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: FS.sm, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Month:</span>
          <SolidTabs
            options={MONTHS_SHORT.map((m, i) => ({ value: String(i), label: m }))}
            active={String(selMonth)}
            onChange={v => setSelMonth(Number(v))}
          />
        </div>
      )}
      {granularity === "quarter" && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: FS.sm, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Quarter:</span>
          <SolidTabs
            options={QUARTERS.map((q, i) => ({ value: String(i), label: q }))}
            active={String(selQuarter)}
            onChange={v => setSelQuarter(Number(v))}
          />
        </div>
      )}
    </GlassCard>

    {/* Headline stats */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
      <GlassStat label={labelFor(curYear, curWindow)} value={fmtCurrency(curTotal)} />
      <GlassStat label={labelFor(cmpYear, cmpWindow)} value={fmtCurrency(cmpTotal)} />
      <GlassStat
        label="Delta $"
        value={<span style={{ color: deltaColor(deltaPct) }}>{deltaAbs >= 0 ? "+" : "−"}{fmtCurrency(Math.abs(deltaAbs))}</span>}
      />
      <GlassStat
        label="Delta %"
        value={
          deltaPct == null
            ? <span style={{ color: Z.tm }}>n/a</span>
            : <span style={{ color: dPctColor }}>{dPctArrow} {deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%</span>
        }
      />
    </div>

    {/* Monthly grid (always 12 months) */}
    <GlassCard style={{ padding: SP.cardPad }}>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, marginBottom: 12 }}>
        Monthly breakdown — {curYear} vs. {cmpYear}
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>Month</th>
            <th style={{ textAlign: "right" }}>{curYear}</th>
            <th style={{ textAlign: "right" }}>{cmpYear}</th>
            <th style={{ textAlign: "right" }}>$ Δ</th>
            <th style={{ textAlign: "right" }}>% Δ</th>
            <th style={{ width: 160 }}>Bar</th>
          </tr>
        </thead>
        <tbody>
          {monthlyGrid.map(row => {
            const inWindow = curWindow.some(w => w.year === Number(curYear) && w.month === row.monthIdx);
            const max = Math.max(row.cur, row.cmp, 1);
            const dColor = deltaColor(row.dPct);
            return <tr key={row.month} style={inWindow ? { background: "rgba(59,130,246,0.06)" } : undefined}>
              <td style={{ fontWeight: inWindow ? FW.heavy : FW.semi, color: inWindow ? Z.tx : Z.tx }}>{row.month}</td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontFamily: DISPLAY, color: Z.tx }}>
                {row.cur === 0 ? <span style={{ color: Z.tm }}>—</span> : fmtCurrency(row.cur)}
                {row.curDeals > 0 && <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>{row.curDeals} deal{row.curDeals === 1 ? "" : "s"}</div>}
              </td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontFamily: DISPLAY, color: Z.td }}>
                {row.cmp === 0 ? <span style={{ color: Z.tm }}>—</span> : fmtCurrency(row.cmp)}
              </td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: dColor, fontWeight: FW.heavy }}>
                {row.cur === 0 && row.cmp === 0 ? "—" : `${row.d$ >= 0 ? "+" : "−"}${fmtCurrency(Math.abs(row.d$))}`}
              </td>
              <td style={{ textAlign: "right", color: dColor, fontWeight: FW.heavy }}>
                {row.dPct == null ? "—" : `${deltaArrow(row.dPct)} ${row.dPct >= 0 ? "+" : ""}${row.dPct.toFixed(0)}%`}
              </td>
              <td>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ height: 6, background: Z.bg, borderRadius: R }}>
                    <div style={{ height: "100%", width: `${(row.cur / max) * 100}%`, background: Z.ac, borderRadius: R }} />
                  </div>
                  <div style={{ height: 6, background: Z.bg, borderRadius: R }}>
                    <div style={{ height: "100%", width: `${(row.cmp / max) * 100}%`, background: Z.tm, borderRadius: R, opacity: 0.6 }} />
                  </div>
                </div>
              </td>
            </tr>;
          })}
          <tr style={{ borderTop: `2px solid ${Z.bd}` }}>
            <td style={{ fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>Total</td>
            <td style={{ textAlign: "right", fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>{fmtCurrency(monthlyTotal.cur)}</td>
            <td style={{ textAlign: "right", fontWeight: FW.black, fontFamily: DISPLAY, color: Z.td }}>{fmtCurrency(monthlyTotal.cmp)}</td>
            <td style={{ textAlign: "right", fontWeight: FW.black, color: deltaColor(monthlyTotal.dPct) }}>
              {monthlyTotal.d$ >= 0 ? "+" : "−"}{fmtCurrency(Math.abs(monthlyTotal.d$))}
            </td>
            <td style={{ textAlign: "right", fontWeight: FW.black, color: deltaColor(monthlyTotal.dPct) }}>
              {monthlyTotal.dPct == null ? "—" : `${deltaArrow(monthlyTotal.dPct)} ${monthlyTotal.dPct >= 0 ? "+" : ""}${monthlyTotal.dPct.toFixed(0)}%`}
            </td>
            <td />
          </tr>
        </tbody>
      </DataTable>
    </GlassCard>

    {/* Per-publication breakdown */}
    <GlassCard style={{ padding: SP.cardPad }}>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, marginBottom: 12 }}>
        Per-publication — {labelFor(curYear, curWindow)} vs. {labelFor(cmpYear, cmpWindow)}
      </div>
      {perPub.length === 0 ? (
        <div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND }}>No publications with revenue in this window.</div>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Publication</th>
              <th style={{ textAlign: "right" }}>{labelFor(curYear, curWindow)}</th>
              <th style={{ textAlign: "right" }}>{labelFor(cmpYear, cmpWindow)}</th>
              <th style={{ textAlign: "right" }}>$ Δ</th>
              <th style={{ textAlign: "right" }}>% Δ</th>
            </tr>
          </thead>
          <tbody>
            {perPub.map(p => {
              const dColor = deltaColor(p.dPct);
              return <tr key={p.id}>
                <td style={{ fontWeight: FW.heavy, color: Z.tx }}>{p.name}</td>
                <td style={{ textAlign: "right", fontFamily: DISPLAY, color: Z.tx }}>{p.cur === 0 ? <span style={{ color: Z.tm }}>—</span> : fmtCurrency(p.cur)}</td>
                <td style={{ textAlign: "right", fontFamily: DISPLAY, color: Z.td }}>{p.cmp === 0 ? <span style={{ color: Z.tm }}>—</span> : fmtCurrency(p.cmp)}</td>
                <td style={{ textAlign: "right", color: dColor, fontWeight: FW.heavy }}>
                  {p.cur === 0 && p.cmp === 0 ? "—" : `${p.d$ >= 0 ? "+" : "−"}${fmtCurrency(Math.abs(p.d$))}`}
                </td>
                <td style={{ textAlign: "right", color: dColor, fontWeight: FW.heavy }}>
                  {p.dPct == null ? "—" : `${deltaArrow(p.dPct)} ${p.dPct >= 0 ? "+" : ""}${p.dPct.toFixed(0)}%`}
                </td>
              </tr>;
            })}
            <tr style={{ borderTop: `2px solid ${Z.bd}` }}>
              <td style={{ fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>All Publications</td>
              <td style={{ textAlign: "right", fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>{fmtCurrency(curTotal)}</td>
              <td style={{ textAlign: "right", fontWeight: FW.black, fontFamily: DISPLAY, color: Z.td }}>{fmtCurrency(cmpTotal)}</td>
              <td style={{ textAlign: "right", fontWeight: FW.black, color: deltaColor(deltaPct) }}>
                {deltaAbs >= 0 ? "+" : "−"}{fmtCurrency(Math.abs(deltaAbs))}
              </td>
              <td style={{ textAlign: "right", fontWeight: FW.black, color: deltaColor(deltaPct) }}>
                {deltaPct == null ? "—" : `${deltaArrow(deltaPct)} ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(0)}%`}
              </td>
            </tr>
          </tbody>
        </DataTable>
      )}
    </GlassCard>
  </div>;
};

export default YearOverYearTab;
