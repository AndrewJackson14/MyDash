// ============================================================
// AdvertisingAdmin.jsx — Publisher CRUD for self-serve workflow
//
// Four tabs:
//   Industries       — name + markup % (per-pub)
//   Local Zips       — bulk-paste zip list (per-pub)
//   Ad Products      — bookable catalog (per-pub, by product_type)
//   Free Domains     — global; super_admin only
// ============================================================
import { useState, useEffect, useCallback, useMemo } from "react";
import { Z, COND, FS, FW } from "../lib/theme";
import { Btn, Inp, Sel, TA, Modal, PageHeader, GlassCard, SolidTabs, FilterBar } from "../components/ui";
import { supabase } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";

const PRODUCT_TYPES = [
  { value: "digital_display",        label: "Digital Display" },
  { value: "print",                  label: "Print" },
  { value: "newsletter_sponsorship", label: "Newsletter Sponsorship" },
  { value: "classifieds",            label: "Classifieds" },
];

const slugify = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const labelStyle = { fontSize: 10, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND };
const tableHeader = { padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.6, borderBottom: `1px solid ${Z.bd}`, fontFamily: COND };
const tableCell  = { padding: "8px 10px", color: Z.tx, fontSize: FS.sm, fontFamily: COND, borderBottom: `1px solid ${Z.bd}30` };
const fmtMoney = (cents) => `$${(cents / 100).toFixed(2)}`;

export default function AdvertisingAdmin({ pubs = [], isActive }) {
  const [tab, setTab] = useState("industries");
  // Default to first pub. The free-domains tab ignores this.
  const [pubId, setPubId] = useState(() => pubs[0]?.id || "");
  useEffect(() => { if (!pubId && pubs[0]?.id) setPubId(pubs[0].id); }, [pubs, pubId]);
  const pubOptions = useMemo(() => pubs.map(p => ({ value: p.id, label: p.name })), [pubs]);

  return (
    <div>
      <PageHeader title="Advertising Admin" />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <SolidTabs
          active={tab}
          onChange={setTab}
          options={[
            { value: "industries", label: "Industries" },
            { value: "zips",       label: "Local Zips" },
            { value: "products",   label: "Ad Products" },
            { value: "domains",    label: "Free Email Domains" },
          ]}
        />
        {tab !== "domains" && (
          <div style={{ marginLeft: "auto", minWidth: 220 }}>
            <Sel value={pubId} onChange={e => setPubId(e.target.value)} options={pubOptions} />
          </div>
        )}
      </div>

      {tab === "industries" && pubId && <IndustriesTab pubId={pubId} />}
      {tab === "zips"       && pubId && <ZipsTab pubId={pubId} />}
      {tab === "products"   && pubId && <ProductsTab pubId={pubId} />}
      {tab === "domains"             && <DomainsTab />}
    </div>
  );
}

// ── Industries ───────────────────────────────────────────────
function IndustriesTab({ pubId }) {
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("industries").select("*").eq("site_id", pubId).order("name");
    if (!error) setRows(data || []);
    setLoading(false);
  }, [pubId]);
  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    const slug = slugify(form.slug || form.name);
    const payload = { site_id: pubId, name: form.name.trim(), slug, markup_percent: Number(form.markup_percent) || 0 };
    const { error } = editing?.id
      ? await supabase.from("industries").update(payload).eq("id", editing.id)
      : await supabase.from("industries").insert(payload);
    if (error) { await dialog.alert("Save failed: " + error.message); return; }
    setEditing(null);
    load();
  };

  const remove = async (row) => {
    if (!await dialog.confirm(`Delete industry "${row.name}"? Advertisers using it will be unlinked.`)) return;
    const { error } = await supabase.from("industries").delete().eq("id", row.id);
    if (error) { await dialog.alert("Delete failed: " + error.message); return; }
    load();
  };

  return (
    <GlassCard>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
          Industries · {rows.length}
        </div>
        <Btn sm onClick={() => setEditing({ name: "", markup_percent: 0 })}>+ Add Industry</Btn>
      </div>
      {loading ? <div style={{ padding: 20, color: Z.tm }}>Loading…</div> :
        rows.length === 0 ? <div style={{ padding: 20, color: Z.td, fontFamily: COND }}>None yet. Add one to start tagging advertisers.</div> :
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={tableHeader}>Name</th>
            <th style={tableHeader}>Slug</th>
            <th style={{ ...tableHeader, textAlign: "right" }}>Markup %</th>
            <th style={{ ...tableHeader, width: 1 }}></th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={tableCell}>{r.name}</td>
                <td style={{ ...tableCell, color: Z.tm, fontSize: FS.xs }}>{r.slug}</td>
                <td style={{ ...tableCell, textAlign: "right", fontWeight: r.markup_percent > 0 ? FW.bold : FW.normal, color: r.markup_percent > 0 ? Z.ac : Z.tx }}>
                  {Number(r.markup_percent).toFixed(2)}%
                </td>
                <td style={{ ...tableCell, whiteSpace: "nowrap" }}>
                  <Btn sm v="ghost" onClick={() => setEditing(r)}>Edit</Btn>
                  <span style={{ display: "inline-block", width: 6 }} />
                  <Btn sm v="ghost" onClick={() => remove(r)} style={{ color: Z.da }}>Delete</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? "Edit Industry" : "Add Industry"}
          actions={<>
            <Btn v="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
            <Btn onClick={() => save(editing)} disabled={!editing.name?.trim()}>Save</Btn>
          </>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="Name" value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Personal Injury Law" />
            <Inp label="Markup %" type="number" min="0" max="100" step="0.5"
              value={editing.markup_percent ?? 0}
              onChange={e => setEditing({ ...editing, markup_percent: e.target.value })}
            />
            <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
              Set markup &gt; 0 to apply +X% to advertisers in this industry. They will not also receive the local-zip discount (markup wins).
            </div>
          </div>
        </Modal>
      )}
    </GlassCard>
  );
}

