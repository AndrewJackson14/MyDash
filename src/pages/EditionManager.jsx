// ============================================================
// EditionManager.jsx — Upload & manage print editions (PDF)
// Stores in editions, uploads to BunnyCDN, auto-generates covers
// Client-side PDF compression via pdf.js re-render + jsPDF assembly
// ============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri, INV } from "../lib/theme";
import { Ic, Btn, Inp, Sel, Modal, PageHeader, GlassCard, DataTable, SB, Badge, FilterBar, Pill, FilterPillStrip } from "../components/ui";
import { supabase, isOnline, EDGE_FN_URL } from "../lib/supabase";
import { fmtDate } from "../lib/formatters";

// ── Config ───────────────────────────────────────────────────
const CDN_BASE = "https://cdn.13stars.media";
const PROXY_URL = EDGE_FN_URL + "/bunny-storage";

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
async function bunnyUploadWithProgress(file, path, filename, onProgress) {
  // bunny-storage needs BOTH apikey (Supabase gateway) and
  // Authorization (verify_jwt user token). Pull them before the XHR
  // opens so headers can go on the request.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", PROXY_URL, true);
    xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_ANON_KEY || "");
    xhr.setRequestHeader("Authorization", "Bearer " + session.access_token);
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
let _pdfjsReady = null;
async function getPdfjs() {
  if (_pdfjsReady) return _pdfjsReady;
  const pdfjsLib = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  _pdfjsReady = pdfjsLib;
  return pdfjsLib;
}

// Open a PDF document with full rendering support (cMaps, standard fonts,
// WASM decoders). Newspaper PDFs use JBig2 for B&W scans and OpenJPEG
// for some color layers; without the wasm dir, pdf.js silently falls
// back to pure-JS decoders that are 10-50x slower and will stall the
// compression pass on a multi-page paper.
async function openPdf(data) {
  const pdfjsLib = await getPdfjs();
  const cMapUrl = await import("pdfjs-dist/cmaps/78-H.bcmap?url").then(m => {
    const url = m.default;
    return url.substring(0, url.lastIndexOf("/") + 1);
  });
  const standardFontDataUrl = await import("pdfjs-dist/standard_fonts/FoxitFixed.pfb?url").then(m => {
    const url = m.default;
    return url.substring(0, url.lastIndexOf("/") + 1);
  });
  // pdf.js's wasmUrl needs a directory containing unhashed filenames
  // (jbig2.wasm, openjpeg.wasm, qcms_bg.wasm). Vite's `?url` imports
  // would hash each file and we'd only include the one we imported.
  // Copy the whole wasm dir into public/ at prebuild time (see
  // package.json prebuild script) so Vite serves them verbatim.
  return pdfjsLib.getDocument({
    data,
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl,
    wasmUrl: "/pdfjs-wasm/",
    isEvalSupported: false,
  }).promise;
}

