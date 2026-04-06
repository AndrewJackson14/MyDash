import { useState } from "react";
import { Z, COND, DISPLAY, R, Ri, FS, FW } from "../lib/theme";
import { Btn, GlassCard, PageHeader } from "../components/ui";
import { supabase, isOnline } from "../lib/supabase";

const ImportCard = ({ title, description, buttonLabel, onRun, status, progress, onReset }) => (
  <GlassCard>
    <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>{title}</div>
    <div style={{ fontSize: FS.base, color: Z.tm, marginBottom: 16, lineHeight: 1.6 }}>{description}</div>
    {status === "idle" && <Btn onClick={onRun}>{buttonLabel}</Btn>}
    {status === "loading" && <div style={{ fontSize: FS.base, color: Z.ac, fontWeight: FW.bold }}>Loading data files...</div>}
    {status === "inserting" && <div>
      <div style={{ fontSize: FS.base, color: Z.ac, fontWeight: FW.bold, marginBottom: 8 }}>Inserting...</div>
      <div style={{ display: "flex", gap: 16 }}>
        {Object.entries(progress.counts || {}).map(([k, v]) => <div key={k}>
          <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx }}>{v.toLocaleString()}</div>
          <div style={{ fontSize: FS.xs, color: Z.td, textTransform: "uppercase", fontWeight: FW.bold }}>{k}</div>
        </div>)}
      </div>
      {progress.total > 0 && <div style={{ marginTop: 8, height: 4, background: Z.bd, borderRadius: Ri }}>
        <div style={{ height: "100%", borderRadius: Ri, background: Z.go, width: `${(progress.current / progress.total) * 100}%`, transition: "width 0.3s" }} />
      </div>}
    </div>}
    {status === "done" && <div>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su, marginBottom: 4 }}>Import Complete</div>
      <div style={{ fontSize: FS.base, color: Z.tm }}>{progress.summary}</div>
      {(progress.errors || []).length > 0 && <div style={{ marginTop: 8, fontSize: FS.sm, color: Z.da }}>{progress.errors.length} errors (check console)</div>}
    </div>}
    {status === "error" && <div>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.da, marginBottom: 4 }}>Import Failed</div>
      {(progress.errors || []).map((e, i) => <div key={i} style={{ fontSize: FS.sm, color: Z.da }}>{e}</div>)}
      <Btn sm v="secondary" onClick={onReset} style={{ marginTop: 8 }}>Try Again</Btn>
    </div>}
  </GlassCard>
);

