import { useState, useEffect } from "react";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { Z, COND, DISPLAY, R, Ri, FS, FW } from "../lib/theme";
import { Btn, FileBtn, GlassCard, PageHeader } from "../components/ui";
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
      <div style={{ fontSize: FS.xxl, marginBottom: 8 }}>✓</div>
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

// ── Publication name → ID mapping for SimpleCirc ──────────────
const PUB_NAME_MAP = {
  "Paso Robles Magazine": "pub-prm",
  "Atascadero News Magazine": "pub-anm",
  "Atascadero News": "pub-atn",
  "The Atascadero News": "pub-atn",
  "Paso Robles Press": "pub-prp",
  "The Paso Robles Press": "pub-prp",
  "The Malibu Times": "pub-mt",
  "Malibu Times": "pub-mt",
  "Central Coast Journal": null, // skip — discontinued
};

// ── Parse CSV with quoted fields ──────────────────────────────
function parseCSV(text) {
  const lines = [];
  let current = [];
  let field = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { current.push(field.trim()); field = ""; }
      else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        current.push(field.trim()); field = "";
        if (current.length > 1) lines.push(current);
        current = [];
        if (ch === '\r') i++;
      } else { field += ch; }
    }
  }
  if (field || current.length > 0) { current.push(field.trim()); if (current.length > 1) lines.push(current); }
  return lines;
}

// ── Subscriber deduplication key ──────────────────────────────
function subKey(row) {
  const fn = (row[0] || "").toUpperCase().trim();
  const ln = (row[1] || "").toUpperCase().trim();
  const addr = (row[2] || "").toUpperCase().trim();
  const zip = (row[6] || "").trim();
  return `${fn}|${ln}|${addr}|${zip}`;
}

// ── Parse expiration date (formats: "Jun 2036", "01/29/2020", etc.)
function parseExpDate(str) {
  if (!str) return null;
  str = str.trim();
  // MM/DD/YYYY
  const mdyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) return `${mdyMatch[3]}-${mdyMatch[1].padStart(2, '0')}-${mdyMatch[2].padStart(2, '0')}`;
  // Mon YYYY
  const myMatch = str.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (myMatch) {
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const m = months[myMatch[1].toLowerCase().slice(0, 3)];
    if (m) return `${myMatch[2]}-${m}-01`;
  }
  return null;
}

// ── Determine tier from price description ─────────────────────
function inferTier(priceDesc, amount) {
  const pd = (priceDesc || "").toLowerCase();
  if (pd.includes("diamond")) return "diamond";
  if (pd.includes("online-only") || pd.includes("premium online")) return "digital";
  if (pd.includes("26 issues")) return "print_6mo";
  if (pd.includes("52 issues") || pd.includes("one year")) return "print_12mo";
  if (amount >= 70) return "diamond";
  if (amount >= 40) return "print_12mo";
  if (amount >= 25) return "print_6mo";
  if (amount > 0) return "print_12mo";
  return "print_12mo"; // default for comp/free
}

// ── Map SimpleCirc status to our status ───────────────────────
function mapStatus(s) {
  const st = (s || "").toLowerCase().trim();
  if (st === "active") return "active";
  if (st === "expired") return "expired";
  if (st === "cancelled") return "cancelled";
  if (st === "on hold") return "on_hold";
  if (st === "bad address") return "bad_address";
  if (st === "deceased") return "deceased";
  if (st === "other") return "cancelled";
  return "expired";
}

// ── Infer payment method from Payment Details ─────────────────
function inferMethod(pd) {
  if (!pd) return "comp";
  const p = pd.toLowerCase();
  if (p.includes("credit card") || p.includes("cc ")) return "card";
  if (p.includes("quickbooks") || p.includes("qb")) return "quickbooks";
  if (p.includes("cash")) return "cash";
  if (p.includes("check") || p.includes("ck ") || /^\d{3,}$/.test(pd.trim())) return "check";
  if (p.includes("pay pal") || p.includes("paypal")) return "card";
  if (pd.trim() && !/^covid/i.test(pd.trim())) return "check"; // likely a check number
  return "comp";
}

