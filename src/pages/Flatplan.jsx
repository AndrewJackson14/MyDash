import { useState, useRef, useEffect, useMemo, memo } from "react";
import { Z, SC, COND, DISPLAY, FS, FW, Ri, CARD, R, INV } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, Bar, FilterBar, SortHeader, BackBtn, ThemeToggle , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, ListCard, ListDivider, ListGrid, glass } from "../components/ui";

import { supabase } from "../lib/supabase";
import { sendGmailEmail } from "../lib/gmail";
import { generateInvoiceHtml } from "../lib/invoiceTemplate";

const GRID_COLS = 2;
const GRID_ROWS = 4;
const cellW = 100 / GRID_COLS;
const cellH = 100 / GRID_ROWS;

function adToGridSpan(adW, adH, pubW, pubH) {
  const cols = Math.max(1, Math.min(GRID_COLS, Math.round((adW / pubW) * GRID_COLS)));
  const rows = Math.max(1, Math.min(GRID_ROWS, Math.round((adH / pubH) * GRID_ROWS)));
  return { cols, rows };
}

function buildPageGrid(items, pub) {
  const grid = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
  const placements = [];
  const withPos = items.filter(i => i.gridRow != null && i.gridCol != null);
  const withoutPos = items.filter(i => i.gridRow == null || i.gridCol == null);
  withPos.forEach(item => {
    const span = adToGridSpan(item.adW || 1, item.adH || 1, pub.width, pub.height);
    const r = Math.min(item.gridRow, GRID_ROWS - span.rows);
    const c = Math.min(item.gridCol, GRID_COLS - span.cols);
    placements.push({ ...item, gridRow: r, gridCol: c, spanCols: span.cols, spanRows: span.rows });
    for (let dr = 0; dr < span.rows; dr++) for (let dc = 0; dc < span.cols; dc++) { if (grid[r + dr]?.[c + dc] !== undefined) grid[r + dr][c + dc] = item.id; }
  });
  withoutPos.forEach(item => {
    const span = adToGridSpan(item.adW || 1, item.adH || 1, pub.width, pub.height);
    let placed = false;
    for (let r = GRID_ROWS - span.rows; r >= 0 && !placed; r--) {
      for (let c = 0; c <= GRID_COLS - span.cols && !placed; c++) {
        let fits = true;
        for (let dr = 0; dr < span.rows && fits; dr++) for (let dc = 0; dc < span.cols && fits; dc++) { if (grid[r + dr][c + dc] !== null) fits = false; }
        if (fits) { for (let dr = 0; dr < span.rows; dr++) for (let dc = 0; dc < span.cols; dc++) grid[r + dr][c + dc] = item.id; placements.push({ ...item, gridRow: r, gridCol: c, spanCols: span.cols, spanRows: span.rows }); placed = true; }
      }
    }
    if (!placed) placements.push({ ...item, gridRow: 0, gridCol: 0, spanCols: span.cols, spanRows: span.rows });
  });
  return placements;
}