const DataImport = ({ onClose }) => {
  const [clientStatus, setClientStatus] = useState("idle");
  const [clientProgress, setClientProgress] = useState({ counts: {}, total: 0, current: 0, errors: [], summary: "" });
  const [salesStatus, setSalesStatus] = useState("idle");
  const [salesProgress, setSalesProgress] = useState({ counts: {}, total: 0, current: 0, errors: [], summary: "" });

  const runClientImport = async () => {
    if (!isOnline() || !supabase) { setClientStatus("error"); setClientProgress(p => ({ ...p, errors: ["Not connected"] })); return; }
    setClientStatus("loading");
    try {
      const [clientsData, contactsData] = await Promise.all([
        fetch("/import_clients.json").then(r => r.json()),
        fetch("/import_contacts.json").then(r => r.json()),
      ]);
      setClientProgress(p => ({ ...p, total: clientsData.length }));
      setClientStatus("inserting");
      let insertedClients = 0;
      const clientIdMap = {};
      for (let i = 0; i < clientsData.length; i += 100) {
        const batch = clientsData.slice(i, i + 100).map(c => ({
          name: c.name, status: c.status || "Lead", category: c.category || "",
          address: c.address || "", city: c.city || "", state: c.state || "", zip: c.zip || "",
          rep_id: c.rep_id || null,
        }));
        const { data, error } = await supabase.from("clients").insert(batch).select("id, name");
        if (error) { console.error("Client batch error:", error); setClientProgress(p => ({ ...p, errors: [...p.errors, error.message] })); }
        else if (data) { data.forEach(d => { clientIdMap[d.name] = d.id; }); insertedClients += data.length; }
        setClientProgress(p => ({ ...p, current: insertedClients, counts: { clients: insertedClients } }));
      }
      let insertedContacts = 0;
      const allContacts = [];
      for (const [companyName, contacts] of Object.entries(contactsData)) {
        const clientId = clientIdMap[companyName];
        if (!clientId) continue;
        let first = true;
        for (const ct of contacts) {
          allContacts.push({ client_id: clientId, name: ct.name, role: ct.role || "Business Owner", phone: ct.phone || "", email: ct.email || "", is_primary: first });
          first = false;
        }
      }
      for (let i = 0; i < allContacts.length; i += 200) {
        const batch = allContacts.slice(i, i + 200);
        const { error } = await supabase.from("client_contacts").insert(batch);
        if (error) { console.error("Contact batch error:", error); }
        else { insertedContacts += batch.length; }
        setClientProgress(p => ({ ...p, counts: { clients: insertedClients, contacts: insertedContacts } }));
      }
      setClientProgress(p => ({ ...p, summary: `${insertedClients.toLocaleString()} clients and ${insertedContacts.toLocaleString()} contacts imported.` }));
      setClientStatus("done");
    } catch (err) { console.error(err); setClientStatus("error"); setClientProgress(p => ({ ...p, errors: [err.message] })); }
  };

  // Generic sales import function
  const runGenericSalesImport = async (jsonFile, setStatus, setProgress) => {
    if (!isOnline() || !supabase) { setStatus("error"); setProgress(p => ({ ...p, errors: ["Not connected"] })); return; }
    setStatus("loading");
    try {
      const salesData = await fetch(jsonFile).then(r => r.json());
      setProgress(p => ({ ...p, total: salesData.length }));
      setStatus("inserting");

      let allClients = [];
      let page = 0;
      while (true) {
        const { data } = await supabase.from("clients").select("id, name").range(page * 1000, (page + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        allClients = allClients.concat(data);
        if (data.length < 1000) break;
        page++;
      }
      const clientMap = {};
      allClients.forEach(c => { clientMap[c.name] = c.id; });

      let inserted = 0;
      let skipped = 0;

      for (let i = 0; i < salesData.length; i += 100) {
        const batch = salesData.slice(i, i + 100);
        const salesRows = [];
        for (const s of batch) {
          const clientId = clientMap[s.client_name];
          if (!clientId) { skipped++; continue; }
          salesRows.push({
            client_id: clientId,
            publication_id: s.publication_id,
            ad_type: s.ad_type,
            ad_size: s.ad_size,
            amount: s.amount,
            status: "Closed",
            date: s.date,
            assigned_to: s.assigned_to || null,
            notes: `Issue: ${s.issue_label} ${s.issue_year} | Gross: $${s.gross} | Rate: $${s.rate} | Discount: $${s.discount} | Invoice: ${s.invoice_number}`,
            product_type: "display_print",
            placement_notes: `Size: ${s.ad_size}`,
          });
        }
        if (salesRows.length > 0) {
          const { error } = await supabase.from("sales").insert(salesRows);
          if (error) { console.error("Sales batch error:", error); setProgress(p => ({ ...p, errors: [...(p.errors||[]), error.message] })); }
          else { inserted += salesRows.length; }
        }
        setProgress(p => ({ ...p, current: i + batch.length, counts: { sales: inserted, skipped } }));
      }

      setProgress(p => ({ ...p, summary: `${inserted.toLocaleString()} sales imported. ${skipped} skipped (no matching client).` }));
      setStatus("done");
    } catch (err) { console.error(err); setStatus("error"); setProgress(p => ({ ...p, errors: [err.message] })); }
  };

  const runSalesImport = () => runGenericSalesImport("/import_2025_sales.json", setSalesStatus, setSalesProgress);

  // 2026 sales
  const [sales26Status, setSales26Status] = useState("idle");
  const [sales26Progress, setSales26Progress] = useState({ counts: {}, total: 0, current: 0, errors: [], summary: "" });
  const runSales26Import = () => runGenericSalesImport("/import_2026_sales.json", setSales26Status, setSales26Progress);

  // 2021-2024 sales
  const [sales2124Status, setSales2124Status] = useState("idle");
  const [sales2124Progress, setSales2124Progress] = useState({ counts: {}, total: 0, current: 0, errors: [], summary: "" });
  const runSales2124Import = () => runGenericSalesImport("/import_2124_sales.json", setSales2124Status, setSales2124Progress);

  // Contract generation
  const [contractStatus, setContractStatus] = useState("idle");
  const [contractProgress, setContractProgress] = useState({ counts: {}, total: 0, current: 0, errors: [], summary: "" });

  const runContractGeneration = async () => {
    if (!isOnline() || !supabase) { setContractStatus("error"); setContractProgress(p => ({ ...p, errors: ["Not connected"] })); return; }
    setContractStatus("loading");
    try {
      // Fetch all sales with pagination
      let allSales = [];
      let page = 0;
      while (true) {
        const { data } = await supabase.from("sales").select("id, client_id, publication_id, ad_size, amount, date, assigned_to, ad_type").range(page * 1000, (page + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        allSales = allSales.concat(data);
        if (data.length < 1000) break;
        page++;
      }

      setContractProgress(p => ({ ...p, total: allSales.length }));
      setContractStatus("inserting");

      // Group by client_id + year + publication_id
      const groups = {};
      for (const s of allSales) {
        if (!s.date || !s.client_id) continue;
        const year = s.date.slice(0, 4);
        const key = `${s.client_id}|${year}|${s.publication_id || 'none'}`;
        if (!groups[key]) groups[key] = { client_id: s.client_id, year, pub_id: s.publication_id, sales: [], assigned_to: s.assigned_to };
        groups[key].sales.push(s);
        if (s.assigned_to && !groups[key].assigned_to) groups[key].assigned_to = s.assigned_to;
      }

      const groupList = Object.values(groups);
      let contractsCreated = 0;
      let salesLinked = 0;

      // Fetch client names for contract naming
      let allClients = [];
      page = 0;
      while (true) {
        const { data } = await supabase.from("clients").select("id, name").range(page * 1000, (page + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        allClients = allClients.concat(data);
        if (data.length < 1000) break;
        page++;
      }
      const clientNames = {};
      allClients.forEach(c => { clientNames[c.id] = c.name; });

      // Fetch pub names
      const { data: pubData } = await supabase.from("publications").select("id, name");
      const pubNames = {};
      (pubData || []).forEach(p => { pubNames[p.id] = p.name; });

      // Create contracts in batches of 50
      for (let i = 0; i < groupList.length; i += 50) {
        const batch = groupList.slice(i, i + 50);
        const contractRows = batch.map(g => {
          const dates = g.sales.map(s => s.date).filter(Boolean).sort();
          const totalValue = g.sales.reduce((sum, s) => sum + Number(s.amount || 0), 0);
          const clientName = clientNames[g.client_id] || "Unknown";
          const pubName = pubNames[g.pub_id] || "Mixed";
          return {
            client_id: g.client_id,
            name: `${clientName} — ${pubName} ${g.year}`,
            status: g.year < "2026" ? "completed" : "active",
            start_date: dates[0] || null,
            end_date: dates[dates.length - 1] || null,
            total_value: totalValue,
            total_paid: totalValue,
            assigned_to: g.assigned_to || null,
            is_synthetic: true,
          };
        });

        const { data: inserted, error } = await supabase.from("contracts").insert(contractRows).select("id, client_id, name, start_date");
        if (error) {
          console.error("Contract batch error:", error);
          setContractProgress(p => ({ ...p, errors: [...(p.errors||[]), error.message] }));
          continue;
        }

        // Now link sales to contracts and create contract_lines
        for (let j = 0; j < batch.length; j++) {
          const g = batch[j];
          const contract = inserted?.[j];
          if (!contract) continue;

          // Group sales by ad_size to create contract_lines
          const bySizeMap = {};
          for (const s of g.sales) {
            const sz = s.ad_size || "Other";
            if (!bySizeMap[sz]) bySizeMap[sz] = { count: 0, total: 0 };
            bySizeMap[sz].count++;
            bySizeMap[sz].total += Number(s.amount || 0);
          }

          const lineRows = Object.entries(bySizeMap).map(([sz, info], idx) => ({
            contract_id: contract.id,
            publication_id: g.pub_id,
            ad_size: sz,
            rate: info.count > 0 ? Math.round(info.total / info.count * 100) / 100 : 0,
            quantity: info.count,
            line_total: Math.round(info.total * 100) / 100,
            sort_order: idx,
          }));

          if (lineRows.length > 0) {
            await supabase.from("contract_lines").insert(lineRows);
          }

          // Link sales to this contract
          const saleIds = g.sales.map(s => s.id);
          for (let k = 0; k < saleIds.length; k += 200) {
            const idBatch = saleIds.slice(k, k + 200);
            await supabase.from("sales").update({ contract_id: contract.id }).in("id", idBatch);
            salesLinked += idBatch.length;
          }

          contractsCreated++;
        }

        setContractProgress(p => ({ ...p, current: i + batch.length, counts: { contracts: contractsCreated, "sales linked": salesLinked } }));
      }

      // Update client contract_end_date from their latest contract
      await supabase.from("clients").select("id").limit(1); // just to keep connection alive
      // We'll do this via SQL after

      setContractProgress(p => ({ ...p, summary: `${contractsCreated.toLocaleString()} contracts created. ${salesLinked.toLocaleString()} sales linked.` }));
      setContractStatus("done");
    } catch (err) { console.error(err); setContractStatus("error"); setContractProgress(p => ({ ...p, errors: [err.message] })); }
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Data Import">
      <Btn sm v="ghost" onClick={onClose}>✕ Close</Btn>
    </PageHeader>

    <ImportCard title="Client Import"
      description="Import 3,937 clients and 5,209 contacts from Newspaper Manager. Current team members mapped as reps."
      buttonLabel="Import 3,937 Clients" onRun={runClientImport} status={clientStatus} progress={clientProgress}
      onReset={() => { setClientStatus("idle"); setClientProgress({ counts: {}, total: 0, current: 0, errors: [], summary: "" }); }} />

    <ImportCard title="2021–2024 Sales Orders"
      description="Import 28,798 historical sales orders from 2021–2024. Covers all publications including discontinued titles (mapped to Special Projects)."
      buttonLabel="Import 28,798 Sales Orders" onRun={runSales2124Import} status={sales2124Status} progress={sales2124Progress}
      onReset={() => { setSales2124Status("idle"); setSales2124Progress({ counts: {}, total: 0, current: 0, errors: [], summary: "" }); }} />

    <ImportCard title="2025 Sales Orders"
      description="Import 7,201 sales orders from 2025. Each order links to a client and publication."
      buttonLabel="Import 7,201 Sales Orders" onRun={runSalesImport} status={salesStatus} progress={salesProgress}
      onReset={() => { setSalesStatus("idle"); setSalesProgress({ counts: {}, total: 0, current: 0, errors: [], summary: "" }); }} />

    <ImportCard title="2026 Sales Orders"
      description="Import 3,880 sales orders from 2026. Includes data through September 2026."
      buttonLabel="Import 3,880 Sales Orders" onRun={runSales26Import} status={sales26Status} progress={sales26Progress}
      onReset={() => { setSales26Status("idle"); setSales26Progress({ counts: {}, total: 0, current: 0, errors: [], summary: "" }); }} />

    <ImportCard title="Generate Contracts from Sales"
      description="Auto-groups all imported sales into synthetic contracts by client + year + publication. Each group becomes a contract with line items. Run this AFTER all sales imports are complete."
      buttonLabel="Generate Contracts" onRun={runContractGeneration} status={contractStatus} progress={contractProgress}
      onReset={() => { setContractStatus("idle"); setContractProgress({ counts: {}, total: 0, current: 0, errors: [], summary: "" }); }} />
  </div>;
};

export default DataImport;
