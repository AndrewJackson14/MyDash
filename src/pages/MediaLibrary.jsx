import { useState, useEffect, useCallback, useRef } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, ZI, INV } from "../lib/theme";
import { Ic, Btn, SB } from "../components/ui";
import { supabase } from "../lib/supabase";

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

// Progressively list files from subfolders (one folder at a time, newest first)
async function bunnyListProgressive(path, onBatch, signal) {
  const root = await bunnyList(path);
  const rootFiles = root.filter(i => !i.IsDirectory);
  if (rootFiles.length > 0) onBatch(rootFiles);

  // Get subdirectories sorted newest first (descending by name for year/month dirs)
  const dirs = root.filter(i => i.IsDirectory).sort((a, b) => b.ObjectName.localeCompare(a.ObjectName));

  for (const dir of dirs) {
    if (signal?.aborted) return;
    try {
      const subItems = await bunnyList(path + "/" + dir.ObjectName);
      const subFiles = subItems.filter(i => !i.IsDirectory);
      if (subFiles.length > 0) onBatch(subFiles);

      // Go one level deeper (month dirs inside year dirs)
      const subDirs = subItems.filter(i => i.IsDirectory).sort((a, b) => b.ObjectName.localeCompare(a.ObjectName));
      for (const subDir of subDirs) {
        if (signal?.aborted) return;
        try {
          const deepItems = await bunnyList(path + "/" + dir.ObjectName + "/" + subDir.ObjectName);
          const deepFiles = deepItems.filter(i => !i.IsDirectory);
          if (deepFiles.length > 0) onBatch(deepFiles);
        } catch (e) { /* skip failed subfolder */ }
      }
    } catch (e) { /* skip failed folder */ }
  }
}

async function bunnyUpload(file, path, filename) {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-action": "upload",
      "x-path": path,
      "x-filename": encodeURIComponent(filename),
    },
    body: file,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Upload failed"); }
  return res.json();
}

