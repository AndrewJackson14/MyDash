// Drop Locations tab — list of drop points + edit modal. "Import CSV"
// button lands the Phase 3 wizard (stub for now). Existing Circulation.jsx
// functionality preserved verbatim.
import { useState } from "react";
import { Z, COND, FS, FW, R, Ri } from "../../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Modal, SB, GlassCard, GlassStat } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { LOC_TYPES, pnFor } from "./constants";
import DropLocationCSVImport from "./DropLocationCSVImport";

export default function DropLocations({
  pubs,
  dropLocations, setDropLocations,
  dropLocationPubs, setDropLocationPubs,
}) {
  const pn = pnFor(pubs);
  const locs = dropLocations || [];
  const locPubs = dropLocationPubs || [];

  const [sr, setSr] = useState("");
  const [dropPubFilter] = useState([]); // multi-pub filter — kept as state shape for future wiring
  const [locModal, setLocModal] = useState(false);
  const [editLoc, setEditLoc] = useState(null);
  const [csvModal, setCsvModal] = useState(false);

  const blankLoc = { name: "", locationType: "newsstand", address: "", city: "", state: "CA", zip: "", contactName: "", contactPhone: "", notes: "", isActive: true, pubs: {} };
  const [locForm, setLocForm] = useState(blankLoc);

  const openLocModal = (loc) => {
    if (loc) {
      setEditLoc(loc);
      const pubMap = {};
      locPubs.filter(lp => lp.dropLocationId === loc.id).forEach(lp => { pubMap[lp.publicationId] = lp.quantity; });
      setLocForm({ ...loc, pubs: pubMap });
    } else {
      setEditLoc(null);
      setLocForm({ ...blankLoc });
    }
    setLocModal(true);
  };

  const [savingLoc, setSavingLoc] = useState(false);
  const saveLoc = async () => {
    if (!locForm.name || !locForm.address || savingLoc) return;
    setSavingLoc(true);

    // Map UI shape → drop_locations columns. The DB column is `type`,
    // not `location_type` (legacy useAppData has the wrong name; we
    // write to the actual column).
    const payload = {
      name: locForm.name,
      type: locForm.locationType,
      address: locForm.address,
      city: locForm.city || null,
      state: locForm.state || "CA",
      zip: locForm.zip || null,
      contact_name: locForm.contactName || null,
      contact_phone: locForm.contactPhone || null,
      notes: locForm.notes || null,
      is_active: locForm.isActive !== false,
      source: editLoc?.source || "office",
    };

    let savedLoc;
    if (editLoc) {
      const { data, error } = await supabase.from("drop_locations")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editLoc.id).select().single();
      setSavingLoc(false);
      if (error) { console.error("Drop location update failed:", error); return; }
      savedLoc = data;
      setDropLocations(prev => (prev || []).map(l => l.id === data.id ? {
        ...l,
        name: data.name, locationType: data.type, address: data.address,
        city: data.city, state: data.state, zip: data.zip,
        contactName: data.contact_name, contactPhone: data.contact_phone,
        notes: data.notes, isActive: data.is_active, source: data.source,
      } : l));
    } else {
      const { data, error } = await supabase.from("drop_locations")
        .insert(payload).select().single();
      setSavingLoc(false);
      if (error) { console.error("Drop location insert failed:", error); return; }
      savedLoc = data;
      setDropLocations(prev => [...(prev || []), {
        id: data.id, name: data.name, locationType: data.type, address: data.address,
        city: data.city, state: data.state, zip: data.zip,
        contactName: data.contact_name, contactPhone: data.contact_phone,
        notes: data.notes, isActive: data.is_active, source: data.source,
        createdAt: data.created_at,
      }]);
    }

    // Replace the per-pub quantity rows. Delete-and-reinsert is simpler
    // than diffing; drop_location_pubs has no FK dependents.
    await supabase.from("drop_location_pubs").delete().eq("drop_location_id", savedLoc.id);
    const newPubs = Object.entries(locForm.pubs || {})
      .filter(([, q]) => q > 0)
      .map(([pid, qty]) => ({
        drop_location_id: savedLoc.id,
        publication_id: pid,
        quantity: Number(qty) || 0,
      }));
    if (newPubs.length) {
      const { data: insertedPubs } = await supabase.from("drop_location_pubs").insert(newPubs).select();
      if (insertedPubs) setDropLocationPubs(prev => [
        ...(prev || []).filter(lp => lp.dropLocationId !== savedLoc.id),
        ...insertedPubs.map(lp => ({
          id: lp.id, dropLocationId: lp.drop_location_id,
          publicationId: lp.publication_id, quantity: lp.quantity,
        })),
      ]);
    } else {
      setDropLocationPubs(prev => (prev || []).filter(lp => lp.dropLocationId !== savedLoc.id));
    }

    setLocModal(false);
    setEditLoc(null);
  };

  const totalDropCopies = locPubs.reduce((s, lp) => s + (lp.quantity || 0), 0);
  const activeLocCount = locs.filter(l => l.isActive).length;

  return <>
    {/* Action row */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <SB value={sr} onChange={setSr} placeholder="Search locations..." />
      <Btn sm v="secondary" onClick={() => setCsvModal(true)}>Import CSV</Btn>
      <Btn sm onClick={() => openLocModal(null)}><Ic.plus size={13} /> New Location</Btn>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      <GlassStat label="Active Locations" value={activeLocCount} />
      <GlassStat label="Total Drop Copies" value={totalDropCopies.toLocaleString()} />
      <GlassStat label="Cities Covered" value={[...new Set(locs.filter(l => l.isActive).map(l => l.city).filter(Boolean))].length} />
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {locs.filter(l => {
        if (sr) { const q = sr.toLowerCase(); if (!((l.name || "").toLowerCase().includes(q) || l.city?.toLowerCase().includes(q) || l.address?.toLowerCase().includes(q))) return false; }
        if (dropPubFilter.length > 0) { const lpIds = locPubs.filter(lp => lp.dropLocationId === l.id).map(lp => lp.publicationId); if (!dropPubFilter.some(pid => lpIds.includes(pid))) return false; }
        return true;
      }).sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(loc => {
        const lpubs = locPubs.filter(lp => lp.dropLocationId === loc.id);
        const totalQ = lpubs.reduce((s, lp) => s + (lp.quantity || 0), 0);
        return <GlassCard key={loc.id} style={{ padding: 12, opacity: loc.isActive ? 1 : 0.5, cursor: "pointer" }} onClick={() => openLocModal(loc)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 15, fontWeight: FW.heavy, color: Z.tx }}>{loc.name}</div>
                <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", background: Z.sa, borderRadius: Ri }}>{loc.locationType?.replace("_", " ")}</span>
              </div>
              <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>{loc.address}{loc.city ? `, ${loc.city}` : ""}{loc.state ? ` ${loc.state}` : ""} {loc.zip}</div>
              {loc.contactName && <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 2 }}>{loc.contactName}{loc.contactPhone ? ` · ${loc.contactPhone}` : ""}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.su }}>{totalQ}</div>
              <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase" }}>copies</div>
            </div>
          </div>
          {lpubs.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {lpubs.map(lp => <span key={lp.publicationId} style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tx, background: Z.sa, borderRadius: Ri }}>{pn(lp.publicationId)} × {lp.quantity}</span>)}
          </div>}
        </GlassCard>;
      })}
      {locs.length === 0 && <GlassCard><div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.base }}>No drop locations yet. Add your first location above.</div></GlassCard>}
    </div>

    {/* Drop Location edit modal */}
    <Modal open={locModal} onClose={() => setLocModal(false)} title={editLoc ? "Edit Location" : "New Drop Location"} width={560} onSubmit={saveLoc}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <Inp label="Location Name" value={locForm.name} onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))} placeholder="Coffee Bean & Tea Leaf" />
          <Sel label="Type" value={locForm.locationType} onChange={e => setLocForm(f => ({ ...f, locationType: e.target.value }))} options={LOC_TYPES.map(t => ({ value: t, label: t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase()) }))} />
        </div>
        <Inp label="Address" value={locForm.address} onChange={e => setLocForm(f => ({ ...f, address: e.target.value }))} />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
          <Inp label="City" value={locForm.city} onChange={e => setLocForm(f => ({ ...f, city: e.target.value }))} />
          <Inp label="State" value={locForm.state} onChange={e => setLocForm(f => ({ ...f, state: e.target.value }))} />
          <Inp label="Zip" value={locForm.zip} onChange={e => setLocForm(f => ({ ...f, zip: e.target.value }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Contact Name" value={locForm.contactName} onChange={e => setLocForm(f => ({ ...f, contactName: e.target.value }))} />
          <Inp label="Contact Phone" value={locForm.contactPhone} onChange={e => setLocForm(f => ({ ...f, contactPhone: e.target.value }))} />
        </div>

        <div>
          <label style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Copies per Publication</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {pubs.map(p => <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: Ri, background: Z.tm }} />
              <span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx, flex: 1 }}>{p.name}</span>
              <input type="number" min="0" value={locForm.pubs?.[p.id] || ""} onChange={e => setLocForm(f => ({ ...f, pubs: { ...f.pubs, [p.id]: Number(e.target.value) || 0 } }))} placeholder="0" style={{ width: 70, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, color: Z.tx, fontSize: FS.base, textAlign: "right", outline: "none" }} />
            </div>)}
          </div>
        </div>

        <TA label="Notes" value={locForm.notes} onChange={e => setLocForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => { setLocModal(false); setEditLoc(null); }}>Cancel</Btn>
          <Btn onClick={saveLoc} disabled={!locForm.name || !locForm.address || savingLoc}>
            {savingLoc ? "Saving…" : editLoc ? "Save Changes" : "Add Location"}
          </Btn>
        </div>
      </div>
    </Modal>

    {/* CSV import wizard (Phase 3). Re-queries drop_locations +
        drop_location_pubs after a successful import so newly-inserted
        rows appear in the list without a full page reload. */}
    <DropLocationCSVImport
      open={csvModal}
      onClose={() => setCsvModal(false)}
      pubs={pubs}
      dropLocations={locs}
      onImported={async () => {
        const [locRes, pubRes] = await Promise.all([
          supabase.from("drop_locations").select("*").order("name").limit(2000),
          supabase.from("drop_location_pubs").select("*").limit(5000),
        ]);
        if (locRes.data) setDropLocations(locRes.data.map(d => ({
          id: d.id, name: d.name, locationType: d.type, address: d.address,
          city: d.city, state: d.state, zip: d.zip,
          contactName: d.contact_name, contactPhone: d.contact_phone,
          notes: d.notes, isActive: d.is_active, createdAt: d.created_at,
          lat: d.lat, lng: d.lng, geocodeStatus: d.geocode_status,
          source: d.source, accessNotes: d.access_notes,
          preferredDeliveryWindow: d.preferred_delivery_window,
        })));
        if (pubRes.data) setDropLocationPubs(pubRes.data.map(lp => ({
          id: lp.id, dropLocationId: lp.drop_location_id,
          publicationId: lp.publication_id, quantity: lp.quantity,
        })));
      }}
    />
  </>;
}
