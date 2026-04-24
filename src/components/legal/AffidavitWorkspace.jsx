// ============================================================
// AffidavitWorkspace — three-pane crop / tray / canvas UI for
// building a certification of publication.
//
// Left pane:   page source image with marquee-crop tool
// Center rail: ordered list of clips (click to add to canvas)
// Right pane:  AffidavitTemplate at 1:1 print scale, clips
//              positioned absolutely, draggable to reposition,
//              width slider for resize, +Add Page
//
// Source freeze + crop upload happen client-side via legalClippings;
// Save Draft persists clip rows + canvas positions; Lock rasterizes
// each page via html2canvas → pdf-lib and uploads the final PDF.
// ============================================================
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Z, FS, FW, Ri, COND } from "../../lib/theme";
import { Btn } from "../ui";
import { supabase } from "../../lib/supabase";
import { editionPageImageUrl } from "../../lib/legalFormats";
import {
  freezeSourcePage, cropAndUploadClip, insertClipping,
  loadClippings, updateClippingPlacement, deleteClipping,
} from "../../lib/legalClippings";
import { rasterizePagesToPdf, uploadAffidavitPdf } from "../../lib/affidavitPdf";
import AffidavitTemplate, { PAGE_W, PAGE_H } from "./AffidavitTemplate";

// Default clip width when first dropped on the canvas (print pixels).
const DEFAULT_CLIP_W = 360;
// Canvas zoom factor for screen display (template renders at 100%
// internally; we shrink visually so it fits beside the source pane).
const CANVAS_VIEW_SCALE = 0.5;

