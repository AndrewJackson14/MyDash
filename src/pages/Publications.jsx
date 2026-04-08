import { useState, useRef } from "react";
import { Z, SC, COND, DISPLAY, FS, FW, Ri, CARD, R, INV, TOGGLE, ACCENT } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, Bar, FilterBar, SortHeader, BackBtn, ThemeToggle , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid, glass } from "../components/ui";
import EZSchedule from "./EZSchedule";

const FREQ_OPTIONS = ["Weekly", "Bi-Weekly", "Bi-Monthly", "Monthly", "Quarterly", "Semi-Annual", "Annual"];
const TYPE_OPTIONS = ["Magazine", "Newspaper", "Special Publication"];

const Publications = ({ pubs, setPubs, issues, setIssues, insertIssuesBatch, insertPublication, updatePublication, insertAdSizes, updatePubGoal, updateIssueGoal, sales }) => {
  const [sel, setSel] = useState(null);
  const [rateModal, setRateModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editPub, setEditPub] = useState(null);
  const [showEZSchedule, setShowEZSchedule] = useState(false);
  const [showAddPub, setShowAddPub] = useState(false);
  const [goToWizard, setGoToWizard] = useState(false);
  const [newPub, setNewPub] = useState({ name: "", type: "Newspaper", frequency: "Weekly", pageCount: 24, width: 11.125, height: 20.75, circ: 0, color: ACCENT.blue, hasWebsite: false, websiteUrl: "" });

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
    <PageHeader title="My Publications">
      <Btn sm v="secondary" onClick={() => setShowEZSchedule(true)}>MyWizard</Btn>
      <Btn sm onClick={() => setShowAddPub(true)}><Ic.plus size={13} /> Publication</Btn>
    </PageHeader>

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
    {[{ l: "Magazines", f: p => p.type === "Magazine" }, { l: "Newspapers", f: p => p.type === "Newspaper" }, { l: "Special Publications", f: p => p.type === "Special Publication" }].map(g => {
      const gp = pubs.filter(g.f);
      return <div key={g.l} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10,  }}><span style={{ fontSize: FS.lg, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{g.l}</span><span style={{ fontSize: FS.sm, color: Z.td }}>{gp.length}</span></div>
        {gp.length === 0 ? <div style={{ fontSize: FS.base, color: Z.td }}>None yet</div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10, marginTop: 8 }}>{gp.map(p => <div key={p.id} onClick={() => openPub(p)} style={{ ...glass(), borderRadius: R, padding: CARD.pad, cursor: "pointer" }}>
          <h4 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{p.name}</h4>
          <div style={{ fontSize: FS.base, color: Z.tm, marginBottom: 4 }}>{p.frequency} · {p.circ?.toLocaleString()} circ.</div>
          <div style={{ fontSize: FS.sm, color: Z.ac, fontWeight: FW.bold, marginTop: 4 }}>{p.adSizes?.length || 0} ad sizes</div>
        </div>)}</div>}
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
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm, fontFamily: COND }}>
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
            </table>
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
        {editMode ? <><Btn v="secondary" onClick={() => { setEditPub(JSON.parse(JSON.stringify(sel))); setEditMode(false); }}>Cancel</Btn><Btn onClick={savePub}>Save Changes</Btn></> : <Btn v="secondary" onClick={() => setEditMode(true)}><Ic.edit size={12} /> Edit Publication</Btn>}
      </div>
    </div>}</Modal>
  </div>;
};


export default Publications;
