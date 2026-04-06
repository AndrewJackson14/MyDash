import { useState, useEffect, useCallback, useRef } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri } from "../lib/theme";
import { Ic, Btn, SB } from "../components/ui";

// ── Config ───────────────────────────────────────────────────────
const CDN_BASE = "https://cdn.13stars.media";
const PROXY_URL = "https://hqywacyhpllapdwccmaw.supabase.co/functions/v1/bunny-storage";

// ── Helpers ──────────────────────────────────────────────────────
const fmtSize = (bytes) => {
  if (!bytes) return "\u2014";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const isImage = (name) => /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|ico)$/i.test(name || "");
const sanitize = (name) => name.toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

// ── BunnyCDN API calls via proxy ─────────────────────────────────
async function bunnyList(path) {
  const res = await fetch(PROXY_URL, {
    headers: { "x-action": "list", "x-path": path || "" },
  });
  if (!res.ok) throw new Error("List failed: " + res.status);
  return res.json();
}

// Recursively list all files under a path (follows subdirectories)
async function bunnyListRecursive(path, maxDepth = 4) {
  const items = await bunnyList(path);
  const files = items.filter(i => !i.IsDirectory);
  if (maxDepth <= 0) return files;
  const dirs = items.filter(i => i.IsDirectory);
  const subResults = await Promise.all(
    dirs.map(d => bunnyListRecursive(path + "/" + d.ObjectName, maxDepth - 1).catch(() => []))
  );
  return files.concat(...subResults);
}

async function bunnyUpload(file, path, filename) {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-action": "upload",
      "x-path": path,
      "x-filename": filename,
    },
    body: file,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Upload failed"); }
  return res.json();
}

async function bunnyDelete(path, filename) {
  const res = await fetch(PROXY_URL, {
    method: "DELETE",
    headers: { "x-action": "delete", "x-path": path, "x-filename": filename },
  });
  if (!res.ok) throw new Error("Delete failed: " + res.status);
}

// ── Publication folder mapping ──────────────────────────────────
const PUB_FOLDERS = [
  { slug: "malibu-times", label: "Malibu Times" },
  { slug: "paso-robles-press", label: "Paso Robles Press" },
  { slug: "atascadero-news", label: "Atascadero News" },
  { slug: "paso-robles-magazine", label: "Paso Robles Magazine" },
  { slug: "atascadero-news-magazine", label: "Atascadero News Magazine" },
  { slug: "santa-ynez-valley-star", label: "Santa Ynez Valley Star" },
  { slug: "general", label: "General / Shared" },
];