export default function AffidavitWorkspace({
  notice,             // legal_notices row (uuid id, title, run_dates, publication_id, notice_number)
  publication,        // publications row (id, name, legal_pub_group)
  currentUser,        // { id, name, signature_url? }
  editions,           // editions[] indexed elsewhere — array filtered to this publication
  onClose,            // back to LegalNotices list
  onStatusChange,     // (newStatus) => void — bubble up so list refreshes
}) {
  // Run-date dropdown — pulled from notice.run_dates (sorted asc).
  const runDates = useMemo(() => {
    const arr = (notice?.run_dates || notice?.runDates || []).slice().sort();
    return arr;
  }, [notice]);

  const [activeRunDate, setActiveRunDate] = useState(runDates[0] || null);
  const [activePage, setActivePage] = useState(1);
  // Frozen-source URL cache, keyed by `${run_date}-p${page}` so a
  // re-crop on the same source skips the freeze step.
  const [frozenByPage, setFrozenByPage] = useState(new Map());
  // All clips for the notice; refreshed after each upload / placement.
  const [clips, setClips] = useState([]);
  // Total canvas pages the user has spun up.
  const [canvasPageCount, setCanvasPageCount] = useState(notice?.affidavit_page_count || 1);
  // Active canvas page (which one new tray clicks land on).
  const [activeCanvasPage, setActiveCanvasPage] = useState(1);
  // Workspace status: "idle" | "freezing" | "cropping" | "saving" | "locking".
  const [busy, setBusy] = useState("idle");
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);

  // Refs to each rendered canvas page DOM node so Lock can rasterize.
  const pageRefs = useRef(new Map());
  const registerPageRef = (pn, el) => {
    if (el) pageRefs.current.set(pn, el);
    else pageRefs.current.delete(pn);
  };

  // Initial load of existing clips for the notice.
  useEffect(() => {
    if (!notice?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await loadClippings(notice.id);
        if (cancelled) return;
        setClips(list);
        // Rebuild the frozen-page cache from existing rows so we don't
        // re-freeze when the user revisits a draft.
        const m = new Map();
        list.forEach((c) => {
          const key = `${c.run_date}-p${c.source_page_number}`;
          if (!m.has(key)) m.set(key, c.source_frozen_url);
        });
        setFrozenByPage(m);
        // Bump canvas page count if any clip lives beyond the current count.
        const maxPage = list.reduce((mx, c) => Math.max(mx, c.canvas_page || 1), 1);
        if (maxPage > canvasPageCount) setCanvasPageCount(maxPage);
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, [notice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The edition that owns this run_date — found by matching the date
  // against editions.publish_date for the notice's publication.
  const activeEdition = useMemo(() => {
    if (!activeRunDate) return null;
    return (editions || []).find(e => (e.publication_id === publication?.id || e.publicationId === publication?.id) && e.publish_date === activeRunDate);
  }, [editions, publication?.id, activeRunDate]);

  const activeFrozenUrl = frozenByPage.get(`${activeRunDate}-p${activePage}`) || null;

  // ── Crop marquee on the source pane ─────────────────────────
  const sourceWrapRef = useRef(null);
  const [cropRect, setCropRect] = useState(null);  // {x,y,w,h} in container pixels while dragging
  const dragRef = useRef(null);
  const onSourceMouseDown = (e) => {
    if (busy !== "idle") return;
    if (!sourceWrapRef.current) return;
    const bounds = sourceWrapRef.current.getBoundingClientRect();
    const startX = e.clientX - bounds.left;
    const startY = e.clientY - bounds.top;
    dragRef.current = { startX, startY };
    setCropRect({ x: startX, y: startY, w: 0, h: 0 });
  };
  const onSourceMouseMove = (e) => {
    if (!dragRef.current || !sourceWrapRef.current) return;
    const bounds = sourceWrapRef.current.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;
    const { startX, startY } = dragRef.current;
    setCropRect({
      x: Math.min(startX, x),
      y: Math.min(startY, y),
      w: Math.abs(x - startX),
      h: Math.abs(y - startY),
    });
  };
  const onSourceMouseUp = async () => {
    if (!dragRef.current || !cropRect) { dragRef.current = null; return; }
    dragRef.current = null;
    if (cropRect.w < 8 || cropRect.h < 8) { setCropRect(null); return; }
    if (!sourceWrapRef.current) { setCropRect(null); return; }
    // Convert container pixel rect → fractions of the displayed image.
    const bounds = sourceWrapRef.current.getBoundingClientRect();
    const fracs = {
      x: cropRect.x / bounds.width,
      y: cropRect.y / bounds.height,
      w: cropRect.w / bounds.width,
      h: cropRect.h / bounds.height,
    };
    // Clamp to [0,1] in case of off-by-one drag past the edge.
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const safe = { x: clamp(fracs.x), y: clamp(fracs.y), w: clamp(fracs.w), h: clamp(fracs.h) };
    setCropRect(null);
    await runCrop(safe);
  };

  const runCrop = async (cropBounds) => {
    if (!notice?.id || !activeRunDate || !activePage) return;
    if (!activeEdition) {
      setError("No edition uploaded for this run date — cannot crop.");
      return;
    }
    setError(null);
    setBusy("freezing");
    try {
      let frozenUrl = activeFrozenUrl;
      if (!frozenUrl) {
        frozenUrl = await freezeSourcePage(notice.id, activeEdition, activePage, activeRunDate);
        setFrozenByPage((prev) => new Map(prev).set(`${activeRunDate}-p${activePage}`, frozenUrl));
      }
      setBusy("cropping");
      const upload = await cropAndUploadClip({
        noticeId: notice.id,
        sourceUrl: frozenUrl,
        cropBounds,
      });
      // Insert DB row — unplaced (canvas_x/y null) until user drops it.
      const order = clips.length;
      const inserted = await insertClipping({
        legal_notice_id: notice.id,
        run_date: activeRunDate,
        edition_id: activeEdition.id,
        source_page_number: activePage,
        source_frozen_url: frozenUrl,
        cropBounds,
        clipping_cdn_url: upload.cdn_url,
        clip_order: order,
        created_by: currentUser?.id || null,
      });
      setClips((prev) => [...prev, inserted]);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy("idle");
    }
  };

  // ── Place a clip on the active canvas page ──────────────────
  const placeOnCanvas = async (clip) => {
    const newPos = {
      canvas_page: activeCanvasPage,
      canvas_x: 0,
      canvas_y: nextDropY(activeCanvasPage),
      canvas_w: DEFAULT_CLIP_W,
    };
    setClips((prev) => prev.map((c) => c.id === clip.id ? { ...c, ...newPos } : c));
    try {
      await updateClippingPlacement(clip.id, newPos);
    } catch (e) {
      setError(e.message);
    }
  };

  // Stack clips vertically on the page so they don't all overlap at 0,0.
  const nextDropY = (page) => {
    const onPage = clips.filter((c) => Number(c.canvas_page) === page && c.canvas_y != null);
    if (!onPage.length) return 0;
    const bottom = Math.max(...onPage.map((c) => Number(c.canvas_y) + Math.max(120, Number(c.canvas_w) * 0.7)));
    return Math.min(bottom + 8, PAGE_H - 200);
  };

  // ── Drag clip within canvas (in print-pixel coords) ─────────
  const canvasDrag = useRef(null);
  const onClipMouseDown = (e, clip) => {
    e.preventDefault();
    canvasDrag.current = {
      id: clip.id,
      startMx: e.clientX,
      startMy: e.clientY,
      startX: Number(clip.canvas_x) || 0,
      startY: Number(clip.canvas_y) || 0,
    };
    window.addEventListener("mousemove", onClipMouseMove);
    window.addEventListener("mouseup", onClipMouseUp);
  };
  const onClipMouseMove = useCallback((e) => {
    const drag = canvasDrag.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startMx) / CANVAS_VIEW_SCALE;
    const dy = (e.clientY - drag.startMy) / CANVAS_VIEW_SCALE;
    setClips((prev) => prev.map((c) => c.id === drag.id ? { ...c, canvas_x: drag.startX + dx, canvas_y: drag.startY + dy } : c));
  }, []);
  const onClipMouseUp = useCallback(async () => {
    const drag = canvasDrag.current;
    canvasDrag.current = null;
    window.removeEventListener("mousemove", onClipMouseMove);
    window.removeEventListener("mouseup", onClipMouseUp);
    if (!drag) return;
    const updated = clips.find((c) => c.id === drag.id);
    if (updated) {
      try {
        await updateClippingPlacement(drag.id, {
          canvas_x: Math.round(Number(updated.canvas_x) * 100) / 100,
          canvas_y: Math.round(Number(updated.canvas_y) * 100) / 100,
        });
      } catch (e) { setError(e.message); }
    }
  }, [clips, onClipMouseMove]);

  // Resize via slider (proportional — height derives from aspect ratio).
  const setClipWidth = async (clip, newW) => {
    setClips((prev) => prev.map((c) => c.id === clip.id ? { ...c, canvas_w: newW } : c));
    try { await updateClippingPlacement(clip.id, { canvas_w: newW }); } catch (e) { setError(e.message); }
  };

  // Remove from canvas (clears placement, keeps clip in tray).
  const unplace = async (clip) => {
    setClips((prev) => prev.map((c) => c.id === clip.id ? { ...c, canvas_x: null, canvas_y: null, canvas_w: null } : c));
    try { await updateClippingPlacement(clip.id, { canvas_x: null, canvas_y: null, canvas_w: null }); } catch (e) { setError(e.message); }
  };

  const removeClip = async (clip) => {
    if (!window.confirm("Delete this clip from the affidavit?")) return;
    try {
      await deleteClipping(clip.id);
      setClips((prev) => prev.filter((c) => c.id !== clip.id));
    } catch (e) { setError(e.message); }
  };

  // ── Save Draft & Lock ───────────────────────────────────────
  const saveDraft = async () => {
    if (!notice?.id) return;
    setBusy("saving");
    setError(null);
    try {
      await supabase.from("legal_notices").update({
        status: "affidavit_draft",
        affidavit_status: "draft",
        affidavit_page_count: canvasPageCount,
      }).eq("id", notice.id);
      onStatusChange?.("affidavit_draft");
    } catch (e) { setError(e.message); }
    finally { setBusy("idle"); }
  };

  const lockAffidavit = async () => {
    if (!notice?.id) return;
    setBusy("locking");
    setError(null);
    setProgress({ stage: "starting" });
    try {
      const els = [];
      for (let i = 1; i <= canvasPageCount; i++) {
        const el = pageRefs.current.get(i);
        if (el) els.push(el);
      }
      if (!els.length) throw new Error("No pages to rasterize");
      const pdfBytes = await rasterizePagesToPdf(els, { onProgress: setProgress });
      setProgress({ stage: "uploading" });
      const url = await uploadAffidavitPdf(notice.id, notice.notice_number || notice.id, pdfBytes);
      setProgress({ stage: "saving" });
      await supabase.from("legal_notices").update({
        status: "affidavit_ready",
        affidavit_status: "ready",
        affidavit_pdf_url: url,
        affidavit_locked_at: new Date().toISOString(),
        affidavit_page_count: canvasPageCount,
      }).eq("id", notice.id);
      onStatusChange?.("affidavit_ready");
      setProgress(null);
    } catch (e) {
      setError(String(e?.message || e));
      setProgress(null);
    } finally {
      setBusy("idle");
    }
  };

  // Pre-compute clipsByPage for the AffidavitTemplate.
  const clipsByPage = useMemo(() => {
    const m = new Map();
    clips.forEach((c) => {
      if (c.canvas_x == null || c.canvas_y == null) return;
      const pg = Number(c.canvas_page) || 1;
      if (!m.has(pg)) m.set(pg, []);
      m.get(pg).push(c);
    });
    return m;
  }, [clips]);

  const sourceImageUrl = activeFrozenUrl || (activeEdition ? editionPageImageUrl(activeEdition, activePage) : null);
  const pageOptions = activeEdition ? Array.from({ length: activeEdition.page_count || 0 }, (_, i) => i + 1) : [];

  // Tray clips = clips not yet placed on canvas, OR all clips (so the
  // user can re-place an unplaced one). Spec wants every clip in the
  // tray; placed ones get a checkmark.
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: `1px solid ${Z.bd}`, background: Z.sf }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: Z.tm, cursor: "pointer", fontSize: 13 }}>← Back</button>
        <div style={{ fontWeight: 800, fontSize: 14, color: Z.tx }}>
          Affidavit · {notice?.notice_number || notice?.id?.slice(0, 8)}
        </div>
        <div style={{ color: Z.tm, fontSize: 12 }}>
          {notice?.title}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {error && <span style={{ color: Z.da, fontSize: 11 }}>{error}</span>}
          {progress && <span style={{ color: Z.tm, fontSize: 11 }}>
            {progress.stage === "rendering" ? `Rendering page ${progress.page}/${progress.total}…` :
             progress.stage === "uploading" ? "Uploading PDF…" :
             progress.stage === "saving" ? "Saving…" :
             progress.stage === "starting" ? "Preparing…" : ""}
          </span>}
          <select value={activeRunDate || ""} onChange={(e) => { setActiveRunDate(e.target.value); setActivePage(1); }} style={selStyle}>
            {runDates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={activePage} onChange={(e) => setActivePage(Number(e.target.value))} disabled={!pageOptions.length} style={selStyle}>
            {!pageOptions.length && <option>—</option>}
            {pageOptions.map(p => <option key={p} value={p}>p.{p}</option>)}
          </select>
          <Btn sm v="secondary" onClick={saveDraft} disabled={busy !== "idle"}>{busy === "saving" ? "Saving…" : "Save Draft"}</Btn>
          <Btn sm onClick={lockAffidavit} disabled={busy !== "idle" || !clips.some(c => c.canvas_x != null)}>
            {busy === "locking" ? "Locking…" : "Lock Affidavit →"}
          </Btn>
        </div>
      </div>

      {/* Three panes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 1fr", gap: 0, flex: 1, minHeight: 0 }}>
        {/* PAGE SOURCE */}
        <div style={{ borderRight: `1px solid ${Z.bd}`, padding: 8, overflow: "auto", background: Z.bg }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: Z.tm, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontFamily: COND }}>
            Page Source — {activeRunDate || "—"} · p.{activePage}
          </div>
          {!sourceImageUrl ? (
            <div style={{ padding: 30, textAlign: "center", color: Z.td, fontSize: 12, border: `1px dashed ${Z.bd}`, borderRadius: Ri }}>
              {!activeEdition ? "No edition uploaded for this run date." : "No source image available."}
            </div>
          ) : (
            <div
              ref={sourceWrapRef}
              onMouseDown={onSourceMouseDown}
              onMouseMove={onSourceMouseMove}
              onMouseUp={onSourceMouseUp}
              style={{ position: "relative", display: "inline-block", cursor: "crosshair", userSelect: "none", width: "100%" }}
            >
              <img src={sourceImageUrl} crossOrigin="anonymous" alt="" style={{ width: "100%", display: "block", pointerEvents: "none" }} />
              {cropRect && (
                <div style={{
                  position: "absolute",
                  left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h,
                  border: `2px solid ${Z.ac}`, background: "rgba(75,139,245,0.15)",
                }} />
              )}
              {(busy === "freezing" || busy === "cropping") && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700 }}>
                  {busy === "freezing" ? "Caching source page…" : "Cropping…"}
                </div>
              )}
            </div>
          )}
        </div>

        {/* CLIPS TRAY */}
        <div style={{ borderRight: `1px solid ${Z.bd}`, padding: 8, overflow: "auto", background: Z.sf }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: Z.tm, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontFamily: COND }}>
            Clips ({clips.length})
          </div>
          {clips.length === 0 && (
            <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: 11, border: `1px dashed ${Z.bd}`, borderRadius: Ri, fontFamily: COND }}>
              Drag a crop on the source pane to add a clip.
            </div>
          )}
          {clips.map((c, i) => {
            const placed = c.canvas_x != null;
            return (
              <div key={c.id} style={{ marginBottom: 6, padding: 4, border: `1px solid ${placed ? Z.su : Z.bd}`, borderRadius: Ri, background: Z.bg }}>
                <img src={c.clipping_cdn_url} alt="" crossOrigin="anonymous" style={{ width: "100%", display: "block", borderRadius: 2 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 10, color: Z.tm }}>
                  <span style={{ fontWeight: 700, color: Z.tx }}>Clip {i + 1}</span>
                  <span style={{ flex: 1 }}>p.{c.source_page_number}</span>
                  {placed
                    ? <button onClick={() => unplace(c)} title="Remove from canvas" style={btnLink(Z.wa)}>↺</button>
                    : <button onClick={() => placeOnCanvas(c)} title={`Place on page ${activeCanvasPage}`} style={btnLink(Z.ac)}>+</button>
                  }
                  <button onClick={() => removeClip(c)} title="Delete clip" style={btnLink(Z.da)}>×</button>
                </div>
                {placed && (
                  <input
                    type="range" min={120} max={720} step={4}
                    value={Number(c.canvas_w) || DEFAULT_CLIP_W}
                    onChange={(e) => setClipWidth(c, Number(e.target.value))}
                    onMouseUp={(e) => updateClippingPlacement(c.id, { canvas_w: Number(e.target.value) }).catch(() => {})}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* AFFIDAVIT CANVAS */}
        <div style={{ padding: 8, overflow: "auto", background: Z.sa, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: Z.tm, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: COND }}>
              Canvas
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              {Array.from({ length: canvasPageCount }, (_, i) => i + 1).map(pn => (
                <button key={pn} onClick={() => setActiveCanvasPage(pn)} style={{
                  padding: "2px 8px", borderRadius: 10,
                  border: `1px solid ${activeCanvasPage === pn ? Z.ac : Z.bd}`,
                  background: activeCanvasPage === pn ? Z.ac : "transparent",
                  color: activeCanvasPage === pn ? "#fff" : Z.tm,
                  fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: COND,
                }}>p.{pn}</button>
              ))}
              <button
                onClick={() => { setCanvasPageCount((n) => n + 1); setActiveCanvasPage(canvasPageCount + 1); }}
                style={{ padding: "2px 8px", borderRadius: 10, border: `1px dashed ${Z.bd}`, background: "transparent", color: Z.tm, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: COND }}
              >+ Page</button>
            </div>
          </div>

          {/* Render the template at internal 1:1 scale, visually shrunk
              so it fits the pane. Drag handlers inside override
              CANVAS_VIEW_SCALE in math so movement matches the cursor. */}
          <div style={{ transform: `scale(${CANVAS_VIEW_SCALE})`, transformOrigin: "top left", width: PAGE_W, position: "relative" }}>
            <AffidavitTemplate
              notice={notice}
              publication={publication}
              signatureUrl={currentUser?.signature_url || currentUser?.signatureUrl}
              clipsByPage={clipsByPage}
              pageCount={canvasPageCount}
              registerPageRef={registerPageRef}
              onClipMouseDown={onClipMouseDown}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const selStyle = { padding: "4px 6px", borderRadius: 4, border: `1px solid var(--bd, #ddd)`, background: "transparent", color: "inherit", fontSize: 12 };
const btnLink = (color) => ({ background: "none", border: "none", color, cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1 });
