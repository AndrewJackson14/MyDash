import { useState, useMemo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, Card, SB, TB, Stat, Modal, GlassCard, GlassStat, SolidTabs, glass } from "../../components/ui";

import { fmtCurrencyWhole as fmtCurrency } from "../../lib/formatters";

const ENTRY_STATUSES = [
  { value: "queued", label: "Queued", color: Z.td },
  { value: "contacted", label: "Contacted", color: Z.wa },
  { value: "responded", label: "Responded", color: Z.ac },
  { value: "meeting", label: "Meeting Set", color: Z.go },
  { value: "won_back", label: "Won Back", color: Z.go },
  { value: "not_interested", label: "Not Interested", color: Z.da },
  { value: "skipped", label: "Skipped", color: Z.td },
];

const CONTACT_VIA = ["email", "phone", "in_person"];

const Outreach = ({ sales, clients, pubs, issues, team, campaigns, entries, helpers, navTo }) => {
  const [view, setView] = useState("campaigns"); // campaigns | build | detail
  const [selCampaign, setSelCampaign] = useState(null);
  const [search, setSearch] = useState("");
  const [entryFilter, setEntryFilter] = useState("all");
  const [entryModal, setEntryModal] = useState(null);
  const [entryForm, setEntryForm] = useState({});

  // Campaign builder state
  const [buildName, setBuildName] = useState("");
  const [buildDesc, setBuildDesc] = useState("");
  const [buildStatuses, setBuildStatuses] = useState(["Lapsed", "Renewal"]);
  const [buildPubs, setBuildPubs] = useState([]);
  const [buildMinSpend, setBuildMinSpend] = useState(0);
  const [buildLastAdBefore, setBuildLastAdBefore] = useState("");
  const [buildLastAdAfter, setBuildLastAdAfter] = useState("");
  const [buildAssignedTo, setBuildAssignedTo] = useState("");

  const cn = id => (clients || []).find(c => c.id === id)?.name || "—";
  const pn = id => (pubs || []).find(p => p.id === id)?.name || "—";
  const tn = id => (team || []).find(t => t.id === id)?.name || "—";
  const salespeople = (team || []).filter(t => ["Sales Manager", "Salesperson", "Publisher"].includes(t.role));
  const today = new Date().toISOString().slice(0, 10);

  // Compute client sales data for filtering
  const clientSalesData = useMemo(() => {
    const map = {};
    (sales || []).forEach(s => {
      if (s.status !== "Closed") return;
      if (!map[s.clientId]) map[s.clientId] = { totalSpend: 0, saleCount: 0, lastSale: "", pubs: new Set() };
      map[s.clientId].totalSpend += s.amount || 0;
      map[s.clientId].saleCount++;
      if (s.date > map[s.clientId].lastSale) map[s.clientId].lastSale = s.date;
      if (s.publication) map[s.clientId].pubs.add(s.publication);
    });
    return map;
  }, [sales]);

  // Preview filtered clients for campaign builder
  const previewClients = useMemo(() => {
    return (clients || []).filter(c => {
      if (buildStatuses.length > 0 && !buildStatuses.includes(c.status)) return false;
      const data = clientSalesData[c.id];
      if (buildMinSpend > 0 && (!data || data.totalSpend < buildMinSpend)) return false;
      if (buildPubs.length > 0 && (!data || !buildPubs.some(p => data.pubs.has(p)))) return false;
      if (buildLastAdBefore && data?.lastSale && data.lastSale > buildLastAdBefore) return false;
      if (buildLastAdAfter && (!data?.lastSale || data.lastSale < buildLastAdAfter)) return false;
      return true;
    });
  }, [clients, clientSalesData, buildStatuses, buildPubs, buildMinSpend, buildLastAdBefore, buildLastAdAfter]);

  // Campaign entries for the selected campaign
  const campaignEntries = useMemo(() => {
    if (!selCampaign) return [];
    return (entries || []).filter(e => e.campaignId === selCampaign.id);
  }, [entries, selCampaign]);

  const filteredEntries = useMemo(() => {
    let list = campaignEntries;
    if (entryFilter !== "all") list = list.filter(e => e.status === entryFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e => cn(e.clientId).toLowerCase().includes(q));
    }
    return list;
  }, [campaignEntries, entryFilter, search]);

  // Stats for selected campaign
  const campaignStats = useMemo(() => {
    const total = campaignEntries.length;
    const contacted = campaignEntries.filter(e => e.status !== "queued" && e.status !== "skipped").length;
    const responded = campaignEntries.filter(e => ["responded", "meeting", "won_back"].includes(e.status)).length;
    const meetings = campaignEntries.filter(e => e.status === "meeting" || e.status === "won_back").length;
    const wonBack = campaignEntries.filter(e => e.status === "won_back").length;
    const wonAmount = campaignEntries.filter(e => e.status === "won_back").reduce((s, e) => s + (e.wonBackAmount || 0), 0);
    return { total, contacted, responded, meetings, wonBack, wonAmount };
  }, [campaignEntries]);

  // Create campaign
  const handleCreateCampaign = async () => {
    if (!buildName.trim() || !helpers?.insertCampaign) return;
    const filters = { statuses: buildStatuses, pubs: buildPubs, minSpend: buildMinSpend, lastAdBefore: buildLastAdBefore, lastAdAfter: buildLastAdAfter };
    const campaign = await helpers.insertCampaign({
      name: buildName, description: buildDesc, status: "active",
      filters, assignedTo: buildAssignedTo || null, clientCount: previewClients.length,
    });
    if (campaign && helpers?.insertOutreachEntries) {
      await helpers.insertOutreachEntries(campaign.id, previewClients.map(c => c.id));
    }
    setSelCampaign(campaign);
    setView("detail");
    setBuildName(""); setBuildDesc(""); setBuildStatuses(["Lapsed", "Renewal"]); setBuildPubs([]); setBuildMinSpend(0); setBuildLastAdBefore(""); setBuildLastAdAfter(""); setBuildAssignedTo("");
  };

  // Update entry status
  const handleUpdateEntry = async (entryId, changes) => {
    if (!helpers?.updateOutreachEntry) return;
    const now = new Date().toISOString();
    const updates = { ...changes };
    if (changes.status === "contacted" && !changes.contactedAt) updates.contactedAt = now;
    if (changes.status === "responded" && !changes.responseAt) updates.responseAt = now;
    if (changes.status === "won_back" && !changes.wonBackAt) updates.wonBackAt = now;
    await helpers.updateOutreachEntry(entryId, updates);
    // Update campaign counters
    if (selCampaign && helpers?.updateCampaign) {
      const allEntries = (entries || []).map(e => e.id === entryId ? { ...e, ...updates } : e).filter(e => e.campaignId === selCampaign.id);
      helpers.updateCampaign(selCampaign.id, {
        contactedCount: allEntries.filter(e => e.status !== "queued" && e.status !== "skipped").length,
        wonBackCount: allEntries.filter(e => e.status === "won_back").length,
      });
    }
  };

  // Export CSV
  const exportCSV = () => {
    const rows = filteredEntries.map(e => {
      const client = (clients || []).find(c => c.id === e.clientId);
      const data = clientSalesData[e.clientId] || {};
      return { name: client?.name || "", status: e.status, email: client?.contacts?.[0]?.email || "", phone: client?.contacts?.[0]?.phone || "", lastAd: data.lastSale || "", totalSpend: data.totalSpend || 0, publications: data.pubs ? [...data.pubs].map(p => pn(p)).join("; ") : "", notes: e.notes || "" };
    });
    const header = "Name,Status,Email,Phone,Last Ad,Total Spend,Publications,Notes\n";
    const csv = header + rows.map(r => `"${r.name}","${r.status}","${r.email}","${r.phone}","${r.lastAd}","${r.totalSpend}","${r.publications}","${r.notes}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `outreach-${selCampaign?.name || "export"}-${today}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const statusColor = (s) => ENTRY_STATUSES.find(es => es.value === s)?.color || Z.td;

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

    {/* CAMPAIGNS LIST */}
    {view === "campaigns" && <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: FS.base, color: Z.tm }}>{campaigns.length} campaigns</div>
        <Btn onClick={() => setView("build")}><Ic.plus size={13} /> New Campaign</Btn>
      </div>

      {campaigns.length === 0 ? (
        <GlassCard style={{ textAlign: "center", padding: 32, color: Z.td }}>
          <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, marginBottom: 8 }}>No outreach campaigns yet</div>
          <div style={{ fontSize: FS.base, marginBottom: 16 }}>Create a campaign to identify lapsed clients and track re-engagement efforts.</div>
          <Btn onClick={() => setView("build")}><Ic.plus size={13} /> Create First Campaign</Btn>
        </GlassCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {campaigns.map(c => {
            const cEntries = (entries || []).filter(e => e.campaignId === c.id);
            const contacted = cEntries.filter(e => e.status !== "queued" && e.status !== "skipped").length;
            const wonBack = cEntries.filter(e => e.status === "won_back").length;
            const pctContacted = c.clientCount > 0 ? Math.round((contacted / c.clientCount) * 100) : 0;
            return <div key={c.id} onClick={() => { setSelCampaign(c); setView("detail"); setEntryFilter("all"); setSearch(""); }} style={{ ...glass(), borderRadius: R, padding: 16, cursor: "pointer", borderLeft: `3px solid ${c.status === "active" ? Z.go : c.status === "completed" ? Z.ac : Z.bd}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{c.name}</div>
                  <div style={{ fontSize: FS.sm, color: Z.tm }}>{c.clientCount} clients · {contacted} contacted · {wonBack} won back</div>
                  {c.description && <div style={{ fontSize: FS.sm, color: Z.td, marginTop: 2 }}>{c.description}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 60, height: 6, borderRadius: 3, background: Z.sa, overflow: "hidden" }}>
                    <div style={{ width: `${pctContacted}%`, height: "100%", background: Z.go, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm }}>{pctContacted}%</span>
                  <Badge status={c.status === "active" ? "Active" : c.status === "completed" ? "Closed" : "Draft"} small />
                </div>
              </div>
            </div>;
          })}
        </div>
      )}
    </>}

    {/* CAMPAIGN BUILDER */}
    {view === "build" && <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setView("campaigns")} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tx, fontSize: FS.base, fontWeight: FW.bold, fontFamily: COND }}><span style={{ fontSize: FS.lg }}>←</span> Back</button>
        <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>New Outreach Campaign</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Inp label="Campaign Name" value={buildName} onChange={e => setBuildName(e.target.value)} placeholder="e.g. Q2 2026 Lapsed Re-engagement" />
        <Sel label="Assign To" value={buildAssignedTo} onChange={e => setBuildAssignedTo(e.target.value)} options={[{ value: "", label: "Unassigned" }, ...salespeople.map(sp => ({ value: sp.id, label: sp.name }))]} />
      </div>
      <Inp label="Description (optional)" value={buildDesc} onChange={e => setBuildDesc(e.target.value)} placeholder="Campaign notes..." />

      <Card>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Filter Clients</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, marginBottom: 4 }}>Client Status</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {["Lead", "Active", "Renewal", "Lapsed"].map(s => <button key={s} onClick={() => setBuildStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} style={{ padding: "5px 14px", borderRadius: Ri, border: `1px solid ${buildStatuses.includes(s) ? Z.go : Z.bd}`, background: buildStatuses.includes(s) ? "rgba(0,163,0,0.12)" : Z.bg, cursor: "pointer", fontSize: FS.sm, fontWeight: buildStatuses.includes(s) ? FW.bold : FW.normal, color: buildStatuses.includes(s) ? Z.go : Z.td }}>{s}</button>)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, marginBottom: 4 }}>Advertised In (any)</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {(pubs || []).map(p => <button key={p.id} onClick={() => setBuildPubs(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])} style={{ padding: "5px 10px", borderRadius: Ri, border: `1px solid ${buildPubs.includes(p.id) ? Z.ac : Z.bd}`, background: buildPubs.includes(p.id) ? Z.as : Z.bg, cursor: "pointer", fontSize: FS.sm, fontWeight: buildPubs.includes(p.id) ? FW.bold : FW.normal, color: buildPubs.includes(p.id) ? Z.tx : Z.td }}>{p.name}</button>)}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Inp label="Min Total Spend ($)" type="number" value={buildMinSpend || ""} onChange={e => setBuildMinSpend(Number(e.target.value) || 0)} />
            <Inp label="Last Ad After" type="date" value={buildLastAdAfter} onChange={e => setBuildLastAdAfter(e.target.value)} />
            <Inp label="Last Ad Before" type="date" value={buildLastAdBefore} onChange={e => setBuildLastAdBefore(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card style={{ borderLeft: `3px solid ${Z.go}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{previewClients.length}</div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>clients match these filters</div>
          </div>
          <Btn onClick={handleCreateCampaign} disabled={!buildName.trim() || previewClients.length === 0}>
            Create Campaign ({previewClients.length} clients)
          </Btn>
        </div>
      </Card>
    </>}

    {/* CAMPAIGN DETAIL */}
    {view === "detail" && selCampaign && <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => { setView("campaigns"); setSelCampaign(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tx, fontSize: FS.base, fontWeight: FW.bold, fontFamily: COND }}><span style={{ fontSize: FS.lg }}>←</span> Campaigns</button>
        <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{selCampaign.name}</span>
        <Badge status={selCampaign.status === "active" ? "Active" : selCampaign.status === "completed" ? "Closed" : "Draft"} small />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        <GlassStat label="Total" value={campaignStats.total} />
        <GlassStat label="Contacted" value={campaignStats.contacted} sub={campaignStats.total > 0 ? Math.round((campaignStats.contacted / campaignStats.total) * 100) + "%" : "—"} />
        <GlassStat label="Responded" value={campaignStats.responded} />
        <GlassStat label="Meetings" value={campaignStats.meetings} />
        <GlassStat label="Won Back" value={campaignStats.wonBack} sub={campaignStats.wonAmount > 0 ? fmtCurrency(campaignStats.wonAmount) : "—"} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
          <SB value={search} onChange={setSearch} placeholder="Search clients..." />
          <SolidTabs options={[{ value: "all", label: `All (${campaignEntries.length})` }, ...ENTRY_STATUSES.filter(s => campaignEntries.some(e => e.status === s.value)).map(s => ({ value: s.value, label: `${s.label} (${campaignEntries.filter(e => e.status === s.value).length})` }))]} active={entryFilter} onChange={setEntryFilter} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn sm v="secondary" onClick={exportCSV}><Ic.download size={12} /> Export CSV</Btn>
          {selCampaign.status === "active" && <Btn sm v="secondary" onClick={() => helpers?.updateCampaign?.(selCampaign.id, { status: "completed" })}>Mark Complete</Btn>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filteredEntries.length === 0 && <GlassCard style={{ textAlign: "center", padding: 20, color: Z.td }}>No entries match this filter.</GlassCard>}
        {filteredEntries.slice(0, 100).map(e => {
          const client = (clients || []).find(c => c.id === e.clientId);
          const data = clientSalesData[e.clientId] || {};
          return <div key={e.id} style={{ ...glass(), borderRadius: R, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: `3px solid ${statusColor(e.status)}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, cursor: "pointer" }} onClick={() => navTo?.("Clients", e.clientId)}>{client?.name || "—"}</span>
                <span style={{ fontSize: FS.micro, fontWeight: FW.bold, padding: "2px 6px", borderRadius: Ri, background: statusColor(e.status) + "22", color: statusColor(e.status) }}>{ENTRY_STATUSES.find(s => s.value === e.status)?.label}</span>
              </div>
              <div style={{ fontSize: FS.sm, color: Z.tm }}>
                {data.lastSale ? `Last ad: ${data.lastSale}` : "No ads"} · {fmtCurrency(data.totalSpend)} spent · {data.saleCount || 0} orders
                {data.pubs?.size > 0 && <> · {[...data.pubs].slice(0, 2).map(p => pn(p)).join(", ")}{data.pubs.size > 2 && ` +${data.pubs.size - 2}`}</>}
              </div>
              {e.notes && <div style={{ fontSize: FS.sm, color: Z.td, marginTop: 2 }}>{e.notes}</div>}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {e.status === "queued" && <Btn sm onClick={() => handleUpdateEntry(e.id, { status: "contacted", contactedVia: "email" })}>Contacted</Btn>}
              {e.status === "contacted" && <Btn sm onClick={() => handleUpdateEntry(e.id, { status: "responded" })}>Responded</Btn>}
              {e.status === "responded" && <Btn sm onClick={() => handleUpdateEntry(e.id, { status: "meeting" })}>Meeting</Btn>}
              {(e.status === "meeting" || e.status === "responded") && <Btn sm v="success" onClick={() => { setEntryModal(e.id); setEntryForm({ wonBackAmount: 0, notes: e.notes || "" }); }}>Won Back</Btn>}
              {e.status === "queued" && <Btn sm v="ghost" onClick={() => handleUpdateEntry(e.id, { status: "skipped" })}>Skip</Btn>}
              <button onClick={() => { setEntryModal(e.id); setEntryForm({ status: e.status, notes: e.notes || "", contactedVia: e.contactedVia || "email", wonBackAmount: e.wonBackAmount || 0, meetingDate: e.meetingDate || "" }); }} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: FS.md }}>⋯</button>
            </div>
          </div>;
        })}
        {filteredEntries.length > 100 && <div style={{ textAlign: "center", padding: 10, fontSize: FS.sm, color: Z.td }}>Showing first 100 of {filteredEntries.length}. Use filters to narrow.</div>}
      </div>
    </>}

    {/* ENTRY DETAIL MODAL */}
    <Modal open={!!entryModal} onClose={() => setEntryModal(null)} title="Update Outreach Entry" width={440}>
      {entryModal && (() => {
        const entry = (entries || []).find(e => e.id === entryModal);
        if (!entry) return null;
        const client = (clients || []).find(c => c.id === entry.clientId);
        return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>{client?.name}</div>
          <Sel label="Status" value={entryForm.status || entry.status} onChange={e => setEntryForm(f => ({ ...f, status: e.target.value }))} options={ENTRY_STATUSES.map(s => ({ value: s.value, label: s.label }))} />
          <Sel label="Contacted Via" value={entryForm.contactedVia || ""} onChange={e => setEntryForm(f => ({ ...f, contactedVia: e.target.value }))} options={[{ value: "", label: "—" }, ...CONTACT_VIA.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1).replace("_", " ") }))]} />
          {(entryForm.status === "meeting" || entry.status === "meeting") && <Inp label="Meeting Date" type="date" value={entryForm.meetingDate || ""} onChange={e => setEntryForm(f => ({ ...f, meetingDate: e.target.value }))} />}
          {(entryForm.status === "won_back") && <Inp label="Deal Value ($)" type="number" value={entryForm.wonBackAmount || ""} onChange={e => setEntryForm(f => ({ ...f, wonBackAmount: Number(e.target.value) || 0 }))} />}
          <Inp label="Notes" value={entryForm.notes || ""} onChange={e => setEntryForm(f => ({ ...f, notes: e.target.value }))} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn v="cancel" onClick={() => setEntryModal(null)}>Cancel</Btn>
            <Btn onClick={async () => { await handleUpdateEntry(entryModal, entryForm); setEntryModal(null); }}>Save</Btn>
          </div>
        </div>;
      })()}
    </Modal>
  </div>;
};

export default Outreach;
