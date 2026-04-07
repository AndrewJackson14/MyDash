// ============================================================
// EditionManager.jsx — Upload & manage print editions (PDF)
// Stores in issuu_editions, uploads to BunnyCDN, auto-generates covers
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

// ── Helpers ──────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const slugFromDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  return `${months[d.getMonth()]}-${d.getDate()}-${d.getFullYear()}`;
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

// ── Render PDF page 1 to JPEG blob ──────────────────────────
async function renderPdfCover(pdfUrl) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
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

// ── Render PDF page 1 from File object ──────────────────────
async function renderPdfCoverFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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
    // If featuring, unfeature all others for this publication
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

  // Upload state
  const [step, setStep] = useState(isEdit ? "metadata" : "upload");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [coverProgress, setCoverProgress] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);

  // Auto-generate title and slug when pubId or date changes
  useEffect(() => {
    if (isEdit) return;
    const pub = pubs.find(p => p.id === pubId);
    if (pub && publishDate) {
      setTitle(titleFromPubAndDate(pub.name, publishDate));
      setSlug(slugFromDate(publishDate));
    }
  }, [pubId, publishDate, isEdit, pubs]);

  const pubSlug = PUB_SLUG_MAP[pubId] || pubId.replace(/^pub-/, "");

  // ── Handle PDF file selection ────────────────────────────
  const handlePdfFile = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file.");
      return;
    }
    setError("");
    setPdfFile(file);
    setStep("uploading");
    setUploadProgress(0);

    try {
      // Ensure unique slug
      let finalSlug = slug || slugFromDate(publishDate);
      const existing = editions.filter(e => e.publicationId === pubId && e.slug === finalSlug && e.id !== edition?.id);
      if (existing.length > 0) finalSlug = finalSlug + "-" + Date.now().toString(36);
      setSlug(finalSlug);

      const path = `${pubSlug}/editions`;
      const pdfFilename = `${finalSlug}.pdf`;

      // Upload PDF with progress
      await bunnyUploadWithProgress(file, path, pdfFilename, setUploadProgress);
      const cdnUrl = `${CDN_BASE}/${path}/${pdfFilename}`;
      setPdfUrl(cdnUrl);
      setUploadProgress(100);

      // Auto-generate cover
      setCoverProgress("Generating cover from page 1...");
      const { blob: coverBlob, numPages } = await renderPdfCoverFromFile(file);
      setPageCount(numPages);

      setCoverProgress("Uploading cover image...");
      const coverFilename = `${finalSlug}-cover.jpg`;
      await bunnyUploadWithProgress(
        new File([coverBlob], coverFilename, { type: "image/jpeg" }),
        path, coverFilename, () => {}
      );
      const coverUrl = `${CDN_BASE}/${path}/${coverFilename}`;
      setCoverImageUrl(coverUrl);
      setCoverProgress("");

      setStep("metadata");
    } catch (err) {
      setError(err.message || "Upload failed");
      setStep("upload");
    }
  };

  // ── Drag & drop handlers ─────────────────────────────────
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handlePdfFile(e.dataTransfer.files[0]); };

  // ── Manual cover override ────────────────────────────────
  const handleCoverOverride = async (file) => {
    if (!file) return;
    setCoverProgress("Uploading custom cover...");
    try {
      const path = `${pubSlug}/editions`;
      const coverFilename = `${slug || "cover"}-cover.jpg`;
      await bunnyUploadWithProgress(
        file, path, coverFilename, () => {}
      );
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
      // If featuring, unfeature others first
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

  return <Modal open={open} onClose={onClose} title={isEdit ? "Edit Edition" : "Upload New Edition"} width={600}>
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Step: Upload PDF */}
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
            onChange={(e) => { if (e.target.files[0]) handlePdfFile(e.target.files[0]); }} />
          <Ic.up size={32} color={Z.tm} />
          <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx, marginTop: 12, fontFamily: DISPLAY }}>
            Drop PDF here or click to browse
          </div>
          <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 6 }}>
            Supports PDF files up to 100MB
          </div>
        </div>
      )}

      {/* Step: Uploading */}
      {step === "uploading" && (
        <GlassCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>
              {coverProgress || `Uploading PDF... ${uploadProgress}%`}
            </div>
            <div style={{ height: 6, background: Z.bd, borderRadius: Ri, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: Ri, background: Z.go,
                width: coverProgress ? "100%" : `${uploadProgress}%`,
                transition: "width 0.3s",
              }} />
            </div>
            {pdfFile && (
              <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
                {pdfFile.name} — {(pdfFile.size / 1048576).toFixed(1)} MB
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* Step: Metadata */}
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
              </div>
            )}
            {coverImageUrl && (
              <div style={{ fontSize: FS.sm, color: Z.go, fontWeight: FW.bold, fontFamily: COND }}>
                ✓ Cover image generated
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
                    onChange={(e) => { if (e.target.files[0]) { setStep("upload"); handlePdfFile(e.target.files[0]); } }} />
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
