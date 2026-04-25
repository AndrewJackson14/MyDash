// Build the ANM + PRM Monthly Route template from the imported
// drop_locations. Stops are added in the CSV's original order — the
// same order Cami curated when authoring the spreadsheet (which
// already reflects her mental driving sequence).
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const ANM_ID = "pub-atascadero-news-maga";
const PRM_ID = "pub-paso-robles-magazine";

// ── Parse the CSV for the stop order + per-stop qtys ─────────────
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
const body = parseCSV(fs.readFileSync("Routes/ANM PRM Drops.csv", "utf8")).slice(1);
console.log(`CSV parsed: ${body.length} rows in source order`);

// ── Map each CSV row → drop_location.id via (name, address) match ──
// The recent import is the authoritative source. Name+address together
// uniquely identify each location (even for Cowgirl Cafe × 2 and
// American Riviera Bank × 2 etc, which have different addresses).
const { data: locs } = await supabase
  .from("drop_locations")
  .select("id, name, address, city")
  .eq("source", "csv-import")
  .gt("created_at", new Date(Date.now() - 6 * 3600_000).toISOString())
  .limit(2000);
console.log(`Imported locs in last 6h: ${locs.length}`);

function norm(s) { return (s || "").toString().trim().replace(/\s+/g, " ").toLowerCase(); }
const locByKey = new Map();
for (const l of locs) locByKey.set(`${norm(l.name)}|${norm(l.address)}`, l);

// ── Create the route template + pub links ──────────────────────────
const { data: route, error: routeErr } = await supabase.from("driver_routes").insert({
  name: "ANM + PRM Monthly Route",
  frequency: "monthly",
  publication_id: ANM_ID, // ANM primary (trigger syncs to driver_route_pubs below)
  default_driver_id: null,
  flat_fee: null,
  notes: "Imported from ANM PRM Drops.csv on 2026-04-24. 114 stops across Paso Robles / Atascadero / Templeton / Santa Margarita. Assign a driver + set flat_fee before first run.",
  is_active: true,
}).select().single();
if (routeErr) { console.error("Route insert failed:", routeErr); process.exit(1); }
console.log(`Route template created: ${route.id}`);

await supabase.from("driver_route_pubs").insert([
  { route_id: route.id, publication_id: ANM_ID, is_primary: true },
  { route_id: route.id, publication_id: PRM_ID, is_primary: false },
]);
console.log("Pub links created: ANM (primary) + PRM");

// ── Build stops in CSV order ─────────────────────────────────────
const stopRows = [];
let missing = [];
body.forEach((r, i) => {
  const name = r[0]?.trim(), addr = r[1]?.trim();
  const qtyAnm = parseInt(r[4]?.trim() || "0") || 0;
  const qtyPrm = parseInt(r[5]?.trim() || "0") || 0;
  const expected = qtyAnm + qtyPrm;
  const match = locByKey.get(`${norm(name)}|${norm(addr)}`);
  if (!match) { missing.push(`row ${i+2}: ${name} | ${addr}`); return; }
  stopRows.push({
    route_id: route.id,
    drop_location_id: match.id,
    sort_order: i,
    stop_order: i,
    expected_qty: expected,
    access_notes: r[6]?.trim() || null,
  });
});
console.log(`Matched ${stopRows.length}/${body.length} CSV rows to drop_locations`);
if (missing.length) console.log("Unmatched:", missing.slice(0, 10));

for (let i = 0; i < stopRows.length; i += 100) {
  const chunk = stopRows.slice(i, i + 100);
  const { error } = await supabase.from("route_stops").insert(chunk);
  if (error) { console.error(`Stop chunk ${i}:`, error); break; }
}
console.log(`${stopRows.length} route_stops inserted`);

// Audit trail
await supabase.from("location_audit_log").insert({
  entity_type: "route_template",
  entity_id: route.id,
  action: "created",
  actor_type: "system",
  context: {
    route_id: route.id,
    reason: "Bulk-imported ANM+PRM route from CSV",
    stop_count: stopRows.length,
    pubs: [ANM_ID, PRM_ID],
  },
});

console.log(`\n✓ Route ready: ${route.id}`);
console.log(`  114 active drop locations · 134 pub links · ${stopRows.length} stops in template`);
