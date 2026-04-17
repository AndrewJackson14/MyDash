// ============================================================
// Performance.jsx — Publisher-facing team performance dashboard
// (Sales / Editorial / Production / Admin), driven by
// usePerformanceData so every tab stays consistent with the
// selected time window and team filter.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Btn, PageHeader, TabRow, TB, Sel } from "../components/ui";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { usePerformanceData } from "./performance/usePerformanceData";
import SalesMetrics from "./performance/SalesMetrics";
import EditorialMetrics from "./performance/EditorialMetrics";
import ProductionMetrics from "./performance/ProductionMetrics";
import AdminMetrics from "./performance/AdminMetrics";

const DEPT_TABS = ["Sales", "Editorial", "Production", "Admin"];
const PERIOD_TABS = ["This Week", "This Month", "Custom"];

const PERIOD_TO_PRESET = { "This Week": "week", "This Month": "month", "Custom": "custom" };

export default function Performance({ sales, clients, stories, issues, adProjects, loadAdProjects, team, onNavigate, isActive }) {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Performance" }], title: "Performance" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  const [dept, setDept] = useState("Sales");
  const [period, setPeriod] = useState("This Month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");

  // Ad projects are lazy-loaded elsewhere in the app. Trigger the load
  // when Performance mounts so the Production tab has real data on first
  // visit instead of an empty state.
  useEffect(() => {
    if (loadAdProjects) loadAdProjects();
  }, [loadAdProjects]);

  const preset = PERIOD_TO_PRESET[period] || "month";

  // Team filter options depend on the active department so the publisher
  // can scope to a sales rep, editor, designer, etc. Default "all".
  const teamOptions = useMemo(() => {
    const allOption = { value: "all", label: "All team" };
    const roleFilter = {
      Sales: t => ["Sales Manager", "Salesperson"].includes(t.role),
      Editorial: t => ["Content Editor", "Copy Editor", "Editor"].includes(t.role),
      Production: t => ["Ad Designer", "Layout Designer", "Production", "Designer"].includes(t.role),
      Admin: t => ["Office Administrator", "Admin", "Publisher"].includes(t.role),
    }[dept];
    const filtered = (team || []).filter(t => roleFilter ? roleFilter(t) : true);
    return [allOption, ...filtered.map(t => ({ value: t.id, label: t.name }))];
  }, [team, dept]);

  const data = usePerformanceData({
    preset,
    customStart: customStart || null,
    customEnd: customEnd || null,
    teamFilter,
    sales, clients, stories, issues, adProjects, team,
  });

  const rangeLabel = useMemo(() => {
    const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(data.range.start)} \u2014 ${fmt(new Date(data.range.end.getTime() - 1))}`;
  }, [data.range]);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Action row — title moved to TopBar via usePageHeader. */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <Sel value={teamFilter} onChange={e => setTeamFilter(e.target.value)} options={teamOptions} />
      <span style={{ fontSize: FS.sm, color: Z.td, fontFamily: COND }}>{rangeLabel}</span>
    </div>

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <TabRow>
        <TB tabs={DEPT_TABS} active={dept} onChange={setDept} />
      </TabRow>
      <TabRow>
        <TB tabs={PERIOD_TABS} active={period} onChange={setPeriod} />
      </TabRow>
    </div>

    {period === "Custom" && <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", background: Z.sa, borderRadius: Ri }}>
      <label style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Start</label>
      <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
        style={{ padding: "5px 8px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, outline: "none", fontFamily: "inherit" }} />
      <label style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>End</label>
      <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
        style={{ padding: "5px 8px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, outline: "none", fontFamily: "inherit" }} />
    </div>}

    {dept === "Sales" && <SalesMetrics data={data.sales} onNavigate={onNavigate} />}
    {dept === "Editorial" && <EditorialMetrics data={data.editorial} onNavigate={onNavigate} />}
    {dept === "Production" && <ProductionMetrics data={data.production} onNavigate={onNavigate} />}
    {dept === "Admin" && <AdminMetrics data={data.admin} loading={data.adminLoading} onNavigate={onNavigate} />}
  </div>;
}
