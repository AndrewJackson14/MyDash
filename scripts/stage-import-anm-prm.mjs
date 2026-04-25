// Simulates the full CSV import wizard end-to-end against live Supabase
// in staging mode. All inserts go in with is_active=false so they
// don't appear in the Circulation tab until explicitly activated.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const STAGING_TAG = "[STAGE 2026-04-24 ANM/PRM]"; // prefix on notes so we can cleanly rollback

// ── Step 1: parse ───────────────────────────────────────────────
function parseCSV(s) {
  const rows = [[]];
  let field = "", inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === "\"" && s[i+1] === "\"") { field += "\""; i++; }
      else if (c === "\"") inQuotes = false;
      else field += c;
    } else {
      if (c === "\"") inQuotes = true;
      else if (c === ",") { rows[rows.length-1].push(field); field = ""; }
      else if (c === "\n") { rows[rows.length-1].push(field); field = ""; rows.push([]); }
      else if (c === "\r") {}
      else field += c;
    }
  }
  if (field !== "" || rows[rows.length-1].length) rows[rows.length-1].push(field);
  if (rows[rows.length-1].length === 1 && rows[rows.length-1][0] === "") rows.pop();
  return rows;
}
const raw = fs.readFileSync("Routes/ANM PRM Drops.csv", "utf8");
const rows = parseCSV(raw);
const body = rows.slice(1);
console.log(`Step 1 (parse): ${body.length} rows parsed, all 7 columns\n`);

// ── Step 2: column map (user-chosen) ─────────────────────────────
const ANM_ID = "pub-atascadero-news-maga";
const PRM_ID = "pub-paso-robles-magazine";
// Indices: 0=Name, 1=Address, 2=City, 3=ZIP(blank header), 4=ANM, 5=PRM, 6=Notes
const mapped = body.map(r => ({
  name: r[0]?.trim(),
  address: r[1]?.trim(),
  city: r[2]?.trim() || null,
  state: "CA",
  zip: r[3]?.trim() || null,
  qty_anm: parseInt(r[4]?.trim() || "0") || 0,
  qty_prm: parseInt(r[5]?.trim() || "0") || 0,
  notes: r[6]?.trim() || null,
}));
console.log("Step 2 (column map): 6 fields auto/manually mapped, 2 qty columns (ANM → atascadero-news-maga, PRM → paso-robles-magazine)\n");

// ── Step 3: validate ────────────────────────────────────────────
let errors = 0, warnings = 0;
mapped.forEach(r => {
  if (!r.name || !r.address || !r.city || !r.zip) errors++;
  if (r.zip === "94322") warnings++; // suspected typo
});
console.log(`Step 3 (validation): ${mapped.length - errors} valid, ${warnings} warnings (likely ZIP typos), ${errors} errors\n`);

// ── Step 4 + 5: geocode + insert ────────────────────────────────
console.log("Step 4+5 (geocode + stage): inserting with is_active=false…\n");
let inserted = 0, geocodeOk = 0, geocodeFail = 0, zipCorrected = 0;
const insertedLocs = []; // keep id + row data for pubs insert later

for (let i = 0; i < mapped.length; i++) {
  const r = mapped[i];
  // Geocode
  const geoRes = await fetch(`${SUPABASE_URL}/functions/v1/geocode-address`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ address: r.address, city: r.city, state: r.state, zip: r.zip }),
  });
  const geo = await geoRes.json();
  let lat = null, lng = null, geocode_status = "failed", effective_zip = r.zip;
  if (geo.status === "success") {
    lat = geo.lat; lng = geo.lng; geocode_status = "success";
    geocodeOk++;
    // Extract Mapbox's authoritative ZIP from place_name — e.g. "...California 93422..."
    const mapboxZip = (geo.place_name?.match(/\b\d{5}\b/) || [])[0];
    if (mapboxZip && mapboxZip !== r.zip) { effective_zip = mapboxZip; zipCorrected++; }
  } else {
    geocodeFail++;
  }

  // Insert drop_location
  const stagedNotes = [STAGING_TAG, r.notes].filter(Boolean).join(" ");
  const { data, error } = await supabase.from("drop_locations").insert({
    name: r.name,
    type: "other",
    address: r.address,
    city: r.city, state: r.state, zip: effective_zip,
    lat, lng, geocoded_at: lat ? new Date().toISOString() : null, geocode_status,
    source: "csv-import",
    notes: stagedNotes,
    is_active: false,
  }).select("id").single();
  if (error) { console.log(`  ROW ${i+1} "${r.name}": ${error.message}`); continue; }
  inserted++;
  insertedLocs.push({ id: data.id, r });

  if ((i+1) % 25 === 0) console.log(`  …${i+1}/${mapped.length} processed`);
}

console.log(`\nInsert results: ${inserted}/${mapped.length} rows`);
console.log(`Geocode: ${geocodeOk} success, ${geocodeFail} failed`);
console.log(`ZIP corrections applied from Mapbox: ${zipCorrected}`);

// drop_location_pubs rows
const pubLinks = [];
for (const { id, r } of insertedLocs) {
  if (r.qty_anm > 0) pubLinks.push({ drop_location_id: id, publication_id: ANM_ID, quantity: r.qty_anm });
  if (r.qty_prm > 0) pubLinks.push({ drop_location_id: id, publication_id: PRM_ID, quantity: r.qty_prm });
}
// Bulk insert in chunks of 200
for (let i = 0; i < pubLinks.length; i += 200) {
  const chunk = pubLinks.slice(i, i + 200);
  const { error } = await supabase.from("drop_location_pubs").insert(chunk);
  if (error) { console.log(`pub-link chunk ${i}: ${error.message}`); break; }
}
console.log(`\nPub links: ${pubLinks.length} (${pubLinks.filter(p => p.publication_id === ANM_ID).length} ANM + ${pubLinks.filter(p => p.publication_id === PRM_ID).length} PRM)`);
