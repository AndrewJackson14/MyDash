// ContractReviewModal — review screen for an extracted contract.
//
// Worker writes back a JSON shape like:
//   {
//     publication_hint: "OpenDoor Directories",
//     client: { name, phone, email, website, contact_name, contact_phone, contact_email, address },
//     line_items: [{ section, category, ad_size, rate, design }],
//     total_due, paid_amount, check_number,
//     payment_method: "cc" | "check" | "bill" | "paid",
//     notes,
//     pickup_or_camera_ready: "pick_up" | "camera_ready",
//     confidence: 0..1,
//   }
//
// Christie can:
//   - Pick (or override) the matched client (auto-suggested if there's
//     a fuzzy match against existing clients)
//   - Edit any extracted field
//   - Tap "Create proposal" → inserts a sales row + proposal row,
//     marks contract_imports as 'converted'
//   - Tap "Reject" → marks 'failed' with a reason
//
// We keep this MVP minimal: client + line-items + totals are editable,
// the rest stays in extracted_json for the desktop session to refine.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Ic } from "../../components/ui";
import { TOKENS, SURFACE, INK, ACCENT, GOLD, fmtMoneyFull, todayISO } from "./mobileTokens";

export default function ContractReviewModal({ importRow, currentUser, appData, onClose, onConverted }) {
  const clients = appData?.clients || [];
  // useAppData exposes pubs (active) + allPubs (everything incl. dormant).
  // Older code paths in this tree mistakenly read .publications, which is
  // undefined and silently produced an empty dropdown.
  const pubs = appData?.pubs || appData?.allPubs || [];
  const draft = importRow.extracted_json || {};

  const prebound = importRow.client_id ? clients.find(c => c.id === importRow.client_id) : null;
  const [clientName, setClientName] = useState(prebound?.name || draft.client?.name || "");
  const [matchedClientId, setMatchedClientId] = useState(importRow.client_id || null);
  const [pubId, setPubId] = useState(() => {
    const hint = (draft.publication_hint || "").toLowerCase();
    const match = pubs.find(p => p.name.toLowerCase().includes(hint) || hint.includes(p.name.toLowerCase()));
    return match?.id || "";
  });
  const [lineItems, setLineItems] = useState(() => Array.isArray(draft.line_items) ? draft.line_items.map(li => ({
    section: li.section || "",
    category: li.category || "",
    ad_size: li.ad_size || "",
    rate: li.rate || 0,
  })) : []);
  const [totalDue, setTotalDue] = useState(draft.total_due || 0);
  const [paidAmount, setPaidAmount] = useState(draft.paid_amount || 0);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showPhoto, setShowPhoto] = useState(0);  // index of photo currently displayed
  const [photoUrls, setPhotoUrls] = useState([]);

  // Load signed URLs for the photos so Christie can compare draft to reality.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urls = [];
      for (const path of (importRow.storage_paths || [])) {
        const { data } = await supabase.storage.from("contract-imports").createSignedUrl(path, 600);
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
      if (!cancelled) setPhotoUrls(urls);
    })();
    return () => { cancelled = true; };
  }, [importRow.storage_paths]);

  // Suggest a client match when clientName changes (fuzzy substring).
  const clientSuggestions = useMemo(() => {
    if (!clientName.trim() || matchedClientId) return [];
    const q = clientName.toLowerCase().trim();
    return clients.filter(c => (c.name || "").toLowerCase().includes(q)).slice(0, 5);
  }, [clientName, clients, matchedClientId]);

  const updateLine = (i, key, value) => {
    setLineItems(items => items.map((li, idx) => idx === i ? { ...li, [key]: value } : li));
  };
  const addLine = () => setLineItems(items => [...items, { section: "", category: "", ad_size: "", rate: 0 }]);
  const removeLine = (i) => setLineItems(items => items.filter((_, idx) => idx !== i));

  const lineTotal = lineItems.reduce((s, li) => s + (Number(li.rate) || 0), 0);

  const computedTotal = totalDue || lineTotal;
  const canConvert = !!clientName.trim() && lineItems.length > 0 && computedTotal > 0;

  const reject = async () => {
    if (!confirm("Reject this contract? It will be marked failed and removed from the queue.")) return;
    setSubmitting(true);
    try {
      await supabase.from("contract_imports").update({
        status: "failed",
        error_message: reviewNotes.trim() || "rejected by reviewer",
        reviewed_by: currentUser?.id || null,
        reviewed_at: new Date().toISOString(),
      }).eq("id", importRow.id);
      onConverted?.();
      onClose();
    } catch (e) {
      setError(String(e?.message ?? e));
      setSubmitting(false);
    }
  };

  const convert = async () => {
    if (!canConvert || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // 1) Resolve or create the client.
      let clientId = matchedClientId;
      if (!clientId) {
        const { data: newClient, error: cErr } = await supabase
          .from("clients")
          .insert({
            name: clientName.trim(),
            status: "Lead",
            leadSource: "Mobile contract import",
            contacts: [{
              name: draft.client?.contact_name || "",
              email: draft.client?.contact_email || "",
              phone: draft.client?.contact_phone || draft.client?.phone || "",
              role: "Business Owner",
            }],
            notes: `Imported from ${importRow.id}`,
          })
          .select()
          .single();
        if (cErr) throw cErr;
        clientId = newClient.id;
      }

      // 2) Insert a PROPOSAL row (status='Sent' since the paper contract
      // is the signed proposal). The "Mark Signed → Convert to
      // Contract" button on the mobile Proposals tab will fire the
      // existing convert_proposal_to_contract RPC chain when she's
      // ready, which mints the contract + sales orders + ad project +
      // first invoice in one shot.
      const proposalName = `Imported · ${clientName.trim()} · ${todayISO()}`;
      const { data: newProposal, error: pErr } = await supabase
        .from("proposals")
        .insert({
          client_id: clientId,
          name: proposalName,
          status: "Sent",
          total: computedTotal,
          date: todayISO(),
          sent_at: new Date().toISOString(),
          assigned_to: currentUser?.id || null,
          created_by: currentUser?.id || null,
          art_source: draft.line_items?.[0]?.design || null,
          notes: [
            `Imported from paper contract (${importRow.id}).`,
            reviewNotes.trim() ? `Reviewer: ${reviewNotes.trim()}` : null,
            draft.notes ? `Form notes: ${draft.notes}` : null,
            draft.payment_method ? `Payment method: ${draft.payment_method}` : null,
            draft.check_number ? `Check #: ${draft.check_number}` : null,
            paidAmount ? `Paid: $${paidAmount}` : null,
          ].filter(Boolean).join("\n"),
        })
        .select()
        .single();
      if (pErr) throw pErr;

      // 3) Insert proposal_lines from the extracted/edited line items.
      if (lineItems.length > 0) {
        const linesPayload = lineItems.map((li, idx) => ({
          proposal_id: newProposal.id,
          publication_id: pubId || null,
          ad_size: li.ad_size || "—",
          price: Number(li.rate) || 0,
          sort_order: idx,
          notes: [li.section, li.category].filter(Boolean).join(" / ") || null,
        }));
        const { error: lErr } = await supabase.from("proposal_lines").insert(linesPayload);
        if (lErr) throw lErr;
      }

      // 4) Link the import to the proposal + mark converted.
      await supabase.from("contract_imports").update({
        status: "converted",
        client_id: clientId,
        proposal_id: newProposal.id,
        reviewed_by: currentUser?.id || null,
        reviewed_at: new Date().toISOString(),
      }).eq("id", importRow.id);

      // 5) Optimistic local refresh.
      if (typeof appData?.setProposals === "function") {
        appData.setProposals(ps => [...(ps || []), newProposal]);
      }

      onConverted?.({ proposalId: newProposal.id, clientId });
      onClose();
    } catch (e) {
      setError(String(e?.message ?? e));
      setSubmitting(false);
    }
  };

  return <div style={{ position: "fixed", inset: 0, zIndex: 110, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.55)" }}>
    <div onClick={submitting ? undefined : onClose} style={{ flex: 1 }} />
    <div style={{
      background: SURFACE.elevated,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom: "env(safe-area-inset-bottom)",
      maxHeight: "94vh", overflowY: "auto",
      animation: "slideUp 0.2s ease-out",
    }}>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div style={{ width: 40, height: 4, background: TOKENS.rule, borderRadius: 2, margin: "12px auto 4px" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px 4px" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>Review draft</div>
        <button onClick={onClose} disabled={submitting} style={{ background: "transparent", border: "none", cursor: submitting ? "not-allowed" : "pointer", color: TOKENS.muted, fontSize: 14, fontWeight: 600, padding: 4 }}>Close</button>
      </div>

      <div style={{ padding: "8px 18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Photo viewer + thumbnail strip */}
        {photoUrls.length > 0 && <div>
          <div style={{ position: "relative", aspectRatio: "4 / 3", background: SURFACE.alt, borderRadius: 10, overflow: "hidden" }}>
            <img src={photoUrls[showPhoto]} alt={`Photo ${showPhoto + 1}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            {photoUrls.length > 1 && <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, padding: "4px 8px", borderRadius: 999, background: "rgba(0,0,0,0.6)" }}>
              {photoUrls.map((_, i) => <button key={i} onClick={() => setShowPhoto(i)} style={{
                width: 8, height: 8, borderRadius: 4,
                background: i === showPhoto ? "#FFFFFF" : "rgba(255,255,255,0.4)",
                border: "none", cursor: "pointer", padding: 0,
              }} />)}
            </div>}
          </div>
        </div>}

        {/* Confidence pill */}
        {draft.confidence != null && <div style={{
          padding: "8px 12px", borderRadius: 8,
          background: draft.confidence >= 0.7 ? TOKENS.good + "15" : TOKENS.warn + "15",
          color: draft.confidence >= 0.7 ? TOKENS.good : TOKENS.warn,
          fontSize: 12, fontWeight: 600,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>Parser confidence: {(draft.confidence * 100).toFixed(0)}%</span>
          {draft.confidence < 0.7 && <span style={{ fontWeight: 500 }}>Read carefully — handwriting was tricky</span>}
        </div>}

        {/* Client */}
        <Field label="Client">
          <input
            value={clientName}
            onChange={e => { setClientName(e.target.value); setMatchedClientId(null); }}
            style={inputStyle}
            placeholder="Client name"
          />
          {clientSuggestions.length > 0 && <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            {clientSuggestions.map(c => <button key={c.id} onClick={() => { setMatchedClientId(c.id); setClientName(c.name); }} style={{
              padding: "8px 12px", textAlign: "left",
              background: SURFACE.alt, border: `1px solid ${TOKENS.rule}`, borderRadius: 8,
              cursor: "pointer", fontSize: 13, fontWeight: 600, color: ACCENT,
              fontFamily: "inherit",
            }}><Ic.checkAll size={12} color={ACCENT} /> Match to existing: <strong>{c.name}</strong> ({c.status})</button>)}
          </div>}
          {matchedClientId && <div style={{ marginTop: 6, fontSize: 12, color: TOKENS.good, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Ic.check size={12} color={TOKENS.good} /> Matched to existing client</div>}
        </Field>

        {/* Pub */}
        <Field label="Publication">
          <select value={pubId} onChange={e => setPubId(e.target.value)} style={inputStyle}>
            <option value="">— pick a pub —</option>
            {pubs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        {/* Line items */}
        <div>
          <label style={labelStyle}>Line items</label>
          {lineItems.length === 0 && <div style={{ padding: 12, color: TOKENS.muted, fontSize: 13, fontStyle: "italic" }}>No line items extracted — add at least one.</div>}
          {lineItems.map((li, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 28px", gap: 6, marginBottom: 6 }}>
            <input value={li.section} onChange={e => updateLine(i, "section", e.target.value)} placeholder="Section" style={smallInput} />
            <input value={li.category} onChange={e => updateLine(i, "category", e.target.value)} placeholder="Category" style={smallInput} />
            <input value={li.ad_size} onChange={e => updateLine(i, "ad_size", e.target.value)} placeholder="Size" style={smallInput} />
            <input type="number" inputMode="decimal" value={li.rate} onChange={e => updateLine(i, "rate", parseFloat(e.target.value) || 0)} placeholder="Rate" style={smallInput} />
            <button onClick={() => removeLine(i)} aria-label="Remove line" style={{ background: "transparent", border: "none", cursor: "pointer", color: TOKENS.urgent, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Ic.close size={16} color={TOKENS.urgent} /></button>
          </div>)}
          <button onClick={addLine} style={{
            marginTop: 4, padding: "8px 12px", background: "transparent",
            border: `1px dashed ${TOKENS.rule}`, borderRadius: 8,
            cursor: "pointer", fontSize: 13, fontWeight: 600, color: ACCENT,
            width: "100%", fontFamily: "inherit",
          }}>+ Add line item</button>
        </div>

        {/* Totals */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Total due">
            <input type="number" inputMode="decimal" value={totalDue} onChange={e => setTotalDue(parseFloat(e.target.value) || 0)} style={inputStyle} />
            {totalDue !== lineTotal && lineTotal > 0 && <div style={{ fontSize: 11, color: TOKENS.warn, marginTop: 4 }}>
              Lines sum to {fmtMoneyFull(lineTotal)} — totals don't match
            </div>}
          </Field>
          <Field label="Paid">
            <input type="number" inputMode="decimal" value={paidAmount} onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)} style={inputStyle} />
          </Field>
        </div>

        {/* Review notes */}
        <Field label="Review note (optional)">
          <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="Anything you want recorded with this conversion" />
        </Field>

        {error && <div style={{ padding: "10px 12px", background: TOKENS.urgent + "12", borderRadius: 8, color: TOKENS.urgent, fontSize: 13 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={reject} disabled={submitting} style={{
            flex: 1, padding: "14px", minHeight: 52,
            background: "transparent", color: TOKENS.urgent,
            border: `1px solid ${TOKENS.urgent}40`, borderRadius: 10,
            fontSize: 14, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}>Reject</button>
          <button onClick={convert} disabled={!canConvert || submitting} style={{
            flex: 2, padding: "14px", minHeight: 52,
            background: canConvert && !submitting ? ACCENT : TOKENS.rule,
            color: canConvert && !submitting ? "#FFFFFF" : TOKENS.muted,
            border: "none", borderRadius: 10,
            fontSize: 16, fontWeight: 700, cursor: canConvert && !submitting ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}>{submitting ? "Saving…" : `Convert · ${fmtMoneyFull(computedTotal)}`}</button>
        </div>
      </div>
    </div>
  </div>;
}

const labelStyle = { display: "block", fontSize: 12, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 };
function Field({ label, children }) {
  return <div>
    <label style={labelStyle}>{label}</label>
    {children}
  </div>;
}
const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "12px 14px", minHeight: 48,
  fontSize: 16, color: INK,
  background: SURFACE.alt, border: `1px solid ${TOKENS.rule}`,
  borderRadius: 10, outline: "none",
  fontFamily: "inherit",
};
const smallInput = {
  ...inputStyle,
  padding: "8px 10px", minHeight: 38, fontSize: 14,
};