// ══════════════════════════════════════════════════════════════════
// DETAIL PANEL
// ══════════════════════════════════════════════════════════════════
const DetailPanel = ({ item, currentPath, onClose, onDelete, onSelect, selectMode }) => {
  const [copied, setCopied] = useState(false);
  const url = item.cdnUrl || `${CDN_BASE}/${item.fullPath}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputStyle = { width: "100%", padding: "6px 8px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND };

  return (
    <div style={{ width: 320, flexShrink: 0, borderLeft: "1px solid " + Z.bd, background: Z.sf, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: COND, color: Z.tx }}>Details</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 16 }}>{"\u00d7"}</button>
      </div>

      {isImage(item.ObjectName) && (
        <img src={url} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 4, background: Z.sa, border: "1px solid " + Z.bd }} />
      )}

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: Z.tm, fontFamily: COND, marginBottom: 3 }}>Filename</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: Z.tx, fontFamily: COND, wordBreak: "break-all" }}>{item.ObjectName}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, fontFamily: COND }}>
        <div><span style={{ color: Z.tm }}>Size: </span><span style={{ color: Z.tx, fontWeight: 600 }}>{fmtSize(item.Length)}</span></div>
        <div><span style={{ color: Z.tm }}>Date: </span><span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(item.DateCreated)}</span></div>
        {item.ContentType && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: Z.tm }}>Type: </span><span style={{ color: Z.tx, fontWeight: 600 }}>{item.ContentType}</span></div>}
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: Z.tm, fontFamily: COND, marginBottom: 3 }}>CDN URL</div>
        <div style={{ display: "flex", gap: 4 }}>
          <input value={url} readOnly style={{ ...inputStyle, flex: 1, fontSize: 10, color: Z.tm }} />
          <button onClick={copyUrl} style={{ padding: "4px 8px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sa, color: copied ? "#22c55e" : Z.tx, fontSize: 10, fontFamily: COND, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            {copied ? "\u2713 Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
        {selectMode && <Btn sm onClick={() => onSelect({ url, fileName: item.ObjectName })} style={{ background: Z.ac + "12", color: Z.ac, border: "1px solid " + Z.ac + "40" }}>Select This Image</Btn>}
        <button onClick={() => { if (confirm("Delete " + item.ObjectName + " permanently?")) onDelete(item); }} style={{ padding: "6px 10px", borderRadius: 3, border: "1px solid #ef444440", background: "transparent", color: "#ef4444", fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>
          Delete
        </button>
      </div>
    </div>
  );
};

// (Folder tree replaced by horizontal pub tabs in toolbar)

// ══════════════════════════════════════════════════════════════════
// MEDIA LIBRARY
// ══════════════════════════════════════════════════════════════════
export default function MediaLibrary({ pubs, embedded, onSelect, pubFilter }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState(pubFilter ? PUB_FOLDERS.find(p => pubFilter.includes(p.slug))?.slug || PUB_FOLDERS[0].slug : PUB_FOLDERS[0].slug);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [viewMode, setViewMode] = useState("grid");
  const [selected, setSelected] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [uploading, setUploading] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [thumbScale, setThumbScale] = useState(100);
  const [showAll, setShowAll] = useState(true); // flat recursive view by default
  const [loadProgress, setLoadProgress] = useState("");
  const searchTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Load directory (flat or recursive)
  const loadPath = useCallback(async (path, recursive) => {
    setLoading(true);
    setLoadProgress(recursive ? "Scanning folders..." : "");
    try {
      if (recursive) {
        const allFiles = await bunnyListRecursive(path, 4);
        setItems(allFiles || []);
        setLoadProgress("");
      } else {
        const data = await bunnyList(path);
        setItems(data || []);
      }
    } catch (err) {
      console.error("Failed to list:", err);
      setItems([]);
      setLoadProgress("");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadPath(currentPath, showAll); }, [currentPath, showAll, loadPath]);

  const navigate = (path) => {
    setCurrentPath(path);
    setSelected(null);
    setSelectedItems(new Set());
    setSearch("");
    setShowAll(true); // default to flat view when switching pubs
  };

  // Filter and sort files (exclude directories for grid display)
  const files = (() => {
    let f = items.filter(i => !i.IsDirectory);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      f = f.filter(i => i.ObjectName.toLowerCase().includes(q));
    }
    if (sortBy === "date") f.sort((a, b) => new Date(b.DateCreated) - new Date(a.DateCreated));
    else if (sortBy === "name") f.sort((a, b) => a.ObjectName.localeCompare(b.ObjectName));
    else if (sortBy === "size") f.sort((a, b) => (b.Length || 0) - (a.Length || 0));
    return f;
  })();

  // Upload
  const handleUpload = async (fileList) => {
    const now = new Date();
    const monthPath = `${currentPath}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
    const newUploads = Array.from(fileList).map(f => ({ id: Math.random().toString(36).slice(2), file: f, name: f.name, done: false, error: null }));
    setUploading(prev => [...prev, ...newUploads]);

    for (const u of newUploads) {
      try {
        const safeName = sanitize(u.file.name);
        const uniqueName = Date.now().toString(36) + "-" + safeName;
        const result = await bunnyUpload(u.file, monthPath, uniqueName);
        setUploading(prev => prev.map(x => x.id === u.id ? { ...x, done: true, cdnUrl: result.cdnUrl } : x));
        // Refresh listing
        loadPath(currentPath);
      } catch (err) {
        setUploading(prev => prev.map(x => x.id === u.id ? { ...x, error: err.message } : x));
      }
    }
    // Clear completed uploads after 3s
    setTimeout(() => setUploading(prev => prev.filter(u => !u.done)), 3000);
  };

  // Delete
  const handleDelete = async (item) => {
    const pathParts = (item.fullPath || "").split("/");
    const filename = pathParts.pop();
    const folder = pathParts.join("/");
    await bunnyDelete(folder, filename);
    setItems(prev => prev.filter(i => i.ObjectName !== item.ObjectName));
    if (selected?.ObjectName === item.ObjectName) setSelected(null);
  };

  // Bulk delete
  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedItems.size} files permanently?`)) return;
    const toDelete = files.filter(f => selectedItems.has(f.ObjectName));
    for (const item of toDelete) {
      try { await handleDelete(item); } catch (err) { console.error("Delete failed:", item.ObjectName, err); }
    }
    setSelectedItems(new Set());
  };

  const toggleSelect = (name) => setSelectedItems(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  // Drag/drop
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files); };

  const baseMin = 140;
  const scaledMin = Math.round(baseMin * thumbScale / 100);
  const thumbH = Math.round(100 * thumbScale / 100);

  // Breadcrumb
  const pathParts = currentPath.split("/").filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: embedded ? "100%" : undefined }}>
      {/* Header */}
      {!embedded && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY }}>Media Library</h2>
          <span style={{ fontSize: 12, color: Z.tm, fontFamily: COND }}>{files.length} files</span>
        </div>
      )}

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: COND }}>
        {pathParts.map((part, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span style={{ color: Z.tm }}>/</span>}
            <button onClick={() => navigate(pathParts.slice(0, i + 1).join("/"))} style={{ background: "none", border: "none", color: i === pathParts.length - 1 ? Z.tx : Z.ac, fontWeight: i === pathParts.length - 1 ? 700 : 500, cursor: "pointer", fontFamily: COND, fontSize: 11 }}>{part}</button>
          </span>
        ))}
      </div>

      {/* Upload zone */}
      <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.accept = "image/*,application/pdf,video/*"; inp.onchange = (e) => handleUpload(e.target.files); inp.click(); }} style={{
        border: `2px dashed ${dragOver ? Z.ac : Z.bd}`, borderRadius: 6, padding: dragOver ? "20px" : "12px 16px",
        background: dragOver ? Z.ac + "08" : Z.sa, textAlign: "center", cursor: "pointer", transition: "all 0.2s",
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: dragOver ? Z.ac : Z.tm, fontFamily: COND }}>
          {dragOver ? "Drop files here" : "Drag & drop files or click to upload"}
        </div>
      </div>

      {/* Upload progress */}
      {uploading.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {uploading.map(u => (
            <div key={u.id} style={{ padding: "4px 10px", borderRadius: 3, background: u.error ? "#fef2f2" : u.done ? "#f0fdf4" : Z.sa, border: "1px solid " + (u.error ? "#ef444430" : u.done ? "#22c55e30" : Z.bd), fontSize: 10, fontFamily: COND, color: u.error ? "#ef4444" : u.done ? "#22c55e" : Z.tm }}>
              {u.name} {u.error ? "\u2014 " + u.error : u.done ? "\u2713 Done" : "uploading..."}
            </div>
          ))}
        </div>
      )}

      {/* Publication tabs + toolbar */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        {PUB_FOLDERS.map(pf => {
          const isActive = currentPath === pf.slug || currentPath.startsWith(pf.slug + "/");
          return (
            <button key={pf.slug} onClick={() => navigate(pf.slug)} style={{
              padding: "5px 10px", borderRadius: 3, border: "1px solid " + (isActive ? Z.ac : Z.bd),
              background: isActive ? Z.ac + "12" : "transparent", color: isActive ? Z.ac : Z.tm,
              fontSize: 11, fontWeight: isActive ? 700 : 500, fontFamily: COND, cursor: "pointer",
            }}>{pf.label}</button>
          );
        })}
      </div>

      {/* View toggle + sort + search */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {/* Show All / Browse Folders toggle */}
        <div style={{ display: "flex", gap: 0, border: "1px solid " + Z.bd, borderRadius: 3 }}>
          <button onClick={() => setShowAll(true)} style={{ padding: "4px 10px", background: showAll ? Z.ac + "12" : "transparent", border: "none", color: showAll ? Z.ac : Z.tm, cursor: "pointer", fontSize: 11, fontFamily: COND, fontWeight: showAll ? 700 : 500 }}>All Files</button>
          <button onClick={() => setShowAll(false)} style={{ padding: "4px 10px", background: !showAll ? Z.ac + "12" : "transparent", border: "none", color: !showAll ? Z.ac : Z.tm, cursor: "pointer", fontSize: 11, fontFamily: COND, fontWeight: !showAll ? 700 : 500 }}>Folders</button>
        </div>
        {/* Subfolder nav — only in folder mode */}
        {!showAll && items.filter(i => i.IsDirectory).length > 0 && (
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {currentPath.includes("/") && (
              <button onClick={() => { setShowAll(false); setCurrentPath(currentPath.split("/").slice(0, -1).join("/")); }} style={{ padding: "3px 8px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tm, fontSize: 10, fontFamily: COND, cursor: "pointer" }}>{"\u2190"} Up</button>
            )}
            {items.filter(i => i.IsDirectory).map(f => (
              <button key={f.ObjectName} onClick={() => { setShowAll(false); setCurrentPath(currentPath + "/" + f.ObjectName); }} style={{ padding: "3px 8px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tx, fontSize: 10, fontFamily: COND, cursor: "pointer" }}>{f.ObjectName}</button>
            ))}
          </div>
        )}
        {loadProgress && <span style={{ fontSize: 10, color: Z.tm, fontFamily: COND, fontStyle: "italic" }}>{loadProgress}</span>}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "5px 8px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 11, fontFamily: COND }}>
          <option value="date">Newest</option>
          <option value="name">Name A-Z</option>
          <option value="size">Largest</option>
        </select>
        <div style={{ display: "flex", gap: 0, border: "1px solid " + Z.bd, borderRadius: 3 }}>
          <button onClick={() => setViewMode("grid")} style={{ padding: "4px 8px", background: viewMode === "grid" ? Z.ac + "12" : "transparent", border: "none", color: viewMode === "grid" ? Z.ac : Z.tm, cursor: "pointer", fontSize: 12 }}>{"\u25a6"}</button>
          <button onClick={() => setViewMode("list")} style={{ padding: "4px 8px", background: viewMode === "list" ? Z.ac + "12" : "transparent", border: "none", color: viewMode === "list" ? Z.ac : Z.tm, cursor: "pointer", fontSize: 12 }}>{"\u2630"}</button>
        </div>
        {viewMode === "grid" && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 9, color: Z.tm, fontFamily: COND }}>Size</span>
            <input type="range" min={100} max={150} value={thumbScale} onChange={e => setThumbScale(Number(e.target.value))} style={{ width: 60, accentColor: Z.ac }} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ minWidth: 180 }}><SB value={search} onChange={setSearch} placeholder="Search files..." /></div>
      </div>

      {/* Bulk bar */}
      {selectedItems.size > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 12px", background: Z.ac + "08", borderRadius: 3, border: "1px solid " + Z.ac + "20" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: Z.ac, fontFamily: COND }}>{selectedItems.size} selected</span>
          <button onClick={bulkDelete} style={{ padding: "3px 10px", borderRadius: 3, border: "1px solid #ef444430", background: "transparent", color: "#ef4444", fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>Delete Selected</button>
          <button onClick={() => setSelectedItems(new Set())} style={{ padding: "3px 10px", borderRadius: 3, border: "1px solid " + Z.bd, background: "transparent", color: Z.tm, fontSize: 11, fontFamily: COND, cursor: "pointer" }}>Clear</button>
        </div>
      )}

      {/* Main content: grid + detail */}
      <div style={{ display: "flex", flex: 1, minHeight: 400, gap: 0 }}>
        {/* File grid/list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: 13 }}>Loading...</div>}
          {!loading && files.length === 0 && <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: 13 }}>No files in this folder</div>}

          {!loading && viewMode === "grid" && (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${scaledMin}px, 1fr))`, gap: 8 }}>
              {files.map(item => {
                const url = item.cdnUrl || `${CDN_BASE}/${item.fullPath}`;
                const isSel = selectedItems.has(item.ObjectName);
                const isActive = selected?.ObjectName === item.ObjectName;
                return (
                  <div key={item.ObjectName} onClick={() => { if (selected?.ObjectName === item.ObjectName) setLightbox(item); else setSelected(item); }} style={{
                    borderRadius: 4, border: `2px solid ${isActive ? Z.ac : isSel ? Z.ac + "60" : Z.bd}`,
                    background: Z.sf, cursor: "pointer", overflow: "hidden", position: "relative",
                  }}>
                    <div onClick={(e) => { e.stopPropagation(); toggleSelect(item.ObjectName); }} style={{
                      position: "absolute", top: 4, left: 4, width: 18, height: 18, borderRadius: 3,
                      border: "2px solid " + (isSel ? Z.ac : "rgba(255,255,255,0.6)"), background: isSel ? Z.ac : "rgba(0,0,0,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 1,
                    }}>
                      {isSel && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{"\u2713"}</span>}
                    </div>
                    {isImage(item.ObjectName) ? (
                      <div style={{ width: "100%", height: thumbH, background: Z.sa }}>
                        <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    ) : (
                      <div style={{ width: "100%", height: thumbH, background: Z.sa, display: "flex", alignItems: "center", justifyContent: "center", color: Z.tm, fontSize: 10, fontFamily: COND }}>
                        {item.ObjectName.split(".").pop()?.toUpperCase() || "FILE"}
                      </div>
                    )}
                    <div style={{ padding: "6px 8px" }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: Z.tx, fontFamily: COND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.ObjectName}</div>
                      <div style={{ fontSize: 9, color: Z.tm, fontFamily: COND }}>{fmtSize(item.Length)} {"\u00b7"} {fmtDate(item.DateCreated)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && viewMode === "list" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: Z.tm, fontFamily: COND, borderBottom: "1px solid " + Z.bd }}>
                <span style={{ width: 20 }}></span>
                <span style={{ width: 36 }}>Thumb</span>
                <span style={{ flex: 1 }}>Filename</span>
                <span style={{ width: 70, textAlign: "right" }}>Size</span>
                <span style={{ width: 90 }}>Date</span>
              </div>
              {files.map(item => {
                const url = item.cdnUrl || `${CDN_BASE}/${item.fullPath}`;
                const isSel = selectedItems.has(item.ObjectName);
                const isActive = selected?.ObjectName === item.ObjectName;
                return (
                  <div key={item.ObjectName} onClick={() => { if (selected?.ObjectName === item.ObjectName) setLightbox(item); else setSelected(item); }} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 3, cursor: "pointer",
                    background: isActive ? Z.ac + "08" : "transparent",
                  }}>
                    <div onClick={(e) => { e.stopPropagation(); toggleSelect(item.ObjectName); }} style={{
                      width: 16, height: 16, borderRadius: 3, border: "2px solid " + (isSel ? Z.ac : Z.bd), flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: isSel ? Z.ac : "transparent",
                    }}>
                      {isSel && <span style={{ color: "#fff", fontSize: 9 }}>{"\u2713"}</span>}
                    </div>
                    {isImage(item.ObjectName) ? (
                      <img src={url} alt="" loading="lazy" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: 3, background: Z.sa, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: Z.tm, flexShrink: 0 }}>{item.ObjectName.split(".").pop()?.toUpperCase()}</div>
                    )}
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: Z.tx, fontFamily: COND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.ObjectName}</span>
                    <span style={{ width: 70, fontSize: 10, color: Z.tm, fontFamily: COND, textAlign: "right" }}>{fmtSize(item.Length)}</span>
                    <span style={{ width: 90, fontSize: 10, color: Z.tm, fontFamily: COND }}>{fmtDate(item.DateCreated)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <DetailPanel
            item={selected}
            currentPath={currentPath}
            onClose={() => setSelected(null)}
            onDelete={handleDelete}
            onSelect={onSelect ? (data) => { onSelect(data); } : undefined}
            selectMode={!!onSelect}
          />
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (() => {
        const lbUrl = lightbox.cdnUrl || `${CDN_BASE}/${lightbox.fullPath}`;
        return (
          <div onClick={() => setLightbox(null)} style={{
            position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: "88vw", height: "88vh", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", position: "relative",
            }}>
              <button onClick={() => setLightbox(null)} style={{
                position: "absolute", top: 0, right: 0, background: "rgba(255,255,255,0.15)",
                border: "none", color: "#fff", fontSize: 22, cursor: "pointer", width: 36, height: 36,
                borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center",
              }}>{"\u00d7"}</button>
              {isImage(lightbox.ObjectName) ? (
                <img src={lbUrl} alt="" style={{ maxWidth: "100%", maxHeight: "calc(88vh - 60px)", objectFit: "contain", borderRadius: 4 }} />
              ) : (
                <div style={{ color: "#fff", fontSize: 14, fontFamily: COND }}>{lightbox.ObjectName}</div>
              )}
              <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: COND }}>{lightbox.ObjectName}</span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: COND }}>{fmtSize(lightbox.Length)}</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
