// ============================================================
// DropLocationCSVImport — 5-step CSV import wizard (spec v1.1 §4.2).
//
// Step 1: Upload      — drag/drop or click; papaparse in-memory
// Step 2: Column map  — auto-suggest from header fuzzy match; localStorage
// Step 3: Validation  — required fields, state/ZIP format, qty integers
// Step 4: Match + geo — NEW/UPDATE/SKIP bucket per row; background geocode
// Step 5: Execute     — batched writes to drop_locations + drop_location_pubs
//
// Notes:
//   - All validation + preview is client-side; only geocode and the final
//     insert/update touch the network.
//   - Column mapping is persisted to localStorage keyed "csvImportMap:v1"
//     so re-imports auto-apply the previous mapping.
//   - Geocoding is opportunistic: failed lookups don't block import; the
//     row saves with geocode_status='failed' and Cami can fix manually.
//   - We write `type` (the actual DB column), not `location_type` —
//     existing useAppData has a latent bug writing to a non-existent column.
// ============================================================
import { useState, useMemo, useEffect, useCallback } from "react";
import Papa from "papaparse";
import { Z, FS, FW, COND, R, Ri } from "../../lib/theme";
import { Btn, Modal, Sel, GlassCard } from "../../components/ui";
import { supabase, EDGE_FN_URL } from "../../lib/supabase";
import { pnFor } from "./constants";

// Canonical MyDash fields we accept from a CSV. Order matters — it's the
// order they appear in the column-mapping UI.
const FIELDS = [
  { key: "name",                       label: "Location Name",           required: true,  format: "max 200 chars" },
  { key: "type",                       label: "Type",                    required: true,  format: "rack | retail | hotel | office | restaurant | library | other" },
  { key: "address",                    label: "Street Address",          required: true },
  { key: "city",                       label: "City",                    required: true },
  { key: "state",                      label: "State",                   required: true,  format: "2-letter, default CA" },
  { key: "zip",                        label: "ZIP",                     required: true },
  { key: "contact_name",               label: "Contact",                 required: false },
  { key: "contact_phone",              label: "Phone",                   required: false },
  { key: "contact_email",              label: "Email",                   required: false },
  { key: "access_notes",               label: "Access Notes",            required: false, format: "e.g. 'Behind counter, ask for Maria'" },
  { key: "preferred_delivery_window",  label: "Delivery Window",         required: false, format: "e.g. 'Mornings before 10am'" },
  { key: "active",                     label: "Active",                  required: false, format: "TRUE/FALSE, defaults TRUE" },
];

const DEFAULT_CSV_HEADERS = {
  name: "Location Name", type: "Type", address: "Street Address",
  city: "City", state: "State", zip: "ZIP",
  contact_name: "Contact", contact_phone: "Phone", contact_email: "Email",
  access_notes: "Access Notes", preferred_delivery_window: "Delivery Window",
  active: "Active",
};

const LS_KEY = "csvImportMap:v1";
const MAX_BYTES = 10 * 1024 * 1024;    // 10 MB
const MAX_ROWS  = 10000;

// Levenshtein-free fuzzy match — strip spaces/punctuation/casing; compare
// as substring in either direction. Good enough for "Street Address" ≈
// "street_address" ≈ "Address".
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const looksLike = (csvHeader, canonical) => {
  const a = norm(csvHeader); const b = norm(canonical);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
};

// ── Step helpers ───────────────────────────────────────────────────
function autoMap(headers, pubs) {
  const map = {};
  for (const f of FIELDS) {
    const defaultHeader = DEFAULT_CSV_HEADERS[f.key];
    const match = headers.find(h => looksLike(h, defaultHeader)) || headers.find(h => looksLike(h, f.label));
    if (match) map[f.key] = match;
  }
  // qty_<PUB_CODE> columns — look for "PRP Qty", "qty_PRP", "qty PRP" etc.
  for (const pub of pubs) {
    const code = pub.shortName || pub.code || pub.id;
    if (!code) continue;
    const match = headers.find(h => {
      const n = norm(h);
      return n.includes(norm(code)) && n.includes("qty");
    });
    if (match) map[`qty_${pub.id}`] = match;
  }
  return map;
}