const SimpleCircImport = () => {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState({ counts: {}, total: 0, current: 0, errors: [], summary: "" });
  const [csvFile, setCsvFile] = useState(null);
  const [preview, setPreview] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = parseCSV(ev.target.result);
      const header = lines[0];
      const rows = lines.slice(1);
      // Count by publication
      const pubCounts = {};
      const statusCounts = {};
      rows.forEach(r => {
        const pub = r[10] || "Unknown";
        const st = r[11] || "Unknown";
        pubCounts[pub] = (pubCounts[pub] || 0) + 1;
        statusCounts[st] = (statusCounts[st] || 0) + 1;
      });
      // Deduplicate subscribers
      const seen = new Set();
      rows.forEach(r => seen.add(subKey(r)));
      setPreview({ total: rows.length, uniqueSubs: seen.size, pubCounts, statusCounts, header });
    };
    reader.readAsText(file);
  };

  const runImport = async () => {
    if (!csvFile || !supabase) return;
    setStatus("loading");

    const text = await csvFile.text();
    const lines = parseCSV(text);
    const rows = lines.slice(1); // skip header

    // Step 1: Deduplicate subscribers — group rows by person
    const subMap = new Map(); // key → { person info, subscriptions: [] }
    rows.forEach(r => {
      const key = subKey(r);
      const pubName = r[10];
      const pubId = PUB_NAME_MAP[pubName];
      if (pubId === undefined) return; // unknown pub
      if (pubId === null) return; // skip discontinued

      if (!subMap.has(key)) {
        subMap.set(key, {
          firstName: (r[0] || "").trim(),
          lastName: (r[1] || "").trim(),
          address1: (r[2] || "").trim(),
          address2: (r[3] || "").trim(),
          city: (r[4] || "").trim(),
          state: (r[5] || "").trim(),
          zip: (r[6] || "").trim(),
          phone: (r[7] || "").trim(),
          email: (r[8] || "").trim(),
          subscriptions: [],
        });
      }

      const amount = parseFloat(r[15]) || 0;
      subMap.get(key).subscriptions.push({
        pubId,
        status: mapStatus(r[11]),
        paymentDetails: (r[12] || "").trim(),
        endDate: parseExpDate(r[13]),
        copies: parseInt(r[14]) || 1,
        amount,
        method: inferMethod(r[12]),
        tier: inferTier(r[16], amount),
        note: (r[9] || "").trim(),
        priceDescription: (r[16] || "").trim(),
      });
    });

    setProgress({ counts: { "Unique subscribers": subMap.size, "Total subscriptions": rows.length }, total: subMap.size, current: 0, errors: [] });
    setStatus("inserting");

    let insertedSubs = 0;
    let insertedSubscriptions = 0;
    let insertedPayments = 0;
    const errors = [];
    const entries = Array.from(subMap.entries());

    // Step 2: Batch insert subscribers, then subscriptions
    for (let i = 0; i < entries.length; i += 50) {
      const batch = entries.slice(i, i + 50);

      // Insert subscribers
      const subBatch = batch.map(([, s]) => ({
        first_name: s.firstName || '',
        last_name: s.lastName || 'Unknown',
        type: 'print', // default — will be overridden per subscription
        status: 'active', // overall status — best of their subscriptions
        email: s.email || '',
        phone: s.phone || '',
        address_line1: s.address1 || '',
        address_line2: s.address2 || '',
        city: s.city || '',
        state: s.state || '',
        zip: s.zip || '',
        publication_id: s.subscriptions[0]?.pubId || null, // primary pub (first one)
        source: 'simplecirc',
        notes: 'Migrated from SimpleCirc',
      }));

      const { data: insertedSubData, error: subErr } = await supabase.from('subscribers').insert(subBatch).select('id');
      if (subErr) { errors.push(`Subscriber batch ${i}: ${subErr.message}`); continue; }

      insertedSubs += insertedSubData.length;

      // Insert subscriptions for each subscriber
      const subscriptionBatch = [];
      const paymentBatch = [];

      batch.forEach(([, s], idx) => {
        const subscriberId = insertedSubData[idx]?.id;
        if (!subscriberId) return;

        s.subscriptions.forEach(sub => {
          const subId = crypto.randomUUID();
          subscriptionBatch.push({
            id: subId,
            subscriber_id: subscriberId,
            publication_id: sub.pubId,
            tier: sub.tier,
            status: sub.status,
            start_date: null, // unknown from CSV
            end_date: sub.endDate,
            amount_paid: sub.amount,
            payment_method: sub.method,
            copies: sub.copies,
            notes: sub.note,
            price_description: sub.priceDescription,
            auto_renew: sub.status === 'active',
          });

          if (sub.amount > 0) {
            paymentBatch.push({
              subscription_id: subId,
              amount: sub.amount,
              method: sub.method,
              status: 'completed',
              check_number: sub.method === 'check' ? sub.paymentDetails : null,
              notes: `SimpleCirc: ${sub.paymentDetails}`,
            });
          }
        });
      });

      if (subscriptionBatch.length > 0) {
        const { error: subxErr } = await supabase.from('subscriptions').insert(subscriptionBatch);
        if (subxErr) errors.push(`Subscriptions batch ${i}: ${subxErr.message}`);
        else insertedSubscriptions += subscriptionBatch.length;
      }

      if (paymentBatch.length > 0) {
        const { error: payErr } = await supabase.from('subscription_payments').insert(paymentBatch);
        if (payErr) errors.push(`Payments batch ${i}: ${payErr.message}`);
        else insertedPayments += paymentBatch.length;
      }

      setProgress(p => ({
        ...p,
        current: i + batch.length,
        counts: { Subscribers: insertedSubs, Subscriptions: insertedSubscriptions, Payments: insertedPayments },
      }));
    }

    setProgress(p => ({
      ...p,
      errors,
      summary: `${insertedSubs.toLocaleString()} subscribers, ${insertedSubscriptions.toLocaleString()} subscriptions, ${insertedPayments.toLocaleString()} payments imported.`,
    }));
    setStatus(errors.length > 0 && insertedSubs === 0 ? "error" : "done");
  };

  return (
    <GlassCard>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>SimpleCirc Subscriber Import</div>
      <div style={{ fontSize: FS.base, color: Z.tm, marginBottom: 16, lineHeight: 1.6 }}>
        Import subscribers from a SimpleCirc CSV export. Deduplicates by name+address, creates normalized subscriber → subscription → payment records. Skips Central Coast Journal (discontinued). Maps publication names to MyDash IDs.
      </div>

      {status === "idle" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FileBtn sm accept=".csv" onChange={handleFile}>Choose CSV</FileBtn>
          {preview && (
            <div style={{ padding: 12, background: Z.sa, borderRadius: R, border: `1px solid ${Z.bd}` }}>
              <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, marginBottom: 8 }}>
                {preview.total.toLocaleString()} rows → {preview.uniqueSubs.toLocaleString()} unique subscribers
              </div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
                <div>
                  <div style={{ fontWeight: FW.bold, color: Z.tx, marginBottom: 4 }}>By Publication:</div>
                  {Object.entries(preview.pubCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <div key={k}>{k}: <b style={{ color: PUB_NAME_MAP[k] === null ? Z.td : Z.tx }}>{v}</b>{PUB_NAME_MAP[k] === null ? " (skip)" : PUB_NAME_MAP[k] === undefined ? " (unknown)" : ""}</div>
                  ))}
                </div>
                <div>
                  <div style={{ fontWeight: FW.bold, color: Z.tx, marginBottom: 4 }}>By Status:</div>
                  {Object.entries(preview.statusCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <div key={k}>{k}: <b>{v}</b></div>
                  ))}
                </div>
              </div>
              <Btn onClick={runImport} style={{ marginTop: 12 }}>Import {preview.uniqueSubs.toLocaleString()} Subscribers</Btn>
            </div>
          )}
        </div>
      )}
      {status === "loading" && <div style={{ fontSize: FS.base, color: Z.ac, fontWeight: FW.bold }}>Parsing CSV...</div>}
      {status === "inserting" && (
        <div>
          <div style={{ fontSize: FS.base, color: Z.ac, fontWeight: FW.bold, marginBottom: 8 }}>Importing...</div>
          <div style={{ display: "flex", gap: 16 }}>
            {Object.entries(progress.counts).map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx }}>{v.toLocaleString()}</div>
                <div style={{ fontSize: FS.xs, color: Z.td, textTransform: "uppercase", fontWeight: FW.bold }}>{k}</div>
              </div>
            ))}
          </div>
          {progress.total > 0 && <div style={{ marginTop: 8, height: 4, background: Z.bd, borderRadius: Ri }}>
            <div style={{ height: "100%", borderRadius: Ri, background: Z.go, width: `${(progress.current / progress.total) * 100}%`, transition: "width 0.3s" }} />
          </div>}
        </div>
      )}
      {status === "done" && (
        <div>
          <div style={{ fontSize: FS.xxl, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su, marginBottom: 4 }}>Import Complete</div>
          <div style={{ fontSize: FS.base, color: Z.tm }}>{progress.summary}</div>
          {progress.errors.length > 0 && <div style={{ marginTop: 8, fontSize: FS.sm, color: Z.da }}>{progress.errors.length} errors — check console</div>}
          {progress.errors.length > 0 && progress.errors.map((e, i) => <div key={i} style={{ fontSize: FS.xs, color: Z.da }}>{e}</div>)}
        </div>
      )}
      {status === "error" && (
        <div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.da, marginBottom: 4 }}>Import Failed</div>
          {progress.errors.map((e, i) => <div key={i} style={{ fontSize: FS.sm, color: Z.da }}>{e}</div>)}
          <Btn sm v="secondary" onClick={() => { setStatus("idle"); setProgress({ counts: {}, total: 0, current: 0, errors: [], summary: "" }); }} style={{ marginTop: 8 }}>Try Again</Btn>
        </div>
      )}
    </GlassCard>
  );
};

const DataImport = ({ onClose, isActive }) => {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Data Import" }], title: "Data Import" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
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
    {/* Action row — title moved to TopBar via usePageHeader. */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <Btn sm v="ghost" onClick={onClose}>✕ Close</Btn>
    </div>

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

    {/* SimpleCirc Subscriber Import */}
    <SimpleCircImport />
  </div>;
};

export default DataImport;
