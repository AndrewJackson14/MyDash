// ============================================================
// EditionManager.jsx — Upload & manage print editions (PDF)
// Stores in issuu_editions, uploads to BunnyCDN, auto-generates covers
// Client-side PDF compression via pdf.js re-render + jsPDF assembly
// ============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri } from "../lib/theme";
import { Ic, Btn, Inp, Sel, Modal, PageHeader, GlassCard, DataTable, SB, Badge, FilterBar } from "../components/ui";
import { supabase, isOnline } from "../lib/supabase";

// ── Config ───────────────────────────────────────────────────
const CDN_BASE = "https://cdn.13stars.media";
const PROXY_URL = "https://hqywacyhpllapdwccmaw.supabase.co/functions/v1/bunny-storage";

// Publication ID → CDN folder slug
const PUB_SLUG_MAP = {
  "pub-paso-robles-press": "paso-robles-press",
  "pub-atascadero-news": "atascadero-news",
  "pub-paso-robles-magazine": "paso-robles-magazine",
  "pub-atascadero-news-maga": "atascadero-news-magazine",
  "pub-morro-bay-life": "morro-bay-life",
  "pub-santa-ynez-valley-st": "santa-ynez-valley-star",
  "pub-the-malibu-times": "malibu-times",
};

// ── Compression presets ─────────────────────────────────────
const COMPRESSION_PRESETS = {
  none:       { label: "None (Original)",  dpi: 0,   quality: 0,    targetMB: 0,  desc: "Upload the original PDF without compression" },
  light:      { label: "Light",            dpi: 200, quality: 0.85, targetMB: 30, desc: "Minimal quality loss, good for archival" },
  medium:     { label: "Medium",           dpi: 150, quality: 0.72, targetMB: 15, desc: "Good balance of quality and file size" },
  aggressive: { label: "Aggressive",       dpi: 120, quality: 0.55, targetMB: 8,  desc: "Maximum compression, some quality loss" },
  custom:     { label: "Custom",           dpi: 150, quality: 0.75, targetMB: 0,  desc: "Set your own DPI, quality, and target size" },
};

// ── Helpers ──────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtSize = (bytes) => {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
};

const slugFromDate = (dateStr, pubSlug) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const datePart = `${months[d.getMonth()]}-${d.getDate()}-${d.getFullYear()}`;
  return pubSlug ? `${pubSlug}-${datePart}` : datePart;
};