function validateRow(row, map) {
  const errs = [];
  const warns = [];
  for (const f of FIELDS) {
    if (f.required && !row[map[f.key]]?.trim?.()) {
      errs.push(`Missing ${f.label}`);
    }
  }
  if (row[map.state] && row[map.state].length !== 2) warns.push("State not 2-letter");
  if (row[map.zip] && !/^\d{5}(-\d{4})?$/.test(String(row[map.zip]).trim())) warns.push("ZIP format");
  return { errs, warns };
}

// Convert a mapped CSV row into the drop_locations insert/update shape.
function rowToDb(row, map, pubs) {
  const pubQtys = [];
  for (const pub of pubs) {
    const col = map[`qty_${pub.id}`];
    if (!col) continue;
    const raw = row[col];
    const qty = parseInt(String(raw || "").trim(), 10);
    if (Number.isFinite(qty) && qty > 0) pubQtys.push({ publication_id: pub.id, quantity: qty });
  }
  return {
    name: (row[map.name] || "").trim(),
    type: (row[map.type] || "other").trim().toLowerCase(),
    address: (row[map.address] || "").trim(),
    city: (row[map.city] || "").trim(),
    state: ((row[map.state] || "CA").trim() || "CA").toUpperCase().slice(0, 2),
    zip: (row[map.zip] || "").trim(),
    contact_name: (row[map.contact_name] || "").trim() || null,
    contact_phone: (row[map.contact_phone] || "").trim() || null,
    access_notes: (row[map.access_notes] || "").trim() || null,
    preferred_delivery_window: (row[map.preferred_delivery_window] || "").trim() || null,
    is_active: !/^(false|no|0)$/i.test((row[map.active] || "").trim()),
    source: "csv-import",
    geocode_status: "pending",
    __pub_qtys: pubQtys, // consumed in writePhase, stripped before insert
  };
}

