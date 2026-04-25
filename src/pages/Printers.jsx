// ============================================================
// Printers — Anthony Phase 5. Directory of print vendors with
// per-printer delivery method (email / sftp / portal / manual),
// per-publication assignments, cost-per-copy, SLA. Publisher-only
// CRUD; everyone else reads.
//
// SFTP delivery isn't wired yet (Phase 5b). The dropdown surfaces
// it but the send-to-press function falls back to email-only when
// it sees a non-email method. delivery_config holds method-specific
// payloads (e.g. cc_emails for email, host/path/username for SFTP).
// ============================================================
import { useState, useEffect } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri } from "../lib/theme";
import { Btn, Inp, TA, Sel, Modal, glass as glassStyle, PageHeader } from "../components/ui";
import { supabase, isOnline } from "../lib/supabase";

const DELIVERY_METHODS = [
  { value: "email", label: "Email" },
  { value: "sftp", label: "SFTP (not yet wired)" },
  { value: "portal", label: "Portal upload (manual)" },
  { value: "manual", label: "Manual (no auto-send)" },
];

export default function Printers({ isActive, currentUser, pubs }) {
  const [printers, setPrinters] = useState([]);
  const [pubAssignments, setPubAssignments] = useState([]); // printer_publications rows
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | row | { _new: true }
  const [saving, setSaving] = useState(false);

  const isPublisherOrProd = ["Publisher", "Production Manager"].includes(currentUser?.role || "");

  useEffect(() => {
    if (!isActive || !isOnline()) return;
    (async () => {
      setLoading(true);
      const [prRes, ppRes] = await Promise.all([
        supabase.from("printers").select("*").order("name"),
        supabase.from("printer_publications").select("*"),
      ]);
      setPrinters(prRes.data || []);
      setPubAssignments(ppRes.data || []);
      setLoading(false);
    })();
  }, [isActive]);

  const openNew = () => setEditing({
    _new: true,
    name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    delivery_method: "email",
    delivery_config: { cc_emails: [] },
    cost_per_copy: null,
    sla_hours: 24,
    notes: "",
    is_active: true,
    pubAssignments: [], // [{ pub_id, is_default, cost_per_copy }]
  });

  const openEdit = (p) => {
    const myAssignments = pubAssignments.filter(a => a.printer_id === p.id);
    setEditing({
      ...p,
      delivery_config: p.delivery_config || { cc_emails: [] },
      pubAssignments: myAssignments.map(a => ({
        pub_id: a.publication_id,
        is_default: !!a.is_default,
        cost_per_copy: a.cost_per_copy,
      })),
    });
  };

  const togglePubAssignment = (pubId) => {
    setEditing(e => {
      const has = e.pubAssignments.some(a => a.pub_id === pubId);
      return {
        ...e,
        pubAssignments: has
          ? e.pubAssignments.filter(a => a.pub_id !== pubId)
          : [...e.pubAssignments, { pub_id: pubId, is_default: false, cost_per_copy: null }],
      };
    });
  };

  const updatePubAssignment = (pubId, key, value) => {
    setEditing(e => ({
      ...e,
      pubAssignments: e.pubAssignments.map(a => a.pub_id === pubId ? { ...a, [key]: value } : a),
    }));
  };

  const save = async () => {
    if (saving) return;
    if (!editing.name?.trim()) return;
    setSaving(true);
    try {
      let printerId = editing.id;
      const row = {
        name: editing.name.trim(),
        contact_name: editing.contact_name?.trim() || null,
        contact_email: editing.contact_email?.trim() || null,
        contact_phone: editing.contact_phone?.trim() || null,
        delivery_method: editing.delivery_method || "email",
        delivery_config: editing.delivery_config || {},
        cost_per_copy: editing.cost_per_copy != null && editing.cost_per_copy !== "" ? Number(editing.cost_per_copy) : null,
        sla_hours: editing.sla_hours != null && editing.sla_hours !== "" ? Number(editing.sla_hours) : null,
        notes: editing.notes?.trim() || null,
        is_active: editing.is_active !== false,
      };
      if (editing._new) {
        const { data, error } = await supabase.from("printers").insert(row).select().single();
        if (error) throw error;
        printerId = data.id;
        setPrinters(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
      } else {
        const { data, error } = await supabase.from("printers").update(row).eq("id", printerId).select().single();
        if (error) throw error;
        setPrinters(prev => prev.map(p => p.id === printerId ? data : p));
      }

      // Reconcile pub assignments — delete the diff, then upsert the rest
      const existing = pubAssignments.filter(a => a.printer_id === printerId);
      const desired = editing.pubAssignments;
      const toDelete = existing.filter(e => !desired.some(d => d.pub_id === e.publication_id));
      for (const a of toDelete) {
        await supabase.from("printer_publications").delete().eq("id", a.id);
      }
      const upsertRows = desired.map(d => ({
        printer_id: printerId,
        publication_id: d.pub_id,
        is_default: !!d.is_default,
        cost_per_copy: d.cost_per_copy != null && d.cost_per_copy !== "" ? Number(d.cost_per_copy) : null,
      }));
      if (upsertRows.length > 0) {
        const { data } = await supabase.from("printer_publications")
          .upsert(upsertRows, { onConflict: "printer_id,publication_id" })
          .select();
        setPubAssignments(prev => {
          const others = prev.filter(a => a.printer_id !== printerId);
          return [...others, ...(data || [])];
        });
      } else {
        setPubAssignments(prev => prev.filter(a => a.printer_id !== printerId));
      }

      setEditing(null);
    } catch (err) {
      console.error("Printer save failed:", err);
      alert("Save failed: " + (err.message || "unknown error"));
    }
    setSaving(false);
  };

  const remove = async (p) => {
    if (!confirm(`Remove "${p.name}"? Existing print runs stay; new runs can no longer pick this printer.`)) return;
    try {
      // Soft-delete by setting is_active=false rather than hard DELETE,
      // so historical print_runs with this printer_id keep resolving.
      await supabase.from("printers").update({ is_active: false }).eq("id", p.id);
      setPrinters(prev => prev.map(x => x.id === p.id ? { ...x, is_active: false } : x));
    } catch (err) {
      console.error("Printer remove failed:", err);
    }
  };

  if (!isActive) return null;

  const glass = { ...glassStyle(), borderRadius: R, padding: "20px 24px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      <PageHeader title="Printers" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: FS.sm, color: Z.tm }}>
          {printers.filter(p => p.is_active).length} active · {printers.length} total
        </div>
        {isPublisherOrProd && <Btn sm onClick={openNew}>+ Add Printer</Btn>}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Loading…</div>
      ) : printers.length === 0 ? (
        <div style={glass}>
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx, marginBottom: 8 }}>No printers yet</div>
            <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 16 }}>
              Add your first print vendor so the Send-to-Press flow has a target.
            </div>
            {isPublisherOrProd && <Btn onClick={openNew}>+ Add Printer</Btn>}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 12 }}>
          {printers.map(p => {
            const myPubs = pubAssignments.filter(a => a.printer_id === p.id);
            return (
              <div key={p.id} style={{
                ...glass,
                padding: "16px 18px",
                opacity: p.is_active === false ? 0.5 : 1,
                borderLeft: `3px solid ${p.is_active === false ? Z.tm : Z.go}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div title={p.name} style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                    {p.contact_name && <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{p.contact_name}</div>}
                  </div>
                  <span style={{ fontSize: 9, fontWeight: FW.heavy, color: Z.td, padding: "2px 8px", background: Z.bg, borderRadius: 999, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    {p.delivery_method || "email"}
                  </span>
                </div>
                <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, lineHeight: 1.6, marginBottom: 8 }}>
                  {p.contact_email && <div>📧 {p.contact_email}</div>}
                  {p.contact_phone && <div>📞 {p.contact_phone}</div>}
                  {p.cost_per_copy != null && <div>${Number(p.cost_per_copy).toFixed(4)} / copy</div>}
                  {p.sla_hours != null && <div>SLA: {p.sla_hours}h</div>}
                </div>
                {myPubs.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    {myPubs.map(a => {
                      const pub = (pubs || []).find(x => x.id === a.publication_id);
                      return (
                        <span key={a.publication_id} style={{ fontSize: 10, color: a.is_default ? Z.go : Z.tm, padding: "2px 6px", background: a.is_default ? Z.go + "12" : Z.bg, borderRadius: Ri, fontFamily: COND, fontWeight: a.is_default ? FW.bold : FW.semi }}>
                          {pub?.name || a.publication_id}{a.is_default ? " ★" : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
                {isPublisherOrProd && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <Btn sm v="secondary" onClick={() => openEdit(p)}>Edit</Btn>
                    {p.is_active !== false && <Btn sm v="ghost" onClick={() => remove(p)} style={{ color: Z.da }}>Deactivate</Btn>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <Modal open={true} onClose={() => !saving && setEditing(null)} title={editing._new ? "Add Printer" : "Edit Printer"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 4 }}>
            <Inp label="Name *" value={editing.name || ""} onChange={v => setEditing(e => ({ ...e, name: v }))} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Inp label="Contact name" value={editing.contact_name || ""} onChange={v => setEditing(e => ({ ...e, contact_name: v }))} />
              <Inp label="Contact phone" value={editing.contact_phone || ""} onChange={v => setEditing(e => ({ ...e, contact_phone: v }))} />
            </div>
            <Inp label="Contact email" value={editing.contact_email || ""} onChange={v => setEditing(e => ({ ...e, contact_email: v }))} />
            <Sel
              label="Delivery method"
              value={editing.delivery_method}
              onChange={e => setEditing(p => ({ ...p, delivery_method: e.target.value }))}
              options={DELIVERY_METHODS.map(m => ({ value: m.value, label: m.label }))}
            />
            {editing.delivery_method === "email" && (
              <Inp
                label="CC emails (comma-separated)"
                value={(editing.delivery_config?.cc_emails || []).join(", ")}
                onChange={v => setEditing(e => ({
                  ...e,
                  delivery_config: { ...e.delivery_config, cc_emails: v.split(",").map(s => s.trim()).filter(Boolean) },
                }))}
              />
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Inp label="Cost / copy ($)" type="number" value={editing.cost_per_copy ?? ""} onChange={v => setEditing(e => ({ ...e, cost_per_copy: v }))} />
              <Inp label="SLA (hours)" type="number" value={editing.sla_hours ?? ""} onChange={v => setEditing(e => ({ ...e, sla_hours: v }))} />
            </div>
            <TA label="Notes" value={editing.notes || ""} onChange={v => setEditing(e => ({ ...e, notes: v }))} rows={2} />

            {/* Per-pub assignment */}
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND, marginBottom: 6 }}>Publications</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto", padding: "4px 6px", background: Z.bg, borderRadius: Ri }}>
                {(pubs || []).filter(p => p.isActive !== false).map(pub => {
                  const a = editing.pubAssignments.find(x => x.pub_id === pub.id);
                  const checked = !!a;
                  return (
                    <div key={pub.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: 4 }}>
                      <input type="checkbox" checked={checked} onChange={() => togglePubAssignment(pub.id)} />
                      <span style={{ flex: 1, fontSize: FS.sm, color: Z.tx, fontFamily: COND }}>{pub.name}</span>
                      {checked && (
                        <>
                          <label style={{ fontSize: 10, color: Z.tm, fontFamily: COND, display: "flex", alignItems: "center", gap: 4 }}>
                            <input type="checkbox" checked={a.is_default} onChange={e => updatePubAssignment(pub.id, "is_default", e.target.checked)} />
                            default
                          </label>
                          <input
                            type="number"
                            placeholder="$/copy"
                            value={a.cost_per_copy ?? ""}
                            onChange={e => updatePubAssignment(pub.id, "cost_per_copy", e.target.value)}
                            style={{ width: 70, padding: "2px 6px", fontSize: 11, borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontFamily: COND }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
                {(pubs || []).length === 0 && <div style={{ padding: 8, color: Z.td, fontSize: FS.xs, fontFamily: COND }}>No publications yet</div>}
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: FS.sm, color: Z.tx, marginTop: 4 }}>
              <input type="checkbox" checked={editing.is_active !== false} onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))} />
              Active
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
              <Btn sm v="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Btn>
              <Btn sm onClick={save} disabled={saving || !editing.name?.trim()}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
