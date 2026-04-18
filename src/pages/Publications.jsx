import { useState, useRef, useEffect, useMemo } from "react";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { useAuth } from "../hooks/useAuth";
import { Z, SC, COND, DISPLAY, FS, FW, Ri, CARD, R, INV, TOGGLE, ACCENT } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, Bar, FilterBar, SortHeader, BackBtn, ThemeToggle , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid, glass } from "../components/ui";
import { supabase } from "../lib/supabase";
import EZSchedule from "./EZSchedule";

const FREQ_OPTIONS = ["Weekly", "Bi-Weekly", "Semi-Monthly", "Monthly", "Bi-Monthly", "Quarterly", "Semi-Annual", "Annual"];
const TYPE_OPTIONS = ["Magazine", "Newspaper", "Special Publication"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtMoney = (n) => "$" + Math.round(Number(n) || 0).toLocaleString();

// ============================================================
// GoalsSubtab — Publisher-only goal entry for the Financials cascade.
// Issue goals are the single source of truth. Month/year rollups are
// shown read-only, derived client-side from the issue-level goals.
// Writes go through updateIssueGoal which upserts commission_issue_goals
// (triggering the allocation rebuild via the db trigger in migration 051).
// ============================================================
const GoalsSubtab = ({ pubs, issues, commissionGoals, salespersonPubAssignments, team, updateIssueGoal }) => {
  const activePubs = (pubs || []).filter(p => !p.dormant);
  const [selPubId, setSelPubId] = useState(activePubs[0]?.id || "");
  const currentYear = new Date().getFullYear();
  const [selYear, setSelYear] = useState(currentYear);
  const [expanded, setExpanded] = useState(new Set());
  const [editDraft, setEditDraft] = useState({});
  const [bulkAnnual, setBulkAnnual] = useState("");
  const [bulkPct, setBulkPct] = useState("");
  const [allocationsByIssue, setAllocationsByIssue] = useState({});
  const [actualsByMonth, setActualsByMonth] = useState({});

  // commission_issue_goals lookup so the UI reflects the canonical source
  // even when issues.revenueGoal hasn't been synced for some reason.
  const goalByIssue = useMemo(() => {
    const m = {};
    (commissionGoals || []).forEach(cg => { if (cg.issueId) m[cg.issueId] = Number(cg.goal) || 0; });
    return m;
  }, [commissionGoals]);

  const pubIssues = useMemo(() => {
    const yearStr = String(selYear);
    return (issues || [])
      .filter(i => i.pubId === selPubId && (i.date || "").startsWith(yearStr))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [issues, selPubId, selYear]);

  const yearOptions = useMemo(() => {
    const years = new Set();
    (issues || []).filter(i => i.pubId === selPubId).forEach(i => {
      const y = (i.date || "").slice(0, 4);
      if (y) years.add(y);
    });
    years.add(String(currentYear));
    return Array.from(years).sort();
  }, [issues, selPubId, currentYear]);

  const effectiveGoal = (iss) => {
    const draft = editDraft[iss.id];
    if (draft !== undefined && draft !== "") return Number(draft) || 0;
    return goalByIssue[iss.id] ?? Number(iss.revenueGoal) ?? 0;
  };

  // Group issues by month. Annual roll-up math is just a sum.
  const months = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, i) => ({ monthIdx: i, period: `${selYear}-${String(i + 1).padStart(2, "0")}`, issues: [], goal: 0 }));
    pubIssues.forEach(iss => {
      const m = Number((iss.date || "").slice(5, 7)) - 1;
      if (m < 0 || m > 11) return;
      buckets[m].issues.push(iss);
    });
    buckets.forEach(b => { b.goal = b.issues.reduce((s, iss) => s + effectiveGoal(iss), 0); });
    return buckets;
  }, [pubIssues, selYear, editDraft, goalByIssue]);

  const annualGoal = months.reduce((s, m) => s + m.goal, 0);

  // Fetch allocations + actuals for selPubId + selYear
  useEffect(() => {
    if (!selPubId) return;
    let cancelled = false;
    (async () => {
      const [{ data: allocs }, { data: actRows }] = await Promise.all([
        supabase.from("issue_goal_allocations")
          .select("issue_id, salesperson_id, share_pct, allocated_goal, is_frozen")
          .in("issue_id", pubIssues.map(i => i.id).filter(Boolean)),
        supabase.from("publication_monthly_revenue")
          .select("period, actual_revenue")
          .eq("publication_id", selPubId)
          .like("period", `${selYear}-%`),
      ]);
      if (cancelled) return;
      const byIssue = {};
      (allocs || []).forEach(a => {
        if (!byIssue[a.issue_id]) byIssue[a.issue_id] = [];
        byIssue[a.issue_id].push(a);
      });
      setAllocationsByIssue(byIssue);
      const byMonth = {};
      (actRows || []).forEach(r => { byMonth[r.period] = Number(r.actual_revenue) || 0; });
      setActualsByMonth(byMonth);
    })();
    return () => { cancelled = true; };
  }, [selPubId, selYear, pubIssues.length]);

  const isIssueFrozen = (issueId) => (allocationsByIssue[issueId] || []).some(a => a.is_frozen);

  const toggleMonth = (period) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(period)) n.delete(period); else n.add(period);
    return n;
  });

  const commitGoal = async (iss, raw) => {
    const n = Math.max(0, Math.round(Number(raw) || 0));
    setEditDraft(d => { const c = { ...d }; delete c[iss.id]; return c; });
    if (updateIssueGoal) await updateIssueGoal(iss.id, n);
  };

  const distributeEvenly = async () => {
    const total = Math.max(0, Math.round(Number(bulkAnnual) || 0));
    if (!total) return;
    const targets = pubIssues.filter(i => !isIssueFrozen(i.id));
    if (targets.length === 0) return;
    const per = Math.round(total / targets.length);
    for (const iss of targets) {
      await updateIssueGoal?.(iss.id, per);
    }
    setBulkAnnual("");
  };

  const bumpByPct = async () => {
    const pct = Number(bulkPct) || 0;
    if (!pct) return;
    for (const iss of pubIssues) {
      if (isIssueFrozen(iss.id)) continue;
      const curr = goalByIssue[iss.id] ?? Number(iss.revenueGoal) ?? 0;
      const next = Math.max(0, Math.round(curr * (1 + pct / 100)));
      await updateIssueGoal?.(iss.id, next);
    }
    setBulkPct("");
  };

  // Read-only salesperson allocation preview based on current
  // salesperson_pub_assignments × the derived annual goal for selPubId.
  const activeAssignments = (salespersonPubAssignments || []).filter(a => a.publicationId === selPubId && a.isActive !== false && (a.percentage || 0) > 0);
  const teamById = useMemo(() => { const m = {}; (team || []).forEach(t => { m[t.id] = t; }); return m; }, [team]);

  const labelFor = (iss) => iss.label || (iss.date || "").slice(0, 10);

  // Rollup: YTD goal running sum for a quick "where are we tracking?" read
  let ytdSum = 0;
  const monthsRollup = months.map(m => { ytdSum += m.goal; return { ...m, ytdGoal: ytdSum }; });

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {/* Picker row */}
    <GlassCard>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 1fr", gap: 12, alignItems: "flex-end" }}>
        <Sel label="Publication" value={selPubId} onChange={e => setSelPubId(e.target.value)} options={activePubs.map(p => ({ value: p.id, label: p.name }))} />
        <Sel label="Year" value={String(selYear)} onChange={e => setSelYear(Number(e.target.value))} options={yearOptions.map(y => ({ value: y, label: y }))} />
        <div style={{ padding: "10px 12px", background: Z.bg, borderRadius: Ri, textAlign: "right" }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>Annual Goal</div>
          <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{fmtMoney(annualGoal)}</div>
        </div>
      </div>
    </GlassCard>

    {/* Bulk ops */}
    <GlassCard>
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontFamily: COND }}>Bulk Adjustments</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Inp label="Annual $ (split evenly across non-frozen issues)" type="number" value={bulkAnnual} onChange={e => setBulkAnnual(e.target.value)} placeholder="e.g. 500000" />
        </div>
        <Btn onClick={distributeEvenly} disabled={!bulkAnnual}>Distribute Evenly</Btn>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Inp label="Bump every issue by %" type="number" value={bulkPct} onChange={e => setBulkPct(e.target.value)} placeholder="e.g. 5" />
        </div>
        <Btn v="secondary" onClick={bumpByPct} disabled={!bulkPct}>Apply %</Btn>
      </div>
      <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 6 }}>Bulk ops only affect non-frozen issues. Issues sent to press stay at their historical allocation.</div>
    </GlassCard>

    {/* Month rollup + expandable issue editing */}
    <GlassCard noPad style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${Z.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>{selYear} · {pubIssues.length} issues</span>
        <span style={{ fontSize: FS.xs, color: Z.td }}>Click a month to expand issue-level goals</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 70px 110px 110px 110px 90px", gap: 0, alignItems: "center" }}>
        <div style={{ padding: "10px 16px", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, background: Z.sa }}>Month</div>
        <div style={{ padding: "10px 8px", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, background: Z.sa, textAlign: "right" }}>Issues</div>
        <div style={{ padding: "10px 8px", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, background: Z.sa, textAlign: "right" }}>Goal</div>
        <div style={{ padding: "10px 8px", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, background: Z.sa, textAlign: "right" }}>YTD Goal</div>
        <div style={{ padding: "10px 8px", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, background: Z.sa, textAlign: "right" }}>Actual</div>
        <div style={{ padding: "10px 16px", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, background: Z.sa, textAlign: "right" }}>Δ %</div>

        {monthsRollup.map(m => {
          const open = expanded.has(m.period);
          const actual = actualsByMonth[m.period] || 0;
          const variance = m.goal > 0 ? Math.round(((actual - m.goal) / m.goal) * 100) : null;
          const varColor = variance === null ? Z.tm : variance >= 0 ? Z.go : variance >= -20 ? Z.wa : Z.da;
          const disabledRow = m.issues.length === 0;
          return <div key={m.period} style={{ display: "contents" }}>
            <div onClick={disabledRow ? undefined : () => toggleMonth(m.period)} style={{ padding: "10px 16px", borderTop: `1px solid ${Z.bd}20`, cursor: disabledRow ? "default" : "pointer", color: disabledRow ? Z.td : Z.tx, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: Z.tm, width: 10 }}>{m.issues.length === 0 ? "" : open ? "▼" : "▶"}</span>
              <span style={{ fontWeight: FW.semi, fontFamily: COND }}>{MONTH_NAMES[m.monthIdx]}</span>
            </div>
            <div style={{ padding: "10px 8px", borderTop: `1px solid ${Z.bd}20`, textAlign: "right", color: Z.tm, fontSize: FS.sm }}>{m.issues.length}</div>
            <div style={{ padding: "10px 8px", borderTop: `1px solid ${Z.bd}20`, textAlign: "right", fontWeight: FW.bold, color: m.goal > 0 ? Z.tx : Z.td, fontFamily: DISPLAY }}>{fmtMoney(m.goal)}</div>
            <div style={{ padding: "10px 8px", borderTop: `1px solid ${Z.bd}20`, textAlign: "right", color: Z.tm, fontFamily: DISPLAY }}>{fmtMoney(m.ytdGoal)}</div>
            <div style={{ padding: "10px 8px", borderTop: `1px solid ${Z.bd}20`, textAlign: "right", color: actual > 0 ? Z.tx : Z.td, fontFamily: DISPLAY }}>{actual > 0 ? fmtMoney(actual) : "—"}</div>
            <div style={{ padding: "10px 16px", borderTop: `1px solid ${Z.bd}20`, textAlign: "right", fontWeight: FW.heavy, color: varColor, fontFamily: DISPLAY }}>{variance === null ? "—" : `${variance > 0 ? "+" : ""}${variance}%`}</div>

            {open && m.issues.map(iss => {
              const frozen = isIssueFrozen(iss.id);
              const goalVal = effectiveGoal(iss);
              return <div key={iss.id} style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 8, padding: "8px 16px 8px 48px", borderTop: `1px solid ${Z.bd}10`, background: Z.bg, alignItems: "center" }}>
                <div style={{ fontSize: FS.sm, color: Z.tx, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: FS.xs, color: Z.td, fontFamily: COND, minWidth: 80 }}>{(iss.date || "").slice(5)}</span>
                  <span style={{ fontWeight: FW.semi }}>{labelFor(iss)}</span>
                  {frozen && <span title="Sent to press — frozen" style={{ fontSize: 11, color: Z.wa, fontWeight: FW.bold, fontFamily: COND }}>🔒 FROZEN</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <input
                    type="number"
                    value={editDraft[iss.id] !== undefined ? editDraft[iss.id] : goalVal}
                    onChange={e => setEditDraft(d => ({ ...d, [iss.id]: e.target.value }))}
                    onBlur={e => editDraft[iss.id] !== undefined && commitGoal(iss, e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    disabled={frozen}
                    style={{ width: 140, padding: "6px 10px", textAlign: "right", background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, color: frozen ? Z.tm : Z.tx, fontSize: FS.sm, fontFamily: DISPLAY, fontWeight: FW.bold, outline: "none", opacity: frozen ? 0.5 : 1 }}
                  />
                </div>
              </div>;
            })}
          </div>;
        })}
      </div>
    </GlassCard>

    {/* Salesperson allocation preview */}
    <GlassCard>
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontFamily: COND }}>Salesperson Allocation Preview</div>
      {activeAssignments.length === 0 ? (
        <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No salesperson assignments for this publication yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 130px 130px", gap: 0 }}>
          <div style={{ padding: "8px 12px", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, background: Z.sa }}>Salesperson</div>
          <div style={{ padding: "8px 12px", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, background: Z.sa, textAlign: "right" }}>Share</div>
          <div style={{ padding: "8px 12px", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, background: Z.sa, textAlign: "right" }}>Annual Goal</div>
          <div style={{ padding: "8px 12px", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, background: Z.sa, textAlign: "right" }}>Monthly Avg</div>
          {activeAssignments.map(a => {
            const tm = teamById[a.salespersonId];
            const share = Number(a.percentage) || 0;
            const annual = annualGoal * share / 100;
            return <div key={a.id} style={{ display: "contents" }}>
              <div style={{ padding: "8px 12px", borderTop: `1px solid ${Z.bd}20`, fontWeight: FW.semi, color: Z.tx }}>{tm?.name || "Unknown"}</div>
              <div style={{ padding: "8px 12px", borderTop: `1px solid ${Z.bd}20`, textAlign: "right", color: Z.tm }}>{share}%</div>
              <div style={{ padding: "8px 12px", borderTop: `1px solid ${Z.bd}20`, textAlign: "right", fontFamily: DISPLAY, fontWeight: FW.bold, color: Z.ac }}>{fmtMoney(annual)}</div>
              <div style={{ padding: "8px 12px", borderTop: `1px solid ${Z.bd}20`, textAlign: "right", fontFamily: DISPLAY, color: Z.tm }}>{fmtMoney(annual / 12)}</div>
            </div>;
          })}
        </div>
      )}
      <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 8 }}>
        Derived from salesperson_pub_assignments × annual goal. Share % edits happen in Sales → Commissions; they apply to non-frozen (future) issues only.
      </div>
    </GlassCard>
  </div>;
};

