import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// ── PDF Generation Helpers ──────────────────────────────────────

interface PdfSection {
  type: "heading" | "text" | "table" | "spacer" | "divider" | "keyvalue";
  content?: string;
  rows?: string[][];
  headers?: string[];
  pairs?: [string, string][];
  size?: number;
  bold?: boolean;
  color?: [number, number, number];
  height?: number;
}

async function buildPdf(title: string, sections: PdfSection[], meta?: { logo?: string }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const timesFont = await doc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await doc.embedFont(StandardFonts.TimesRomanBold);

  const PAGE_W = 612; // Letter
  const PAGE_H = 792;
  const MARGIN = 50;
  const CONTENT_W = PAGE_W - 2 * MARGIN;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const navy = rgb(0.102, 0.212, 0.365); // #1A365D
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const red = rgb(0.77, 0.12, 0.12); // #C53030
  const lineGray = rgb(0.82, 0.82, 0.82);

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  function drawText(text: string, opts: { x?: number; size?: number; font?: any; color?: any; maxWidth?: number }) {
    const sz = opts.size || 10;
    const f = opts.font || font;
    const c = opts.color || black;
    const x = opts.x || MARGIN;
    const maxW = opts.maxWidth || CONTENT_W;

    // Simple word wrapping
    const words = text.split(" ");
    let line = "";
    const lines: string[] = [];

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const w = f.widthOfTextAtSize(test, sz);
      if (w > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    for (const l of lines) {
      ensureSpace(sz + 4);
      page.drawText(l, { x, y: y - sz, size: sz, font: f, color: c });
      y -= sz + 4;
    }
  }

  // ── Title bar ──
  ensureSpace(40);
  page.drawRectangle({ x: 0, y: y - 30, width: PAGE_W, height: 35, color: navy });
  page.drawText(title, { x: MARGIN, y: y - 24, size: 16, font: fontBold, color: rgb(1, 1, 1) });
  y -= 50;

  // ── Render sections ──
  for (const sec of sections) {
    switch (sec.type) {
      case "heading": {
        const sz = sec.size || 14;
        ensureSpace(sz + 12);
        const c = sec.color ? rgb(sec.color[0]/255, sec.color[1]/255, sec.color[2]/255) : navy;
        page.drawText(sec.content || "", { x: MARGIN, y: y - sz, size: sz, font: timesBold, color: c });
        y -= sz + 10;
        break;
      }

      case "text": {
        const sz = sec.size || 10;
        const f = sec.bold ? fontBold : font;
        const c = sec.color ? rgb(sec.color[0]/255, sec.color[1]/255, sec.color[2]/255) : black;
        drawText(sec.content || "", { size: sz, font: f, color: c });
        y -= 4;
        break;
      }

      case "keyvalue": {
        if (!sec.pairs) break;
        for (const [key, val] of sec.pairs) {
          ensureSpace(16);
          page.drawText(key + ":", { x: MARGIN, y: y - 10, size: 10, font: fontBold, color: gray });
          page.drawText(val, { x: MARGIN + 140, y: y - 10, size: 10, font: font, color: black });
          y -= 16;
        }
        y -= 4;
        break;
      }

      case "table": {
        if (!sec.rows) break;
        const headers = sec.headers || [];
        const cols = headers.length || (sec.rows[0]?.length || 1);
        const colW = CONTENT_W / cols;

        // Headers
        if (headers.length) {
          ensureSpace(20);
          page.drawRectangle({ x: MARGIN, y: y - 16, width: CONTENT_W, height: 18, color: rgb(0.94, 0.94, 0.96) });
          headers.forEach((h, i) => {
            page.drawText(h, { x: MARGIN + i * colW + 4, y: y - 12, size: 9, font: fontBold, color: navy });
          });
          y -= 20;
        }

        // Rows
        for (const row of sec.rows) {
          ensureSpace(16);
          row.forEach((cell, i) => {
            const cellText = String(cell || "").slice(0, 60);
            page.drawText(cellText, { x: MARGIN + i * colW + 4, y: y - 11, size: 9, font: font, color: black });
          });
          // Bottom border
          page.drawLine({ start: { x: MARGIN, y: y - 14 }, end: { x: MARGIN + CONTENT_W, y: y - 14 }, thickness: 0.5, color: lineGray });
          y -= 16;
        }
        y -= 6;
        break;
      }

      case "divider": {
        ensureSpace(12);
        page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: MARGIN + CONTENT_W, y: y - 4 }, thickness: 1, color: lineGray });
        y -= 12;
        break;
      }

      case "spacer": {
        y -= sec.height || 16;
        break;
      }
    }
  }

  // Footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`13 Stars Media Group  |  Page ${i + 1} of ${pages.length}`, {
      x: MARGIN, y: 25, size: 8, font, color: gray,
    });
    p.drawText(new Date().toLocaleDateString(), {
      x: PAGE_W - MARGIN - 60, y: 25, size: 8, font, color: gray,
    });
  });

  return await doc.save();
}

// ── Invoice PDF builder ─────────────────────────────────────────