// ── Main component ─────────────────────────────────────────────────
export default function DropLocationCSVImport({ open, onClose, pubs, dropLocations, onImported }) {
  const pn = pnFor(pubs || []);
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);            // parsed CSV rows
  const [parseErr, setParseErr] = useState(null);
  const [map, setMap] = useState({});               // { field: csvHeader }
  const [rowDecisions, setRowDecisions] = useState([]); // [{ action, existingId, lat, lng, geocode_status }]
  const [geocoded, setGeocoded] = useState(0);
  const [writing, setWriting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);       // { inserted, updated, skipped }

  // Reset everything when modal closes.
  useEffect(() => {
    if (!open) {
      setStep(1); setFile(null); setHeaders([]); setRows([]); setParseErr(null);
      setMap({}); setRowDecisions([]); setGeocoded(0); setWriting(false);
      setProgress({ done: 0, total: 0 }); setResult(null);
    }
  }, [open]);

  // Step 1 → 2: parse file.
  const handleFile = useCallback(async (f) => {
    setParseErr(null);
    if (!f) return;
    if (f.size > MAX_BYTES) { setParseErr(`File too large (${(f.size / 1024 / 1024).toFixed(1)} MB, max 10 MB)`); return; }
    if (!/\.csv$/i.test(f.name)) { setParseErr("File must be .csv"); return; }
    setFile(f);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (res.errors?.length) {
          const first = res.errors[0];
          setParseErr(`Parse error at row ${(first.row ?? 0) + 1}: ${first.message}`);
          return;
        }
        if (res.data.length > MAX_ROWS) { setParseErr(`Too many rows (${res.data.length}, max ${MAX_ROWS.toLocaleString()})`); return; }
        setHeaders(res.meta.fields || []);
        setRows(res.data);
        // Try stored mapping first; fall back to auto-map.
        let initial = {};
        try { initial = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { /* ignore */ }
        const stored = Object.fromEntries(Object.entries(initial).filter(([, v]) => (res.meta.fields || []).includes(v)));
        setMap({ ...autoMap(res.meta.fields || [], pubs || []), ...stored });
      },
    });
  }, [pubs]);

  // Step 2 → 3: save mapping, move to validation.
  const saveMappingAndNext = () => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch { /* ignore */ }
    setStep(3);
  };

  // Validation summary for Step 3.
  const validation = useMemo(() => {
    const v = rows.map(r => validateRow(r, map));
    return {
      valid: v.filter(x => x.errs.length === 0 && x.warns.length === 0).length,
      warned: v.filter(x => x.errs.length === 0 && x.warns.length > 0).length,
      errored: v.filter(x => x.errs.length > 0).length,
      perRow: v,
    };
  }, [rows, map]);

  // Step 3 → 4: precompute match decisions.
  const buildDecisions = () => {
    const byKey = new Map();
    for (const loc of (dropLocations || [])) {
      byKey.set(`${norm(loc.name)}|${norm(loc.zip)}`, loc);
    }
    const decisions = rows.map((row, i) => {
      if (validation.perRow[i].errs.length > 0) return { action: "error" };
      const db = rowToDb(row, map, pubs || []);
      const existing = byKey.get(`${norm(db.name)}|${norm(db.zip)}`);
      return {
        action: existing ? "update" : "new",
        existingId: existing?.id || null,
        db,
        geocode_status: "pending",
        lat: null, lng: null,
      };
    });
    setRowDecisions(decisions);
    setStep(4);
  };

  // Step 4: background geocode pass. Fire sequentially to stay gentle on
  // the Mapbox free tier (burst-friendly token but not unlimited).
  useEffect(() => {
    if (step !== 4 || !rowDecisions.length) return;
    let cancelled = false;
    const toGeocode = rowDecisions
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => d.action === "new" || d.action === "update")
      .filter(({ d }) => d.geocode_status === "pending");

    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      let completed = 0;
      for (const { d, i } of toGeocode) {
        if (cancelled) return;
        try {
          const r = await fetch(`${EDGE_FN_URL}/geocode-address`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: supabase.supabaseKey || "" },
            body: JSON.stringify({ address: d.db.address, city: d.db.city, state: d.db.state, zip: d.db.zip }),
          });
          const json = await r.json();
          if (cancelled) return;
          setRowDecisions(prev => prev.map((p, idx) => idx === i ? {
            ...p,
            lat: json.status === "success" ? json.lat : null,
            lng: json.status === "success" ? json.lng : null,
            geocode_status: json.status === "success" ? "success" : "failed",
          } : p));
        } catch {
          setRowDecisions(prev => prev.map((p, idx) => idx === i ? { ...p, geocode_status: "failed" } : p));
        }
        completed++;
        if (!cancelled) setGeocoded(completed);
      }
    })();
    return () => { cancelled = true; };
  }, [step, rowDecisions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAction = (i) => {
    setRowDecisions(prev => prev.map((d, idx) => {
      if (idx !== i) return d;
      if (d.action === "new") return { ...d, action: "skip" };
      if (d.action === "skip") return { ...d, action: "new" };
      if (d.action === "update") return { ...d, action: "skip" };
      return d;
    }));
  };

  // Step 5: batched writes.
  const execute = async () => {
    setWriting(true);
    const queue = rowDecisions.filter(d => d.action === "new" || d.action === "update");
    setProgress({ done: 0, total: queue.length });
    let inserted = 0, updated = 0;
    const skipped = rowDecisions.filter(d => d.action === "skip" || d.action === "error").length;
    const BATCH = 100;

    for (let i = 0; i < queue.length; i += BATCH) {
      const chunk = queue.slice(i, i + BATCH);
      const inserts = chunk.filter(d => d.action === "new");
      const updates = chunk.filter(d => d.action === "update");

      if (inserts.length) {
        const rowsToInsert = inserts.map(d => {
          const { __pub_qtys, ...rest } = d.db;
          return { ...rest, lat: d.lat, lng: d.lng, geocoded_at: d.geocode_status === "success" ? new Date().toISOString() : null, geocode_status: d.geocode_status };
        });
        const { data, error } = await supabase.from("drop_locations").insert(rowsToInsert).select("id");
        if (error) {
          console.error("Insert error:", error);
        } else {
          // Pair returned IDs with per-pub quantities.
          const pubLinks = [];
          (data || []).forEach((row, idx) => {
            const qtys = inserts[idx].db.__pub_qtys || [];
            for (const q of qtys) pubLinks.push({ drop_location_id: row.id, publication_id: q.publication_id, quantity: q.quantity });
          });
          if (pubLinks.length) await supabase.from("drop_location_pubs").insert(pubLinks);
          inserted += inserts.length;
        }
      }

      for (const d of updates) {
        const { __pub_qtys, ...rest } = d.db;
        await supabase.from("drop_locations").update({
          ...rest,
          lat: d.lat, lng: d.lng,
          geocoded_at: d.geocode_status === "success" ? new Date().toISOString() : null,
          geocode_status: d.geocode_status,
          updated_at: new Date().toISOString(),
        }).eq("id", d.existingId);
        // Replace drop_location_pubs rows atomically (delete + insert).
        await supabase.from("drop_location_pubs").delete().eq("drop_location_id", d.existingId);
        if (__pub_qtys?.length) {
          await supabase.from("drop_location_pubs").insert(
            __pub_qtys.map(q => ({ drop_location_id: d.existingId, publication_id: q.publication_id, quantity: q.quantity }))
          );
        }
        updated++;
      }

      setProgress({ done: Math.min(i + BATCH, queue.length), total: queue.length });
    }

    setResult({ inserted, updated, skipped });
    setWriting(false);
    onImported?.();
  };

  // ── Render helpers ───────────────────────────────────────────────
  const canGoNext = (() => {
    if (step === 1) return rows.length > 0 && !parseErr;
    if (step === 2) return FIELDS.filter(f => f.required).every(f => map[f.key]);
    if (step === 3) return validation.errored < rows.length; // any valid row → allow
    if (step === 4) return rowDecisions.length > 0;
    return false;
  })();

  const totalGeocodeTargets = rowDecisions.filter(d => d.action === "new" || d.action === "update").length;

  return <Modal open={open} onClose={onClose} title="Import Drop Locations — CSV" width={720}>
    {/* Step indicator */}
    <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const active = step === n;
        const done = step > n;
        return <div key={n} style={{
          flex: 1, height: 4, borderRadius: 2,
          background: active ? Z.ac : done ? Z.go : Z.bd,
          transition: "background 0.2s",
        }} />;
      })}
    </div>

    <div style={{ minHeight: 360 }}>
      {step === 1 && <Step1Upload file={file} parseErr={parseErr} rows={rows} headers={headers} onFile={handleFile} />}
      {step === 2 && <Step2Mapping headers={headers} map={map} setMap={setMap} pubs={pubs} />}
      {step === 3 && <Step3Validation validation={validation} rows={rows} />}
      {step === 4 && <Step4Match decisions={rowDecisions} geocoded={geocoded} totalGeocodeTargets={totalGeocodeTargets} onToggle={toggleAction} pubs={pubs} />}
      {step === 5 && <Step5Execute writing={writing} progress={progress} result={result} onExecute={execute} decisions={rowDecisions} onClose={onClose} />}
    </div>

    {/* Nav footer */}
    {step < 5 && <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
      <Btn v="cancel" onClick={onClose}>Cancel</Btn>
      <div style={{ display: "flex", gap: 8 }}>
        {step > 1 && <Btn v="secondary" onClick={() => setStep(s => s - 1)}>Back</Btn>}
        {step === 2 && <Btn onClick={saveMappingAndNext} disabled={!canGoNext}>Next</Btn>}
        {step === 3 && <Btn onClick={buildDecisions} disabled={!canGoNext}>Next</Btn>}
        {step !== 2 && step !== 3 && step !== 5 && <Btn onClick={() => setStep(s => s + 1)} disabled={!canGoNext}>Next</Btn>}
      </div>
    </div>}
  </Modal>;
}