// ── Local Zips ───────────────────────────────────────────────
function ZipsTab({ pubId }) {
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("local_zip_codes").select("*").eq("site_id", pubId).order("zip_code");
    setRows(data || []);
    setLoading(false);
  }, [pubId]);
  useEffect(() => { load(); }, [load]);

  const remove = async (row) => {
    if (!await dialog.confirm(`Remove ${row.zip_code}?`)) return;
    await supabase.from("local_zip_codes").delete().eq("id", row.id);
    load();
  };

  const addBulk = async () => {
    // "12345" or "12345, Optional Label" per line
    const items = bulkText.split("\n").map(line => {
      const [zip, ...labelParts] = line.split(",").map(s => s.trim());
      if (!/^\d{5}$/.test(zip)) return null;
      return { site_id: pubId, zip_code: zip, label: labelParts.join(",").trim() || null };
    }).filter(Boolean);
    if (!items.length) { await dialog.alert("No valid 5-digit zip codes found."); return; }
    // Upsert via insert + ON CONFLICT DO NOTHING semantics
    const { error } = await supabase.from("local_zip_codes").upsert(items, { onConflict: "site_id,zip_code", ignoreDuplicates: true });
    if (error) { await dialog.alert("Add failed: " + error.message); return; }
    setBulk(false);
    setBulkText("");
    load();
  };

  return (
    <GlassCard>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
          Local Zip Codes · {rows.length}
          <span style={{ fontSize: FS.xs, fontWeight: FW.normal, color: Z.tm, marginLeft: 8 }}>
            (Advertisers billing at these zips get 10% off; markup wins if both apply.)
          </span>
        </div>
        <Btn sm onClick={() => setBulk(true)}>+ Bulk Add</Btn>
      </div>
      {loading ? <div style={{ padding: 20, color: Z.tm }}>Loading…</div> :
        rows.length === 0 ? <div style={{ padding: 20, color: Z.td, fontFamily: COND }}>No local zips yet.</div> :
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={tableHeader}>Zip</th>
            <th style={tableHeader}>Label</th>
            <th style={{ ...tableHeader, width: 1 }}></th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ ...tableCell, fontWeight: FW.bold }}>{r.zip_code}</td>
                <td style={{ ...tableCell, color: Z.tm }}>{r.label || "—"}</td>
                <td style={tableCell}><Btn sm v="ghost" onClick={() => remove(r)} style={{ color: Z.da }}>Remove</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      }

      {bulk && (
        <Modal open onClose={() => setBulk(false)} title="Bulk add zip codes"
          actions={<>
            <Btn v="ghost" onClick={() => setBulk(false)}>Cancel</Btn>
            <Btn onClick={addBulk} disabled={!bulkText.trim()}>Add</Btn>
          </>}>
          <div style={{ fontSize: FS.xs, color: Z.tm, marginBottom: 8 }}>
            One zip per line. Optionally add a comma + label (e.g. <code>93446, Paso Robles core</code>). Duplicates are ignored.
          </div>
          <TA value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder={"93446\n93465, Templeton\n93452"} rows={10} />
        </Modal>
      )}
    </GlassCard>
  );
}