function buildInvoiceSections(inv: any, client: any, lineItems: any[]): PdfSection[] {
  const sections: PdfSection[] = [];

  sections.push({ type: "spacer", height: 8 });
  sections.push({ type: "keyvalue", pairs: [
    ["Invoice #", inv.invoice_number || "—"],
    ["Date", inv.created_at ? new Date(inv.created_at).toLocaleDateString() : "—"],
    ["Due Date", inv.due_date || "—"],
    ["Status", (inv.status || "draft").toUpperCase()],
  ]});
  sections.push({ type: "divider" });

  sections.push({ type: "heading", content: "Bill To", size: 12 });
  sections.push({ type: "text", content: client?.name || "Client" });
  if (client?.address) sections.push({ type: "text", content: client.address, color: [100, 100, 100] });
  if (client?.email || client?.contacts?.[0]?.email) {
    sections.push({ type: "text", content: client.email || client.contacts[0].email, color: [100, 100, 100] });
  }
  sections.push({ type: "spacer", height: 8 });

  // Line items
  const headers = ["Description", "Qty", "Rate", "Amount"];
  const rows = lineItems.map(li => [
    li.description || li.ad_size || "Ad placement",
    String(li.quantity || 1),
    "$" + (li.rate || li.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }),
    "$" + (li.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }),
  ]);
  sections.push({ type: "table", headers, rows });

  sections.push({ type: "divider" });
  sections.push({ type: "keyvalue", pairs: [
    ["Subtotal", "$" + (inv.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })],
    ["Payments", "$" + ((inv.total || 0) - (inv.balance_due || inv.total || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })],
    ["Balance Due", "$" + (inv.balance_due || inv.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })],
  ]});

  sections.push({ type: "spacer", height: 16 });
  sections.push({ type: "text", content: "Payment Instructions:", bold: true });
  sections.push({ type: "text", content: "Please make checks payable to 13 Stars Media Group or contact billing@13stars.media for payment options.", color: [100, 100, 100] });

  return sections;
}

// ── Contract PDF builder ────────────────────────────────────────

function buildContractSections(sale: any, client: any, pub: any, issue: any): PdfSection[] {
  const sections: PdfSection[] = [];

  sections.push({ type: "spacer", height: 8 });
  sections.push({ type: "heading", content: "Advertising Contract", size: 16 });
  sections.push({ type: "keyvalue", pairs: [
    ["Client", client?.name || "—"],
    ["Publication", pub?.name || "—"],
    ["Ad Size", sale.ad_size || "—"],
    ["Amount", "$" + (sale.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })],
    ["Issue", issue?.label || "—"],
    ["Contract Date", sale.contract_date ? new Date(sale.contract_date).toLocaleDateString() : new Date().toLocaleDateString()],
  ]});
  sections.push({ type: "divider" });

  if (sale.notes) {
    sections.push({ type: "heading", content: "Terms & Notes", size: 12 });
    sections.push({ type: "text", content: sale.notes });
    sections.push({ type: "spacer", height: 8 });
  }

  sections.push({ type: "heading", content: "Signatures", size: 12 });
  sections.push({ type: "spacer", height: 24 });
  sections.push({ type: "text", content: "____________________________          ____________________________" });
  sections.push({ type: "text", content: "Client Signature                                     13 Stars Media Group", color: [100, 100, 100] });

  return sections;
}

// ═══════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { type, id } = body; // type: "invoice" | "contract"
    const admin = getAdmin();

    let pdfBytes: Uint8Array;
    let filename: string;

    if (type === "invoice") {
      const { data: inv } = await admin.from("invoices").select("*").eq("id", id).single();
      if (!inv) throw new Error("Invoice not found");

      const { data: client } = await admin.from("clients").select("*, contacts:client_contacts(email)").eq("id", inv.client_id).single();
      const { data: lineItems } = await admin.from("invoice_line_items").select("*").eq("invoice_id", id);

      const sections = buildInvoiceSections(inv, client, lineItems || []);
      pdfBytes = await buildPdf(`Invoice ${inv.invoice_number || ""}`, sections);
      filename = `invoice-${inv.invoice_number || id}.pdf`;

    } else if (type === "contract") {
      const { data: sale } = await admin.from("sales").select("*").eq("id", id).single();
      if (!sale) throw new Error("Sale not found");

      const { data: client } = await admin.from("clients").select("*").eq("id", sale.client_id).single();
      const { data: pub } = await admin.from("publications").select("name").eq("id", sale.publication_id).single();
      const { data: issue } = sale.issue_id ? await admin.from("issues").select("label").eq("id", sale.issue_id).single() : { data: null };

      const sections = buildContractSections(sale, client, pub, issue);
      pdfBytes = await buildPdf("Advertising Contract", sections);
      filename = `contract-${client?.name?.replace(/\s+/g, "-") || id}.pdf`;

    } else if (type === "custom") {
      // Accept raw sections for custom PDFs
      const sections: PdfSection[] = body.sections || [];
      const title = body.title || "Document";
      pdfBytes = await buildPdf(title, sections);
      filename = body.filename || "document.pdf";

    } else {
      throw new Error("Unknown type: " + type);
    }

    // Return PDF as base64 (for email attachment) or raw binary
    if (body.format === "base64") {
      const b64 = btoa(String.fromCharCode(...pdfBytes));
      return new Response(
        JSON.stringify({ base64: b64, filename, size: pdfBytes.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
