import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Z, COND, DISPLAY, FS, FW, R, SP } from "../../lib/theme";
import { GlassCard, GlassStat, DataTable, Sel, SolidTabs, EntityLink } from "../../components/ui";
import { fmtCurrencyWhole as fmtCurrency } from "../../lib/formatters";
import { pacingColor, pacingIcon } from "./comparisonColors";
import { daysElapsedPct, isYearComplete, isPeriodFuture } from "./pacing";
import RefreshPill from "./RefreshPill";
import { useNav } from "../../hooks/useNav";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const pct = (num, den) => (den > 0 ? (num / den) * 100 : null);
const fmtPct = (p) => (p == null ? "—" : `${p.toFixed(0)}%`);

const RevenueVsGoalsTab = ({ pubs, onNavigate }) => {
  const nav = useNav(onNavigate);

  const now = useMemo(() => new Date(), []);
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [goals, setGoals] = useState([]); // publication_monthly_goals
  const [rev, setRev] = useState([]);     // publication_monthly_revenue
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const inflight = useRef(false);

  const [granularity, setGranularity] = useState("annual"); // month | quarter | annual
  const [year, setYear] = useState(String(thisYear));
  const [pubFilter, setPubFilter] = useState("all");
  const [selMonth, setSelMonth] = useState(thisMonth);
  const [selQuarter, setSelQuarter] = useState(Math.floor(thisMonth / 3));

  // Fetch full ranges. Both views are small.
  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true); setErr(null);
    const [goalsRes, revRes] = await Promise.all([
      supabase.from("publication_monthly_goals").select("publication_id, period, goal_amount"),
      supabase.from("publication_monthly_revenue").select("publication_id, period, actual_revenue"),
    ]);
    inflight.current = false;
    if (goalsRes.error || revRes.error) {
      setErr((goalsRes.error || revRes.error)?.message || "Failed to load report data.");
      setLoading(false);
      return;
    }
    setGoals(goalsRes.data || []);
    setRev(revRes.data || []);
    setLastFetchedAt(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [load]);

  // Year options: union of goal-years and revenue-years, newest first.
  const yearOptions = useMemo(() => {
    const s = new Set();
    goals.forEach(g => { if (Number(g.goal_amount) > 0) s.add(g.period?.slice(0, 4)); });
    rev.forEach(r => { if (Number(r.actual_revenue) > 0) s.add(r.period?.slice(0, 4)); });
    return [...s].filter(Boolean).sort().reverse();
  }, [goals, rev]);

  useEffect(() => {
    if (!yearOptions.length) return;
    if (!yearOptions.includes(year)) setYear(yearOptions[0]);
  }, [yearOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const pubOptions = useMemo(() => {
    const active = new Set([...goals.map(g => g.publication_id), ...rev.map(r => r.publication_id)]);
    const byId = Object.fromEntries((pubs || []).map(p => [p.id, p]));
    const opts = [...active]
      .filter(id => byId[id])
      .map(id => ({ value: id, label: byId[id].name }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "all", label: "All publications" }, ...opts];
  }, [goals, rev, pubs]);

  // Scope rows to selected year + pub filter.
  const scopedGoals = useMemo(
    () => goals.filter(g => g.period?.startsWith(year) && (pubFilter === "all" || g.publication_id === pubFilter)),
    [goals, year, pubFilter]
  );
  const scopedRev = useMemo(
    () => rev.filter(r => r.period?.startsWith(year) && (pubFilter === "all" || r.publication_id === pubFilter)),
    [rev, year, pubFilter]
  );

  // Per-month: { period, goal, actual }
  const months = useMemo(() => {
    return MONTHS_SHORT.map((short, m) => {
      const period = `${year}-${String(m + 1).padStart(2, "0")}`;
      const goal = scopedGoals.filter(g => g.period === period).reduce((a, g) => a + Number(g.goal_amount || 0), 0);
      const actual = scopedRev.filter(r => r.period === period).reduce((a, r) => a + Number(r.actual_revenue || 0), 0);
      return {
        period, m, short, goal, actual,
        pct: pct(actual, goal),
        future: isPeriodFuture(period),
      };
    });
  }, [scopedGoals, scopedRev, year]);

  // Window definition for the current granularity (list of month indices in [0,11]).
  const windowMonths = useMemo(() => {
    if (granularity === "annual") return months.map((_, i) => i);
    if (granularity === "quarter") return [0, 1, 2].map(i => selQuarter * 3 + i);
    if (granularity === "month") return [selMonth];
    return [];
  }, [granularity, selMonth, selQuarter, months]);

  const windowGoal = useMemo(() => windowMonths.reduce((a, i) => a + (months[i]?.goal || 0), 0), [windowMonths, months]);
  const windowActual = useMemo(() => windowMonths.reduce((a, i) => a + (months[i]?.actual || 0), 0), [windowMonths, months]);
  const windowPct = pct(windowActual, windowGoal);

  const elapsed = daysElapsedPct(year, granularity, granularity === "month" ? selMonth : selQuarter * 3);
  const pacingDelta = windowPct == null ? null : windowPct - elapsed;

  // Per-publication view respects granularity + pub filter (but pub filter "all" is already the breakdown).
  const perPub = useMemo(() => {
    const byId = Object.fromEntries((pubs || []).map(p => [p.id, p]));
    const inWindow = new Set(windowMonths.map(i => `${year}-${String(i + 1).padStart(2, "0")}`));
    const ids = new Set([
      ...scopedGoals.filter(g => inWindow.has(g.period)).map(g => g.publication_id),
      ...scopedRev.filter(r => inWindow.has(r.period)).map(r => r.publication_id),
    ]);
    const rows = [...ids].map(id => {
      const goal = scopedGoals
        .filter(g => g.publication_id === id && inWindow.has(g.period))
        .reduce((a, g) => a + Number(g.goal_amount || 0), 0);
      const actual = scopedRev
        .filter(r => r.publication_id === id && inWindow.has(r.period))
        .reduce((a, r) => a + Number(r.actual_revenue || 0), 0);
      return { id, name: byId[id]?.name || id, goal, actual, pct: pct(actual, goal) };
    });
    rows.sort((a, b) => {
      // primary: by pct desc (nulls at bottom). secondary: by goal desc.
      if (a.pct == null && b.pct == null) return b.goal - a.goal;
      if (a.pct == null) return 1;
      if (b.pct == null) return -1;
      return b.pct - a.pct;
    });
    return rows;
  }, [scopedGoals, scopedRev, windowMonths, year, pubs]);

  const yearDone = isYearComplete(year);
  const hasGoals = windowGoal > 0;
  const hasActual = windowActual > 0;

  // Render helpers
  const granLabel = granularity === "annual"
    ? `${year}`
    : granularity === "quarter"
      ? `${QUARTERS[selQuarter]} ${year}`
      : `${MONTHS_SHORT[selMonth]} ${year}`;

  if (loading && !goals.length && !rev.length) {
    return <GlassCard style={{ padding: 24 }}><div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND }}>Loading reports…</div></GlassCard>;
  }
  if (err && !goals.length && !rev.length) {
    return <GlassCard style={{ padding: 24 }}><div style={{ fontSize: FS.base, color: Z.da, fontFamily: COND }}>Unable to load report data. {err}</div></GlassCard>;
  }
  if (!yearOptions.length) {
    return <GlassCard style={{ padding: 24 }}><div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND }}>No revenue or goal data available yet.</div></GlassCard>;
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Filter row */}
    <GlassCard style={{ padding: "14px 18px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <div style={{ minWidth: 140 }}>
          <Sel label="Year" value={year} onChange={e => setYear(e.target.value)} options={yearOptions} />
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
              { value: "annual", label: "Annual" },
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
          <SolidTabs options={MONTHS_SHORT.map((m, i) => ({ value: String(i), label: m }))} active={String(selMonth)} onChange={v => setSelMonth(Number(v))} />
        </div>
      )}
      {granularity === "quarter" && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: FS.sm, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Quarter:</span>
          <SolidTabs options={QUARTERS.map((q, i) => ({ value: String(i), label: q }))} active={String(selQuarter)} onChange={v => setSelQuarter(Number(v))} />
        </div>
      )}
    </GlassCard>

    {/* Pacing / summary card */}
    <GlassCard style={{ padding: 24 }}>
      {!hasGoals && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>No goals set for {granLabel}</div>
          <div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND }}>
            Set issue goals in <span style={{ color: Z.ac, fontWeight: FW.heavy }}>Publications → Goals</span>. They roll up here automatically.
          </div>
          {hasActual && (
            <div style={{ marginTop: 8, fontSize: FS.base, color: Z.tx, fontFamily: COND }}>
              Actual revenue recorded: <span style={{ fontWeight: FW.heavy, fontFamily: DISPLAY }}>{fmtCurrency(windowActual)}</span>
            </div>
          )}
        </div>
      )}

      {hasGoals && yearDone && (
        // Past year: show final summary, skip pacing.
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>{granLabel} Final</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <div style={{ fontSize: 40, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, letterSpacing: -1 }}>
              {fmtCurrency(windowActual)}
            </div>
            <div style={{ fontSize: FS.md, color: Z.tm, fontFamily: COND }}>of {fmtCurrency(windowGoal)} goal</div>
            <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: pacingColor(windowPct), fontFamily: DISPLAY }}>
              {pacingIcon(windowPct)} {fmtPct(windowPct)}
            </div>
          </div>
          <div style={{ height: 10, background: Z.bg, borderRadius: R, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, windowPct || 0)}%`,
              background: pacingColor(windowPct),
              borderRadius: R,
            }} />
          </div>
        </div>
      )}

      {hasGoals && !yearDone && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>
            Pacing · {granLabel}
          </div>
          <div style={{ fontSize: FS.md, color: Z.tx, fontFamily: COND }}>
            You're <span style={{ fontWeight: FW.heavy }}>{elapsed.toFixed(0)}%</span> through the {granularity === "annual" ? "year" : granularity === "quarter" ? "quarter" : "month"}.
          </div>
          <div style={{ fontSize: FS.md, color: Z.tx, fontFamily: COND }}>
            You're at <span style={{ fontWeight: FW.heavy, color: pacingColor(windowPct) }}>{fmtPct(windowPct)}</span> of the {granularity === "annual" ? "annual" : granularity === "quarter" ? "quarter" : "month"} goal.
          </div>
          <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: pacingDelta == null ? Z.tm : pacingDelta >= 2 ? Z.go : pacingDelta <= -2 ? Z.da : Z.wa, fontFamily: COND }}>
            {pacingDelta == null
              ? "—"
              : pacingDelta >= 2
                ? `✓ Pacing ahead (+${pacingDelta.toFixed(0)} pts)`
                : pacingDelta <= -2
                  ? `✗ Pacing behind (${pacingDelta.toFixed(0)} pts)`
                  : `→ On pace (${pacingDelta >= 0 ? "+" : ""}${pacingDelta.toFixed(0)} pts)`}
          </div>
          <div style={{ marginTop: 4, height: 10, background: Z.bg, borderRadius: R, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, windowPct || 0)}%`, background: pacingColor(windowPct), borderRadius: R }} />
          </div>
          <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND, fontVariantNumeric: "tabular-nums" }}>
            {fmtCurrency(windowActual)} / {fmtCurrency(windowGoal)}
          </div>
        </div>
      )}
    </GlassCard>

    {/* Monthly pacing grid */}
    <GlassCard style={{ padding: SP.cardPad }}>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, marginBottom: 12 }}>
        Monthly pacing — {year}
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>Month</th>
            <th style={{ textAlign: "right" }}>Goal</th>
            <th style={{ textAlign: "right" }}>Actual</th>
            <th style={{ textAlign: "right" }}>%</th>
            <th style={{ textAlign: "center", width: 60 }}>Status</th>
            <th style={{ width: 160 }}>Bar</th>
          </tr>
        </thead>
        <tbody>
          {months.map(m => {
            const inWindow = windowMonths.includes(m.m);
            const status = m.future ? "—" : pacingIcon(m.pct);
            const statusColor = m.future ? Z.tm : pacingColor(m.pct);
            const barPct = m.goal > 0 ? Math.min(100, (m.actual / m.goal) * 100) : 0;
            const overflow = m.goal > 0 && m.actual > m.goal;
            return <tr key={m.short} style={inWindow ? { background: "rgba(59,130,246,0.06)" } : undefined}>
              <td style={{ fontWeight: inWindow ? FW.heavy : FW.semi, color: Z.tx }}>{m.short}</td>
              <td style={{ textAlign: "right", fontFamily: DISPLAY, color: Z.td }}>
                {m.goal === 0 ? <span style={{ color: Z.tm }}>—</span> : fmtCurrency(m.goal)}
              </td>
              <td style={{ textAlign: "right", fontFamily: DISPLAY, color: Z.tx }}>
                {m.future
                  ? <span style={{ color: Z.tm }}>—</span>
                  : m.actual === 0
                    ? <span style={{ color: Z.tm }}>—</span>
                    : fmtCurrency(m.actual)}
              </td>
              <td style={{ textAlign: "right", color: statusColor, fontWeight: FW.heavy }}>
                {m.future ? "—" : fmtPct(m.pct)}
              </td>
              <td style={{ textAlign: "center", color: statusColor, fontWeight: FW.heavy }}>{status}</td>
              <td>
                <div style={{ height: 8, background: Z.bg, borderRadius: R, overflow: "hidden", position: "relative" }}>
                  <div style={{ height: "100%", width: `${barPct}%`, background: overflow ? Z.go : (m.future ? Z.tm : pacingColor(m.pct)), borderRadius: R, opacity: m.future ? 0.25 : 1 }} />
                </div>
              </td>
            </tr>;
          })}
          <tr style={{ borderTop: `2px solid ${Z.bd}` }}>
            {(() => {
              const totalGoal = months.reduce((a, x) => a + x.goal, 0);
              const totalActual = months.reduce((a, x) => a + (x.future ? 0 : x.actual), 0);
              const totalPct = pct(totalActual, totalGoal);
              return <>
                <td style={{ fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>Total</td>
                <td style={{ textAlign: "right", fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>{fmtCurrency(totalGoal)}</td>
                <td style={{ textAlign: "right", fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx }}>{fmtCurrency(totalActual)}</td>
                <td style={{ textAlign: "right", fontWeight: FW.black, color: pacingColor(totalPct) }}>{fmtPct(totalPct)}</td>
                <td style={{ textAlign: "center", fontWeight: FW.black, color: pacingColor(totalPct) }}>{pacingIcon(totalPct)}</td>
                <td />
              </>;
            })()}
          </tr>
        </tbody>
      </DataTable>
    </GlassCard>

    {/* Per-publication pacing */}
    <GlassCard style={{ padding: SP.cardPad }}>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, marginBottom: 12 }}>
        Per-publication — {granLabel}
      </div>
      {perPub.length === 0 ? (
        <div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND }}>No publications with goal or revenue data for this window.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {perPub.map(p => {
            const barPct = p.goal > 0 ? Math.min(100, (p.actual / p.goal) * 100) : 0;
            const overflow = p.goal > 0 && p.actual > p.goal;
            return <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND, minWidth: 200 }}>
                  <EntityLink onClick={nav.toReport("Sales by Issue", { pubId: p.id, year })}>{p.name}</EntityLink>
                </div>
                <div style={{ fontSize: FS.md, fontFamily: DISPLAY, color: Z.tx }}>
                  {fmtCurrency(p.actual)} <span style={{ color: Z.tm }}>/ {p.goal > 0 ? fmtCurrency(p.goal) : "no goal"}</span>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: FS.md, fontWeight: FW.black, color: pacingColor(p.pct), fontFamily: DISPLAY }}>
                  {pacingIcon(p.pct)} {fmtPct(p.pct)}
                </div>
              </div>
              <div style={{ height: 8, background: Z.bg, borderRadius: R, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${barPct}%`, background: overflow ? Z.go : pacingColor(p.pct), borderRadius: R }} />
              </div>
            </div>;
          })}
        </div>
      )}
    </GlassCard>
  </div>;
};

export default RevenueVsGoalsTab;
