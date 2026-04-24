// ============================================================
// DeliveryPanel — three-mode finisher for a locked affidavit.
//
// Modes:
//   email — Gmail send with the affidavit PDF attached
//   mail  — opens a print-ready PDF (window-envelope cover + affidavit)
//   both  — email then mail; Mark Delivered fires after the second
//
// Mark Delivered:
//   - status → 'delivered', affidavit_status → 'delivered'
//   - delivery_method / delivered_at / delivered_to_* stamped
//   - intake invoice's `notes` column gets a one-line append
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Z, FS, FW, Ri, COND } from "../../lib/theme";
import { Btn, Modal, Inp } from "../ui";
import { supabase } from "../../lib/supabase";
import { sendGmailEmail } from "../../lib/gmail";
import { buildMailablePdf } from "../../lib/affidavitPdf";
import { getAffidavitConfig } from "../../lib/legalFormats";

export default function DeliveryPanel({ open, onClose, notice, publication, client, currentUser, onDelivered }) {
  const [mode, setMode] = useState("email");
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [recipient, setRecipient] = useState({ name: "", line1: "", line2: "", city: "", state: "", zip: "" });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  const [mailPrinted, setMailPrinted] = useState(false);

  // Pre-fill on open. Email + address come from the client row; reset
  // the "did I send/mail it" flags so a re-open of an already-delivered
  // notice doesn't auto-skip steps.
  useEffect(() => {
    if (!open || !notice) return;
    setError(null);
    setEmailSent(false);
    setMailPrinted(false);
    const billingEmail = client?.billingEmail || client?.billing_email || "";
    setEmailTo(billingEmail || "");
    const ccs = (client?.billingCcEmails || client?.billing_cc_emails || []).filter(Boolean).slice(0, 2);
    setEmailCc(ccs.join(", "));
    setEmailSubject(`Affidavit of Publication — ${notice.notice_number || ""}`.trim());
    setEmailBody(defaultBodyHtml(notice, publication));
    setRecipient({
      name: client?.name || "",
      line1: client?.billingAddress || client?.billing_address || client?.address || "",
      line2: client?.billingAddress2 || client?.billing_address2 || "",
      city:  client?.billingCity || client?.billing_city || client?.city || "",
      state: client?.billingState || client?.billing_state || client?.state || "",
      zip:   client?.billingZip || client?.billing_zip || client?.zip || "",
    });
  }, [open, notice?.id, client?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendEmail = async () => {
    if (!notice?.affidavit_pdf_url) {
      setError("Affidavit PDF is not locked yet.");
      return;
    }
    setBusy("email");
    setError(null);
    try {
      // Pull the PDF, base64-encode for Gmail multipart attachment.
      const pdfRes = await fetch(notice.affidavit_pdf_url);
      if (!pdfRes.ok) throw new Error("PDF fetch failed");
      const pdfBuf = await pdfRes.arrayBuffer();
      const b64 = arrayBufferToBase64(pdfBuf);
      const ccArr = (emailCc || "").split(",").map(s => s.trim()).filter(Boolean);
      const result = await sendGmailEmail({
        teamMemberId: currentUser?.id || null,
        to: [emailTo],
        cc: ccArr,
        subject: emailSubject,
        htmlBody: emailBody,
        mode: "send",
        emailType: "legal_affidavit",
        clientId: notice.client_id || client?.id || null,
        refId: notice.id,
        refType: "legal_notice",
        attachments: [{
          filename: `${(notice.notice_number || notice.id).replace(/\s+/g, "-")}-affidavit.pdf`,
          mimeType: "application/pdf",
          base64: b64,
        }],
      });
      if (!result.success) throw new Error(result.error || "Gmail send failed");
      setEmailSent(true);
      if (mode === "email") await markDelivered({ via: "email" });
    } catch (e) { setError(String(e?.message || e)); }
    finally { setBusy(null); }
  };

  const printMail = async () => {
    setBusy("mail");
    setError(null);
    try {
      const pdfBytes = await buildMailablePdf({
        affidavitPdfUrl: notice.affidavit_pdf_url,
        recipient,
      });
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMailPrinted(true);
    } catch (e) { setError(String(e?.message || e)); }
    finally { setBusy(null); }
  };

  const markMailed = async () => {
    if (mode === "both") await markDelivered({ via: "both" });
    else await markDelivered({ via: "mail" });
  };

  const markDelivered = async ({ via }) => {
    if (!notice?.id) return;
    setBusy("delivering");
    setError(null);
    try {
      const now = new Date().toISOString();
      const note = buildInvoiceNote(via, now, emailTo, recipient);
      await supabase.from("legal_notices").update({
        status: "delivered",
        affidavit_status: "delivered",
        delivery_method: via,
        delivered_at: now,
        delivered_to_email: via === "email" || via === "both" ? emailTo : null,
        delivered_to_address_json: via === "mail" || via === "both" ? recipient : null,
        delivered_note: note,
      }).eq("id", notice.id);

      // Append to the original intake invoice's notes column. Looked up
      // via invoice_lines.legal_notice_id which was stamped on intake.
      const { data: lines } = await supabase
        .from("invoice_lines").select("invoice_id")
        .eq("legal_notice_id", notice.id).limit(1);
      if (lines?.[0]?.invoice_id) {
        const { data: inv } = await supabase
          .from("invoices").select("notes").eq("id", lines[0].invoice_id).single();
        const updated = [inv?.notes, note].filter(Boolean).join(" · ");
        await supabase.from("invoices").update({ notes: updated }).eq("id", lines[0].invoice_id);
      }

      onDelivered?.({ via, at: now });
      onClose?.();
    } catch (e) { setError(String(e?.message || e)); }
    finally { setBusy(null); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Deliver Affidavit" width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 580 }}>
        {/* Mode chips */}
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { k: "email", l: "Email" },
            { k: "mail",  l: "Mail" },
            { k: "both",  l: "Email + Mail" },
          ].map(opt => (
            <button key={opt.k} onClick={() => setMode(opt.k)} style={{
              flex: 1, padding: "8px 12px", borderRadius: Ri,
              border: `1px solid ${mode === opt.k ? Z.ac : Z.bd}`,
              background: mode === opt.k ? Z.ac + "15" : "transparent",
              color: mode === opt.k ? Z.ac : Z.tx,
              fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: COND,
            }}>{opt.l}</button>
          ))}
        </div>

        {error && <div style={{ padding: "6px 10px", background: "rgba(232,72,85,0.1)", color: Z.da, borderRadius: Ri, fontSize: 12 }}>{error}</div>}

        {/* Email panel */}
        {(mode === "email" || mode === "both") && !emailSent && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Inp label="To" value={emailTo} onChange={setEmailTo} />
            <Inp label="CC (comma-separated)" value={emailCc} onChange={setEmailCc} />
            <Inp label="Subject" value={emailSubject} onChange={setEmailSubject} />
            <div>
              <div style={{ fontSize: 10, color: Z.tm, marginBottom: 4, textTransform: "uppercase", fontFamily: COND, fontWeight: 700 }}>Body (HTML)</div>
              <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={6} style={{ width: "100%", padding: "8px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: 12, fontFamily: "monospace", boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>
              The affidavit PDF will be attached automatically.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn sm v="cancel" onClick={onClose}>Close</Btn>
              <Btn sm onClick={sendEmail} disabled={!emailTo || busy != null}>
                {busy === "email" ? "Sending…" : mode === "both" ? "Send email →" : "Send & deliver"}
              </Btn>
            </div>
          </div>
        )}

        {/* Mail panel */}
        {(mode === "mail" || (mode === "both" && emailSent)) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {emailSent && mode === "both" && (
              <div style={{ fontSize: 11, color: Z.su, padding: "4px 8px", background: Z.su + "15", borderRadius: Ri }}>
                ✓ Email sent. Now print + mail.
              </div>
            )}
            <Inp label="Recipient name" value={recipient.name} onChange={(v) => setRecipient(r => ({ ...r, name: v }))} />
            <Inp label="Address line 1" value={recipient.line1} onChange={(v) => setRecipient(r => ({ ...r, line1: v }))} />
            <Inp label="Address line 2" value={recipient.line2} onChange={(v) => setRecipient(r => ({ ...r, line2: v }))} />
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6 }}>
              <Inp label="City" value={recipient.city} onChange={(v) => setRecipient(r => ({ ...r, city: v }))} />
              <Inp label="State" value={recipient.state} onChange={(v) => setRecipient(r => ({ ...r, state: v }))} />
              <Inp label="ZIP" value={recipient.zip} onChange={(v) => setRecipient(r => ({ ...r, zip: v }))} />
            </div>
            <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>
              Address sits in the lower third of page 1 to show through a #10 window envelope when folded into thirds.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn sm v="cancel" onClick={onClose}>Close</Btn>
              {!mailPrinted
                ? <Btn sm onClick={printMail} disabled={busy != null}>{busy === "mail" ? "Building PDF…" : "Open print PDF"}</Btn>
                : <Btn sm onClick={markMailed} disabled={busy != null}>{busy === "delivering" ? "Marking…" : "Mark mailed & deliver"}</Btn>
              }
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function defaultBodyHtml(notice, publication) {
  return `<p>Hello,</p>
<p>Attached is the Affidavit of Publication for <strong>${escapeHtml(notice?.title || "your legal notice")}</strong> in <strong>${escapeHtml(publication?.name || "")}</strong>.</p>
<p>Please retain this for your records. Reach out if you need anything further.</p>
<p>—<br/>${escapeHtml(publication?.name || "13 Stars Media Group")}</p>`;
}

function buildInvoiceNote(via, atIso, email, addr) {
  const date = new Date(atIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const addrLine = [addr?.line1, addr?.line2, [addr?.city, addr?.state].filter(Boolean).join(", "), addr?.zip].filter(Boolean).join(", ");
  if (via === "email") return `Affidavit delivered via email on ${date} to ${email || "(unset)"}`;
  if (via === "mail")  return `Affidavit delivered via mail on ${date} to ${addrLine || "(unset)"}`;
  return `Affidavit delivered via email + mail on ${date} (email: ${email || "(unset)"}; mail: ${addrLine || "(unset)"})`;
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  // Chunk to avoid stack overflow on large PDFs.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