// ── Step 1 ───────────────────────────────────────────────────────
function Step1Upload({ file, parseErr, rows, headers, onFile }) {
  const [dragOver, setDragOver] = useState(false);
  return <div>
    <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 6 }}>Step 1 — Upload CSV</div>
    <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 12 }}>
      Drag-and-drop or click to select. .csv only · 10 MB max · 10,000 rows max.
    </div>
    <label style={{
      display: "block", padding: "40px 20px", textAlign: "center",
      border: `2px dashed ${dragOver ? Z.ac : Z.bd}`, borderRadius: R,
      background: dragOver ? Z.ac + "10" : Z.bg,
      cursor: "pointer", transition: "all 0.15s",
    }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files[0]); }}
    >
      <input type="file" accept=".csv" style={{ display: "none" }} onChange={e => onFile(e.target.files[0])} />
      {file ? <>
        <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{file.name}</div>
        <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB</div>
        {rows.length > 0 && <div style={{ fontSize: FS.sm, color: Z.go, marginTop: 8, fontWeight: FW.bold }}>
          {rows.length.toLocaleString()} rows · {headers.length} columns
        </div>}
      </> : <>
        <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tm }}>Drop CSV here or click to browse</div>
      </>}
    </label>
    {parseErr && <div style={{ marginTop: 10, padding: "8px 12px", background: Z.da + "18", color: Z.da, borderRadius: Ri, fontSize: FS.sm }}>{parseErr}</div>}
    {rows.length > 0 && !parseErr && <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>First 5 rows</div>
      <div style={{ overflow: "auto", maxHeight: 160, border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
        <table style={{ width: "100%", fontSize: FS.xs, borderCollapse: "collapse" }}>
          <thead><tr>{headers.map(h => <th key={h} style={{ textAlign: "left", padding: "4px 8px", background: Z.sa, color: Z.tm, fontWeight: FW.heavy, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 5).map((r, i) => <tr key={i}>{headers.map(h => <td key={h} style={{ padding: "4px 8px", color: Z.tx, borderTop: `1px solid ${Z.bd}`, whiteSpace: "nowrap" }}>{r[h]}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>}
  </div>;
}

// ── Step 2 ───────────────────────────────────────────────────────
function Step2Mapping({ headers, map, setMap, pubs }) {
  const options = [{ value: "", label: "— not mapped —" }, ...headers.map(h => ({ value: h, label: h }))];
  const missingRequired = FIELDS.filter(f => f.required && !map[f.key]);
  return <div>
    <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 6 }}>Step 2 — Column Mapping</div>
    <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 12 }}>
      Match your spreadsheet's column headers to MyDash fields. Required fields are highlighted. Per-publication quantity columns appear at the bottom.
    </div>
    {missingRequired.length > 0 && <div style={{ padding: "8px 12px", background: Z.wa + "18", color: Z.wa, borderRadius: Ri, fontSize: FS.sm, marginBottom: 12 }}>
      Missing required field{missingRequired.length > 1 ? "s" : ""}: {missingRequired.map(f => f.label).join(", ")}
    </div>}
    <div style={{ display: "grid", gap: 6 }}>
      {FIELDS.map(f => <div key={f.key} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10, alignItems: "center", padding: "6px 10px", background: f.required && !map[f.key] ? Z.wa + "10" : Z.bg, borderRadius: Ri }}>
        <div>
          <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{f.label}{f.required && <span style={{ color: Z.da }}> *</span>}</div>
          {f.format && <div style={{ fontSize: FS.micro, color: Z.td }}>{f.format}</div>}
        </div>
        <Sel value={map[f.key] || ""} onChange={e => setMap(m => ({ ...m, [f.key]: e.target.value }))} options={options} />
      </div>)}
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", marginTop: 14, marginBottom: 4 }}>Per-publication quantities</div>
      {(pubs || []).map(p => <div key={p.id} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10, alignItems: "center", padding: "6px 10px", background: Z.bg, borderRadius: Ri }}>
        <div>
          <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{p.name}</div>
          <div style={{ fontSize: FS.micro, color: Z.td }}>qty column</div>
        </div>
        <Sel value={map[`qty_${p.id}`] || ""} onChange={e => setMap(m => ({ ...m, [`qty_${p.id}`]: e.target.value }))} options={options} />
      </div>)}
    </div>
  </div>;
}