const FlatplanPage = ({ pageNum, pub, adsOnPage, dragId, onDrop, onDropToCell, onRemoveAd, onStartDrag, clientName, pageW, editorialStories, isSelected, sectionSelected, onClick, phLabels }) => {
  const pH = pageW * (pub.height / pub.width);
  const placements = buildPageGrid(adsOnPage, pub);
  const fs = Math.max(8, pageW * 0.07);
  const fsSmall = Math.max(7, pageW * 0.055);
  const occupied = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
  placements.forEach(p => { for (let r = 0; r < p.spanRows; r++) for (let c = 0; c < p.spanCols; c++) { if (occupied[p.gridRow + r]?.[p.gridCol + c] !== undefined) occupied[p.gridRow + r][p.gridCol + c] = true; } });

  return <div onClick={onClick} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragId) onDrop(dragId, pageNum); }} style={{ position: "relative", width: pageW, height: pH, background: Z.bg, border: `2px solid ${sectionSelected ? Z.wa : isSelected ? Z.ac : Z.bd}`, borderRadius: R, overflow: "hidden", flexShrink: 0, cursor: "pointer" }}>
    {/* Page number watermark */}
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 0, pointerEvents: "none" }}><span style={{ fontSize: Math.max(18, pageW * 0.18), fontWeight: FW.black, color: "rgba(138,149,168,0.08)" }}>{pageNum}</span></div>
    {/* Empty grid cells — always show light grid lines */}
    {Array.from({ length: GRID_ROWS }).map((_, r) => Array.from({ length: GRID_COLS }).map((_, c) => {
      if (occupied[r][c]) return null;
      return <div key={`${r}-${c}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragId) onDropToCell(dragId, pageNum, r, c); }} style={{ position: "absolute", left: `${c * cellW}%`, top: `${r * cellH}%`, width: `${cellW}%`, height: `${cellH}%`, background: dragId ? "rgba(138,149,168,0.08)" : "transparent", border: `1px solid rgba(138,149,168,${dragId ? 0.2 : 0.06})`, boxSizing: "border-box", zIndex: 1 }} />;
    }))}
    {/* Editorial stories — only when page is selected */}
    {isSelected && editorialStories.length > 0 && <div style={{ position: "absolute", top: 2, left: 3, right: 3, zIndex: 3, pointerEvents: "none", display: "flex", flexDirection: "column", gap: 0 }}>{editorialStories.map((s, idx) => <div key={s.id} style={{ fontSize: idx === 0 ? fsSmall : Math.max(6, fsSmall - 2), fontWeight: idx === 0 ? 800 : 600, color: Z.ac, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: pageW - 6, opacity: idx === 0 ? 1 : 0.6 }}>{s.title}</div>)}</div>}
    {/* Ads on page */}
    {placements.map(p => {
      const isPH = p.isPlaceholder;
      const isPending = !isPH && (p.status === "Proposal" || p.status === "Negotiation");
      const isSold = !isPH && !isPending;

      // SOLD = solid green, PENDING = hatched pattern, PLACEHOLDER = gray dashed
      const bgStyle = isSold
        ? "rgba(34,197,94,0.25)"
        : isPending
          ? "repeating-linear-gradient(135deg, rgba(232,176,58,0.12), rgba(232,176,58,0.12) 3px, rgba(232,176,58,0.04) 3px, rgba(232,176,58,0.04) 6px)"
          : "transparent";
      const borderStyle = isSold
        ? "1.5px solid rgba(34,197,94,0.6)"
        : isPending
          ? "1.5px dashed rgba(232,176,58,0.6)"
          : "1.5px dashed rgba(138,149,168,0.4)";
      const textColor = isSold ? "#166534" : isPending ? "#92400e" : Z.td;
      const subColor = isSold ? "rgba(22,101,52,0.6)" : isPending ? "rgba(146,64,14,0.5)" : "rgba(138,149,168,0.6)";

      return <div key={p.id} draggable onDragStart={e => { e.stopPropagation(); onStartDrag(p.id, p.isPlaceholder ? "placeholder" : "sale"); }} style={{ position: "absolute", left: `${p.gridCol * cellW}%`, top: `${p.gridRow * cellH}%`, width: `${p.spanCols * cellW}%`, height: `${p.spanRows * cellH}%`, background: bgStyle, border: borderStyle, borderRadius: R, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", zIndex: 5, boxSizing: "border-box", cursor: "grab" }}>
        <div style={{ fontSize: fs, fontWeight: FW.heavy, color: textColor, textAlign: "center", lineHeight: 1.1, padding: "0 2px" }}>{isPH ? (phLabels?.[p.id] || "HOLD") : clientName(p.clientId).slice(0, 18)}</div>
        <div style={{ fontSize: fsSmall, color: subColor, fontWeight: FW.semi }}>{isPH ? "Placeholder" : (p.size || p.type)}</div>
        {pageW > 70 && <button onClick={e => { e.stopPropagation(); onRemoveAd(p.id); }} style={{ position: "absolute", top: 1, right: 1, width: 13, height: 13, borderRadius: Ri, background: "rgba(232,72,85,0.85)", border: "none", cursor: "pointer", fontSize: 9, color: INV.light, fontWeight: FW.black, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>}
      </div>;
    })}
  </div>;
};

const Flatplan = ({ pubs, issues, setIssues, sales, setSales, updateSale, clients, contracts, stories, globalPageStories, setGlobalPageStories, lastIssue, lastPub, onSelectionChange, jurisdiction, currentUser }) => {
  const fpPubs = jurisdiction?.myPubs || pubs;
  const [selPub, setSelPub] = useState("");
  const [selIssue, setSelIssue] = useState("");
  const [di, setDi] = useState(null);
  const [diType, setDiType] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [sendingToPress, setSendingToPress] = useState(false);
  const [sentToPressModal, setSentToPressModal] = useState(false);

  // Send to Press handler
  const canSendToPress = jurisdiction?.isAdmin || false; // Publisher, Admin, Layout Designer
  const handleSendToPress = async () => {
    const issue = issues.find(i => i.id === selIssue);
    if (!issue || sendingToPress) return;

    // Idempotency check
    if (issue.sentToPressAt) {
      setSentToPressModal(true);
      return;
    }
    await executeSendToPress(issue);
  };

  const executeSendToPress = async (issue) => {
    setSendingToPress(true);
    setSentToPressModal(false);

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();

    // 1. Mark issue as sent to press
    await supabase.from("issues").update({ sent_to_press_at: now, sent_to_press_by: currentUser?.name || currentUser?.id || "publisher" }).eq("id", issue.id);
    setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, sentToPressAt: now } : i));

    // 2. Find closed sales for this issue
    const issueSales = (sales || []).filter(s => s.issueId === issue.id && s.status === "Closed");

    let invoicesCreated = 0;
    let invoicesSent = 0;
    let skippedPaymentPlan = 0;
    let skippedRecentlySent = 0;

    for (const sale of issueSales) {
      // Skip $0 sales
      if (!sale.amount || sale.amount <= 0) continue;

      // Check if this sale is part of a monthly payment plan (contract with monthly terms)
      if (sale.contractId) {
        const contract = (contracts || []).find(c => c.id === sale.contractId);
        if (contract?.paymentTerms === "monthly") {
          skippedPaymentPlan++;
          continue; // Monthly payment plans are invoiced separately
        }
      }

      // Check if invoice already exists for this sale
      const { data: existingLines } = await supabase.from("invoice_lines").select("invoice_id").eq("sale_id", sale.id).limit(1);
      if (existingLines?.length > 0) {
        // Invoice exists — check if it needs sending
        const { data: existingInv } = await supabase.from("invoices").select("id, status, client_id, invoice_number, total, balance_due, created_at").eq("id", existingLines[0].invoice_id).single();
        if (existingInv && existingInv.status === "draft") {
          // Draft invoice — send it
          await sendInvoiceEmail(existingInv, issue);
          invoicesSent++;
        } else if (existingInv && existingInv.status === "sent" && existingInv.created_at < fiveDaysAgo) {
          // Sent but older than 5 days — resend
          await sendInvoiceEmail(existingInv, issue);
          invoicesSent++;
        } else {
          skippedRecentlySent++;
        }
        continue;
      }

      // Create new invoice with sequential invoice number
      const clientName = clients.find(c => c.id === sale.clientId)?.name || "";
      const pubName = pubs.find(p => p.id === sale.publication)?.name || "";
      const { data: invNum } = await supabase.rpc("next_invoice_number");
      const net30 = new Date(); net30.setDate(net30.getDate() + 30);
      const { data: inv } = await supabase.from("invoices").insert({
        client_id: sale.clientId,
        invoice_number: invNum || `13XX-${Date.now()}`,
        status: "draft",
        issue_date: today,
        due_date: net30.toISOString().slice(0, 10),
        total: sale.amount || 0,
        balance_due: sale.amount || 0,
      }).select("id, invoice_number, total, balance_due, client_id, status").single();

      if (inv?.id) {
        await supabase.from("invoice_lines").insert({
          invoice_id: inv.id,
          sale_id: sale.id,
          description: `${pubName} ${issue.label} — ${sale.size || sale.type || "Ad"}`,
          quantity: 1,
          unit_price: sale.amount || 0,
          total: sale.amount || 0,
        });
        invoicesCreated++;

        // Send the invoice email
        await sendInvoiceEmail({ ...inv, invoice_number: inv.invoice_number }, issue);
        invoicesSent++;
      }
    }

    setSendingToPress(false);
  };

  const sendInvoiceEmail = async (inv, issue) => {
    // Recipient priority: client.billingEmail > primary client_contacts row.
    // CCs come from client.billingCcEmails (up to 2).
    const client = clients.find(c => c.id === inv.client_id);
    const { data: contactRows } = await supabase.from("client_contacts").select("email").eq("client_id", inv.client_id).limit(1);
    const fallbackEmail = contactRows?.[0]?.email;
    const clientEmail = (client?.billingEmail || "").trim() || fallbackEmail;
    const ccEmails = (client?.billingCcEmails || []).filter(Boolean).slice(0, 2);
    if (!clientEmail) return;

    // Map DB fields to template's expected camelCase format
    const { data: invLines } = await supabase.from("invoice_lines").select("description, amount").eq("invoice_id", inv.id);
    const htmlBody = generateInvoiceHtml({
      invoice: {
        invoiceNumber: inv.invoice_number,
        issueDate: inv.issue_date || new Date().toISOString().slice(0, 10),
        dueDate: inv.due_date || new Date().toISOString().slice(0, 10),
        total: Number(inv.total) || 0,
        balanceDue: Number(inv.balance_due) || 0,
        status: inv.status,
        lines: (invLines || []).map(l => ({ description: l.description, amount: Number(l.amount) })),
      },
      clientName: client?.name || "",
      clientCode: client?.clientCode || client?.client_code || "",
      billingAddress: {
        line1: client?.billingAddress || client?.address || "",
        line2: client?.billingAddress2 || "",
        city: client?.billingCity || client?.city || "",
        state: client?.billingState || client?.state || "",
        zip: client?.billingZip || client?.zip || "",
      },
    });

    const result = await sendGmailEmail({
      teamMemberId: null,
      to: [clientEmail],
      cc: ccEmails,
      subject: `Invoice ${inv.invoice_number} — 13 Stars Media Group`,
      htmlBody,
      mode: "send",
      emailType: "invoice",
      clientId: inv.client_id,
      refId: inv.id,
      refType: "invoice",
    });

    if (result.success) {
      await supabase.from("invoices").update({ status: "sent" }).eq("id", inv.id);
    }
  };
  const [showProposalAds, setShowProposalAds] = useState(false);
  const [placeholders, setPlaceholders] = useState([]);
  const [selPage, setSelPage] = useState(null);
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState("New Section");
  const [newSectionPages, setNewSectionPages] = useState([]);
  const pageStories = globalPageStories || {}; const setPageStories = setGlobalPageStories || (() => {});
  const [phLabels, setPhLabels] = useState({});
  const [sections, setSections] = useState({});
  const [initialized, setInitialized] = useState(false);

  // Don't auto-select — let user choose publication first
  // Only restore previous selection if returning to the page
  useEffect(() => {
    if (initialized || !issues || issues.length === 0 || !pubs || pubs.length === 0) return;
    if (lastPub && lastIssue) {
      setSelPub(lastPub);
      setSelIssue(lastIssue);
    }
    setInitialized(true);
  }, [issues, pubs, lastPub, lastIssue, initialized]);

  const pub = pubs.find(p => p.id === selPub);
  const today = new Date().toISOString().slice(0, 10);
  const allPubIssues = issues.filter(i => i.pubId === selPub).sort((a, b) => a.date.localeCompare(b.date));
  // Show: next upcoming issue + 2 most recent previous issues
  const nextIdx = allPubIssues.findIndex(i => i.date >= today);
  const visibleIssues = (() => {
    if (nextIdx < 0) return allPubIssues.slice(-3); // no future issues, show last 3
    if (nextIdx === 0) return allPubIssues.slice(0, 1); // first issue is future, just show it
    const prevStart = Math.max(0, nextIdx - 2);
    return allPubIssues.slice(prevStart, nextIdx + 1);
  })();
  const issue = issues.find(i => i.id === selIssue);
  const issPlaceholders = placeholders.filter(p => p.issueId === selIssue);
  const pages = issue ? Array.from({ length: issue.pageCount }, (_, i) => i + 1) : [];
  const clientMap = {};
  (clients || []).forEach(c => { clientMap[c.id] = c.name; });
  const cn = id => clientMap[id] || "—";

  // QUALIFICATION + ENRICHMENT — derive from sales prop
  const adSizeLookup = useMemo(() => {
    const asl = {};
    (pub?.adSizes || []).forEach(a => { asl[a.name] = a; });
    return asl;
  }, [pub]);

  const qualifiedSales = useMemo(() => {
    // Non-display product types that should never appear on the Flatplan
    const NON_DISPLAY = new Set(['Calendar Listing', 'Church Listing', 'Classified Line Listing', 
      'Fictitious Business Name - New Filing', 'Legal Notice', 'Obituary', 'Name Change', 
      'Statement of Abandonment', 'Summons English & Spanish', 'Newspaper Insert',
      'Full Page Editorial', 'Front Page Strip', 'Shell 3']);
    
    return sales.filter(s => {
      if (s.issueId !== selIssue) return false;
      // Status filter — when showProposalAds is off, only show Closed/Follow-up
      if (showProposalAds) {
        if (s.status !== "Closed" && s.status !== "Follow-up" && s.status !== "Proposal" && s.status !== "Negotiation") return false;
      } else {
        if (s.status !== "Closed" && s.status !== "Follow-up") return false;
      }
      // Exclude non-display products
      if (NON_DISPLAY.has(s.size)) return false;
      // Must have physical dimensions
      const w = Number(s.adW) || 0;
      const h = Number(s.adH) || 0;
      if (w > 0 && h > 0) return true;
      // Or match an ad_sizes entry
      const match = adSizeLookup[s.size];
      if (match) return true;
      return false;
    }).map(s => {
      const w = Number(s.adW) || 0;
      const h = Number(s.adH) || 0;
      if (w > 0 && h > 0) return s;
      const match = adSizeLookup[s.size];
      if (match) return { ...s, adW: match.w, adH: match.h };
      return s;
    });
  }, [sales, selIssue, adSizeLookup, showProposalAds]);

  // === PLACEMENT TRACKING ===
  // Use a ref for the actual data (instant access, no async state batching)
  // Use a counter state solely to trigger re-renders
  const placedRef = useRef({});     // { saleId: true }
  const pageMapRef = useRef({});    // { saleId: { page, row, col } }
  const [tick, setTick] = useState(0);
  const loadedIssueRef = useRef("");

  // When switching issues, reset from database
  useEffect(() => {
    if (selIssue !== loadedIssueRef.current) {
      const p = {};
      const m = {};
      qualifiedSales.forEach(s => {
        if (s.page != null && s.page > 0) {
          p[s.id] = true;
          m[s.id] = { page: s.page, row: s.pagePos?.row ?? null, col: s.pagePos?.col ?? null };
        }
      });
      placedRef.current = p;
      pageMapRef.current = m;
      loadedIssueRef.current = selIssue;
      setTick(t => t + 1);
    }
  }, [selIssue, qualifiedSales]);

  // Derive sidebar lists using ref (reads current value on every render)
  const issSales = qualifiedSales;
  const pRef = placedRef.current;
  const unplaced = issSales.filter(s => !pRef[s.id]);
  const placed = issSales.filter(s => !!pRef[s.id]);

  const baseW = Math.max(70, Math.min(120, 700 / Math.ceil(Math.sqrt(issue?.pageCount || 16)))) * zoom;
  const pubStories = (stories || []).filter(s => s.publication === selPub);
  const pageStoryKey = (pg) => `${selIssue}_${pg}`;
  const getPageStories = (pg) => (pageStories[pageStoryKey(pg)] || []).map(sid => pubStories.find(s => s.id === sid)).filter(Boolean);

  const storyPageMap = {};
  Object.entries(pageStories).forEach(([key, sids]) => { const pg = parseInt(key.split("_").pop()); sids.forEach(sid => { if (key.startsWith(selIssue + "_")) storyPageMap[sid] = pg; }); });

  const handlePubChange = (pubId) => { setSelPub(pubId); if (onSelectionChange) onSelectionChange(pubId, null); setSelPage(null); const t = new Date().toISOString().slice(0, 10); const pubIss = issues.filter(i => i.pubId === pubId).sort((a,b) => a.date.localeCompare(b.date)); const nextUp = pubIss.find(i => i.date >= t) || pubIss[pubIss.length - 1]; setSelIssue(nextUp?.id || ""); if (nextUp && onSelectionChange) onSelectionChange(pubId, nextUp.id); };

  const startDrag = (id, type) => { setDi(id); setDiType(type); };

  // Custom drag image — sized to match the actual cell size on the page grid
  const handleDragStart = (e, s) => {
    startDrag(s.id, "sale");
    if (pub && s.adW > 0 && s.adH > 0) {
      const span = adToGridSpan(s.adW, s.adH, pub.width, pub.height);
      const pH = baseW * (pub.height / pub.width);
      const gW = Math.round((baseW / GRID_COLS) * span.cols);
      const gH = Math.round((pH / GRID_ROWS) * span.rows);
      const ghost = document.createElement("div");
      ghost.style.cssText = `width:${gW}px;height:${gH}px;background:rgba(75,139,245,0.35);border:2px solid rgba(75,139,245,0.8);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;position:absolute;top:-9999px;left:-9999px;overflow:hidden;`;
      ghost.textContent = s.size || s.type || "";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, gW / 2, gH / 2);
      setTimeout(() => document.body.removeChild(ghost), 0);
    }
  };

  const handleDrop = (itemId, pageNum) => {
    if (placeholders.some(p => p.id === itemId)) {
      setPlaceholders(pl => pl.map(p => p.id === itemId ? { ...p, page: pageNum, gridRow: null, gridCol: null } : p));
      setDi(null); setDiType(null);
      return;
    }
    // Find the first available cell on this page for this ad
    const pageItems = getPageItems(pageNum);
    const grid = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
    pageItems.forEach(item => {
      if (item.id === itemId) return; // Don't block against ourselves (for re-placing)
      if (item.gridRow != null && item.gridCol != null) {
        const sp = adToGridSpan(item.adW || 1, item.adH || 1, pub?.width || 1, pub?.height || 1);
        for (let dr = 0; dr < sp.rows; dr++) for (let dc = 0; dc < sp.cols; dc++) {
          if (grid[item.gridRow + dr]?.[item.gridCol + dc] !== undefined) grid[item.gridRow + dr][item.gridCol + dc] = true;
        }
      }
    });
    const droppedAd = issSales.find(s => s.id === itemId);
    const span = droppedAd ? adToGridSpan(droppedAd.adW || 1, droppedAd.adH || 1, pub?.width || 1, pub?.height || 1) : { cols: 1, rows: 1 };
    let targetRow = -1, targetCol = -1;
    for (let r = GRID_ROWS - span.rows; r >= 0; r--) {
      let found = false;
      for (let c = 0; c <= GRID_COLS - span.cols; c++) {
        let fits = true;
        for (let dr = 0; dr < span.rows && fits; dr++) for (let dc = 0; dc < span.cols && fits; dc++) { if (grid[r + dr][c + dc]) fits = false; }
        if (fits) { targetRow = r; targetCol = c; found = true; break; }
      }
      if (found) break;
    }
    if (targetRow < 0) { setDi(null); setDiType(null); return; } // No space — reject placement
    handleDropToCell(itemId, pageNum, targetRow, targetCol);
  };
  const handleDropToCell = (itemId, pageNum, row, col) => {
    if (placeholders.some(p => p.id === itemId)) {
      setPlaceholders(pl => pl.map(p => p.id === itemId ? { ...p, page: pageNum, gridRow: row, gridCol: col } : p));
      setDi(null); setDiType(null);
      return;
    }
    // Check for overlap before placing
    const droppedAd = issSales.find(s => s.id === itemId);
    const span = droppedAd ? adToGridSpan(droppedAd.adW || 1, droppedAd.adH || 1, pub?.width || 1, pub?.height || 1) : { cols: 1, rows: 1 };
    const pageItems = getPageItems(pageNum);
    const grid = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
    pageItems.forEach(item => {
      if (item.id === itemId) return; // Don't block against ourselves
      if (item.gridRow != null && item.gridCol != null) {
        const sp = adToGridSpan(item.adW || 1, item.adH || 1, pub?.width || 1, pub?.height || 1);
        for (let dr = 0; dr < sp.rows; dr++) for (let dc = 0; dc < sp.cols; dc++) {
          if (grid[item.gridRow + dr]?.[item.gridCol + dc] !== undefined) grid[item.gridRow + dr][item.gridCol + dc] = true;
        }
      }
    });
    // Verify the target cells are free
    let fits = true;
    for (let dr = 0; dr < span.rows && fits; dr++) for (let dc = 0; dc < span.cols && fits; dc++) {
      if (row + dr >= GRID_ROWS || col + dc >= GRID_COLS || grid[row + dr][col + dc]) fits = false;
    }
    if (!fits) { setDi(null); setDiType(null); return; } // Overlap — reject

    // Place the ad
    placedRef.current = { ...placedRef.current, [itemId]: true };
    pageMapRef.current = { ...pageMapRef.current, [itemId]: { page: pageNum, row, col } };
    setTick(t => t + 1);
    // Persist (fire and forget — don't let setSales inside updateSale cause extra re-renders)
    updateSale(itemId, { page: pageNum, gridRow: row, gridCol: col });
    setDi(null); setDiType(null);
  };
  const handleRemove = (itemId) => {
    if (placeholders.some(p => p.id === itemId)) {
      setPlaceholders(pl => pl.map(p => p.id === itemId ? { ...p, page: null, gridRow: null, gridCol: null } : p));
    } else {
      // Remove from placed tracking — use a sentinel to indicate "explicitly removed"
      const nextPlaced = { ...placedRef.current }; delete nextPlaced[itemId];
      placedRef.current = nextPlaced;
      // Mark as removed in pageMap (null page) so getPageItems doesn't fall back to s.page
      pageMapRef.current = { ...pageMapRef.current, [itemId]: { page: null, row: null, col: null } };
      setTick(t => t + 1);
      updateSale(itemId, { page: null, gridRow: null, gridCol: null });
    }
  };
  const adjustPages = (d) => { if (!issue) return; setIssues(iss => iss.map(i => i.id === issue.id ? { ...i, pageCount: Math.max(4, i.pageCount + d) } : i)); };
  const copyFromPrevious = () => { if (!issue) return; const idx = allPubIssues.findIndex(i => i.id === issue.id); if (idx <= 0) return; const prev = allPubIssues[idx - 1]; const prevSales = sales.filter(s => s.issueId === prev.id && s.page !== null); setSales(sl => sl.map(s => { if (s.issueId !== selIssue || s.page !== null) return s; const m = prevSales.find(ps => ps.clientId === s.clientId && ps.type === s.type); return m ? { ...s, page: m.page, gridRow: null, gridCol: null } : s; })); };
  const addPlaceholder = (adSize) => { if (!issue) return; setPlaceholders(pl => [...pl, { id: "ph" + Date.now(), issueId: issue.id, adSizeName: adSize.name, adW: adSize.w, adH: adSize.h, dims: adSize.dims, page: null, gridRow: null, gridCol: null }]); };

  const getPageItems = (n) => {
    const pm = pageMapRef.current;
    const si = issSales.filter(s => {
      const local = pm[s.id];
      if (local !== undefined) {
        // pageMapRef has an entry — use it (could be placed, moved, or removed)
        return local.page === n;
      }
      // No local entry — use database value
      return s.page === n;
    }).map(s => {
      const local = pm[s.id];
      return {
        ...s,
        gridRow: local ? local.row : (s.pagePos?.row ?? null),
        gridCol: local ? local.col : (s.pagePos?.col ?? null),
        isPlaceholder: false,
      };
    });
    const pi = issPlaceholders.filter(p => p.page === n).map(p => ({ id: p.id, clientId: null, type: p.adSizeName, size: p.dims, adW: p.adW, adH: p.adH, page: p.page, gridRow: p.gridRow, gridCol: p.gridCol, isPlaceholder: true, phLabel: phLabels[p.id] || "" }));
    return [...si, ...pi];
  };

  const totalSoldAdCells = issSales.reduce((sum, s) => {
    const span = adToGridSpan(s.adW || 1, s.adH || 1, pub?.width || 1, pub?.height || 1);
    return sum + (span.cols * span.rows);
  }, 0) + issPlaceholders.reduce((sum, p) => {
    const span = adToGridSpan(p.adW || 1, p.adH || 1, pub?.width || 1, pub?.height || 1);
    return sum + (span.cols * span.rows);
  }, 0);
  const totalIssueCells = pages.length * GRID_ROWS * GRID_COLS;
  const issueAdPct = totalIssueCells > 0 ? Math.round((totalSoldAdCells / totalIssueCells) * 100) : 0;
  const issueEditPct = 100 - issueAdPct;
  const totalAdRevenue = issSales.reduce((s, x) => s + x.amount, 0);

  const prevIssueExists = (() => { const idx = allPubIssues.findIndex(i => i.id === selIssue); return idx > 0; })();
  const toggleStoryOnPage = (pg, storyId) => { const key = pageStoryKey(pg); const cur = pageStories[key] || []; if (cur.includes(storyId)) setPageStories(ps => ({ ...ps, [key]: cur.filter(id => id !== storyId) })); else setPageStories(ps => ({ ...ps, [key]: [...cur, storyId] })); };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }} onDragEnd={() => { setDi(null); setDiType(null); }}>
    <PageHeader title="Flatplan">
      {canSendToPress && issue && <Btn sm onClick={handleSendToPress} disabled={sendingToPress} style={issue.sentToPressAt ? { background: Z.go + "15", color: Z.go, border: `1px solid ${Z.go}40` } : {}}>{sendingToPress ? "Sending..." : issue.sentToPressAt ? "✓ Sent to Press" : "Send to Press"}</Btn>}
      {issue && prevIssueExists && <Btn sm v="secondary" onClick={copyFromPrevious}>Copy Prev Issue</Btn>}
      <Btn sm v="secondary" onClick={() => setShowSectionPicker(true)}>+ Section</Btn>
      <button onClick={() => setShowProposalAds(p => !p)} style={{ padding: "7px 16px", borderRadius: Ri, border: `1px solid ${showProposalAds ? Z.wa : Z.bd}`, background: showProposalAds ? "rgba(212,137,14,0.15)" : Z.sa, cursor: "pointer", fontSize: 12, fontWeight: FW.bold, fontFamily: COND, color: showProposalAds ? Z.wa : Z.td }}>{showProposalAds ? "▣ Proposals On" : "▢ Proposals Off"}</button>
      <div style={{ display: "flex", alignItems: "center", gap: 3, background: Z.sa, borderRadius: Ri, padding: "6px 10px", border: `1px solid ${Z.bd}` }}><button onClick={() => setZoom(z => Math.max(0.5, z - 0.15))} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 15, fontWeight: FW.black }}>−</button><span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tm, minWidth: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(z => Math.min(2, z + 0.15))} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 15, fontWeight: FW.black }}>+</button></div>
    </PageHeader>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>Publication</span>
        <select value={selPub} onChange={e => handlePubChange(e.target.value)} style={{ background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "6px 10px", color: selPub ? Z.tx : Z.td, fontSize: FS.base, fontWeight: FW.semi, fontFamily: COND, cursor: "pointer", outline: "none", minWidth: 180 }}>
          <option value="" disabled>Choose publication</option>
          {fpPubs.filter(p => issues.some(i => i.pubId === p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>Issue</span>
        <select value={selIssue} disabled={!selPub} onChange={e => { setSelIssue(e.target.value); setSelPage(null); if (onSelectionChange) onSelectionChange(selPub, e.target.value); }} style={{ background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "6px 10px", color: selIssue ? Z.tx : Z.td, fontSize: FS.base, fontWeight: FW.semi, fontFamily: COND, cursor: selPub ? "pointer" : "not-allowed", outline: "none", minWidth: 200, opacity: selPub ? 1 : 0.5 }}>
          {!selPub && <option value="">Select a publication first</option>}
          {selPub && visibleIssues.length === 0 && <option value="">No issues</option>}
          {selPub && <option value="" disabled>Choose issue</option>}
          {visibleIssues.map(i => <option key={i.id} value={i.id}>{i.label} — {i.date}{i.date >= today ? " ★" : ""}</option>)}
        </select>
      </div>
      {issue && <div style={{ display: "flex", gap: 6, fontSize: FS.sm, color: Z.tm }}>
        <span>{issSales.length} ads</span>
        <span>·</span>
        <span>${totalAdRevenue.toLocaleString()}</span>
        <span>·</span>
        <span>{issue.pageCount} pages</span>
        <span>·</span>
        <span>{issueAdPct}% fill</span>
      </div>}
    </div>

    {showSectionPicker && issue && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", ...glass(), borderRadius: R, marginBottom: 6 }}>
      <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tm, flexShrink: 0 }}>New section:</span>
      <input value={newSectionLabel} onChange={e => setNewSectionLabel(e.target.value)} placeholder="Section name..." style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "5px 8px", color: Z.tx, fontSize: FS.base, fontWeight: FW.semi, fontFamily: COND, outline: "none", width: 160 }} />
      <span style={{ fontSize: FS.sm, color: Z.tm }}>Click pages below to select</span>
      {newSectionPages.length > 0 && <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.ac }}>{newSectionPages.length} selected (p.{newSectionPages.join(",")})</span>}
      <div style={{ flex: 1 }} />
      <Btn sm onClick={() => { if (newSectionPages.length > 0) { setSections(s => ({ ...s, [selIssue]: [...(s[selIssue] || []), { afterPage: Math.min(...newSectionPages) - 1, label: newSectionLabel, pages: newSectionPages }] })); } setShowSectionPicker(false); setNewSectionPages([]); setNewSectionLabel("New Section"); }}>Save Section</Btn>
      <button onClick={() => { setShowSectionPicker(false); setNewSectionPages([]); }} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: FS.md }}>×</button>
    </div>}
    {!issue ? <GlassCard style={{ textAlign: "center", padding: 40, color: Z.td, fontSize: FS.md }}>Select a publication and issue above</GlassCard>
    : <div style={{ display: "flex", gap: 14 }}>
      {/* Left sidebar — ad pool */}
      <div key={"sidebar-" + tick} style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: "calc(100vh - 180px)" }}>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.pu, textTransform: "uppercase" }}>Add Placeholders</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 4 }}>{(pub?.adSizes || []).map((a, i) => <button key={i} onClick={() => addPlaceholder(a)} style={{ padding: "6px 10px", borderRadius: Ri, border: `1px dashed ${Z.pu}`, background: "rgba(144,102,232,0.08)", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: Z.pu }}>{a.name}</button>)}</div>
        {placeholders.filter(p => p.issueId === selIssue && !p.page).map(p => <div key={p.id} draggable onDragStart={() => startDrag(p.id, "placeholder")} style={{ background: "rgba(144,102,232,0.06)", border: `1px dashed ${Z.pu}`, borderRadius: R, padding: 7, cursor: "grab" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: FW.bold, color: Z.pu, fontSize: FS.base }}>{p.adSizeName}</span><button onClick={() => setPlaceholders(pl => pl.filter(x => x.id !== p.id))} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: FS.md, fontWeight: FW.black }}>×</button></div>
          <input value={phLabels[p.id] || ""} onChange={e => setPhLabels(l => ({ ...l, [p.id]: e.target.value }))} placeholder="Label..." style={{ width: "100%", background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "4px 6px", color: Z.tx, fontSize: FS.sm, outline: "none", marginTop: 3, boxSizing: "border-box" }} />
        </div>)}

        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", marginTop: 8 }}>Unplaced ({unplaced.length})</div>
        {unplaced.map(s => { const isPending = s.status === "Proposal" || s.status === "Negotiation"; return <div key={s.id} draggable onDragStart={e => handleDragStart(e, s)} style={{ background: isPending ? "rgba(232,176,58,0.08)" : (Z.bg === "#08090D" ? "rgba(14,16,24,0.45)" : "rgba(255,255,255,0.35)"), backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${isPending ? "rgba(232,176,58,0.3)" : (Z.bg === "#08090D" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)")}`, borderRadius: R, padding: 7, cursor: "grab", opacity: isPending ? 0.6 : 1 }}>
          <div style={{ fontWeight: FW.bold, color: Z.tx, fontSize: FS.base }}>{cn(s.clientId)}</div>
          <div style={{ color: Z.tm, fontSize: FS.sm }}>{s.size || s.type} · ${s.amount.toLocaleString()}{isPending ? " · PENDING" : ""}</div>
          {s.adW > 0 && <div style={{ fontSize: FS.xs, color: Z.td }}>{s.adW}" × {s.adH}"</div>}
        </div>; })}
        {placed.length > 0 && <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.su, textTransform: "uppercase", marginTop: 8 }}>Placed ({placed.length})</div>}
        {placed.map(s => { const pm = pageMapRef.current[s.id]; return <div key={s.id} draggable onDragStart={() => startDrag(s.id, "sale")} style={{ ...glass(), borderRadius: R, padding: CARD.pad, fontSize: FS.sm, cursor: "grab" }}><span style={{ fontWeight: FW.bold, color: Z.tx }}>{cn(s.clientId)}</span> <span style={{ color: Z.tm }}>{s.size || s.type}</span> <span style={{ color: Z.ac }}>p.{pm?.page || s.page}</span></div>; })}
      </div>

      {/* Center — pages */}
      <div key={"pages-" + tick} style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 8, alignContent: "start", overflowY: "auto", maxHeight: "calc(100vh - 180px)" }}>
        {pages.map(n => {
          const issSections = sections[selIssue] || [];
          const sectionHere = issSections.find(s => s.afterPage === n - 1);
          const sectionEndHere = issSections.find(s => s.pages && Math.max(...s.pages) === n);
          return <>{sectionHere && <div style={{ width: "100%", padding: "8px 0 2px" }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><input value={sectionHere.label} onChange={e => { const val = e.target.value; setSections(s => ({ ...s, [selIssue]: (s[selIssue] || []).map(sec => sec.afterPage === sectionHere.afterPage ? { ...sec, label: val } : sec) })); }} style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, textTransform: "uppercase", background: "none", border: "none", outline: "none", fontFamily: COND, padding: 0 }} /><button onClick={() => setSections(s => ({ ...s, [selIssue]: (s[selIssue] || []).filter(sec => sec.afterPage !== sectionHere.afterPage) }))} style={{ background: "none", border: "none", cursor: "pointer", color: Z.td, fontSize: FS.sm }}>×</button></div></div>}<FlatplanPage key={n} pageNum={n} pub={pub} adsOnPage={getPageItems(n)} dragId={di} onDrop={handleDrop} onDropToCell={handleDropToCell} onRemoveAd={handleRemove} onStartDrag={startDrag} clientName={cn} pageW={baseW} editorialStories={getPageStories(n)} isSelected={selPage === n} sectionSelected={showSectionPicker && newSectionPages.includes(n)} onClick={() => { if (showSectionPicker) { setNewSectionPages(ps => ps.includes(n) ? ps.filter(x => x !== n) : [...ps, n].sort((a,b) => a-b)); } else { setSelPage(selPage === n ? null : n); } }} phLabels={phLabels} />{sectionEndHere && <div style={{ width: "100%", height: 1, background: Z.bd, margin: "4px 0" }} />}</>; })}
      </div>

      {/* Right sidebar — issue stats + story list */}
      <div style={{ width: 230, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", maxHeight: "calc(100vh - 180px)" }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: FW.heavy, color: Z.tx }}>{pub?.name} — {issue.label}</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <div style={{ background: Z.sa, borderRadius: R, padding: CARD.pad, textAlign: "center" }}><div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx }}>Ads (sold)</div></div>
          <div style={{ background: Z.sa, borderRadius: R, padding: CARD.pad, textAlign: "center" }}><div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.su }}>{issueEditPct}%</div><div style={{ fontSize: FS.sm, color: Z.tm }}>My Editorial</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <div style={{ background: Z.sa, borderRadius: R, padding: 16, textAlign: "center" }}><div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su }}>${totalAdRevenue.toLocaleString()}</div><div style={{ fontSize: FS.sm, color: Z.tm }}>Revenue</div></div>
          <div style={{ background: Z.sa, borderRadius: R, padding: 16, textAlign: "center" }}><div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx }}>{issSales.length + issPlaceholders.length}</div><div style={{ fontSize: FS.sm, color: Z.tm }}>Total Ads</div></div>
        </div>

        {/* Story list for this publication */}
        <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, marginTop: 4 }}>My Stories</div>
        <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 2 }}>Click a page, then assign stories from this list</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {[...pubStories].sort((a,b) => { const pa = parseInt(a.page) || 999; const pb = parseInt(b.page) || 999; return pa - pb; }).map(s => {
            const assignedPage = storyPageMap[s.id];
            const isAssigned = assignedPage != null;
            return <div key={s.id} onClick={() => { if (selPage) toggleStoryOnPage(selPage, s.id); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: isAssigned ? Z.as : Z.bg, border: `1px solid ${Z.bg === "#08090D" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}`, borderRadius: R, cursor: selPage ? "pointer" : "default" }}>
              <Badge status={s.status} small />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                <div style={{ fontSize: FS.sm, color: Z.tm }}>{s.wordCount}w · {s.author}</div>
              </div>
              {isAssigned && <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac, flexShrink: 0 }}>p.{assignedPage}</span>}
            </div>;
          })}
          {pubStories.length === 0 && <div style={{ fontSize: FS.sm, color: Z.td, padding: 16, textAlign: "center" }}>No stories for this publication</div>}
        </div>
      </div>
    </div>}

    {/* Sent to Press idempotency modal */}
    <Modal open={sentToPressModal} onClose={() => setSentToPressModal(false)} title="Already Sent to Press" width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: FS.sm, color: Z.tm }}>This issue was already sent to press on {issues.find(i => i.id === selIssue)?.sentToPressAt ? new Date(issues.find(i => i.id === selIssue).sentToPressAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"}. Send invoices again?</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setSentToPressModal(false)}>Cancel</Btn>
          <Btn onClick={() => { const iss = issues.find(i => i.id === selIssue); if (iss) executeSendToPress(iss); }}>Resend Invoices</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};


export default memo(Flatplan);