const titleFromPubAndDate = (pubName, dateStr) => {
  if (!dateStr || !pubName) return "";
  const d = new Date(dateStr + "T12:00:00");
  return `${pubName} — ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
};

const today = () => new Date().toISOString().slice(0, 10);

// ── BunnyCDN upload with XHR for progress ────────────────────
function bunnyUploadWithProgress(file, path, filename, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", PROXY_URL, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-action", "upload");
    xhr.setRequestHeader("x-path", path);
    xhr.setRequestHeader("x-filename", filename);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
      } else {
        try { const err = JSON.parse(xhr.responseText); reject(new Error(err.error || "Upload failed")); }
        catch { reject(new Error("Upload failed: " + xhr.status)); }
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.send(file);
  });
}

// ── Initialize pdf.js ────────────────────────────────────────
async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  return pdfjsLib;
}

// ── Render PDF page 1 from File → cover JPEG + page count ───
async function renderPdfCoverFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const scale = 1.5;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve({ blob, numPages: pdf.numPages }), "image/jpeg", 0.85);
  });
}

// ══════════════════════════════════════════════════════════════
// PDF COMPRESSION ENGINE
// Re-renders each page via pdf.js → canvas → JPEG, then
// assembles a new PDF with jsPDF. Supports DPI, JPEG quality,
// and optional target file size (iterative quality reduction).
// ══════════════════════════════════════════════════════════════
async function compressPdf(file, { dpi = 150, quality = 0.75, targetMB = 0, onProgress }) {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const numPages = pdf.numPages;
  const { jsPDF } = await import("jspdf");

  // Render all pages to JPEG blobs at the given DPI & quality
  const renderPages = async (q) => {
    const pages = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      // pdf.js default is 72 DPI at scale=1; scale = targetDPI / 72
      const scale = dpi / 72;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Get page dimensions in points (1/72 inch) for the output PDF
      const origViewport = page.getViewport({ scale: 1 });
      const widthPt = origViewport.width;
      const heightPt = origViewport.height;

      const dataUrl = canvas.toDataURL("image/jpeg", q);
      pages.push({ dataUrl, widthPt, heightPt });

      // Clean up canvas memory
      canvas.width = 1;
      canvas.height = 1;

      if (onProgress) onProgress({ phase: "render", page: i, total: numPages, quality: q });
    }
    return pages;
  };

  // Assemble pages into a new PDF with jsPDF
  const assemblePdf = (pages) => {
    const first = pages[0];
    // jsPDF uses mm; 1 pt = 0.352778 mm
    const ptToMm = 0.352778;
    const doc = new jsPDF({
      orientation: first.widthPt > first.heightPt ? "landscape" : "portrait",
      unit: "mm",
      format: [first.widthPt * ptToMm, first.heightPt * ptToMm],
    });

    pages.forEach((pg, i) => {
      if (i > 0) {
        doc.addPage([pg.widthPt * ptToMm, pg.heightPt * ptToMm],
          pg.widthPt > pg.heightPt ? "landscape" : "portrait");
      }
      doc.addImage(pg.dataUrl, "JPEG", 0, 0, pg.widthPt * ptToMm, pg.heightPt * ptToMm);
    });

    return doc.output("blob");
  };

  // First pass at requested quality
  if (onProgress) onProgress({ phase: "start", total: numPages });
  let pages = await renderPages(quality);
  if (onProgress) onProgress({ phase: "assemble" });
  let blob = assemblePdf(pages);

  // If target size is set and we're over it, iteratively reduce quality
  if (targetMB > 0) {
    const targetBytes = targetMB * 1048576;
    let currentQuality = quality;
    let attempts = 0;
    const maxAttempts = 4;

    while (blob.size > targetBytes && currentQuality > 0.25 && attempts < maxAttempts) {
      attempts++;
      // Reduce quality proportionally to overshoot
      const ratio = targetBytes / blob.size;
      currentQuality = Math.max(0.25, currentQuality * Math.sqrt(ratio));
      if (onProgress) onProgress({ phase: "retry", attempt: attempts, quality: currentQuality, currentSize: blob.size, targetSize: targetBytes });
      pages = await renderPages(currentQuality);
      blob = assemblePdf(pages);
    }
  }

  if (onProgress) onProgress({ phase: "done", finalSize: blob.size, originalSize: file.size });
  return { blob, numPages };
}

// ══════════════════════════════════════════════════════════════
// EDITION MANAGER PAGE
// ══════════════════════════════════════════════════════════════
const EditionManager = ({ pubs, editions, setEditions }) => {
  const [search, setSearch] = useState("");
  const [pubFilter, setPubFilter] = useState("all");
  const [modal, setModal] = useState(false);
  const [editEdition, setEditEdition] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ── Filter & sort ────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = editions || [];
    if (pubFilter !== "all") list = list.filter(e => e.publicationId === pubFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(e => (e.title || "").toLowerCase().includes(s) || (e.slug || "").toLowerCase().includes(s));
    }
    return [...list].sort((a, b) => (b.publishDate || "").localeCompare(a.publishDate || ""));
  }, [editions, pubFilter, search]);

  const pubName = (id) => pubs.find(p => p.id === id)?.name || id;

  // ── Open modal ───────────────────────────────────────────
  const openNew = () => { setEditEdition(null); setModal(true); };
  const openEdit = (ed) => { setEditEdition(ed); setModal(true); };

  // ── Toggle featured ──────────────────────────────────────
  const toggleFeatured = async (ed) => {
    if (!supabase) return;
    const newVal = !ed.isFeatured;
    if (newVal) {
      await supabase.from("issuu_editions").update({ is_featured: false }).eq("publication_id", ed.publicationId);
      setEditions(prev => prev.map(e => e.publicationId === ed.publicationId ? { ...e, isFeatured: false } : e));
    }
    await supabase.from("issuu_editions").update({ is_featured: newVal }).eq("id", ed.id);
    setEditions(prev => prev.map(e => e.id === ed.id ? { ...e, isFeatured: newVal } : e));
  };

  // ── Delete ───────────────────────────────────────────────
  const handleDelete = async (ed) => {
    if (!supabase) return;
    await supabase.from("issuu_editions").delete().eq("id", ed.id);
    setEditions(prev => prev.filter(e => e.id !== ed.id));
    setDeleteConfirm(null);
  };

  // ── Save callback from modal ─────────────────────────────
  const handleSave = (savedEdition) => {
    if (editEdition) {
      setEditions(prev => prev.map(e => e.id === savedEdition.id ? savedEdition : e));
    } else {
      setEditions(prev => [savedEdition, ...prev]);
    }
    setModal(false);
  };

  // ── Pub filter options ───────────────────────────────────
  const pubOptions = useMemo(() => [
    { value: "all", label: "All Publications" },
    ...pubs.map(p => ({ value: p.id, label: p.name })),
  ], [pubs]);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Editions" count={filtered.length}>
      <SB value={search} onChange={setSearch} placeholder="Search editions..." />
      <Sel value={pubFilter} onChange={e => setPubFilter(e.target.value)} options={pubOptions} />
      <Btn sm onClick={openNew}><Ic.plus size={13} /> Upload New Edition</Btn>
    </PageHeader>

    {filtered.length === 0 && (
      <GlassCard>
        <div style={{ textAlign: "center", padding: 40, color: Z.tm }}>
          <div style={{ fontSize: FS.lg, fontWeight: FW.bold, marginBottom: 8 }}>No editions yet</div>
          <div style={{ fontSize: FS.base }}>Upload your first PDF edition to get started.</div>
        </div>
      </GlassCard>
    )}

    {filtered.length > 0 && (
      <DataTable>
        <thead>
          <tr>
            {["", "Title", "Publication", "Date", "Pages", "Status", ""].map(h =>
              <th key={h}>{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {filtered.map(ed => (
            <tr key={ed.id} onClick={() => openEdit(ed)} style={{ cursor: "pointer" }}>
              <td style={{ width: 56, padding: "6px 10px" }}>
                {ed.coverImageUrl ? (
                  <img src={ed.coverImageUrl} alt="" style={{ width: 40, height: 52, objectFit: "cover", borderRadius: Ri, border: `1px solid ${Z.bd}` }} />
                ) : (
                  <div style={{ width: 40, height: 52, background: Z.sa, borderRadius: Ri, border: `1px solid ${Z.bd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ic.story size={16} color={Z.td} />
                  </div>
                )}
              </td>
              <td style={{ fontWeight: FW.semi }}>{ed.title || "Untitled"}</td>
              <td style={{ color: Z.tm, fontSize: FS.sm }}>{pubName(ed.publicationId)}</td>
              <td style={{ fontFamily: COND, fontSize: FS.sm }}>{fmtDate(ed.publishDate)}</td>
              <td style={{ fontFamily: COND, fontSize: FS.sm }}>{ed.pageCount || "—"}</td>
              <td>
                {ed.isFeatured && <span style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: Ri,
                  background: Z.go + "22", color: Z.go, fontSize: FS.xs, fontWeight: FW.bold,
                  fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5,
                }}>Featured</span>}
              </td>
              <td style={{ whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", gap: 4 }}>
                  <Btn sm v={ed.isFeatured ? "warning" : "ghost"} onClick={() => toggleFeatured(ed)}>
                    {ed.isFeatured ? "Unfeature" : "Feature"}
                  </Btn>
                  <Btn sm v="danger" onClick={() => setDeleteConfirm(ed)}>Delete</Btn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    )}

    {/* Upload / Edit Modal */}
    {modal && (
      <EditionModal
        open={modal}
        onClose={() => setModal(false)}
        edition={editEdition}
        pubs={pubs}
        editions={editions}
        onSave={handleSave}
      />
    )}

    {/* Delete Confirmation */}
    <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Edition" width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: FS.base, color: Z.tm, lineHeight: 1.6 }}>
          Are you sure you want to delete <b style={{ color: Z.tx }}>{deleteConfirm?.title}</b>? This will remove the edition record but the PDF and cover image will remain on the CDN.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" sm onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
          <Btn v="danger" sm onClick={() => handleDelete(deleteConfirm)}>Delete Edition</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};