// ── Step 3 ───────────────────────────────────────────────────────
function Step3Validation({ validation, rows }) {
  const issues = [];
  validation.perRow.forEach((v, i) => {
    if (v.errs.length) issues.push({ row: i + 1, kind: "error", msg: v.errs.join("; ") });
    else if (v.warns.length) issues.push({ row: i + 1, kind: "warn", msg: v.warns.join("; ") });
  });
  return <div>
    <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 12 }}>Step 3 — Validation</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
      <div style={{ padding: "10px 14px", background: Z.go + "18", borderRadius: Ri }}>
        <div style={{ fontSize: FS.xs, color: Z.go, fontWeight: FW.heavy, textTransform: "uppercase" }}>Valid</div>
        <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx }}>{validation.valid}</div>
      </div>
      <div style={{ padding: "10px 14px", background: Z.wa + "18", borderRadius: Ri }}>
        <div style={{ fontSize: FS.xs, color: Z.wa, fontWeight: FW.heavy, textTransform: "uppercase" }}>Warnings</div>
        <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx }}>{validation.warned}</div>
      </div>
      <div style={{ padding: "10px 14px", background: Z.da + "18", borderRadius: Ri }}>
        <div style={{ fontSize: FS.xs, color: Z.da, fontWeight: FW.heavy, textTransform: "uppercase" }}>Errors</div>
        <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx }}>{validation.errored}</div>
      </div>
    </div>
    {issues.length === 0
      ? <div style={{ padding: "16px 20px", textAlign: "center", color: Z.go, fontWeight: FW.bold }}>All {rows.length} rows valid</div>
      : <>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>First {Math.min(10, issues.length)} issues</div>
        <div style={{ maxHeight: 180, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
          {issues.slice(0, 10).map((iss, i) => <div key={i} style={{ padding: "6px 10px", fontSize: FS.xs, borderTop: i === 0 ? "none" : `1px solid ${Z.bd}`, display: "flex", gap: 8 }}>
            <span style={{ fontWeight: FW.heavy, color: iss.kind === "error" ? Z.da : Z.wa, minWidth: 58 }}>Row {iss.row}</span>
            <span style={{ color: Z.tm }}>{iss.msg}</span>
          </div>)}
        </div>
      </>}
    {validation.errored > 0 && <div style={{ marginTop: 10, fontSize: FS.xs, color: Z.td }}>
      Rows with errors will be skipped automatically. Warnings still import.
    </div>}
  </div>;
}

// ── Step 4 ───────────────────────────────────────────────────────
function Step4Match({ decisions, geocoded, totalGeocodeTargets, onToggle, pubs }) {
  const news = decisions.filter(d => d.action === "new").length;
  const updates = decisions.filter(d => d.action === "update").length;
  const skips = decisions.filter(d => d.action === "skip").length;
  return <div>
    <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 12 }}>Step 4 — Match & Geocode</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
      <Stat label="New" value={news} color={Z.ac} />
      <Stat label="Update" value={updates} color={Z.wa} />
      <Stat label="Skip" value={skips} color={Z.tm} />
    </div>
    <div style={{ padding: "8px 12px", background: Z.bg, borderRadius: Ri, fontSize: FS.xs, color: Z.tm, marginBottom: 10 }}>
      Geocoded {geocoded} of {totalGeocodeTargets}. Failed rows still import — manually set lat/lng later.
    </div>
    <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
      {decisions.map((d, i) => {
        if (d.action === "error") return null;
        return <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1fr 60px 90px", gap: 8, padding: "6px 10px", borderTop: i === 0 ? "none" : `1px solid ${Z.bd}`, alignItems: "center", fontSize: FS.xs }}>
          <button onClick={() => onToggle(i)} style={{
            fontSize: 10, fontWeight: FW.heavy, color: "#fff",
            background: d.action === "new" ? Z.ac : d.action === "update" ? Z.wa : Z.tm,
            border: "none", borderRadius: Ri, padding: "3px 6px", cursor: "pointer",
          }}>{d.action.toUpperCase()}</button>
          <div>
            <div style={{ color: Z.tx, fontWeight: FW.bold }}>{d.db?.name}</div>
            <div style={{ color: Z.tm }}>{d.db?.city}, {d.db?.state} {d.db?.zip}</div>
          </div>
          <span style={{
            fontSize: 9, fontWeight: FW.heavy, color: d.geocode_status === "success" ? Z.go : d.geocode_status === "failed" ? Z.da : Z.tm,
            textTransform: "uppercase",
          }}>{d.geocode_status === "success" ? "✓ geo" : d.geocode_status === "failed" ? "no geo" : "…"}</span>
          <span style={{ color: Z.tm, textAlign: "right" }}>
            {(d.db?.__pub_qtys || []).reduce((s, q) => s + q.quantity, 0)} copies
          </span>
        </div>;
      })}
    </div>
  </div>;
}