// ── Ad Products ──────────────────────────────────────────────
function ProductsTab({ pubId }) {
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: prods }, { data: zs }] = await Promise.all([
      supabase.from("ad_products").select("*").eq("site_id", pubId).order("product_type").order("sort_order").order("name"),
      supabase.from("ad_zones").select("id, slug, name").eq("publication_id", pubId).eq("is_active", true).order("name"),
    ]);
    setRows(prods || []);
    setZones(zs || []);
    setLoading(false);
  }, [pubId]);
  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    const payload = {
      site_id: pubId,
      product_type: form.product_type,
      name: form.name.trim(),
      description: form.description?.trim() || null,
      ad_zone_id: form.product_type === "digital_display" ? (form.ad_zone_id || null) : null,
      duration_days: Math.max(1, Number(form.duration_days) || 7),
      base_price_cents: Math.round(Number(form.base_price) * 100) || 0,
      is_active: !!form.is_active,
      sort_order: Number(form.sort_order) || 0,
      specs: form.specs || {},
    };
    const { error } = editing?.id
      ? await supabase.from("ad_products").update(payload).eq("id", editing.id)
      : await supabase.from("ad_products").insert(payload);
    if (error) { await dialog.alert("Save failed: " + error.message); return; }
    setEditing(null);
    load();
  };

  const remove = async (row) => {
    if (!await dialog.confirm(`Delete "${row.name}"? Bookings referencing it will block deletion.`)) return;
    const { error } = await supabase.from("ad_products").delete().eq("id", row.id);
    if (error) { await dialog.alert("Delete failed: " + error.message); return; }
    load();
  };

  const filtered = typeFilter === "all" ? rows : rows.filter(r => r.product_type === typeFilter);

  return (
    <GlassCard>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
          Ad Products · {filtered.length}{typeFilter !== "all" && ` of ${rows.length}`}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Sel value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            options={[{ value: "all", label: "All Types" }, ...PRODUCT_TYPES]} />
          <Btn sm onClick={() => setEditing({ product_type: "digital_display", duration_days: 7, base_price: 0, is_active: true, sort_order: 0, specs: {} })}>+ Add Product</Btn>
        </div>
      </div>
      {loading ? <div style={{ padding: 20, color: Z.tm }}>Loading…</div> :
        filtered.length === 0 ? <div style={{ padding: 20, color: Z.td, fontFamily: COND }}>No products yet.</div> :
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={tableHeader}>Name</th>
            <th style={tableHeader}>Type</th>
            <th style={tableHeader}>Zone</th>
            <th style={{ ...tableHeader, textAlign: "right" }}>Duration</th>
            <th style={{ ...tableHeader, textAlign: "right" }}>Price</th>
            <th style={tableHeader}>Status</th>
            <th style={{ ...tableHeader, width: 1 }}></th>
          </tr></thead>
          <tbody>
            {filtered.map(r => {
              const zone = zones.find(z => z.id === r.ad_zone_id);
              return (
                <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.55 }}>
                  <td style={tableCell}>
                    <div style={{ fontWeight: FW.bold }}>{r.name}</div>
                    {r.description && <div style={{ color: Z.tm, fontSize: FS.xs, marginTop: 2 }}>{r.description}</div>}
                  </td>
                  <td style={{ ...tableCell, color: Z.tm }}>{PRODUCT_TYPES.find(t => t.value === r.product_type)?.label || r.product_type}</td>
                  <td style={{ ...tableCell, color: Z.tm }}>{zone ? zone.name : "—"}</td>
                  <td style={{ ...tableCell, textAlign: "right", color: Z.tm }}>{r.duration_days}d</td>
                  <td style={{ ...tableCell, textAlign: "right", fontWeight: FW.bold }}>{fmtMoney(r.base_price_cents)}</td>
                  <td style={tableCell}>
                    <span style={{ fontSize: 10, fontWeight: FW.bold, color: r.is_active ? Z.su : Z.tm, textTransform: "uppercase", fontFamily: COND }}>
                      {r.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ ...tableCell, whiteSpace: "nowrap" }}>
                    <Btn sm v="ghost" onClick={() => setEditing({ ...r, base_price: r.base_price_cents / 100 })}>Edit</Btn>
                    <span style={{ display: "inline-block", width: 6 }} />
                    <Btn sm v="ghost" onClick={() => remove(r)} style={{ color: Z.da }}>Delete</Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      }

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? "Edit Ad Product" : "Add Ad Product"} width={600}
          actions={<>
            <Btn v="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
            <Btn onClick={() => save(editing)} disabled={!editing.name?.trim()}>Save</Btn>
          </>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Sel label="Type" value={editing.product_type} onChange={e => setEditing({ ...editing, product_type: e.target.value })} options={PRODUCT_TYPES} />
            {editing.product_type === "digital_display" && (
              <Sel label="Ad Zone" value={editing.ad_zone_id || ""} onChange={e => setEditing({ ...editing, ad_zone_id: e.target.value || null })}
                options={[{ value: "", label: "— None —" }, ...zones.map(z => ({ value: z.id, label: z.name }))]} />
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              <Inp label="Name" value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Sidebar Top — 300×250 — 1 week" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <TA label="Description" rows={3} value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })}
                placeholder="Shown to advertisers in the self-serve catalog." />
            </div>
            <Inp label="Base Price (USD)" type="number" min="0" step="0.01" value={editing.base_price ?? 0}
              onChange={e => setEditing({ ...editing, base_price: e.target.value })} />
            <Inp label="Duration (days)" type="number" min="1" value={editing.duration_days ?? 7}
              onChange={e => setEditing({ ...editing, duration_days: e.target.value })} />
            <Inp label="Sort Order" type="number" value={editing.sort_order ?? 0}
              onChange={e => setEditing({ ...editing, sort_order: e.target.value })} />
            <div style={{ display: "flex", alignItems: "end", paddingBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.sm, color: Z.tx, fontFamily: COND, cursor: "pointer" }}>
                <input type="checkbox" checked={!!editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                Active in self-serve catalog
              </label>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Specs (JSON)</label>
              <textarea
                value={JSON.stringify(editing.specs || {}, null, 2)}
                onChange={e => {
                  try { setEditing({ ...editing, specs: JSON.parse(e.target.value || "{}"), _specsErr: null }); }
                  catch (err) { setEditing({ ...editing, _specsErr: err.message }); }
                }}
                rows={6}
                style={{ width: "100%", background: Z.bg, border: `1px solid ${editing._specsErr ? Z.da : Z.bd}`, borderRadius: 6, padding: 10, color: Z.tx, fontSize: FS.xs, fontFamily: "monospace", outline: "none" }}
              />
              {editing._specsErr && <div style={{ fontSize: 10, color: Z.da, marginTop: 4 }}>{editing._specsErr}</div>}
              <div style={{ fontSize: 10, color: Z.tm, marginTop: 4, fontFamily: COND }}>
                Free-form per product type. Examples: <code>{"{\"width\":300,\"height\":250}"}</code> for digital;
                <code>{" {\"size\":\"quarter_page\",\"color\":true}"}</code> for print.
              </div>
            </div>
          </div>
        </Modal>
      )}
    </GlassCard>
  );
}

// ── Free Email Domains (global, super_admin only) ───────────
function DomainsTab() {
  const dialog = useDialog();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("free_email_domains").select("*").order("domain");
    setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const d = newDomain.trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) { await dialog.alert("Invalid domain."); return; }
    const { error } = await supabase.from("free_email_domains").insert({ domain: d });
    if (error) { await dialog.alert("Add failed (super_admin only): " + error.message); return; }
    setNewDomain("");
    load();
  };

  const remove = async (row) => {
    if (!await dialog.confirm(`Remove "${row.domain}" from the free-email skip list? Future tier-resolution against this domain may fall to 'domain' tier.`)) return;
    const { error } = await supabase.from("free_email_domains").delete().eq("domain", row.domain);
    if (error) { await dialog.alert("Delete failed (super_admin only): " + error.message); return; }
    load();
  };

  return (
    <GlassCard>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
        <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
          Free Email Domains · {rows.length}
          <span style={{ fontSize: FS.xs, fontWeight: FW.normal, color: Z.tm, marginLeft: 8 }}>
            (Global. Super-admin only. Domain-tier email resolution skips these.)
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={newDomain}
          onChange={e => setNewDomain(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") add(); }}
          placeholder="newdomain.com"
          style={{ flex: 1, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: 6, padding: "8px 12px", color: Z.tx, fontSize: FS.sm, outline: "none" }}
        />
        <Btn onClick={add} disabled={!newDomain.trim()}>Add</Btn>
      </div>
      {loading ? <div style={{ padding: 20, color: Z.tm }}>Loading…</div> :
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
          {rows.map(r => (
            <div key={r.domain} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", border: `1px solid ${Z.bd}`, borderRadius: 4, background: Z.bg }}>
              <span style={{ fontSize: FS.sm, color: Z.tx, fontFamily: COND }}>{r.domain}</span>
              <button onClick={() => remove(r)} style={{ background: "none", border: "none", color: Z.da, fontSize: FS.xs, cursor: "pointer", fontFamily: COND, fontWeight: FW.bold }}>×</button>
            </div>
          ))}
        </div>
      }
    </GlassCard>
  );
}