async function bunnyDelete(path, filename) {
  const res = await fetch(PROXY_URL, {
    method: "DELETE",
    headers: { "x-action": "delete", "x-path": path, "x-filename": encodeURIComponent(filename) },
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

  const inputStyle = { width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND };

  return (
    <div style={{ width: 320, flexShrink: 0, borderLeft: "1px solid " + Z.bd, background: Z.sf, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: COND, color: Z.tx }}>Details</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 16 }}>{"\u00d7"}</button>
      </div>

      {isImage(item.ObjectName) && (
        <img src={url} alt="" loading="lazy" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: R, background: Z.sa, border: "1px solid " + Z.bd }} />
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
          <button onClick={copyUrl} style={{ padding: "4px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sa, color: copied ? "#22c55e" : Z.tx, fontSize: 10, fontFamily: COND, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            {copied ? "\u2713 Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
        {selectMode && <Btn sm onClick={() => onSelect({ url, fileName: item.ObjectName })} style={{ background: Z.ac + "12", color: Z.ac, border: "1px solid " + Z.ac + "40" }}>Select This Image</Btn>}
        <button onClick={() => { if (confirm("Delete " + item.ObjectName + " permanently?")) onDelete(item); }} style={{ padding: "6px 10px", borderRadius: Ri, border: `1px solid ${Z.da}40`, background: "transparent", color: Z.da, fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>
          Delete
        </button>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// UNUSED IMAGES SCANNER
// Collects all CDN URLs referenced by stories + site settings,
// then compares against all files in BunnyCDN to find orphans.
// ══════════════════════════════════════════════════════════════════
const CDN_PATTERN = /https?:\/\/cdn\.13stars\.media\/[^\s"'<>)]+/g;

async function collectReferencedUrls() {
  const urls = new Set();

  // 1. Featured images from stories
  const { data: featured } = await supabase
    .from("stories")
    .select("featured_image_url")
    .not("featured_image_url", "is", null);
  (featured || []).forEach(s => { if (s.featured_image_url) urls.add(s.featured_image_url); });

  // 2. Inline images from story body HTML
  const { data: bodies } = await supabase
    .from("stories")
    .select("body")
    .not("body", "is", null);
  (bodies || []).forEach(s => {
    const matches = (s.body || "").match(CDN_PATTERN);
    if (matches) matches.forEach(u => urls.add(u));
  });

  // 3. Site logos and favicons
  const { data: sites } = await supabase
    .from("sites")
    .select("logo_url, favicon_url, settings");
  (sites || []).forEach(s => {
    if (s.logo_url) urls.add(s.logo_url);
    if (s.favicon_url) urls.add(s.favicon_url);
    if (s.settings?.logo_url) urls.add(s.settings.logo_url);
  });

  return urls;
}

// Streaming scanner: processes one pub folder at a time, comparing on the fly.
// Only orphans are kept in memory — not the full 100K+ file list.
async function scanForOrphans(referencedUrls, onProgress, onOrphanBatch, signal) {
  const normalizedRefs = new Set();
  referencedUrls.forEach(u => normalizedRefs.add(decodeURIComponent(u).toLowerCase().replace(/\/$/, "")));

  let totalFiles = 0;
  let referencedCount = 0;
  let orphanCount = 0;
  let orphanBytes = 0;

  const folders = [...PUB_FOLDERS, { slug: "featured", label: "Featured" }];

  for (const pf of folders) {
    if (signal?.aborted) break;
    onProgress?.({ message: `Scanning ${pf.label}...`, totalFiles, referencedCount, orphanCount, orphanBytes, currentPub: pf.label });

    try {
      await bunnyListProgressive(pf.slug, (batch) => {
        if (signal?.aborted) return;
        const batchOrphans = [];
        batch.forEach(f => {
          totalFiles++;
          const url = (f.cdnUrl || `${CDN_BASE}/${f.fullPath}`).toLowerCase();
          if (normalizedRefs.has(url)) {
            referencedCount++;
          } else {
            batchOrphans.push(f);
            orphanCount++;
            orphanBytes += f.Length || 0;
          }
        });
        if (batchOrphans.length > 0) onOrphanBatch?.(batchOrphans);
        onProgress?.({ message: `Scanning ${pf.label}...`, totalFiles, referencedCount, orphanCount, orphanBytes, currentPub: pf.label });
      }, signal);
    } catch (e) { /* skip failed folder */ }
  }

  return { totalFiles, referencedCount, orphanCount, orphanBytes };
}

const UnusedImagesPanel = ({ onClose }) => {
  const [phase, setPhase] = useState("idle"); // idle | scanning | done | deleting
  const [progress, setProgress] = useState(null); // { message, totalFiles, referencedCount, orphanCount, orphanBytes, currentPub }
  const [orphans, setOrphans] = useState([]);
  const [selectedOrphans, setSelectedOrphans] = useState(new Set());
  const [deleteProgress, setDeleteProgress] = useState("");
  const [stats, setStats] = useState(null);
  const [refsCount, setRefsCount] = useState(0);
  const [orphanPage, setOrphanPage] = useState(120);
  const abortRef = useRef(null);

  const startScan = async () => {
    setPhase("scanning");
    setProgress({ message: "Loading referenced URLs from stories & sites...", totalFiles: 0, referencedCount: 0, orphanCount: 0, orphanBytes: 0 });
    setOrphans([]);
    setSelectedOrphans(new Set());
    setStats(null);
    setOrphanPage(120);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const referencedUrls = await collectReferencedUrls();
      if (controller.signal.aborted) return;
      setRefsCount(referencedUrls.size);

      const result = await scanForOrphans(
        referencedUrls,
        (p) => { if (!controller.signal.aborted) setProgress(p); },
        (batch) => { if (!controller.signal.aborted) setOrphans(prev => [...prev, ...batch]); },
        controller.signal,
      );

      if (controller.signal.aborted) return;
      setStats({
        total: result.totalFiles,
        referenced: result.referencedCount,
        orphaned: result.orphanCount,
        orphanBytes: result.orphanBytes,
      });
      // Sort orphans by size (largest first) after scan completes
      setOrphans(prev => [...prev].sort((a, b) => (b.Length || 0) - (a.Length || 0)));
      setPhase("done");
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error("Scan failed:", err);
        setProgress({ message: "Scan failed: " + err.message, totalFiles: 0, referencedCount: 0, orphanCount: 0, orphanBytes: 0 });
        setPhase("idle");
      }
    }
  };

  const cancelScan = () => { abortRef.current?.abort(); setPhase("idle"); setProgress(null); };

  const toggleOrphan = (name) => setSelectedOrphans(prev => {
    const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n;
  });

  const selectAll = () => setSelectedOrphans(new Set(orphans.map(f => f.ObjectName)));
  const selectNone = () => setSelectedOrphans(new Set());

  const deleteSelected = async () => {
    const count = selectedOrphans.size;
    if (!confirm(`Permanently delete ${count} unused image${count !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setPhase("deleting");
    let done = 0;
    const toDelete = orphans.filter(f => selectedOrphans.has(f.ObjectName));
    for (const item of toDelete) {
      try {
        const pathParts = (item.fullPath || "").split("/");
        const filename = pathParts.pop();
        const folder = pathParts.join("/");
        await bunnyDelete(folder, filename);
        done++;
        setDeleteProgress(`Deleted ${done} of ${count}...`);
      } catch (err) {
        console.error("Delete failed:", item.ObjectName, err);
      }
    }
    // Remove deleted from orphans list
    setOrphans(prev => prev.filter(f => !selectedOrphans.has(f.ObjectName)));
    setSelectedOrphans(new Set());
    setStats(prev => prev ? { ...prev, orphaned: prev.orphaned - done, orphanBytes: prev.orphanBytes - toDelete.reduce((s, f) => s + (f.Length || 0), 0) } : prev);
    setDeleteProgress("");
    setPhase("done");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY }}>Find Unused Images</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 13, fontFamily: COND, fontWeight: 600 }}>← Back to Library</button>
      </div>

      <div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND, lineHeight: 1.5 }}>
        Scans all CDN files across every publication folder and compares them against images referenced in stories (featured images + inline body images) and site settings (logos, favicons). Files not referenced anywhere are flagged for review.
      </div>

      {/* Action bar */}
      {phase === "idle" && (
        <div><Btn onClick={startScan}>Scan All Publications</Btn></div>
      )}
      {phase === "scanning" && progress && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{progress.message}</div>
            <button onClick={cancelScan} style={{ padding: "4px 12px", borderRadius: Ri, border: "1px solid " + Z.bd, background: "transparent", color: Z.tm, fontSize: 11, fontFamily: COND, cursor: "pointer" }}>Cancel</button>
          </div>
          {/* Live counters during scan */}
          <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: COND, color: Z.tm }}>
            {refsCount > 0 && <span>Referenced URLs: <b style={{ color: Z.tx }}>{refsCount.toLocaleString()}</b></span>}
            <span>Files scanned: <b style={{ color: Z.tx }}>{progress.totalFiles.toLocaleString()}</b></span>
            <span>Referenced: <b style={{ color: Z.go }}>{progress.referencedCount.toLocaleString()}</b></span>
            <span>Orphaned: <b style={{ color: progress.orphanCount > 0 ? Z.da : Z.tm }}>{progress.orphanCount.toLocaleString()}</b></span>
            <span>Reclaimable: <b style={{ color: Z.wa }}>{fmtSize(progress.orphanBytes)}</b></span>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && phase !== "scanning" && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Total CDN Files", value: stats.total.toLocaleString() },
            { label: "Referenced by Stories/Sites", value: stats.referenced.toLocaleString(), color: Z.go },
            { label: "Unused / Orphaned", value: stats.orphaned.toLocaleString(), color: stats.orphaned > 0 ? Z.da : Z.go },
            { label: "Reclaimable Space", value: fmtSize(stats.orphanBytes), color: stats.orphaned > 0 ? Z.wa : Z.tm },
          ].map(s => (
            <div key={s.label} style={{ padding: "12px 16px", borderRadius: R, border: "1px solid " + Z.bd, background: Z.sf, minWidth: 140 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color || Z.tx, fontFamily: DISPLAY }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Orphan list */}
      {phase === "done" && orphans.length === 0 && (
        <div style={{ padding: 32, textAlign: "center", color: Z.go, fontSize: FS.md, fontWeight: FW.bold, fontFamily: COND }}>
          All images are referenced by stories or site settings. Nothing to purge.
        </div>
      )}

      {/* Show orphans as they stream in during scan, or after done */}
      {(phase === "done" || (phase === "scanning" && orphans.length > 0)) && orphans.length > 0 && (
        <>
          {/* Bulk bar */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={selectedOrphans.size === orphans.length ? selectNone : selectAll} style={{ padding: "5px 12px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tx, fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>
              {selectedOrphans.size === orphans.length ? "Deselect All" : "Select All"}
            </button>
            {selectedOrphans.size > 0 && (
              <Btn sm v="danger" onClick={deleteSelected}>
                Delete {selectedOrphans.size} Unused Image{selectedOrphans.size !== 1 ? "s" : ""}
              </Btn>
            )}
            {deleteProgress && <span style={{ fontSize: 11, color: Z.wa, fontFamily: COND }}>{deleteProgress}</span>}
            <span style={{ fontSize: 11, color: Z.tm, fontFamily: COND }}>{selectedOrphans.size} of {orphans.length} selected</span>
            <div style={{ flex: 1 }} />
            <button onClick={startScan} style={{ padding: "5px 12px", borderRadius: Ri, border: "1px solid " + Z.bd, background: "transparent", color: Z.tm, fontSize: 11, fontFamily: COND, cursor: "pointer" }}>Re-scan</button>
          </div>

          {/* Grid of orphaned images (paginated) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
            {orphans.slice(0, orphanPage).map(item => {
              const url = item.cdnUrl || `${CDN_BASE}/${item.fullPath}`;
              const isSel = selectedOrphans.has(item.ObjectName);
              return (
                <div key={item.fullPath || item.ObjectName} onClick={() => toggleOrphan(item.ObjectName)} style={{
                  borderRadius: R, border: `2px solid ${isSel ? Z.da : Z.bd}`,
                  background: isSel ? Z.da + "08" : Z.sf, cursor: "pointer", overflow: "hidden", position: "relative",
                }}>
                  <div style={{
                    position: "absolute", top: 4, left: 4, width: 18, height: 18, borderRadius: Ri,
                    border: "2px solid " + (isSel ? Z.da : "rgba(255,255,255,0.6)"), background: isSel ? Z.da : "rgba(0,0,0,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: ZI.raised,
                  }}>
                    {isSel && <span style={{ color: INV.light, fontSize: 10, fontWeight: 700 }}>✓</span>}
                  </div>
                  {isImage(item.ObjectName) ? (
                    <div style={{ width: "100%", height: 100, background: Z.sa }}>
                      <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  ) : (
                    <div style={{ width: "100%", height: 100, background: Z.sa, display: "flex", alignItems: "center", justifyContent: "center", color: Z.tm, fontSize: 10, fontFamily: COND }}>
                      {item.ObjectName.split(".").pop()?.toUpperCase() || "FILE"}
                    </div>
                  )}
                  <div style={{ padding: "6px 8px" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: Z.tx, fontFamily: COND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.ObjectName}</div>
                    <div style={{ fontSize: 9, color: Z.tm, fontFamily: COND }}>{fmtSize(item.Length)} · {item.fullPath?.split("/").slice(0, -1).join("/") || ""}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {orphans.length > orphanPage && (
            <div style={{ padding: "12px 0", textAlign: "center" }}>
              <button onClick={() => setOrphanPage(p => p + 120)} style={{ padding: "8px 24px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tx, fontSize: 12, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>
                Show More ({(orphans.length - orphanPage).toLocaleString()} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {phase === "deleting" && (
        <div style={{ padding: 32, textAlign: "center", color: Z.wa, fontSize: FS.md, fontFamily: COND }}>
          {deleteProgress || "Deleting..."}
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// MEDIA LIBRARY
// ══════════════════════════════════════════════════════════════════
export default function MediaLibrary({ pubs, embedded, onSelect, pubFilter }) {
  const [showUnused, setShowUnused] = useState(false);
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
  const [showAll, setShowAll] = useState(false); // folder-browse by default (avoids loading 100K+ files)
  const [loadProgress, setLoadProgress] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const abortRef = useRef(null);
  const searchTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Load directory (flat progressive or single folder)
  const loadPath = useCallback(async (path, progressive) => {
    // Abort any previous progressive scan
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setItems([]);
    setLoadProgress("");
    try {
      if (progressive) {
        setLoadingMore(true);
        let count = 0;
        await bunnyListProgressive(path, (batch) => {
          if (controller.signal.aborted) return;
          count += batch.length;
          setItems(prev => [...prev, ...batch]);
          setLoadProgress(count + " files loaded...");
        }, controller.signal);
        setLoadingMore(false);
        setLoadProgress(count + " files");
      } else {
        const data = await bunnyList(path);
        setItems(data || []);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error("Failed to list:", err);
        setItems([]);
      }
    }
    if (!controller.signal.aborted) setLoading(false);
  }, []);

  useEffect(() => { loadPath(currentPath, showAll); return () => { if (abortRef.current) abortRef.current.abort(); }; }, [currentPath, showAll, loadPath]);

  const [visibleCount, setVisibleCount] = useState(60);

  const navigate = (path) => {
    setCurrentPath(path);
    setSelected(null);
    setSelectedItems(new Set());
    setSearch("");
    setVisibleCount(60);
  };

  // Filter and sort files (exclude directories for grid display)
  const allFiles = (() => {
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
  const files = allFiles.slice(0, visibleCount);
  const hasMore = allFiles.length > visibleCount;

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

  // Show unused images scanner
  if (showUnused && !embedded) {
    return <UnusedImagesPanel onClose={() => setShowUnused(false)} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: embedded ? "100%" : undefined }}>
      {/* Header */}
      {!embedded && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY }}>Media Library</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: Z.tm, fontFamily: COND }}>{allFiles.length.toLocaleString()} files{loadingMore ? " (scanning...)" : ""}{loadProgress ? " · " + loadProgress : ""}</span>
            <button onClick={() => setShowUnused(true)} style={{ padding: "5px 12px", borderRadius: Ri, border: "1px solid " + Z.da + "40", background: "transparent", color: Z.da, fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>Find Unused Images</button>
          </div>
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
        border: `2px dashed ${dragOver ? Z.ac : Z.bd}`, borderRadius: R, padding: dragOver ? "20px" : "12px 16px",
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
            <div key={u.id} style={{ padding: "4px 10px", borderRadius: Ri, background: u.error ? "#fef2f2" : u.done ? "#f0fdf4" : Z.sa, border: "1px solid " + (u.error ? Z.da + "30" : u.done ? "#22c55e30" : Z.bd), fontSize: 10, fontFamily: COND, color: u.error ? Z.da : u.done ? "#22c55e" : Z.tm }}>
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
              padding: "5px 10px", borderRadius: Ri, border: "1px solid " + (isActive ? Z.ac : Z.bd),
              background: isActive ? Z.ac + "12" : "transparent", color: isActive ? Z.ac : Z.tm,
              fontSize: 11, fontWeight: isActive ? 700 : 500, fontFamily: COND, cursor: "pointer",
            }}>{pf.label}</button>
          );
        })}
      </div>

      {/* View toggle + sort + search */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {/* Show All / Browse Folders toggle */}
        <div style={{ display: "flex", gap: 0, border: "1px solid " + Z.bd, borderRadius: Ri }}>
          <button onClick={() => setShowAll(true)} style={{ padding: "4px 10px", background: showAll ? Z.ac + "12" : "transparent", border: "none", color: showAll ? Z.ac : Z.tm, cursor: "pointer", fontSize: 11, fontFamily: COND, fontWeight: showAll ? 700 : 500 }}>All Files</button>
          <button onClick={() => setShowAll(false)} style={{ padding: "4px 10px", background: !showAll ? Z.ac + "12" : "transparent", border: "none", color: !showAll ? Z.ac : Z.tm, cursor: "pointer", fontSize: 11, fontFamily: COND, fontWeight: !showAll ? 700 : 500 }}>Folders</button>
        </div>
        {/* Subfolder nav — only in folder mode */}
        {!showAll && items.filter(i => i.IsDirectory).length > 0 && (
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {currentPath.includes("/") && (
              <button onClick={() => { setShowAll(false); setCurrentPath(currentPath.split("/").slice(0, -1).join("/")); }} style={{ padding: "3px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tm, fontSize: 10, fontFamily: COND, cursor: "pointer" }}>{"\u2190"} Up</button>
            )}
            {items.filter(i => i.IsDirectory).map(f => (
              <button key={f.ObjectName} onClick={() => { setShowAll(false); setCurrentPath(currentPath + "/" + f.ObjectName); }} style={{ padding: "3px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tx, fontSize: 10, fontFamily: COND, cursor: "pointer" }}>{f.ObjectName}</button>
            ))}
          </div>
        )}
        {loadProgress && <span style={{ fontSize: 10, color: Z.tm, fontFamily: COND, fontStyle: "italic" }}>{loadProgress}</span>}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "5px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 11, fontFamily: COND }}>
          <option value="date">Newest</option>
          <option value="name">Name A-Z</option>
          <option value="size">Largest</option>
        </select>
        <div style={{ display: "flex", gap: 0, border: "1px solid " + Z.bd, borderRadius: Ri }}>
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 12px", background: Z.ac + "08", borderRadius: Ri, border: "1px solid " + Z.ac + "20" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: Z.ac, fontFamily: COND }}>{selectedItems.size} selected</span>
          <button onClick={bulkDelete} style={{ padding: "3px 10px", borderRadius: Ri, border: `1px solid ${Z.da}30`, background: "transparent", color: Z.da, fontSize: 11, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>Delete Selected</button>
          <button onClick={() => setSelectedItems(new Set())} style={{ padding: "3px 10px", borderRadius: Ri, border: "1px solid " + Z.bd, background: "transparent", color: Z.tm, fontSize: 11, fontFamily: COND, cursor: "pointer" }}>Clear</button>
        </div>
      )}

      {/* Main content: grid + detail */}
      <div style={{ display: "flex", flex: 1, minHeight: 400, gap: 0 }}>
        {/* File grid/list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && files.length === 0 && <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: 13 }}>Loading...</div>}
          {!loading && !loadingMore && allFiles.length === 0 && <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: 13 }}>No files in this folder</div>}

          {!loading && viewMode === "grid" && (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${scaledMin}px, 1fr))`, gap: 8 }}>
              {files.map(item => {
                const url = item.cdnUrl || `${CDN_BASE}/${item.fullPath}`;
                const isSel = selectedItems.has(item.ObjectName);
                const isActive = selected?.ObjectName === item.ObjectName;
                return (
                  <div key={item.ObjectName} onClick={() => { if (selected?.ObjectName === item.ObjectName) setLightbox(item); else setSelected(item); }} style={{
                    borderRadius: R, border: `2px solid ${isActive ? Z.ac : isSel ? Z.ac + "60" : Z.bd}`,
                    background: Z.sf, cursor: "pointer", overflow: "hidden", position: "relative",
                  }}>
                    <div onClick={(e) => { e.stopPropagation(); toggleSelect(item.ObjectName); }} style={{
                      position: "absolute", top: 4, left: 4, width: 18, height: 18, borderRadius: Ri,
                      border: "2px solid " + (isSel ? Z.ac : "rgba(255,255,255,0.6)"), background: isSel ? Z.ac : "rgba(0,0,0,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: ZI.raised,
                    }}>
                      {isSel && <span style={{ color: INV.light, fontSize: 10, fontWeight: 700 }}>{"\u2713"}</span>}
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
                    display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: Ri, cursor: "pointer",
                    background: isActive ? Z.ac + "08" : "transparent",
                  }}>
                    <div onClick={(e) => { e.stopPropagation(); toggleSelect(item.ObjectName); }} style={{
                      width: 16, height: 16, borderRadius: Ri, border: "2px solid " + (isSel ? Z.ac : Z.bd), flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: isSel ? Z.ac : "transparent",
                    }}>
                      {isSel && <span style={{ color: INV.light, fontSize: 9 }}>{"\u2713"}</span>}
                    </div>
                    {isImage(item.ObjectName) ? (
                      <img src={url} alt="" loading="lazy" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: Ri, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: Ri, background: Z.sa, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: Z.tm, flexShrink: 0 }}>{item.ObjectName.split(".").pop()?.toUpperCase()}</div>
                    )}
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: Z.tx, fontFamily: COND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.ObjectName}</span>
                    <span style={{ width: 70, fontSize: 10, color: Z.tm, fontFamily: COND, textAlign: "right" }}>{fmtSize(item.Length)}</span>
                    <span style={{ width: 90, fontSize: 10, color: Z.tm, fontFamily: COND }}>{fmtDate(item.DateCreated)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Load More / status */}
          {hasMore && (
            <div style={{ padding: "16px 0", textAlign: "center" }}>
              <button onClick={() => setVisibleCount(prev => prev + 60)} style={{ padding: "8px 24px", borderRadius: R, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tx, fontSize: 12, fontFamily: COND, fontWeight: 600, cursor: "pointer" }}>
                Show More ({allFiles.length - visibleCount} remaining)
              </button>
            </div>
          )}
          {loadingMore && (
            <div style={{ padding: "12px 0", textAlign: "center", fontSize: 11, color: Z.tm, fontFamily: COND }}>
              {loadProgress || "Scanning folders..."}
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
            position: "fixed", inset: 0, zIndex: ZI.overlay, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: "88vw", height: "88vh", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", position: "relative",
            }}>
              <button onClick={() => setLightbox(null)} style={{
                position: "absolute", top: 0, right: 0, background: "rgba(255,255,255,0.15)",
                border: "none", color: INV.light, fontSize: 22, cursor: "pointer", width: 36, height: 36,
                borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center",
              }}>{"\u00d7"}</button>
              {isImage(lightbox.ObjectName) ? (
                <img src={lbUrl} alt="" style={{ maxWidth: "100%", maxHeight: "calc(88vh - 60px)", objectFit: "contain", borderRadius: R }} />
              ) : (
                <div style={{ color: INV.light, fontSize: 14, fontFamily: COND }}>{lightbox.ObjectName}</div>
              )}
              <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ color: INV.light, fontSize: 13, fontWeight: 600, fontFamily: COND }}>{lightbox.ObjectName}</span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: COND }}>{fmtSize(lightbox.Length)}</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
