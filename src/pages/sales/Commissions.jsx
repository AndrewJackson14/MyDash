import { useState, useMemo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, SB, TB, Stat, Modal, DataTable, GlassCard, GlassStat, Pill } from "../../components/ui";

import { fmtCurrencyWhole as fmtCurrency } from "../../lib/formatters";

const DEFAULT_RATE = 20;
const BONUS_TIERS = [
  { threshold: 100, bonus: 2, label: "Hit Goal" },
  { threshold: 110, bonus: 4, label: "110% of Goal" },
  { threshold: 120, bonus: 6, label: "120% of Goal" },
  { threshold: 130, bonus: 8, label: "130% of Goal" },
  { threshold: 140, bonus: 10, label: "140%+ of Goal" },
];

const TRIGGER_LABELS = {
  issue_published: "Issue Publishes",
  invoice_paid: "Invoice Paid",
  both: "Both (Issue + Invoice)",
};

const Commissions = ({
  sales, clients, pubs, issues, team,
  commissionRates, commissionLedger, commissionPayouts,
  commissionGoals, salespersonPubAssignments, helpers,
  tab: tabProp, setTab: setTabProp,
}) => {
  const [_tab, _setTab] = useState("Overview");
  const tab = tabProp || _tab;
  const setTab = setTabProp || _setTab;
  const [rateModal, setRateModal] = useState(false);
  const [goalModal, setGoalModal] = useState(false);
  const [payoutModal, setPayoutModal] = useState(null);
  const [rateForm, setRateForm] = useState({ salespersonId: "", publicationId: "", productType: "", rate: DEFAULT_RATE });
  const [goalForm, setGoalForm] = useState({ issueId: "", publicationId: "", goal: 0 });
  const [recalculating, setRecalculating] = useState(false);

  const _rates = commissionRates || [];
  const _goals = commissionGoals || [];
  const _assignments = salespersonPubAssignments || [];
  const _ledger = commissionLedger || [];
  const _payouts = commissionPayouts || [];
  const salespeople = (team || []).filter(t => ["Sales Manager", "Salesperson"].includes(t.role) && t.isActive !== false && !t.isHidden && !t.is_hidden);
  const cn = id => (clients || []).find(c => c.id === id)?.name || "—";
  const pn = id => (pubs || []).find(p => p.id === id)?.name || "—";
  const tn = id => (team || []).find(t => t.id === id)?.name || "—";
  const today = new Date().toISOString().slice(0, 10);

  const getShare = (spId, pubId) => {
    const a = _assignments.find(a => a.salespersonId === spId && a.publicationId === pubId);
    return a?.isActive !== false ? (a?.percentage || 0) : 0;
  };
  const getIssueGoal = (issueId) => _goals.find(g => g.issueId === issueId)?.goal || 0;

  // Ledger summaries by salesperson
  const ledgerBySp = useMemo(() => {
    const map = {};
    _ledger.forEach(l => {
      if (!map[l.salespersonId]) map[l.salespersonId] = { earned: 0, pending: 0, paid: 0, entries: [] };
      map[l.salespersonId].entries.push(l);
      if (l.status === "earned") map[l.salespersonId].earned += l.totalAmount;
      else if (l.status === "pending") map[l.salespersonId].pending += l.totalAmount;
      else if (l.status === "paid") map[l.salespersonId].paid += l.totalAmount;
    });
    return map;
  }, [_ledger]);

  const totalEarned = Object.values(ledgerBySp).reduce((s, sp) => s + sp.earned, 0);
  const totalPending = Object.values(ledgerBySp).reduce((s, sp) => s + sp.pending, 0);
  const totalPaid = Object.values(ledgerBySp).reduce((s, sp) => s + sp.paid, 0);

  // Save handlers
  const saveRate = async () => {
    if (!rateForm.salespersonId || !helpers?.upsertCommissionRate) return;
    await helpers.upsertCommissionRate({ salespersonId: rateForm.salespersonId, publicationId: rateForm.publicationId || null, productType: rateForm.productType || null, rate: rateForm.rate });
    setRateModal(false);
  };
  const deleteRate = async (rateId) => { if (helpers?.deleteCommissionRate) await helpers.deleteCommissionRate(rateId); };
  const saveGoal = async () => {
    if (!goalForm.issueId || !goalForm.goal || !helpers?.upsertIssueGoal) return;
    const issue = (issues || []).find(i => i.id === goalForm.issueId);
    await helpers.upsertIssueGoal({ issueId: goalForm.issueId, publicationId: issue?.pubId || goalForm.publicationId || "", goal: goalForm.goal });
    setGoalModal(false);
  };
  const updateShare = async (spId, pubId, pct) => { if (helpers?.upsertPubAssignment) await helpers.upsertPubAssignment({ salespersonId: spId, publicationId: pubId, percentage: pct, isActive: pct > 0 }); };
  const updateTrigger = async (spId, trigger) => { if (helpers?.updateTeamMember) await helpers.updateTeamMember(spId, { commissionTrigger: trigger }); };
  const handleRecalculate = async () => { if (!helpers?.recalculateAllCommissions) return; setRecalculating(true); await helpers.recalculateAllCommissions(); setRecalculating(false); };
  const handleMarkPaid = async (spId) => {
    if (!helpers?.markCommissionsPaid) return;
    const earnedEntries = (ledgerBySp[spId]?.entries || []).filter(l => l.status === "earned");
    if (earnedEntries.length === 0) return;
    await helpers.markCommissionsPaid(earnedEntries.map(l => l.id), spId, new Date().toISOString().slice(0, 7));
    setPayoutModal(null);
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

    {/* OVERVIEW */}
    {tab === "Overview" && <>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn sm v="secondary" onClick={handleRecalculate} disabled={recalculating}>{recalculating ? "Recalculating..." : "Recalculate All"}</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <GlassStat label="Earned (Unpaid)" value={fmtCurrency(totalEarned)} />
        <GlassStat label="Pending" value={fmtCurrency(totalPending)} sub="Awaiting trigger" />
        <GlassStat label="Paid Out" value={fmtCurrency(totalPaid)} />
        <GlassStat label="Total All Time" value={fmtCurrency(totalEarned + totalPending + totalPaid)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {salespeople.map(sp => {
          const spData = ledgerBySp[sp.id] || { earned: 0, pending: 0, paid: 0, entries: [] };
          const trigger = sp.commissionTrigger || "both";
          const earnedCount = spData.entries.filter(l => l.status === "earned").length;
          return <GlassCard key={sp.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>{sp.name}</div>
                <div style={{ fontSize: FS.sm, color: Z.tm }}>{sp.role} · Trigger: <span style={{ fontWeight: FW.bold, color: Z.ac }}>{TRIGGER_LABELS[trigger]}</span></div>
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                {spData.earned > 0 && <div style={{ textAlign: "right" }}><div style={{ fontSize: FS.title, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>{fmtCurrency(spData.earned)}</div><div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase" }}>Earned ({earnedCount})</div></div>}
                {spData.pending > 0 && <div style={{ textAlign: "right" }}><div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.wa }}>{fmtCurrency(spData.pending)}</div><div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase" }}>Pending</div></div>}
                {spData.paid > 0 && <div style={{ textAlign: "right" }}><div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tm }}>{fmtCurrency(spData.paid)}</div><div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase" }}>Paid</div></div>}
                {earnedCount > 0 && <Btn sm v="success" onClick={() => setPayoutModal(sp.id)}>Pay {fmtCurrency(spData.earned)}</Btn>}
              </div>
            </div>
            {spData.entries.length > 0 && <div style={{ maxHeight: 160, overflowY: "auto" }}>
              <DataTable>
                <thead><tr>{["Client", "Pub", "Sale", "Rate", "Commission", "Status"].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{spData.entries.slice(0, 20).map(l => <tr key={l.id}>
                  <td style={{ color: Z.tx }}>{cn(l.clientId)}</td>
                  <td style={{ color: Z.tm }}>{pn(l.publicationId)}</td>
                  <td style={{ color: Z.tx }}>{fmtCurrency(l.saleAmount)}</td>
                  <td style={{ color: Z.tm }}>{l.commissionRate}%</td>
                  <td style={{ fontWeight: FW.bold, color: l.status === "paid" ? Z.tm : Z.tx }}>{fmtCurrency(l.totalAmount)}</td>
                  <td><span style={{ fontSize: FS.micro, fontWeight: FW.bold, padding: "2px 6px", borderRadius: Ri, background: l.status === "earned" ? "rgba(0,163,0,0.15)" : l.status === "paid" ? Z.sa : "rgba(212,137,14,0.15)", color: l.status === "earned" ? Z.go : l.status === "paid" ? Z.tm : Z.wa }}>{l.status}</span></td>
                </tr>)}</tbody>
              </DataTable>
            </div>}
          </GlassCard>;
        })}
        {salespeople.length === 0 && <GlassCard style={{ textAlign: "center", padding: 24, color: Z.td }}>No salespeople found.</GlassCard>}
      </div>
    </>}

    {/* RATE TABLES */}
    {tab === "Rate Tables" && <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: FS.base, color: Z.tm }}>Default rate: <span style={{ fontWeight: FW.heavy, color: Z.ac }}>{DEFAULT_RATE}%</span></div>
        <Btn sm onClick={() => { setRateForm({ salespersonId: salespeople[0]?.id || "", publicationId: "", productType: "", rate: DEFAULT_RATE }); setRateModal(true); }}><Ic.plus size={13} /> Add Override</Btn>
      </div>
      <DataTable><thead><tr>{["Salesperson", "Publication", "Product", "Rate", ""].map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{_rates.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: Z.td }}>No overrides. All earn {DEFAULT_RATE}%.</td></tr>}
          {_rates.map(r => <tr key={r.id}><td style={{ fontWeight: FW.semi, color: Z.tx }}>{tn(r.salespersonId)}</td><td style={{ color: Z.tm }}>{r.publicationId ? pn(r.publicationId) : "All"}</td><td style={{ color: Z.tm }}>{r.productType || "All"}</td><td style={{ fontWeight: FW.heavy, color: Z.ac }}>{r.rate}%</td><td><button onClick={() => deleteRate(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: FS.md }}>×</button></td></tr>)}
        </tbody></DataTable>
      <GlassCard>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Earning Trigger (per salesperson)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {salespeople.map(sp => {
            const trigger = sp.commissionTrigger || "both";
            return <div key={sp.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx, width: 150, flexShrink: 0 }}>{sp.name}</span>
              {["issue_published", "invoice_paid", "both"].map(t => <Pill key={t} label={TRIGGER_LABELS[t]} icon={{ issue_published: Ic.pub, invoice_paid: Ic.invoice, both: Ic.check }[t]} active={trigger === t} onClick={() => updateTrigger(sp.id, t)} />)}
            </div>;
          })}
        </div>
      </GlassCard>
      <GlassCard>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Bonus Tiers</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {BONUS_TIERS.map(t => <div key={t.threshold} style={{ textAlign: "center", padding: 10, background: Z.bg, borderRadius: Ri }}>
            <div style={{ fontSize: 18, fontWeight: FW.black, color: Z.ac, fontFamily: DISPLAY }}>+{t.bonus}%</div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.semi, color: Z.tm }}>{t.label}</div>
          </div>)}
        </div>
      </GlassCard>
    </>}

    {/* GOALS */}
    {tab === "Goals" && <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: FS.base, color: Z.tm }}>Revenue goals per issue</div>
        <Btn sm onClick={() => { setGoalForm({ issueId: "", publicationId: "", goal: 0 }); setGoalModal(true); }}><Ic.plus size={13} /> Set Goal</Btn>
      </div>
      {pubs.map(pub => {
        const pubIssues = (issues || []).filter(i => i.pubId === pub.id && i.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
        if (pubIssues.length === 0) return null;
        return <GlassCard key={pub.id}>
          <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 8 }}>{pub.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 6 }}>
            {pubIssues.map(iss => {
              const goal = getIssueGoal(iss.id);
              return <div key={iss.id} style={{ padding: 16, background: Z.bg, borderRadius: Ri, textAlign: "center", cursor: "pointer" }} onClick={() => { setGoalForm({ issueId: iss.id, publicationId: pub.id, goal: goal || 0 }); setGoalModal(true); }}>
                <div style={{ fontSize: FS.xs, fontWeight: FW.semi, color: Z.tm }}>{iss.label}</div>
                <div style={{ fontSize: FS.micro, color: Z.td }}>{iss.date.slice(5)}</div>
                <div style={{ fontSize: 18, fontWeight: FW.black, color: goal > 0 ? Z.ac : Z.td, fontFamily: DISPLAY, marginTop: 4 }}>{goal > 0 ? fmtCurrency(goal) : "—"}</div>
                {goal > 0 && salespeople.map(sp => { const share = getShare(sp.id, pub.id); if (share <= 0) return null; return <div key={sp.id} style={{ fontSize: FS.micro, color: Z.tm, marginTop: 2 }}>{sp.name.split(" ")[0]}: {fmtCurrency(goal * share / 100)}</div>; })}
              </div>;
            })}
          </div>
        </GlassCard>;
      })}
    </>}

    {/* ASSIGNMENTS */}
    {tab === "Assignments" && <>
      <div style={{ fontSize: FS.base, color: Z.tm, marginBottom: 4 }}>Assign each salesperson a percentage share of each publication.</div>
      {pubs.map(pub => {
        const totalPct = salespeople.reduce((s, sp) => s + getShare(sp.id, pub.id), 0);
        return <GlassCard key={pub.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{pub.name}</div>
            <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: totalPct === 100 ? Z.go : totalPct > 100 ? Z.da : Z.wa }}>{totalPct}% assigned</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {salespeople.map(sp => {
              const share = getShare(sp.id, pub.id);
              return <div key={sp.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx, width: 140, flexShrink: 0 }}>{sp.name}</span>
                <input type="range" min={0} max={100} step={5} value={share} onChange={e => updateShare(sp.id, pub.id, Number(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: share > 0 ? Z.ac : Z.td, width: 45, textAlign: "right" }}>{share}%</span>
              </div>;
            })}
          </div>
        </GlassCard>;
      })}
    </>}

    {/* MODALS */}
    <Modal open={rateModal} onClose={() => setRateModal(false)} title="Commission Rate Override" width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Sel label="Salesperson" value={rateForm.salespersonId} onChange={e => setRateForm(f => ({ ...f, salespersonId: e.target.value }))} options={salespeople.map(sp => ({ value: sp.id, label: sp.name }))} />
        <Sel label="Publication" value={rateForm.publicationId} onChange={e => setRateForm(f => ({ ...f, publicationId: e.target.value }))} options={[{ value: "", label: "All Publications" }, ...(pubs || []).map(p => ({ value: p.id, label: p.name }))]} />
        <Sel label="Product Type" value={rateForm.productType} onChange={e => setRateForm(f => ({ ...f, productType: e.target.value }))} options={[{ value: "", label: "All Products" }, { value: "display_print", label: "Print Display" }, { value: "web", label: "Digital/Web" }, { value: "sponsored_content", label: "Sponsored Content" }]} />
        <Inp label="Commission Rate (%)" type="number" min={0} max={100} value={rateForm.rate} onChange={e => setRateForm(f => ({ ...f, rate: Number(e.target.value) }))} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><Btn v="cancel" onClick={() => setRateModal(false)}>Cancel</Btn><Btn onClick={saveRate}>Save</Btn></div>
      </div>
    </Modal>

    <Modal open={goalModal} onClose={() => setGoalModal(false)} title="Set Issue Goal" width={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Sel label="Issue" value={goalForm.issueId} onChange={e => { const iss = (issues || []).find(i => i.id === e.target.value); setGoalForm(f => ({ ...f, issueId: e.target.value, publicationId: iss?.pubId || "" })); }} options={[{ value: "", label: "Select issue..." }, ...(issues || []).filter(i => i.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 30).map(i => ({ value: i.id, label: `${pn(i.pubId)} — ${i.label}` }))]} />
        <Inp label="Revenue Goal ($)" type="number" min={0} value={goalForm.goal} onChange={e => setGoalForm(f => ({ ...f, goal: Number(e.target.value) }))} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><Btn v="cancel" onClick={() => setGoalModal(false)}>Cancel</Btn><Btn onClick={saveGoal} disabled={!goalForm.issueId || !goalForm.goal}>Save Goal</Btn></div>
      </div>
    </Modal>

    <Modal open={!!payoutModal} onClose={() => setPayoutModal(null)} title="Confirm Payout" width={400}>
      {payoutModal && (() => {
        const sp = salespeople.find(s => s.id === payoutModal);
        const spData = ledgerBySp[payoutModal] || { earned: 0, entries: [] };
        const earnedCount = spData.entries.filter(l => l.status === "earned").length;
        return <div style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "center" }}>
          <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>{sp?.name}</div>
          <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>{fmtCurrency(spData.earned)}</div>
          <div style={{ fontSize: FS.sm, color: Z.tm }}>{earnedCount} commission entries for {new Date().toISOString().slice(0, 7)}</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}><Btn v="cancel" onClick={() => setPayoutModal(null)}>Cancel</Btn><Btn v="success" onClick={() => handleMarkPaid(payoutModal)}>Confirm Payout</Btn></div>
        </div>;
      })()}
    </Modal>
  </div>;
};

export default Commissions;