// ══════════════════════════════════════════════════════════════
// COMPRESSION SETTINGS PANEL
// ══════════════════════════════════════════════════════════════
const CompressionSettings = ({ preset, setPreset, dpi, setDpi, quality, setQuality, targetMB, setTargetMB, originalSize }) => {
  const presetKeys = Object.keys(COMPRESSION_PRESETS);

  const handlePresetChange = (key) => {
    setPreset(key);
    if (key !== "custom" && key !== "none") {
      const p = COMPRESSION_PRESETS[key];
      setDpi(p.dpi);
      setQuality(p.quality);
      setTargetMB(p.targetMB);
    }
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, background: Z.sa, borderRadius: R, border: `1px solid ${Z.bd}` }}>
    <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>
      PDF Compression
    </div>

    {/* Preset buttons */}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {presetKeys.map(key => {
        const p = COMPRESSION_PRESETS[key];
        const active = preset === key;
        return <button key={key} onClick={() => handlePresetChange(key)} style={{
          padding: "5px 12px", borderRadius: Ri, border: `1px solid ${active ? Z.ac : Z.bd}`,
          background: active ? Z.ac + "22" : "transparent", color: active ? Z.ac : Z.tm,
          fontSize: FS.sm, fontWeight: active ? FW.bold : FW.medium, fontFamily: COND,
          cursor: "pointer", transition: "all 0.15s",
        }}>{p.label}</button>;
      })}
    </div>

    {/* Description */}
    <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
      {COMPRESSION_PRESETS[preset].desc}
    </div>

    {/* Custom controls */}
    {preset === "custom" && (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        {/* DPI slider */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>DPI (Resolution)</span>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{dpi}</span>
          </div>
          <input type="range" min={72} max={300} step={1} value={dpi} onChange={e => setDpi(Number(e.target.value))}
            style={{ width: "100%", accentColor: Z.ac }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.micro, color: Z.td, fontFamily: COND }}>
            <span>72 (small)</span><span>150 (web)</span><span>300 (print)</span>
          </div>
        </div>

        {/* Quality slider */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>JPEG Quality</span>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{Math.round(quality * 100)}%</span>
          </div>
          <input type="range" min={25} max={95} step={1} value={Math.round(quality * 100)} onChange={e => setQuality(Number(e.target.value) / 100)}
            style={{ width: "100%", accentColor: Z.ac }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.micro, color: Z.td, fontFamily: COND }}>
            <span>25% (aggressive)</span><span>60%</span><span>95% (near-lossless)</span>
          </div>
        </div>

        {/* Target size */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>Target Size (MB)</span>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
              {targetMB > 0 ? `${targetMB} MB` : "No limit"}
            </span>
          </div>
          <input type="range" min={0} max={80} step={1} value={targetMB} onChange={e => setTargetMB(Number(e.target.value))}
            style={{ width: "100%", accentColor: Z.ac }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.micro, color: Z.td, fontFamily: COND }}>
            <span>No limit</span><span>40 MB</span><span>80 MB</span>
          </div>
        </div>
      </div>
    )}

    {/* Size estimate for non-none presets */}
    {preset !== "none" && originalSize > 0 && (
      <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, borderTop: `1px solid ${Z.bd}`, paddingTop: 8 }}>
        Original: <b style={{ color: Z.tx }}>{fmtSize(originalSize)}</b>
        {COMPRESSION_PRESETS[preset].targetMB > 0 && preset !== "custom" && (
          <span> → Target: <b style={{ color: Z.go }}>{COMPRESSION_PRESETS[preset].targetMB} MB</b></span>
        )}
        {preset === "custom" && targetMB > 0 && (
          <span> → Target: <b style={{ color: Z.go }}>{targetMB} MB</b></span>
        )}
      </div>
    )}
  </div>;
};