const Publications = ({ pubs, setPubs, issues, setIssues, insertIssuesBatch, insertPublication, updatePublication, insertAdSizes, updatePubGoal, updateIssueGoal, sales, isActive, commissionGoals = [], salespersonPubAssignments = [], team = [] }) => {
  const { teamMember } = useAuth();
  // Publisher-level access: either the Publisher role, or any team member
  // with the 'admin' permission (e.g. Office Managers who oversee the books).
  const isPublisher = teamMember?.role === "Publisher" || !!teamMember?.permissions?.includes?.("admin");
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Publications" }], title: "Publications" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  const [sel, setSel] = useState(null);
  const [rateModal, setRateModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editPub, setEditPub] = useState(null);
  const [showEZSchedule, setShowEZSchedule] = useState(false);
  const [showAddPub, setShowAddPub] = useState(false);
  const [showDormant, setShowDormant] = useState(false);
  const [goToWizard, setGoToWizard] = useState(false);
  const [newPub, setNewPub] = useState({ name: "", type: "Newspaper", frequency: "Weekly", pageCount: 24, width: 11.125, height: 20.75, circ: 0, color: ACCENT.blue, hasWebsite: false, websiteUrl: "" });

  // Publications | Goals tab state. Goals is Publisher-only.
  const [tab, setTab] = useState("Publications");
  const tabs = isPublisher ? ["Publications", "Goals"] : ["Publications"];

  const openPub = (p) => { setSel(p); setEditPub(JSON.parse(JSON.stringify(p))); setEditMode(false); setRateModal(true); };
  const savePub = async () => {
    if (!editPub) return;
    if (updatePublication) await updatePublication(editPub.id, editPub);
    if (insertAdSizes) await insertAdSizes(editPub.id, editPub.adSizes || []);
    setPubs(ps => ps.map(p => p.id === editPub.id ? editPub : p));
    setSel(editPub);
    setEditMode(false);
  };
  const updateAdSize = (idx, field, val) => { setEditPub(p => ({ ...p, adSizes: p.adSizes.map((a, i) => i === idx ? { ...a, [field]: field === "name" || field === "dims" ? val : Number(val) || 0 } : a) })); };

  const handleAddPub = async () => {
    const id = "pub-" + newPub.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "").slice(0, 20);
    const pub = { ...newPub, id, adSizes: [] };
    if (insertPublication) {
      await insertPublication(pub);
    } else {
      setPubs(ps => [...ps, pub]);
    }
    setShowAddPub(false);
    setNewPub({ name: "", type: "Newspaper", frequency: "Weekly", pageCount: 24, width: 11.125, height: 20.75, circ: 0, color: ACCENT.blue });
    if (goToWizard) {
      setGoToWizard(false);
      setShowEZSchedule(true);
    }
  };

  if (showEZSchedule) return <EZSchedule pubs={pubs} issues={issues} setIssues={setIssues} insertIssuesBatch={insertIssuesBatch} onClose={() => setShowEZSchedule(false)} />;

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Action row — contextual per tab. Goals tab has its own picker
        row inside the subtab, so the global action row stays empty
        there. */}
    {tab === "Publications" && <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <Btn sm v="secondary" onClick={() => setShowEZSchedule(true)}>MyWizard</Btn>
      <Btn sm onClick={() => setShowAddPub(true)}><Ic.plus size={13} /> Publication</Btn>
    </div>}

    {tabs.length > 1 && <TabRow><TB tabs={tabs} active={tab} onChange={setTab} /></TabRow>}

    {/* ADD PUBLICATION MODAL */}
    <Modal open={showAddPub} onClose={() => setShowAddPub(false)} title="Add Publication" onSubmit={newPub.name ? handleAddPub : undefined}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Inp label="Publication Name" value={newPub.name} onChange={e => setNewPub(p => ({ ...p, name: e.target.value }))} placeholder="e.g. The Paso Robles Press" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Sel label="Type" value={newPub.type} onChange={e => {
            const t = e.target.value;
            setNewPub(p => ({
              ...p, type: t,
              width: t === "Magazine" ? 8.375 : 11.125,
              height: t === "Magazine" ? 10.875 : 20.75,
              pageCount: t === "Magazine" ? 48 : 24,
            }));
          }} options={TYPE_OPTIONS} />
          <Sel label="Frequency" value={newPub.frequency} onChange={e => setNewPub(p => ({ ...p, frequency: e.target.value }))} options={FREQ_OPTIONS} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Inp label="Page Count" type="number" value={newPub.pageCount} onChange={e => setNewPub(p => ({ ...p, pageCount: +e.target.value }))} />
          <Inp label="Circulation" type="number" value={newPub.circ} onChange={e => setNewPub(p => ({ ...p, circ: +e.target.value }))} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: COND }}>Brand Color</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: Ri, background: newPub.color, border: `1px solid ${Z.bd}`, flexShrink: 0, cursor: "pointer", position: "relative" }}>
                <input type="color" value={newPub.color} onChange={e => setNewPub(p => ({ ...p, color: e.target.value }))} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
              </div>
              <input value={newPub.color} onChange={e => setNewPub(p => ({ ...p, color: e.target.value }))} style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "9px 14px", color: Z.tx, fontSize: FS.base, outline: "none", flex: 1 }} />
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Inp label="Trim Width (in)" type="number" value={newPub.width} onChange={e => setNewPub(p => ({ ...p, width: +e.target.value }))} />
          <Inp label="Trim Height (in)" type="number" value={newPub.height} onChange={e => setNewPub(p => ({ ...p, height: +e.target.value }))} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: FS.base, color: Z.tx }}>
          <div onClick={() => setNewPub(p => ({ ...p, hasWebsite: !p.hasWebsite }))} style={{ width: 40, height: 22, borderRadius: 11, position: "relative", background: newPub.hasWebsite ? Z.go : Z.bd, transition: "background 0.2s", cursor: "pointer" }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: INV.light, position: "absolute", top: TOGGLE.pad, left: newPub.hasWebsite ? TOGGLE.w - TOGGLE.circle - TOGGLE.pad : TOGGLE.pad, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
          </div>
          <span style={{ fontWeight: FW.semi, fontFamily: COND }}>Has Website</span>
        </label>
        {newPub.hasWebsite && <Inp label="Website URL" value={newPub.websiteUrl} onChange={e => setNewPub(p => ({ ...p, websiteUrl: e.target.value }))} placeholder="e.g. pasoroblespress.com" />}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn v="secondary" onClick={() => { setGoToWizard(true); handleAddPub(); }}>Save & Open MyWizard</Btn>
          <Btn onClick={handleAddPub} disabled={!newPub.name}>Save Publication</Btn>
        </div>
      </div>
    </Modal>
    {tab === "Goals" && isPublisher && <GoalsSubtab
      pubs={pubs}
      issues={issues}
      commissionGoals={commissionGoals}
      salespersonPubAssignments={salespersonPubAssignments}
      team={team}
      updateIssueGoal={updateIssueGoal}
    />}

    {tab === "Publications" && [{ l: "Magazines", f: p => p.type === "Magazine" }, { l: "Newspapers", f: p => p.type === "Newspaper" }, { l: "Special Publications", f: p => p.type === "Special Publication" }].map(g => {
      const gpAll = pubs.filter(g.f);
      const gp = gpAll.filter(p => !p.dormant);
      const gpDormant = gpAll.filter(p => p.dormant);
      return <div key={g.l} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10,  }}><span style={{ fontSize: FS.lg, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{g.l}</span><span style={{ fontSize: FS.sm, color: Z.td }}>{gp.length}</span></div>
        {gp.length === 0 ? <div style={{ fontSize: FS.base, color: Z.td }}>None yet</div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10, marginTop: 8 }}>{gp.map(p => <div key={p.id} onClick={() => openPub(p)} style={{ ...glass(), borderRadius: R, padding: CARD.pad, cursor: "pointer" }}>
          <h4 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{p.name}</h4>
          <div style={{ fontSize: FS.base, color: Z.tm, marginBottom: 4 }}>{p.frequency} · {p.circ?.toLocaleString()} circ.</div>
          <div style={{ fontSize: FS.sm, color: Z.ac, fontWeight: FW.bold, marginTop: 4 }}>{p.adSizes?.length || 0} ad sizes</div>
        </div>)}</div>}
        {gpDormant.length > 0 && <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, cursor: "pointer" }} onClick={() => setShowDormant(s => !s)}>
            <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>{showDormant ? "Hide" : "Show"} Inactive ({gpDormant.length})</span>
          </div>
          {showDormant && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10, marginTop: 8 }}>{gpDormant.map(p => <div key={p.id} onClick={() => openPub(p)} style={{ ...glass(), borderRadius: R, padding: CARD.pad, cursor: "pointer", opacity: 0.5 }}>
            <h4 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{p.name}</h4>
            <div style={{ fontSize: FS.base, color: Z.tm, marginBottom: 4 }}>{p.frequency} · {p.circ?.toLocaleString()} circ.</div>
            <div style={{ fontSize: FS.sm, color: Z.td, fontWeight: FW.bold, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Inactive</div>
          </div>)}</div>}
        </>}
      </div>; })}
    <Modal open={rateModal} onClose={() => setRateModal(false)} title={editMode ? `Edit — ${editPub?.name || ""}` : sel ? sel.name : ""} width={800}>{sel && editPub && <div>
      {/* Pub details — view or edit mode */}
      {editMode ? <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        <Inp label="Publication Name" value={editPub.name} onChange={e => setEditPub(p => ({ ...p, name: e.target.value }))} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Sel label="Type" value={editPub.type} onChange={e => setEditPub(p => ({ ...p, type: e.target.value }))} options={TYPE_OPTIONS} />
          <Sel label="Frequency" value={editPub.frequency} onChange={e => setEditPub(p => ({ ...p, frequency: e.target.value }))} options={FREQ_OPTIONS} />
          <Inp label="Page Count" type="number" value={editPub.pageCount} onChange={e => setEditPub(p => ({ ...p, pageCount: +e.target.value }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Inp label="Circulation" type="number" value={editPub.circ} onChange={e => setEditPub(p => ({ ...p, circ: +e.target.value }))} />
          <Inp label="Trim Width (in)" type="number" value={editPub.width} onChange={e => setEditPub(p => ({ ...p, width: +e.target.value }))} />
          <Inp label="Trim Height (in)" type="number" value={editPub.height} onChange={e => setEditPub(p => ({ ...p, height: +e.target.value }))} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: COND }}>Brand Color</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: Ri, background: editPub.color, border: `1px solid ${Z.bd}`, flexShrink: 0, cursor: "pointer", position: "relative" }}>
                <input type="color" value={editPub.color} onChange={e => setEditPub(p => ({ ...p, color: e.target.value }))} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
              </div>
              <input value={editPub.color} onChange={e => setEditPub(p => ({ ...p, color: e.target.value }))} style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "9px 14px", color: Z.tx, fontSize: FS.base, outline: "none", width: 100 }} />
            </div>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: FS.base, color: Z.tx, marginTop: 4 }}>
          <div onClick={() => setEditPub(p => ({ ...p, hasWebsite: !p.hasWebsite }))} style={{ width: 40, height: 22, borderRadius: 11, position: "relative", background: editPub.hasWebsite ? Z.go : Z.bd, transition: "background 0.2s", cursor: "pointer" }}>
            <div style={{ width: TOGGLE.circle, height: TOGGLE.circle, borderRadius: TOGGLE.circleRadius, background: INV.light, position: "absolute", top: TOGGLE.pad, left: editPub.hasWebsite ? TOGGLE.w - TOGGLE.circle - TOGGLE.pad : TOGGLE.pad, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
          </div>
          <span style={{ fontWeight: FW.semi, fontFamily: COND }}>Has Website</span>
        </label>
        {editPub.hasWebsite && <Inp label="Website URL" value={editPub.websiteUrl || ""} onChange={e => setEditPub(p => ({ ...p, websiteUrl: e.target.value }))} placeholder="e.g. pasoroblespress.com" />}
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: FS.base, color: Z.tx, marginTop: 4 }}>
          <div onClick={() => setEditPub(p => ({ ...p, dormant: !p.dormant }))} style={{ width: 40, height: 22, borderRadius: 11, position: "relative", background: editPub.dormant ? Z.da : Z.bd, transition: "background 0.2s", cursor: "pointer" }}>
            <div style={{ width: TOGGLE.circle, height: TOGGLE.circle, borderRadius: TOGGLE.circleRadius, background: INV.light, position: "absolute", top: TOGGLE.pad, left: editPub.dormant ? TOGGLE.w - TOGGLE.circle - TOGGLE.pad : TOGGLE.pad, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
          </div>
          <span style={{ fontWeight: FW.semi, fontFamily: COND }}>Dormant</span>
          <span style={{ fontSize: FS.sm, color: Z.td }}>Hides from all metrics and dropdowns site-wide</span>
        </label>
        {/* Shared Content — select sibling publications that share physical pages */}
        <div style={{ marginTop: 12, padding: 12, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, fontFamily: COND }}>Shared Content With</div>
          <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 8 }}>Publications that share physical pages with this one. Matching ad projects can be linked so designers only produce the ad once.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {pubs.filter(p => p.id !== editPub.id && !p.dormant).map(p => {
              const isSelected = (editPub.sharedContentWith || []).includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    const current = editPub.sharedContentWith || [];
                    const next = isSelected ? current.filter(id => id !== p.id) : [...current, p.id];
                    setEditPub(ep => ({ ...ep, sharedContentWith: next }));
                  }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: Ri,
                    border: `1px solid ${isSelected ? Z.ac : Z.bd}`,
                    background: isSelected ? Z.ac + "15" : "transparent",
                    color: isSelected ? Z.ac : Z.tm,
                    fontSize: FS.sm,
                    fontWeight: isSelected ? FW.bold : FW.medium,
                    fontFamily: COND,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      : <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: FS.base, color: Z.tm, alignItems: "center" }}>
        <div style={{ width: 12, height: 12, borderRadius: Ri, background: sel.color, flexShrink: 0 }} />
        <span>{sel.type} · {sel.frequency}</span>
        <span>{sel.width}"×{sel.height}" · {sel.pageCount}pp</span>
        <span>{(sel.circ || 0).toLocaleString()} circ.</span>
      </div>}

      {/* Rate card heading */}
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Rate Card</div>

      {/* Rate card table — editable in edit mode */}
        <DataTable>
          <thead><tr>{["Ad Size", "Dimensions", "1× Rate", "6–11 Rate", "12+ Rate", ...(editMode ? [""] : [])].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{(editMode ? editPub.adSizes : sel.adSizes || []).map((a, i) => <tr key={i}>
            <td>{editMode ? <input value={a.name} onChange={e => updateAdSize(i, "name", e.target.value)} style={{ background: "transparent", border: "none", color: Z.tx, fontSize: FS.md, fontFamily: COND, outline: "none", width: "100%", fontWeight: FW.bold }} /> : <span style={{ fontWeight: FW.bold, color: Z.tx }}>{a.name}</span>}</td>
            <td>{editMode ? <input value={a.dims} onChange={e => updateAdSize(i, "dims", e.target.value)} style={{ background: "transparent", border: "none", color: Z.tm, fontSize: FS.md, fontFamily: COND, outline: "none", width: "100%" }} /> : <span style={{ color: Z.tm }}>{a.dims}</span>}</td>
            <td>{editMode ? <input type="number" value={a.rate} onChange={e => updateAdSize(i, "rate", e.target.value)} style={{ background: "transparent", border: "none", color: Z.su, fontSize: FS.md, fontFamily: COND, outline: "none", width: 80, fontWeight: FW.bold }} /> : <span style={{ fontWeight: FW.bold, color: Z.su }}>${(a.rate || 0).toLocaleString()}</span>}</td>
            <td>{editMode ? <input type="number" value={a.rate6} onChange={e => updateAdSize(i, "rate6", e.target.value)} style={{ background: "transparent", border: "none", color: Z.tx, fontSize: FS.md, fontFamily: COND, outline: "none", width: 80 }} /> : <span style={{ color: Z.tx }}>${(a.rate6 || 0).toLocaleString()}</span>}</td>
            <td>{editMode ? <input type="number" value={a.rate12} onChange={e => updateAdSize(i, "rate12", e.target.value)} style={{ background: "transparent", border: "none", color: Z.tx, fontSize: FS.md, fontFamily: COND, outline: "none", width: 80 }} /> : <span style={{ color: Z.tx }}>${(a.rate12 || 0).toLocaleString()}</span>}</td>
            {editMode && <td><button onClick={() => setEditPub(p => ({ ...p, adSizes: p.adSizes.filter((_, j) => j !== i) }))} style={{ background: Z.da, border: "none", borderRadius: Ri, padding: "4px 8px", cursor: "pointer", color: INV.light, fontSize: FS.xs, fontWeight: FW.bold }}>✕</button></td>}
          </tr>)}</tbody>
        </DataTable>
        {editMode && <Btn sm v="ghost" onClick={() => setEditPub(p => ({ ...p, adSizes: [...(p.adSizes || []), { name: "", dims: "", rate: 0, rate6: 0, rate12: 0, w: 0, h: 0 }] }))}>+ Add Ad Size</Btn>}

      {/* Revenue Goals */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Revenue Goals</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: 12, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Default Goal Per Issue</div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>Auto-filled from historical average. Applies to all issues unless overridden below.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: Z.td, fontSize: FS.base }}>$</span>
            <input type="number" value={sel.defaultRevenueGoal || ""} onChange={e => { const v = Number(e.target.value) || 0; setPubs(pp => pp.map(p => p.id === sel.id ? { ...p, defaultRevenueGoal: v } : p)); setSel(s => ({ ...s, defaultRevenueGoal: v })); if (updatePubGoal) updatePubGoal(sel.id, v); }} style={{ width: 100, background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "8px 10px", color: Z.tx, fontSize: FS.md, fontWeight: FW.heavy, textAlign: "right", outline: "none" }} />
            <Btn sm v="secondary" onClick={() => {
              const goal = sel.defaultRevenueGoal || 0;
              if (!goal) return;
              const futureIssues = (issues || []).filter(i => i.pubId === sel.id && i.date >= new Date().toISOString().slice(0, 10));
              setIssues(ii => ii.map(i => futureIssues.some(fi => fi.id === i.id) ? { ...i, revenueGoal: goal } : i));
              futureIssues.forEach(i => { if (updateIssueGoal) updateIssueGoal(i.id, goal); });
            }}>Apply to All Future Issues</Btn>
          </div>
        </div>
        {/* Per-issue goals for upcoming issues */}
        {(() => {
          const upcomingIssues = (issues || []).filter(i => i.pubId === sel.id && i.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
          if (upcomingIssues.length === 0) return <div style={{ fontSize: FS.sm, color: Z.td }}>No upcoming issues scheduled</div>;
          return <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <DataTable>
              <thead><tr style={{ borderBottom: `1px solid ${Z.bd}` }}>
                <th style={{ padding: "4px 8px", textAlign: "left", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Issue</th>
                <th style={{ padding: "4px 8px", textAlign: "left", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Date</th>
                <th style={{ padding: "4px 8px", textAlign: "right", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Revenue</th>
                <th style={{ padding: "4px 8px", textAlign: "right", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Goal Override</th>
              </tr></thead>
              <tbody>{upcomingIssues.map(iss => {
                const issueRev = (sales || []).filter(s => s.issueId === iss.id && s.status === "Closed").reduce((sum, s) => sum + (s.amount || 0), 0);
                const effectiveGoal = iss.revenueGoal != null ? iss.revenueGoal : (sel.defaultRevenueGoal || 0);
                const pct = effectiveGoal > 0 ? Math.min(100, Math.round((issueRev / effectiveGoal) * 100)) : 0;
                return <tr key={iss.id} style={{ borderBottom: `1px solid ${Z.bd}10` }}>
                  <td style={{ padding: "6px 8px", fontWeight: FW.semi, color: Z.tx }}>{iss.label}</td>
                  <td style={{ padding: "6px 8px", color: Z.tm }}>{iss.date}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    <span style={{ fontWeight: FW.heavy, color: pct >= 80 ? Z.go : pct >= 50 ? Z.wa : Z.da }}>${issueRev.toLocaleString()}</span>
                    <span style={{ color: Z.td, marginLeft: 4 }}>({pct}%)</span>
                  </td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}>
                    <input type="number" placeholder={`$${(sel.defaultRevenueGoal || 0).toLocaleString()}`} value={iss.revenueGoal != null ? iss.revenueGoal : ""} onChange={e => { const v = e.target.value === "" ? null : Number(e.target.value) || 0; setIssues(ii => ii.map(i => i.id === iss.id ? { ...i, revenueGoal: v } : i)); if (updateIssueGoal) updateIssueGoal(iss.id, v); }} style={{ width: 90, background: iss.revenueGoal != null ? Z.sf : "transparent", border: `1px solid ${iss.revenueGoal != null ? Z.bd : Z.bd + "40"}`, borderRadius: Ri, padding: "4px 8px", color: Z.tx, fontSize: FS.sm, textAlign: "right", outline: "none" }} />
                  </td>
                </tr>;
              })}</tbody>
            </DataTable>
          </div>;
        })()}
      </div>

      {/* Discount tier info */}
      <div style={{ marginTop: 12, padding: 10, background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}` }}>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", marginBottom: 6 }}>Discount Tiers</div>
        <div style={{ display: "flex", gap: 12, fontSize: FS.base }}>
          <div style={{ flex: 1, padding: 16, background: Z.sa, borderRadius: Ri, textAlign: "center" }}><div style={{ fontWeight: FW.heavy, color: Z.tx }}>1–5 insertions</div><div style={{ color: Z.tm }}>Full rate</div></div>
          <div style={{ flex: 1, padding: 16, background: Z.sa, borderRadius: Ri, textAlign: "center" }}><div style={{ fontWeight: FW.heavy, color: Z.tx }}>6–11 insertions</div><div style={{ color: Z.tm }}>~15% discount</div></div>
          <div style={{ flex: 1, padding: 16, background: Z.sa, borderRadius: Ri, textAlign: "center" }}><div style={{ fontWeight: FW.heavy, color: Z.su }}>12+ insertions</div><div style={{ color: Z.tm }}>~25% discount</div></div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        {editMode ? <><Btn v="cancel" onClick={() => { setEditPub(JSON.parse(JSON.stringify(sel))); setEditMode(false); }}>Cancel</Btn><Btn onClick={savePub}>Save Changes</Btn></> : <Btn v="cancel" onClick={() => setEditMode(true)}><Ic.edit size={12} /> Edit Publication</Btn>}
      </div>
    </div>}</Modal>
  </div>;
};


export default Publications;
