// ============================================================
// affidavitPdf — turn each rendered AffidavitTemplate page into a
// PNG via html2canvas, then assemble a US-Letter PDF via pdf-lib
// and upload to BunnyCDN. Lazy-imports the heavy bits so the module
// only ships when the user clicks Lock Affidavit.
// ============================================================
import { supabase } from "./supabase";
import { legalAffidavitPdfPath } from "./legalFormats";

const UPLOAD_FN = "/functions/v1/upload-image";

// pageEls: array of HTMLElements, one per affidavit page (root of
// each AffidavitTemplate page wrapper). Returns a Uint8Array PDF.
export async function rasterizePagesToPdf(pageEls, { onProgress } = {}) {
  if (!pageEls?.length) throw new Error("No pages to rasterize");
  const [{ default: html2canvas }, { PDFDocument }] = await Promise.all([
    import("html2canvas"),
    import("pdf-lib"),
  ]);
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < pageEls.length; i++) {
    onProgress?.({ stage: "rendering", page: i + 1, total: pageEls.length });
    const canvas = await html2canvas(pageEls[i], {
      scale: 3,         // 3x for print quality
      useCORS: true,    // signature + clips live on cdn.13stars.media
      backgroundColor: "#ffffff",
      logging: false,
    });
    const dataUrl = canvas.toDataURL("image/png");
    const pngBytes = await (await fetch(dataUrl)).arrayBuffer();
    const pngImage = await pdfDoc.embedPng(pngBytes);
    // 8.5 × 11 inches in PDF points (1 in = 72 pt).
    const pdfPage = pdfDoc.addPage([612, 792]);
    pdfPage.drawImage(pngImage, { x: 0, y: 0, width: 612, height: 792 });
  }
  onProgress?.({ stage: "saving" });
  return await pdfDoc.save();
}

export async function uploadAffidavitPdf(noticeId, noticeNumber, pdfBytes) {
  const fullPath = legalAffidavitPdfPath(noticeId, noticeNumber);
  const lastSlash = fullPath.lastIndexOf("/");
  const folder = fullPath.slice(0, lastSlash);
  const file = fullPath.slice(lastSlash + 1);
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token || "";
  const apiKey = supabase.supabaseKey || "";
  const url = `${supabase.supabaseUrl}${UPLOAD_FN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(apiKey ? { apikey: apiKey } : {}),
      "x-upload-path": folder,
      "x-file-name": file,
      "x-content-type": "application/pdf",
    },
    body: pdfBytes,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error || `affidavit upload ${res.status}`);
  return out.url;
}

// Build a single mailable PDF: page 1 = window-envelope address block
// for #10 envelope (fold to thirds), pages 2+ = the affidavit pages.
// Used by DeliveryPanel mail mode.
export async function buildMailablePdf({ affidavitPdfUrl, recipient }) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // 8.5 × 11 in pt.
  const pageW = 612, pageH = 792;
  const cover = doc.addPage([pageW, pageH]);

  // Window-envelope window for a #10 = ~1.125" from left, ~0.5" from
  // top of the lower-third fold. We want the address visible when the
  // letter is folded into thirds and inserted address-side-out, so
  // place the address block ~4" down from the page top (top of lower
  // third). Window is roughly 4.125" wide × 1.125" tall.
  const inch = 72;
  const blockX = 1.125 * inch;
  const blockY = pageH - (4.0 * inch);  // baseline-from-top for first line
  const lineH = 14;

  const lines = [
    recipient.name || "",
    recipient.line1 || "",
    recipient.line2 || "",
    [recipient.city, recipient.state].filter(Boolean).join(", ") + (recipient.zip ? "  " + recipient.zip : ""),
  ].filter(Boolean);

  lines.forEach((text, i) => {
    cover.drawText(String(text), {
      x: blockX, y: blockY - i * lineH,
      size: 12, font: i === 0 ? helvBold : helv, color: rgb(0, 0, 0),
    });
  });

  // Header above address — sender info, optional. Skipped for now.

  // Append the affidavit PDF pages.
  if (affidavitPdfUrl) {
    const res = await fetch(affidavitPdfUrl);
    if (!res.ok) throw new Error("Affidavit fetch for mail merge failed");
    const bytes = await res.arrayBuffer();
    const src = await PDFDocument.load(bytes);
    const copied = await doc.copyPages(src, src.getPageIndices());
    copied.forEach((p) => doc.addPage(p));
  }

  return await doc.save();
}