// ── Render PDF page 1 from File → cover JPEG + page count ───
async function renderPdfCoverFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await openPdf(new Uint8Array(arrayBuffer));
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
// assembles a new PDF with pdf-lib. Supports DPI, JPEG quality,
// and optional target file size (iterative quality reduction).
// ══════════════════════════════════════════════════════════════
async function compressPdf(file, { dpi = 150, quality = 0.75, targetMB = 0, onProgress }) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await openPdf(new Uint8Array(arrayBuffer));
  const numPages = pdf.numPages;

  // Canvas → JPEG ArrayBuffer helper
  const canvasToJpegBuffer = (canvas, q) => new Promise((resolve) => {
    canvas.toBlob((blob) => blob.arrayBuffer().then(resolve), "image/jpeg", q);
  });

  // Render all pages to JPEG buffers at the given DPI & quality
  const renderPages = async (q) => {
    const pages = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const scale = dpi / 72;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Original page dimensions in points for the output PDF
      const origViewport = page.getViewport({ scale: 1 });

      const jpegBuffer = await canvasToJpegBuffer(canvas, q);
      pages.push({ jpegBuffer, widthPt: origViewport.width, heightPt: origViewport.height });

      // Clean up canvas memory
      canvas.width = 1;
      canvas.height = 1;

      if (onProgress) onProgress({ phase: "render", page: i, total: numPages, quality: q });
    }
    return pages;
  };

  // Assemble pages into a new PDF with pdf-lib
  const assemblePdf = async (pages) => {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();

    for (const pg of pages) {
      const jpgImage = await doc.embedJpg(pg.jpegBuffer);
      const page = doc.addPage([pg.widthPt, pg.heightPt]);
      page.drawImage(jpgImage, { x: 0, y: 0, width: pg.widthPt, height: pg.heightPt });
    }

    const pdfBytes = await doc.save();
    return new Blob([pdfBytes], { type: "application/pdf" });
  };

  // First pass at requested quality
  if (onProgress) onProgress({ phase: "start", total: numPages });
  let pages = await renderPages(quality);
  if (onProgress) onProgress({ phase: "assemble" });
  let blob = await assemblePdf(pages);

  // If target size is set and we're over it, iteratively reduce quality
  if (targetMB > 0) {
    const targetBytes = targetMB * 1048576;
    let currentQuality = quality;
    let attempts = 0;
    const maxAttempts = 4;

    while (blob.size > targetBytes && currentQuality > 0.25 && attempts < maxAttempts) {
      attempts++;
      const ratio = targetBytes / blob.size;
      currentQuality = Math.max(0.25, currentQuality * Math.sqrt(ratio));
      if (onProgress) onProgress({ phase: "retry", attempt: attempts, quality: currentQuality, currentSize: blob.size, targetSize: targetBytes });
      pages = await renderPages(currentQuality);
      blob = await assemblePdf(pages);
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
      await supabase.from("editions").update({ is_featured: false }).eq("publication_id", ed.publicationId);
      setEditions(prev => prev.map(e => e.publicationId === ed.publicationId ? { ...e, isFeatured: false } : e));
    }
    await supabase.from("editions").update({ is_featured: newVal }).eq("id", ed.id);
    setEditions(prev => prev.map(e => e.id === ed.id ? { ...e, isFeatured: newVal } : e));
  };

  // ── Delete ───────────────────────────────────────────────
  const handleDelete = async (ed) => {
    if (!supabase) return;
    await supabase.from("editions").delete().eq("id", ed.id);
    setEditions(prev => prev.filter(e => e.id !== ed.id));
    setDeleteConfirm(null);
  };

  // ── Save callback from modal ─────────────────────────────
  const handleSave = (savedEdition) => {
    // If this edition is featured, mirror the DB-side "unfeature all others
    // in the same publication" step in local state so the list shows the
    // correct status without waiting for a reload.
    setEditions(prev => {
      let next = savedEdition.isFeatured
        ? prev.map(e => e.publicationId === savedEdition.publicationId && e.id !== savedEdition.id
            ? { ...e, isFeatured: false } : e)
        : prev;
      if (editEdition) {
        next = next.map(e => e.id === savedEdition.id ? savedEdition : e);
      } else {
        next = [savedEdition, ...next];
      }
      return next;
    });
    setModal(false);
  };

  // ── Pub filter options ───────────────────────────────────
  const pubOptions = useMemo(() => [
    { value: "all", label: "All Publications" },
    ...pubs.map(p => ({ value: p.id, label: p.name })),
  ], [pubs]);

  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <SB value={search} onChange={setSearch} placeholder="Search editions..." />
      <Sel value={pubFilter} onChange={e => setPubFilter(e.target.value)} options={pubOptions} />
      <Btn sm onClick={openNew}><Ic.plus size={13} /> Upload New Edition</Btn>
      <span style={{ fontSize: 11, color: Z.tm, fontFamily: COND }}>{filtered.length} editions</span>
    </div>

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
          <Btn v="cancel" sm onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
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
    {(() => {
      const presetIcons = { none: Ic.file, light: Ic.chart, medium: Ic.chart, aggressive: Ic.chart, custom: Ic.edit };
      const presetOptions = presetKeys.map(key => ({ value: key, label: COMPRESSION_PRESETS[key].label, icon: presetIcons[key] }));
      return <FilterPillStrip gap={6} value={preset} onChange={handlePresetChange} options={presetOptions} />;
    })()}

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
  const [isFeatured, setIsFeatured] = useState(edition ? edition.isFeatured : true);
  const [pageCount, setPageCount] = useState(edition?.pageCount || 0);
  const [pdfUrl, setPdfUrl] = useState(edition?.pdfUrl || "");
  const [coverImageUrl, setCoverImageUrl] = useState(edition?.coverImageUrl || "");
  const [embedUrl] = useState(edition?.embedUrl || "");

  // Upload & compression state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [coverProgress, setCoverProgress] = useState("");
  const [compressionStatus, setCompressionStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedSize, setCompressedSize] = useState(0);

  // Compression settings
  const [compPreset, setCompPreset] = useState("none");
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

  // ── Handle file selected (just stores file, no upload) ────
  const handleFileSelected = (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file.");
      return;
    }
    setError("");
    setPdfFile(file);
    setOriginalSize(file.size);
  };

  // ── Drag & drop handlers ─────────────────────────────────
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFileSelected(e.dataTransfer.files[0]); };

  // ── Publish Edition: compress, upload PDF, upload cover, save record
  const handleSave = async () => {
    if (!pubId) { setError("Please select a publication."); return; }
    if (!publishDate) { setError("Please select a publish date."); return; }
    if (!pdfFile && !isEdit) { setError("Please select a PDF file."); return; }
    if (!supabase) { setError("Not connected to database"); return; }

    setSaving(true);
    setError("");
    setUploadProgress(0);
    setCompressionStatus("");

    try {
      // Compute paths NOW using current pubId/publishDate (not stale state)
      const currentPubSlug = PUB_SLUG_MAP[pubId] || pubId.replace(/^pub-/, "");
      let finalSlug = slugFromDate(publishDate, currentPubSlug);
      const existing = editions.filter(e => e.publicationId === pubId && e.slug === finalSlug && e.id !== edition?.id);
      if (existing.length > 0) finalSlug = finalSlug + "-" + Date.now().toString(36);

      const finalTitle = title || titleFromPubAndDate(pubs.find(p => p.id === pubId)?.name, publishDate);
      const path = `${currentPubSlug}/editions`;

      let finalPdfUrl = pdfUrl;
      let finalCoverUrl = coverImageUrl;
      let finalPageCount = pageCount;
      let finalPageImagesBaseUrl = null;

      // If we have a new PDF file, compress + upload it (and generate cover)
      if (pdfFile) {
        let fileToUpload = pdfFile;

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
                setCompressionStatus(`Reducing quality to ${Math.round(p.quality * 100)}%...`);
              } else if (p.phase === "done") {
                setCompressedSize(p.finalSize);
              }
            },
          });
          finalPageCount = numPages;
          fileToUpload = new File([blob], pdfFile.name, { type: "application/pdf" });
        } else {
          setCompressionStatus("Reading PDF...");
          const ab = await pdfFile.arrayBuffer();
          const pdf = await openPdf(new Uint8Array(ab));
          finalPageCount = pdf.numPages;
          setCompressedSize(pdfFile.size);
        }

        // Upload PDF
        setCompressionStatus("Uploading PDF...");
        const pdfFilename = `${finalSlug}.pdf`;
        await bunnyUploadWithProgress(fileToUpload, path, pdfFilename, setUploadProgress);
        finalPdfUrl = `${CDN_BASE}/${path}/${pdfFilename}`;

        // Generate + upload cover
        setCompressionStatus("Generating cover image...");
        const { blob: coverBlob } = await renderPdfCoverFromFile(pdfFile);
        const coverFilename = `${finalSlug}-cover.jpg`;
        await bunnyUploadWithProgress(
          new File([coverBlob], coverFilename, { type: "image/jpeg" }),
          path, coverFilename, () => {}
        );
        finalCoverUrl = `${CDN_BASE}/${path}/${coverFilename}`;

        // Extract individual page images for the magazine flipper reader.
        // Renders each page via pdf.js → canvas → WebP, uploads to BunnyCDN
        // at {path}/pages/page-001.webp and {path}/thumbs/thumb-001.webp.
        setCompressionStatus("Extracting page images...");
        const pageImagesBasePath = `${path}`;
        const ab2 = await pdfFile.arrayBuffer();
        const pdf2 = await openPdf(new Uint8Array(ab2));
        for (let p = 1; p <= pdf2.numPages; p++) {
          setCompressionStatus(`Extracting page ${p} of ${pdf2.numPages}...`);
          const pg = await pdf2.getPage(p);

          // Full-size page image
          const fullScale = 2;
          const fullVp = pg.getViewport({ scale: fullScale });
          const fullCanvas = document.createElement("canvas");
          fullCanvas.width = fullVp.width;
          fullCanvas.height = fullVp.height;
          await pg.render({ canvasContext: fullCanvas.getContext("2d"), viewport: fullVp }).promise;
          const fullBlob = await new Promise(r => fullCanvas.toBlob(r, "image/webp", 0.82));
          const pageName = `pages/page-${String(p).padStart(3, "0")}.webp`;
          await bunnyUploadWithProgress(
            new File([fullBlob], pageName.split("/").pop(), { type: "image/webp" }),
            pageImagesBasePath, pageName, () => {}
          );

          // Thumbnail
          const thumbScale = 0.4;
          const thumbVp = pg.getViewport({ scale: thumbScale });
          const thumbCanvas = document.createElement("canvas");
          thumbCanvas.width = thumbVp.width;
          thumbCanvas.height = thumbVp.height;
          await pg.render({ canvasContext: thumbCanvas.getContext("2d"), viewport: thumbVp }).promise;
          const thumbBlob = await new Promise(r => thumbCanvas.toBlob(r, "image/webp", 0.7));
          const thumbName = `thumbs/thumb-${String(p).padStart(3, "0")}.webp`;
          await bunnyUploadWithProgress(
            new File([thumbBlob], thumbName.split("/").pop(), { type: "image/webp" }),
            pageImagesBasePath, thumbName, () => {}
          );
        }
        finalPageImagesBaseUrl = `${CDN_BASE}/${pageImagesBasePath}`;
      }

      setCompressionStatus("Saving to database...");

      // Unfeature others if this one is featured. On a brand-new edition
      // there's no row to exclude, so skip the .neq() which would emit
      // `id=neq.` (empty value → Supabase 400).
      if (isFeatured) {
        let q = supabase.from("editions").update({ is_featured: false }).eq("publication_id", pubId);
        if (edition?.id) q = q.neq("id", edition.id);
        const { error: featErr } = await q;
        if (featErr) console.warn("Featured toggle error:", featErr);
      }

      const row = {
        publication_id: pubId,
        title: finalTitle,
        slug: finalSlug,
        pdf_url: finalPdfUrl,
        cover_image_url: finalCoverUrl || null,
        publish_date: publishDate,
        page_count: finalPageCount || 0,
        embed_url: embedUrl || null,
        is_featured: isFeatured,
        page_images_base_url: finalPageImagesBaseUrl,
        page_image_format: finalPageImagesBaseUrl ? "webp" : null,
        is_published: true,
        status: finalPageImagesBaseUrl ? "ready" : "processing",
      };

      let result;
      if (isEdit) {
        result = await supabase.from("editions").update(row).eq("id", edition.id).select().single();
      } else {
        result = await supabase.from("editions").insert(row).select().single();
      }

      if (result.error) throw result.error;
      if (!result.data) throw new Error("Save returned no data — check database permissions");

      const savedRow = result.data;
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
      console.error("Edition save error:", err);
      setError(typeof err === "object" && err.message ? err.message : String(err));
    } finally {
      setSaving(false);
      setCompressionStatus("");
    }
  };

  const pubOptions = pubs.map(p => ({ value: p.id, label: p.name }));

  return <Modal open={open} onClose={onClose} title={isEdit ? "Edit Edition" : "Upload New Edition"} width={620}>
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* PDF File: dropzone if not selected, file card if selected */}
      {!pdfFile && !isEdit && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? Z.ac : Z.bd}`,
            borderRadius: R,
            padding: 30,
            textAlign: "center",
            cursor: "pointer",
            background: dragOver ? Z.ac + "11" : Z.sa,
            transition: "all 0.2s",
          }}
        >
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
            onChange={(e) => { if (e.target.files[0]) handleFileSelected(e.target.files[0]); }} />
          <Ic.up size={28} color={Z.tm} />
          <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, marginTop: 10, fontFamily: DISPLAY }}>
            Drop PDF here or click to browse
          </div>
          <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 4 }}>
            PDF files up to 100MB. Compression and cover generation happen on publish.
          </div>
        </div>
      )}

      {pdfFile && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: Z.sa, borderRadius: R, border: `1px solid ${Z.bd}` }}>
          <Ic.story size={20} color={Z.ac} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.tx }}>{pdfFile.name}</div>
            <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>{fmtSize(pdfFile.size)}</div>
          </div>
          <label style={{ fontSize: FS.xs, color: Z.ac, cursor: "pointer", fontFamily: COND, fontWeight: FW.bold }}>
            Change
            <input type="file" accept=".pdf" style={{ display: "none" }}
              onChange={(e) => { if (e.target.files[0]) handleFileSelected(e.target.files[0]); }} />
          </label>
        </div>
      )}

      {isEdit && !pdfFile && coverImageUrl && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", background: Z.sa, borderRadius: R, border: `1px solid ${Z.bd}` }}>
          <img src={coverImageUrl} alt="Cover" style={{ width: 50, height: 65, objectFit: "cover", borderRadius: 3, border: `1px solid ${Z.bd}` }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: FS.sm, color: Z.tx, fontWeight: FW.semi }}>Current PDF</div>
            <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{pageCount > 0 && `${pageCount} pages`}</div>
          </div>
          <label style={{ fontSize: FS.xs, color: Z.ac, cursor: "pointer", fontFamily: COND, fontWeight: FW.bold }}>
            Replace PDF
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
              onChange={(e) => { if (e.target.files[0]) handleFileSelected(e.target.files[0]); }} />
          </label>
        </div>
      )}

      {/* Publication + Date */}
      <Sel label="Publication" value={pubId} onChange={e => setPubId(e.target.value)} options={pubOptions} />

      <Inp label="Publish Date" type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)} />

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
            width: 18, height: 18, borderRadius: 9, background: INV.light,
            position: "absolute", top: 2, left: isFeatured ? 20 : 2,
            transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }} />
        </div>
        <span style={{ fontWeight: FW.semi }}>Set as this week's edition</span>
        <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>(only one per publication)</span>
      </label>

      {/* Compression settings (collapsed by default — only shown if user wants) */}
      {pdfFile && (
        <details style={{ fontSize: FS.sm, color: Z.tm }}>
          <summary style={{ cursor: "pointer", fontWeight: FW.semi, padding: "4px 0" }}>Compression settings (optional)</summary>
          <div style={{ marginTop: 10 }}>
            <CompressionSettings
              preset={compPreset} setPreset={setCompPreset}
              dpi={compDpi} setDpi={setCompDpi}
              quality={compQuality} setQuality={setCompQuality}
              targetMB={compTargetMB} setTargetMB={setCompTargetMB}
              originalSize={originalSize}
            />
          </div>
        </details>
      )}

      {/* Progress during publish */}
      {saving && compressionStatus && (
        <GlassCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{compressionStatus}</div>
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div style={{ height: 6, background: Z.bd, borderRadius: Ri, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: Ri, background: Z.go, width: `${uploadProgress}%`, transition: "width 0.3s" }} />
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 14px", borderRadius: Ri, background: Z.da + "18", color: Z.da, fontSize: FS.sm, fontWeight: FW.bold }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn v="cancel" sm onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn sm onClick={handleSave} disabled={saving || !pubId || !publishDate || (!pdfFile && !isEdit)}>
          {saving ? "Publishing..." : "Publish Edition"}
        </Btn>
      </div>
    </div>
  </Modal>;
};

export default EditionManager;
