// ============================================================
// SendToPressModal — Anthony Phase 5. Two-step modal that wires the
// final-issue PDF handoff: pick printer + drop PDF, confirm
// recipients + press notes, fire the send-to-press edge function.
// ============================================================
import { useState, useEffect } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri } from "../lib/theme";
import { Btn, TA, Sel, Inp, Modal } from "../components/ui";
import { supabase, EDGE_FN_URL } from "../lib/supabase";

export default function SendToPressModal({ issue, pub, currentUser, onClose, onSent }) {
  const [printers, setPrinters] = useState([]);
  const [pubAssignments, setPubAssignments] = useState([]);
  const [printerId, setPrinterId] = useState("");
  const [file, setFile] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [pressNotes, setPressNotes] = useState("");
  const [recipientOverride, setRecipientOverride] = useState("");
  const [ccExtra, setCcExtra] = useState("");
  const [step, setStep] = useState(1); // 1 = pick printer + file, 2 = confirm, 3 = sending
  const [error, setError] = useState(null);

  // Load printers + per-pub assignments. Auto-select the default
  // printer for this issue's pub if one exists.
  useEffect(() => {
    (async () => {
      const [prRes, ppRes] = await Promise.all([
        supabase.from("printers").select("*").eq("is_active", true).order("name"),
        supabase.from("printer_publications").select("*").eq("publication_id", issue.pubId),
      ]);
      const list = prRes.data || [];
      setPrinters(list);
      setPubAssignments(ppRes.data || []);
      // Pick default for this pub, else first printer
      const def = (ppRes.data || []).find(a => a.is_default);
      const defaultId = def?.printer_id
        || (ppRes.data || [])[0]?.printer_id
        || list[0]?.id
        || "";
      setPrinterId(defaultId);
    })();
  }, [issue.pubId]);

  const printer = printers.find(p => p.id === printerId);
  const pubAssign = pubAssignments.find(a => a.printer_id === printerId);
  const costPerCopy = pubAssign?.cost_per_copy ?? printer?.cost_per_copy;

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      setError("PDF only");
      return;
    }
    if (f.size > 250 * 1024 * 1024) {
      setError("File too large (250 MB max)");
      return;
    }
    setError(null);
    setFile(f);
  };

  const send = async () => {
    if (!file || !printer || step === 3) return;
    setStep(3);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("not signed in");
      const form = new FormData();
      form.append("issue_id", issue.id);
      form.append("printer_id", printerId);
      form.append("file", file);
      if (quantity) form.append("quantity", quantity);
      if (pressNotes.trim()) form.append("press_notes", pressNotes.trim());
      if (recipientOverride.trim()) form.append("recipient_override", recipientOverride.trim());
      if (ccExtra.trim()) form.append("cc_extra", ccExtra.trim());
      const res = await fetch(`${EDGE_FN_URL}/send-to-press`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || `send failed: ${res.status}`);
      onSent?.(out);
    } catch (err) {
      console.error("Send to press failed:", err);
      setError(err.message || "send failed");
      setStep(2);
    }
  };

  const recipient = recipientOverride.trim() || printer?.contact_email || "";
  const configCc = printer?.delivery_config?.cc_emails || [];
  const ccExtraList = ccExtra.split(",").map(s => s.trim()).filter(Boolean);
  const ccPreview = [...new Set([...configCc, ...ccExtraList])];

  return (
    <Modal open={true} onClose={() => step !== 3 && onClose()} title={`Send to Press — ${pub?.name || ""} ${issue.label || ""}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 4, minWidth: 480 }}>
        {step === 1 && (
          <>
            <Sel
              label="Printer"
              value={printerId}
              onChange={e => setPrinterId(e.target.value)}
              options={printers.length === 0
                ? [{ value: "", label: "No active printers — add one in Printers" }]
                : printers.map(p => ({ value: p.id, label: `${p.name}${pubAssignments.some(a => a.printer_id === p.id && a.is_default) ? " ★" : ""}` }))
              }
            />
            {printer && (
              <div style={{ padding: "10px 12px", background: Z.bg, borderRadius: Ri, fontSize: FS.xs, color: Z.tm, fontFamily: COND, lineHeight: 1.6 }}>
                {printer.contact_name && <div>👤 {printer.contact_name}</div>}
                {printer.contact_email && <div>📧 {printer.contact_email}</div>}
                <div>📨 Delivery: {printer.delivery_method || "email"}</div>
                {costPerCopy != null && <div>💰 ${Number(costPerCopy).toFixed(4)} / copy</div>}
                {printer.sla_hours != null && <div>⏱ SLA: {printer.sla_hours}h</div>}
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND, marginBottom: 6 }}>Final PDF *</div>
              <div style={{
                padding: 16, background: Z.bg, borderRadius: Ri,
                border: `2px dashed ${file ? Z.go : Z.bd}`,
                textAlign: "center",
              }}>
                {file ? (
                  <div>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>📄 {file.name}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 2 }}>{(file.size / 1048576).toFixed(1)} MB</div>
                    <Btn sm v="ghost" onClick={() => setFile(null)} style={{ marginTop: 6 }}>Remove</Btn>
                  </div>
                ) : (
                  <label style={{ cursor: "pointer", display: "block" }}>
                    <input type="file" accept="application/pdf,.pdf" onChange={handleFile} style={{ display: "none" }} />
                    <div style={{ fontSize: FS.sm, color: Z.tm }}>Drop PDF or click to browse (max 250 MB)</div>
                  </label>
                )}
              </div>
            </div>
            <Inp label="Quantity (optional)" type="number" value={quantity} onChange={setQuantity} placeholder="2500" />
            {error && <div style={{ fontSize: FS.xs, color: Z.da }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
              <Btn sm v="secondary" onClick={onClose}>Cancel</Btn>
              <Btn sm onClick={() => setStep(2)} disabled={!file || !printerId}>Continue →</Btn>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ padding: "10px 12px", background: Z.bg, borderRadius: Ri, fontSize: FS.xs, color: Z.tm, fontFamily: COND, lineHeight: 1.6 }}>
              <div><strong style={{ color: Z.tx }}>Issue:</strong> {pub?.name} — {issue.label || issue.date}</div>
              <div><strong style={{ color: Z.tx }}>File:</strong> {file?.name} · {(file?.size / 1048576).toFixed(1)} MB</div>
              <div><strong style={{ color: Z.tx }}>Printer:</strong> {printer?.name}</div>
              {quantity && <div><strong style={{ color: Z.tx }}>Quantity:</strong> {quantity}</div>}
            </div>
            <Inp label="Recipient email" value={recipientOverride} onChange={setRecipientOverride} placeholder={printer?.contact_email || "no default email on file"} />
            <Inp label="CC (comma-separated, in addition to printer config)" value={ccExtra} onChange={setCcExtra} placeholder="hayley@13stars.media" />
            {ccPreview.length > 0 && (
              <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>
                Will CC: {ccPreview.join(", ")}
              </div>
            )}
            <TA
              label="Press notes (optional — included in email + saved on the run)"
              value={pressNotes}
              onChange={setPressNotes}
              rows={4}
              placeholder="2,500 copies. Same paper stock as last week. Bundle for hometown delivery."
            />
            {!recipient && <div style={{ fontSize: FS.xs, color: Z.da }}>⚠️ No recipient email — set one above or on the printer.</div>}
            {error && <div style={{ fontSize: FS.xs, color: Z.da }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
              <Btn sm v="secondary" onClick={() => setStep(1)}>← Back</Btn>
              <Btn sm onClick={send} disabled={!recipient}>Send to Press →</Btn>
            </div>
          </>
        )}

        {step === 3 && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📤</div>
            <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx, fontFamily: DISPLAY, marginBottom: 6 }}>Sending to press…</div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>Uploading PDF and emailing the printer.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