// ══════════════════════════════════════════════════════════════
// EDITION UPLOAD / EDIT MODAL
// ══════════════════════════════════════════════════════════════
const EditionModal = ({ open, onClose, edition, pubs, editions, onSave }) => {
  const isEdit = !!edition;
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // Form state
  const [pubId, setPubId] = useState(edition?.publicationId || pubs[0]?.id || "");
  const [title, setTitle] = useState(edition?.title || "");
  const [slug, setSlug] = useState(edition?.slug || "");
  const [publishDate, setPublishDate] = useState(edition?.publishDate || today());
  const [isFeatured, setIsFeatured] = useState(edition?.isFeatured || false);
  const [pageCount, setPageCount] = useState(edition?.pageCount || 0);
  const [pdfUrl, setPdfUrl] = useState(edition?.pdfUrl || "");
  const [coverImageUrl, setCoverImageUrl] = useState(edition?.coverImageUrl || "");
  const [embedUrl] = useState(edition?.embedUrl || "");

  // Upload & compression state
  const [step, setStep] = useState(isEdit ? "metadata" : "upload");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [coverProgress, setCoverProgress] = useState("");
  const [compressionStatus, setCompressionStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedSize, setCompressedSize] = useState(0);

  // Compression settings
  const [compPreset, setCompPreset] = useState("medium");
  const [compDpi, setCompDpi] = useState(150);
  const [compQuality, setCompQuality] = useState(0.72);
  const [compTargetMB, setCompTargetMB] = useState(15);

  const pubSlug = PUB_SLUG_MAP[pubId] || pubId.replace(/^pub-/, "");

  // Auto-generate title and slug when pubId or date changes
  useEffect(() => {
    if (isEdit) return;
    const pub = pubs.find(p => p.id === pubId);
    if (pub && publishDate) {
      setTitle(titleFromPubAndDate(pub.name, publishDate));
      setSlug(slugFromDate(publishDate, pubSlug));
    }
  }, [pubId, publishDate, isEdit, pubs, pubSlug]);

  // ── Handle file selected (shows compression step) ────────
  const handleFileSelected = (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file.");
      return;
    }
    setError("");
    setPdfFile(file);
    setOriginalSize(file.size);
    setStep("compress");
  };

  // ── Process & upload (compress if needed, then upload) ────
  const processAndUpload = async () => {
    if (!pdfFile) return;
    setError("");
    setStep("processing");
    setUploadProgress(0);
    setCompressionStatus("");

    try {
      let fileToUpload = pdfFile;
      let detectedPages = 0;

      // Ensure unique slug
      let finalSlug = slug || slugFromDate(publishDate, pubSlug);
      const existing = editions.filter(e => e.publicationId === pubId && e.slug === finalSlug && e.id !== edition?.id);
      if (existing.length > 0) finalSlug = finalSlug + "-" + Date.now().toString(36);
      setSlug(finalSlug);

      // Compress if not "none"
      if (compPreset !== "none") {
        setCompressionStatus("Compressing PDF...");
        const { blob, numPages } = await compressPdf(pdfFile, {
          dpi: compDpi,
          quality: compQuality,
          targetMB: compTargetMB,
          onProgress: (p) => {
            if (p.phase === "render") {
              setCompressionStatus(`Compressing page ${p.page} of ${p.total}...`);
            } else if (p.phase === "assemble") {
              setCompressionStatus("Assembling compressed PDF...");
            } else if (p.phase === "retry") {
              setCompressionStatus(`Reducing quality to ${Math.round(p.quality * 100)}% (${fmtSize(p.currentSize)} → ${fmtSize(p.targetSize)})...`);
            } else if (p.phase === "done") {
              setCompressedSize(p.finalSize);
            }
          },
        });
        detectedPages = numPages;
        setPageCount(numPages);
        fileToUpload = new File([blob], pdfFile.name, { type: "application/pdf" });
        setCompressionStatus(`Compressed: ${fmtSize(pdfFile.size)} → ${fmtSize(blob.size)} (${Math.round((1 - blob.size / pdfFile.size) * 100)}% reduction)`);
      } else {
        // No compression — just detect page count
        setCompressionStatus("Reading PDF...");
        const pdfjsLib = await getPdfjs();
        const ab = await pdfFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        detectedPages = pdf.numPages;
        setPageCount(pdf.numPages);
        setCompressedSize(pdfFile.size);
        setCompressionStatus("");
      }

      // Upload PDF
      setCompressionStatus(prev => prev ? prev + " Uploading..." : "Uploading PDF...");
      const path = `${pubSlug}/editions`;
      const pdfFilename = `${finalSlug}.pdf`;

      await bunnyUploadWithProgress(fileToUpload, path, pdfFilename, setUploadProgress);
      const cdnUrl = `${CDN_BASE}/${path}/${pdfFilename}`;
      setPdfUrl(cdnUrl);
      setUploadProgress(100);

      // Auto-generate cover from original file (higher quality)
      setCompressionStatus("Generating cover from page 1...");
      const { blob: coverBlob } = await renderPdfCoverFromFile(pdfFile);

      setCompressionStatus("Uploading cover image...");
      const coverFilename = `${finalSlug}-cover.jpg`;
      await bunnyUploadWithProgress(
        new File([coverBlob], coverFilename, { type: "image/jpeg" }),
        path, coverFilename, () => {}
      );
      setCoverImageUrl(`${CDN_BASE}/${path}/${coverFilename}`);
      setCompressionStatus("");

      setStep("metadata");
    } catch (err) {
      setError(err.message || "Processing failed");
      setStep("compress");
    }
  };

  // ── Drag & drop handlers ─────────────────────────────────
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFileSelected(e.dataTransfer.files[0]); };

  // ── Manual cover override ────────────────────────────────
  const handleCoverOverride = async (file) => {
    if (!file) return;
    setCoverProgress("Uploading custom cover...");
    try {
      const path = `${pubSlug}/editions`;
      const coverFilename = `${slug || "cover"}-cover.jpg`;
      await bunnyUploadWithProgress(file, path, coverFilename, () => {});
      setCoverImageUrl(`${CDN_BASE}/${path}/${coverFilename}`);
      setCoverProgress("");
    } catch (err) {
      setCoverProgress("");
      setError("Cover upload failed: " + err.message);
    }
  };

  // ── Save ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!pubId || !title || !slug) { setError("Publication, title, and slug are required."); return; }
    if (!pdfUrl && !isEdit) { setError("Please upload a PDF first."); return; }
    setSaving(true);
    setError("");

    try {
      if (isFeatured) {
        await supabase.from("issuu_editions").update({ is_featured: false }).eq("publication_id", pubId).neq("id", edition?.id || "");
      }

      const row = {
        publication_id: pubId,
        title,
        slug,
        pdf_url: pdfUrl,
        cover_image_url: coverImageUrl,
        publish_date: publishDate,
        page_count: pageCount,
        embed_url: embedUrl || null,
        is_featured: isFeatured,
      };

      let savedRow;
      if (isEdit) {
        const { data, error: err } = await supabase.from("issuu_editions").update(row).eq("id", edition.id).select().single();
        if (err) throw err;
        savedRow = data;
      } else {
        const { data, error: err } = await supabase.from("issuu_editions").insert(row).select().single();
        if (err) throw err;
        savedRow = data;
      }

      onSave({
        id: savedRow.id,
        publicationId: savedRow.publication_id,
        title: savedRow.title,
        slug: savedRow.slug,
        pdfUrl: savedRow.pdf_url,
        coverImageUrl: savedRow.cover_image_url,
        publishDate: savedRow.publish_date,
        pageCount: savedRow.page_count,
        embedUrl: savedRow.embed_url,
        isFeatured: savedRow.is_featured,
      });
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const pubOptions = pubs.map(p => ({ value: p.id, label: p.name }));

  return <Modal open={open} onClose={onClose} title={isEdit ? "Edit Edition" : "Upload New Edition"} width={620}>
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Step 1: Select PDF */}
      {step === "upload" && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? Z.ac : Z.bd}`,
            borderRadius: R,
            padding: 40,
            textAlign: "center",
            cursor: "pointer",
            background: dragOver ? Z.ac + "11" : Z.sa,
            transition: "all 0.2s",
          }}
        >
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
            onChange={(e) => { if (e.target.files[0]) handleFileSelected(e.target.files[0]); }} />
          <Ic.up size={32} color={Z.tm} />
          <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx, marginTop: 12, fontFamily: DISPLAY }}>
            Drop PDF here or click to browse
          </div>
          <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 6 }}>
            Supports PDF files up to 100MB
          </div>
        </div>
      )}

      {/* Step 2: Compression settings */}
      {step === "compress" && pdfFile && (<>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: Z.sa, borderRadius: R, border: `1px solid ${Z.bd}` }}>
          <Ic.story size={20} color={Z.ac} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.tx }}>{pdfFile.name}</div>
            <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>{fmtSize(pdfFile.size)}</div>
          </div>
          <Btn sm v="ghost" onClick={() => { setPdfFile(null); setOriginalSize(0); setStep("upload"); }}>Change</Btn>
        </div>

        <CompressionSettings
          preset={compPreset} setPreset={setCompPreset}
          dpi={compDpi} setDpi={setCompDpi}
          quality={compQuality} setQuality={setCompQuality}
          targetMB={compTargetMB} setTargetMB={setCompTargetMB}
          originalSize={originalSize}
        />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" sm onClick={onClose}>Cancel</Btn>
          <Btn sm onClick={processAndUpload}>
            {compPreset === "none" ? "Upload Original" : "Compress & Upload"}
          </Btn>
        </div>
      </>)}

      {/* Step 3: Processing (compression + upload) */}
      {step === "processing" && (
        <GlassCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>
              {compressionStatus || `Uploading PDF... ${uploadProgress}%`}
            </div>
            <div style={{ height: 6, background: Z.bd, borderRadius: Ri, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: Ri, background: Z.go,
                width: uploadProgress > 0 && !compressionStatus.includes("Compressing") ? `${uploadProgress}%` : "100%",
                transition: "width 0.3s",
                animation: compressionStatus.includes("Compressing") || compressionStatus.includes("Assembling") || compressionStatus.includes("Reducing")
                  ? "pulse 1.5s ease-in-out infinite" : "none",
                opacity: compressionStatus.includes("Compressing") || compressionStatus.includes("Assembling") ? 0.6 : 1,
              }} />
            </div>
            {pdfFile && (
              <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
                {pdfFile.name} — {fmtSize(pdfFile.size)}
                {compressedSize > 0 && compressedSize !== pdfFile.size && (
                  <span> → <b style={{ color: Z.go }}>{fmtSize(compressedSize)}</b> ({Math.round((1 - compressedSize / pdfFile.size) * 100)}% smaller)</span>
                )}
              </div>
            )}
          </div>
          <style>{`@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
        </GlassCard>
      )}

      {/* Step 4: Metadata */}
      {step === "metadata" && (<>
        {/* Cover preview + upload status */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {coverImageUrl ? (
            <div style={{ position: "relative" }}>
              <img src={coverImageUrl} alt="Cover" style={{ width: 100, height: 130, objectFit: "cover", borderRadius: R, border: `1px solid ${Z.bd}` }} />
              <label style={{
                position: "absolute", bottom: -8, left: 0, right: 0, textAlign: "center",
                fontSize: FS.micro, color: Z.ac, cursor: "pointer", fontFamily: COND, fontWeight: FW.bold,
              }}>
                Replace
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { if (e.target.files[0]) handleCoverOverride(e.target.files[0]); }} />
              </label>
            </div>
          ) : (
            <div style={{ width: 100, height: 130, background: Z.sa, borderRadius: R, border: `1px solid ${Z.bd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ic.story size={24} color={Z.td} />
            </div>
          )}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            {pdfUrl && (
              <div style={{ fontSize: FS.sm, color: Z.go, fontWeight: FW.bold, fontFamily: COND }}>
                ✓ PDF uploaded{pageCount > 0 && ` — ${pageCount} pages`}
                {compressedSize > 0 && ` — ${fmtSize(compressedSize)}`}
              </div>
            )}
            {coverImageUrl && (
              <div style={{ fontSize: FS.sm, color: Z.go, fontWeight: FW.bold, fontFamily: COND }}>
                ✓ Cover image generated
              </div>
            )}
            {compressedSize > 0 && originalSize > 0 && compressedSize < originalSize && (
              <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
                Compressed from {fmtSize(originalSize)} ({Math.round((1 - compressedSize / originalSize) * 100)}% reduction)
              </div>
            )}
            {coverProgress && (
              <div style={{ fontSize: FS.sm, color: Z.ac, fontFamily: COND }}>{coverProgress}</div>
            )}
            {isEdit && !pdfFile && (
              <div>
                <label style={{ fontSize: FS.sm, color: Z.ac, cursor: "pointer", fontFamily: COND, fontWeight: FW.bold, textDecoration: "underline" }}>
                  Replace PDF
                  <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
                    onChange={(e) => { if (e.target.files[0]) handleFileSelected(e.target.files[0]); }} />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Publication */}
        <Sel label="Publication" value={pubId} onChange={e => setPubId(e.target.value)} options={pubOptions} />

        {/* Title + Slug */}
        <Inp label="Title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Paso Robles Press — April 6, 2026" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Slug" value={slug} onChange={e => setSlug(e.target.value)} placeholder="april-6-2026" />
          <Inp label="Publish Date" type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)} />
        </div>

        {/* Featured toggle */}
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: FS.base, color: Z.tx }}>
          <div
            onClick={() => setIsFeatured(!isFeatured)}
            style={{
              width: 40, height: 22, borderRadius: 11, position: "relative",
              background: isFeatured ? Z.go : Z.bd, transition: "background 0.2s", cursor: "pointer",
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 9, background: "#fff",
              position: "absolute", top: 2, left: isFeatured ? 20 : 2,
              transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </div>
          <span style={{ fontWeight: FW.semi }}>Set as this week's edition</span>
          <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>(only one per publication)</span>
        </label>
      </>)}

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 14px", borderRadius: Ri, background: Z.da + "18", color: Z.da, fontSize: FS.sm, fontWeight: FW.bold }}>
          {error}
        </div>
      )}

      {/* Actions */}
      {step === "metadata" && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" sm onClick={onClose}>Cancel</Btn>
          <Btn sm onClick={handleSave} disabled={saving || !title || !slug}>
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Publish Edition"}
          </Btn>
        </div>
      )}
    </div>
  </Modal>;
};

export default EditionManager;