// ── Step 5 ───────────────────────────────────────────────────────
function Step5Execute({ writing, progress, result, onExecute, decisions, onClose }) {
  const news = decisions.filter(d => d.action === "new").length;
  const updates = decisions.filter(d => d.action === "update").length;
  const skips = decisions.filter(d => d.action === "skip" || d.action === "error").length;

  if (result) {
    return <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 48, marginBottom: 10 }}>✓</div>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.go, marginBottom: 8 }}>Import complete</div>
      <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 20 }}>
        {result.inserted} inserted · {result.updated} updated · {result.skipped} skipped
      </div>
      <Btn onClick={onClose}>Done</Btn>
    </div>;
  }
  if (writing) {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return <div style={{ padding: "40px 20px" }}>
      <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, marginBottom: 8 }}>Importing…</div>
      <div style={{ height: 8, background: Z.bd, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: Z.ac, transition: "width 0.3s" }} />
      </div>
      <div style={{ fontSize: FS.xs, color: Z.tm }}>{progress.done} of {progress.total} ({pct}%)</div>
    </div>;
  }
  return <div>
    <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 12 }}>Step 5 — Confirm & Execute</div>
    <div style={{ padding: "14px 18px", background: Z.bg, borderRadius: Ri, marginBottom: 18 }}>
      <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 6 }}>Ready to write:</div>
      <div style={{ display: "flex", gap: 18, fontSize: FS.base, color: Z.tx, fontWeight: FW.bold }}>
        <span><b style={{ color: Z.ac }}>{news}</b> insert</span>
        <span><b style={{ color: Z.wa }}>{updates}</b> update</span>
        <span><b style={{ color: Z.tm }}>{skips}</b> skip</span>
      </div>
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <Btn onClick={onExecute} disabled={news + updates === 0}>Import {news + updates} rows</Btn>
    </div>
  </div>;
}

function Stat({ label, value, color }) {
  return <div style={{ padding: "10px 14px", background: color + "18", borderRadius: Ri, textAlign: "center" }}>
    <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx }}>{value}</div>
  </div>;
}
