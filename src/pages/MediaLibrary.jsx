import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Z, COND, DISPLAY, FS, FW } from "../lib/theme";
import { Ic, Btn, Inp, SB } from "../components/ui";
import { supabase, isOnline } from "../lib/supabase";

// ── Helpers ──────────────────────────────────────────────────────
const fmtSize = (bytes) => {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const isImage = (mime) => (mime || "").startsWith("image/");

// ── Upload via Supabase Storage ─────────────────────────────────
async function uploadToStorage(file, pubSlug) {
  const ext = file.name?.split(".").pop()?.toLowerCase() || "jpg";
  const now = new Date();
  const prefix = pubSlug || "general";
  const path = `${prefix}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const { data, error } = await supabase.storage.from("media_assets").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  const { data: urlData } = supabase.storage.from("media_assets").getPublicUrl(path);
  return { storagePath: path, cdnUrl: urlData.publicUrl };
}

// ══════════════════════════════════════════════════════════════════
// DETAIL PANEL
// ══════════════════════════════════════════════════════════════════
const DetailPanel = ({ asset, onClose, onUpdate, onDelete, onSelect, selectMode }) => {
  const [altText, setAltText] = useState(asset.alt_text || "");
  const [caption, setCaption] = useState(asset.caption || "");
  const [fileName, setFileName] = useState(asset.file_name || "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setAltText(asset.alt_text || "");
    setCaption(asset.caption || "");
    setFileName(asset.file_name || "");
  }, [asset.id]);

  const save = async () => {
    setSaving(true);
    const updates = { alt_text: altText, caption, file_name: fileName, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("media_assets").update(updates).eq("id", asset.id);
    if (!error) onUpdate(asset.id, updates);
    setSaving(false);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(asset.cdn_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const url = asset.cdn_url || asset.file_url;
  const inputStyle = { width: "100%", padding: "6px 8px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND };

  return (
    <div style={{ width: 320, flexShrink: 0, borderLeft: "1px solid " + Z.bd, background: Z.sf, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: COND, color: Z.tx }}>Details</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 16 }}>{"\u00d7"}</button>
      </div>

      {/* Preview */}
      {isImage(asset.mime_type) && url && (
        <img src={url} alt={altText} style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 4, background: Z.sa, border: "1px solid " + Z.bd }} />
      )}
      {!isImage(asset.mime_type) && (
        <div style={{ width: "100%", height: 80, display: "flex", alignItems: "center", justifyContent: "center", background: Z.sa, borderRadius: 4, color: Z.tm, fontSize: 11, fontFamily: COND }}>
          {asset.mime_type || "File"}
        </div>
      )}

      {/* File name */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: Z.tm, fontFamily: COND, marginBottom: 3 }}>Filename</div>
        <input value={fileName} onChange={e => setFileName(e.target.value)} style={inputStyle} />
      </div>

      {/* Alt text */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: Z.tm, fontFamily: COND, marginBottom: 3 }}>Alt Text</div>
        <textarea value={altText} onChange={e => setAltText(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="Describe the image for accessibility..." />
      </div>

      {/* Caption */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: Z.tm, fontFamily: COND, marginBottom: 3 }}>Caption</div>
        <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="Photo credit or description..." />
      </div>

      {/* Read-only info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, fontFamily: COND }}>
        <div><span style={{ color: Z.tm }}>Size: </span><span style={{ color: Z.tx, fontWeight: 600 }}>{fmtSize(asset.file_size)}</span></div>
        <div><span style={{ color: Z.tm }}>Type: </span><span style={{ color: Z.tx, fontWeight: 600 }}>{asset.mime_type || "—"}</span></div>
        {asset.width && <div><span style={{ color: Z.tm }}>Dims: </span><span style={{ color: Z.tx, fontWeight: 600 }}>{asset.width}x{asset.height}</span></div>}
        <div><span style={{ color: Z.tm }}>Date: </span><span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(asset.created_at)}</span></div>
      </div>

      {/* URL with copy */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: Z.tm, fontFamily: COND, marginBottom: 3 }}>URL</div>
        <div style={{ display: "flex", gap: 4 }}>
          <input value={url || ""} readOnly style={{ ...inputStyle, flex: 1, fontSize: 10, color: Z.tm }} />
          <button onClick={copyUrl} style={{ padding: "4px 8px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sa, color: copied ? (Z.su || "#22c55e") : Z.tx, fontSize: 10, fontFamily: COND, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            {copied ? "\u2713 Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
        <Btn sm onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Btn>
        {selectMode && <Btn sm onClick={() => onSelect(asset)} style={{ background: Z.ac + "12", color: Z.ac, border: "1px solid " + Z.ac + "40" }}>Select This Image</Btn>}
        <button onClick={() => { if (confirm("Delete this file permanently?")) onDelete(asset.id); }} style={{ padding: "6px 10px", borderRadius: 3, border: "1px solid #ef444440", background: "transparent", color: "#ef4444", fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>
          Delete
        </button>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// MEDIA LIBRARY (standalone page + embeddable)
// ══════════════════════════════════════════════════════════════════
export default function MediaLibrary({ pubs, embedded, onSelect, pubFilter }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPub, setFilterPub] = useState(pubFilter || "all");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("grid");
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [uploading, setUploading] = useState([]);
  const [thumbScale, setThumbScale] = useState(100); // 100-150
  const [lightboxAsset, setLightboxAsset] = useState(null);
  const perPage = 60;
  const dropRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const searchTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Load assets
  const loadAssets = useCallback(async () => {
    if (!isOnline()) { setLoading(false); return; }
    setLoading(true);
    let q = supabase.from("media_assets").select("*", { count: "exact" });
    if (filterPub !== "all") q = q.eq("publication_id", filterPub);
    if (filterType === "image") q = q.like("mime_type", "image/%");
    else if (filterType === "pdf") q = q.eq("mime_type", "application/pdf");
    else if (filterType === "video") q = q.like("mime_type", "video/%");
    if (debouncedSearch) q = q.or(`file_name.ilike.%${debouncedSearch}%,alt_text.ilike.%${debouncedSearch}%`);
    q = q.order(sortBy, { ascending: sortDir === "asc" }).range(page * perPage, (page + 1) * perPage - 1);
    const { data, count } = await q;
    if (data) { setAssets(data); setTotal(count || 0); }
    setLoading(false);
  }, [filterPub, filterType, debouncedSearch, sortBy, sortDir, page]);

  useEffect(() => { loadAssets(); }, [loadAssets]);
  useEffect(() => { setPage(0); }, [filterPub, filterType, debouncedSearch, sortBy, sortDir]);

  // Upload handler
  const handleUpload = async (files) => {
    const pubSlug = filterPub !== "all" ? (pubs || []).find(p => p.id === filterPub)?.name?.toLowerCase().replace(/\s+/g, "-") : "general";
    const newUploads = Array.from(files).map(f => ({ id: Math.random().toString(36).slice(2), file: f, name: f.name, progress: 0 }));
    setUploading(prev => [...prev, ...newUploads]);

    for (const u of newUploads) {
      try {
        const { storagePath, cdnUrl } = await uploadToStorage(u.file, pubSlug);
        const row = {
          file_name: u.file.name,
          cdn_url: cdnUrl,
          file_url: cdnUrl,
          storage_path: storagePath,
          mime_type: u.file.type,
          file_size: u.file.size,
          publication_id: filterPub !== "all" ? filterPub : null,
          alt_text: "",
        };
        const { data } = await supabase.from("media_assets").insert(row).select().single();
        if (data) setAssets(prev => [data, ...prev]);
        setUploading(prev => prev.filter(x => x.id !== u.id));
      } catch (err) {
        console.error("Upload failed:", err);
        setUploading(prev => prev.map(x => x.id === u.id ? { ...x, error: err.message } : x));
      }
    }
  };

  // Drag and drop
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files); };

  // Detail panel actions
  const handleUpdate = (id, updates) => setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  const handleDelete = async (id) => {
    await supabase.from("media_assets").delete().eq("id", id);
    setAssets(prev => prev.filter(a => a.id !== id));
    if (selected?.id === id) setSelected(null);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  // Bulk actions
  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} files permanently?`)) return;
    const ids = [...selectedIds];
    await supabase.from("media_assets").delete().in("id", ids);
    setAssets(prev => prev.filter(a => !selectedIds.has(a.id)));
    setSelectedIds(new Set());
    if (selected && selectedIds.has(selected.id)) setSelected(null);
  };

  const toggleSelect = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => { if (selectedIds.size === assets.length) setSelectedIds(new Set()); else setSelectedIds(new Set(assets.map(a => a.id))); };

  const totalPages = Math.ceil(total / perPage);
  const pn = (id) => (pubs || []).find(p => p.id === id)?.name || "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: embedded ? "100%" : undefined }}>
      {/* Header */}
      {!embedded && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY }}>Media Library</h2>
          <span style={{ fontSize: 12, color: Z.tm, fontFamily: COND }}>{total.toLocaleString()} files</span>
        </div>
      )}

      {/* Upload zone */}
      <div ref={dropRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} style={{
        border: `2px dashed ${dragOver ? Z.ac : Z.bd}`, borderRadius: 6, padding: dragOver ? "20px" : "12px 16px",
        background: dragOver ? Z.ac + "08" : Z.sa, textAlign: "center", cursor: "pointer", transition: "all 0.2s",
      }} onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.accept = "image/*,application/pdf,video/*"; inp.onchange = (e) => handleUpload(e.target.files); inp.click(); }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: dragOver ? Z.ac : Z.tm, fontFamily: COND }}>
          {dragOver ? "Drop files here" : "Drag & drop files or click to upload"}
        </div>
      </div>

      {/* Upload progress */}
      {uploading.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {uploading.map(u => (
            <div key={u.id} style={{ padding: "4px 10px", borderRadius: 3, background: u.error ? "#fef2f2" : Z.sa, border: "1px solid " + (u.error ? "#ef444430" : Z.bd), fontSize: 10, fontFamily: COND, color: u.error ? "#ef4444" : Z.tm }}>
              {u.name} {u.error ? "- " + u.error : "uploading..."}
            </div>
          ))}
        </div>
      )}

      {/* Toolbar: search + filters + sort + view toggle */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SB value={search} onChange={setSearch} placeholder="Search files..." />
        </div>
        {/* Pub filter */}
        <select value={filterPub} onChange={e => setFilterPub(e.target.value)} style={{ padding: "5px 8px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 11, fontFamily: COND }}>
          <option value="all">All Publications</option>
          {(pubs || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {/* Type filter */}
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: "5px 8px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 11, fontFamily: COND }}>
          <option value="all">All Types</option>
          <option value="image">Images</option>
          <option value="pdf">PDFs</option>
          <option value="video">Video</option>
        </select>
        {/* Sort */}
        <select value={sortBy + ":" + sortDir} onChange={e => { const [s, d] = e.target.value.split(":"); setSortBy(s); setSortDir(d); }} style={{ padding: "5px 8px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 11, fontFamily: COND }}>
          <option value="created_at:desc">Newest</option>
          <option value="created_at:asc">Oldest</option>
          <option value="file_name:asc">Name A-Z</option>
          <option value="file_name:desc">Name Z-A</option>
          <option value="file_size:desc">Largest</option>
          <option value="file_size:asc">Smallest</option>
        </select>
        {/* View toggle */}
        <div style={{ display: "flex", gap: 0, border: "1px solid " + Z.bd, borderRadius: 3 }}>
          <button onClick={() => setViewMode("grid")} style={{ padding: "4px 8px", background: viewMode === "grid" ? Z.ac + "12" : "transparent", border: "none", color: viewMode === "grid" ? Z.ac : Z.tm, cursor: "pointer", fontSize: 12 }}>{"\u25a6"}</button>
          <button onClick={() => setViewMode("list")} style={{ padding: "4px 8px", background: viewMode === "list" ? Z.ac + "12" : "transparent", border: "none", color: viewMode === "list" ? Z.ac : Z.tm, cursor: "pointer", fontSize: 12 }}>{"\u2630"}</button>
        </div>
        {/* Thumb size slider */}
        {viewMode === "grid" && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 9, color: Z.tm, fontFamily: COND }}>Size</span>
            <input type="range" min={100} max={150} value={thumbScale} onChange={e => setThumbScale(Number(e.target.value))} style={{ width: 60, accentColor: Z.ac }} />
          </div>
        )}
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 12px", background: Z.ac + "08", borderRadius: 3, border: "1px solid " + Z.ac + "20" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: Z.ac, fontFamily: COND }}>{selectedIds.size} selected</span>
          <button onClick={bulkDelete} style={{ padding: "3px 10px", borderRadius: 3, border: "1px solid #ef444430", background: "transparent", color: "#ef4444", fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>Delete Selected</button>
          <button onClick={() => setSelectedIds(new Set())} style={{ padding: "3px 10px", borderRadius: 3, border: "1px solid " + Z.bd, background: "transparent", color: Z.tm, fontSize: 11, fontFamily: COND, cursor: "pointer" }}>Clear</button>
        </div>
      )}

      {/* Content area */}
      <div style={{ display: "flex", flex: 1, minHeight: 400, gap: 0 }}>
        {/* Grid / List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: 13 }}>Loading...</div>}

          {!loading && assets.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: 13 }}>No files found</div>
          )}

          {!loading && viewMode === "grid" && (() => {
            const baseMin = 140;
            const scaledMin = Math.round(baseMin * thumbScale / 100);
            const thumbH = Math.round(100 * thumbScale / 100);
            return (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${scaledMin}px, 1fr))`, gap: 8 }}>
              {assets.map(a => {
                const url = a.cdn_url || a.file_url;
                const isSel = selectedIds.has(a.id);
                const isActive = selected?.id === a.id;
                return (
                  <div key={a.id} onClick={() => { if (selected?.id === a.id) { setLightboxAsset(a); } else { setSelected(a); } }} style={{
                    borderRadius: 4, border: `2px solid ${isActive ? Z.ac : isSel ? Z.ac + "60" : Z.bd}`,
                    background: Z.sf, cursor: "pointer", overflow: "hidden", transition: "border-color 0.15s", position: "relative",
                  }}>
                    {/* Checkbox */}
                    <div onClick={(e) => { e.stopPropagation(); toggleSelect(a.id); }} style={{
                      position: "absolute", top: 4, left: 4, width: 18, height: 18, borderRadius: 3,
                      border: "2px solid " + (isSel ? Z.ac : "rgba(255,255,255,0.6)"), background: isSel ? Z.ac : "rgba(0,0,0,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 1,
                    }}>
                      {isSel && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{"\u2713"}</span>}
                    </div>
                    {/* Thumbnail */}
                    {isImage(a.mime_type) && url ? (
                      <div style={{ width: "100%", height: thumbH, background: Z.sa }}>
                        <img src={url} alt={a.alt_text || ""} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    ) : (
                      <div style={{ width: "100%", height: thumbH, background: Z.sa, display: "flex", alignItems: "center", justifyContent: "center", color: Z.tm, fontSize: 10, fontFamily: COND }}>
                        {a.mime_type || "File"}
                      </div>
                    )}
                    {/* Info */}
                    <div style={{ padding: "6px 8px" }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: Z.tx, fontFamily: COND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file_name}</div>
                      <div style={{ fontSize: 9, color: Z.tm, fontFamily: COND }}>
                        {fmtSize(a.file_size)}{a.width && a.height ? ` \u00b7 ${a.width}\u00d7${a.height}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })()}

          {!loading && viewMode === "list" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {/* Select all header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: Z.tm, fontFamily: COND, borderBottom: "1px solid " + Z.bd }}>
                <div onClick={selectAll} style={{ width: 16, height: 16, borderRadius: 3, border: "2px solid " + Z.bd, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: selectedIds.size === assets.length && assets.length > 0 ? Z.ac : "transparent" }}>
                  {selectedIds.size === assets.length && assets.length > 0 && <span style={{ color: "#fff", fontSize: 9 }}>{"\u2713"}</span>}
                </div>
                <span style={{ width: 40 }}>Thumb</span>
                <span style={{ flex: 1 }}>Filename</span>
                <span style={{ width: 70, textAlign: "right" }}>Size</span>
                <span style={{ width: 80 }}>Type</span>
                <span style={{ width: 90 }}>Date</span>
              </div>
              {assets.map(a => {
                const url = a.cdn_url || a.file_url;
                const isSel = selectedIds.has(a.id);
                const isActive = selected?.id === a.id;
                return (
                  <div key={a.id} onClick={() => { if (selected?.id === a.id) { setLightboxAsset(a); } else { setSelected(a); } }} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 3, cursor: "pointer",
                    background: isActive ? Z.ac + "08" : "transparent", borderLeft: isSel ? "3px solid " + Z.ac : "3px solid transparent",
                  }}>
                    <div onClick={(e) => { e.stopPropagation(); toggleSelect(a.id); }} style={{
                      width: 16, height: 16, borderRadius: 3, border: "2px solid " + (isSel ? Z.ac : Z.bd), flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: isSel ? Z.ac : "transparent",
                    }}>
                      {isSel && <span style={{ color: "#fff", fontSize: 9 }}>{"\u2713"}</span>}
                    </div>
                    {isImage(a.mime_type) && url ? (
                      <img src={url} alt="" loading="lazy" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: 3, background: Z.sa, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: Z.tm, flexShrink: 0 }}>{a.mime_type?.split("/")[1] || "?"}</div>
                    )}
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: Z.tx, fontFamily: COND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file_name}</span>
                    <span style={{ width: 70, fontSize: 10, color: Z.tm, fontFamily: COND, textAlign: "right" }}>{fmtSize(a.file_size)}</span>
                    <span style={{ width: 80, fontSize: 10, color: Z.tm, fontFamily: COND }}>{a.mime_type?.split("/")[1] || "—"}</span>
                    <span style={{ width: 90, fontSize: 10, color: Z.tm, fontFamily: COND }}>{fmtDate(a.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "12px 0" }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: "4px 10px", borderRadius: 3, border: "1px solid " + Z.bd, background: "transparent", color: page === 0 ? Z.bd : Z.tx, fontSize: 11, fontFamily: COND, cursor: page === 0 ? "default" : "pointer" }}>{"\u2190"} Prev</button>
              <span style={{ fontSize: 11, color: Z.tm, fontFamily: COND }}>Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: "4px 10px", borderRadius: 3, border: "1px solid " + Z.bd, background: "transparent", color: page >= totalPages - 1 ? Z.bd : Z.tx, fontSize: 11, fontFamily: COND, cursor: page >= totalPages - 1 ? "default" : "pointer" }}>Next {"\u2192"}</button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <DetailPanel
            asset={selected}
            onClose={() => setSelected(null)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onSelect={onSelect}
            selectMode={!!onSelect}
          />
        )}
      </div>

      {/* Lightbox */}
      {lightboxAsset && (() => {
        const lbUrl = lightboxAsset.cdn_url || lightboxAsset.file_url;
        return (
          <div onClick={() => setLightboxAsset(null)} style={{
            position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: "88vw", height: "88vh", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", position: "relative",
            }}>
              <button onClick={() => setLightboxAsset(null)} style={{
                position: "absolute", top: 0, right: 0, background: "rgba(255,255,255,0.15)",
                border: "none", color: "#fff", fontSize: 22, cursor: "pointer", width: 36, height: 36,
                borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center",
              }}>{"\u00d7"}</button>
              {isImage(lightboxAsset.mime_type) && lbUrl ? (
                <img src={lbUrl} alt={lightboxAsset.alt_text || ""} style={{ maxWidth: "100%", maxHeight: "calc(88vh - 60px)", objectFit: "contain", borderRadius: 4 }} />
              ) : (
                <div style={{ color: "#fff", fontSize: 14, fontFamily: COND }}>{lightboxAsset.file_name}</div>
              )}
              <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: COND }}>{lightboxAsset.file_name}</span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: COND }}>{fmtSize(lightboxAsset.file_size)}</span>
                {lightboxAsset.width && lightboxAsset.height && <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: COND }}>{lightboxAsset.width}{"\u00d7"}{lightboxAsset.height}</span>}
              </div>
              {lightboxAsset.alt_text && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: COND, marginTop: 4, fontStyle: "italic" }}>{lightboxAsset.alt_text}</div>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
