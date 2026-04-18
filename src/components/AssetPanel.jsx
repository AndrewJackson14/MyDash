// ============================================================
// AssetPanel.jsx — Reusable asset upload/browse component
// Used in Ad Projects (project + global) and Client Profile (global)
// Uploads to BunnyCDN via bunny-storage edge function
// ============================================================
import { useState, useEffect, memo } from "react";
import { Z, FS, FW, Ri, R, COND } from "../lib/theme";
import { Ic, Btn } from "../components/ui";
import { supabase, EDGE_FN_URL } from "../lib/supabase";
import { uploadMedia } from "../lib/media";

const PROXY_URL = EDGE_FN_URL + "/bunny-storage";
const CDN_BASE = "https://cdn.13stars.media";

const isImage = (name) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);
const isPdf = (name) => /\.pdf$/i.test(name);
const fmtSize = (bytes) => bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1048576).toFixed(1)}MB`;

// `path` is legacy — it used to point at a Bunny folder and the list
// was a direct bunny list call. uploadMedia writes files to
// /media/YYYY/MM/, not to the path prop, so the list never showed
// anything uploaded through this panel. We now query media_assets by
// the metadata props that uploadMedia tags each row with; path is
// retained only so legacy callers don't have to be touched yet.
//
// `bunnyFallbackFolder` lets callers layer a direct-Bunny folder on
// top of the media_assets query. This is how we surface files that
// landed on disk without a media_assets row — currently the public
// ClientUpload flow writes to ad_projects.client_assets_path on
// Bunny without auth to insert into media_assets, and the designer's
// AssetPanel was missing those files.
const AssetPanel = memo(({ path, title = "Assets", allowUpload = true, compact = false, clientId, adProjectId, publicationId, legalNoticeId, category = "general", bunnyFallbackFolder }) => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Load assets from media_assets, filtered by whichever metadata anchors
  // the panel. Most specific wins: legal notice > ad project > client +
  // category > publication. Without at least one filter we render empty
  // (the "don't list every asset in the system" safety valve).
  //
  // If bunnyFallbackFolder is provided, we additionally list that Bunny
  // folder and append any files whose name isn't already represented by
  // a media_assets row (media_assets wins on dedupe — it has metadata).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clientId && !adProjectId && !publicationId && !legalNoticeId) {
        setAssets([]); setLoading(false); return;
      }
      setLoading(true);
      let q = supabase.from("media_assets")
        .select("id, file_name, cdn_url, file_url, file_size, created_at, storage_path")
        .order("created_at", { ascending: false })
        .limit(200);
      if (legalNoticeId) q = q.eq("legal_notice_id", legalNoticeId);
      else if (adProjectId) q = q.eq("ad_project_id", adProjectId);
      else if (clientId) {
        q = q.eq("client_id", clientId);
        if (category) q = q.eq("category", category);
      }
      else if (publicationId) q = q.eq("publication_id", publicationId);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) { console.error("Asset list error:", error); setAssets([]); setLoading(false); return; }
      const fromMedia = (data || []).map(r => ({
        id: r.id,
        name: r.file_name,
        url: r.cdn_url || r.file_url,
        size: r.file_size || 0,
        date: r.created_at,
        storagePath: r.storage_path,
      }));

      // Supplement with direct-Bunny listing for flows that don't write
      // media_assets rows (e.g. the public ClientUpload page).
      let fromBunny = [];
      if (bunnyFallbackFolder) {
        try {
          const res = await fetch(PROXY_URL, {
            headers: { "x-action": "list", "x-path": bunnyFallbackFolder },
          });
          if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list)) {
              const mediaNames = new Set(fromMedia.map(a => a.name));
              fromBunny = list
                .filter(f => !f.IsDirectory && !mediaNames.has(f.ObjectName))
                .map(f => ({
                  id: `bunny:${bunnyFallbackFolder}/${f.ObjectName}`,
                  name: f.ObjectName,
                  url: `${CDN_BASE}/${bunnyFallbackFolder}/${f.ObjectName}`,
                  size: f.Length || 0,
                  date: f.LastChanged || f.DateCreated,
                  storagePath: `${bunnyFallbackFolder}/${f.ObjectName}`,
                }));
            }
          }
        } catch (err) { console.warn("Bunny fallback list error:", err); }
      }

      if (cancelled) return;
      setAssets([...fromMedia, ...fromBunny]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId, adProjectId, publicationId, legalNoticeId, category, bunnyFallbackFolder]);

  // Upload — routes through the shared uploadMedia() helper so every
  // asset gets a tagged media_assets row with the context metadata
  // (client_id, ad_project_id, publication_id, category) baked in.
  const handleUpload = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.multiple = true;
    inp.accept = "image/*,application/pdf,.ai,.eps,.psd,.indd";
    inp.onchange = async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      setUploading(true);
      for (const f of files) {
        try {
          const row = await uploadMedia(f, { clientId, adProjectId, publicationId, category });
          setAssets(prev => [{
            id: row.id,
            name: row.file_name,
            url: row.cdn_url || row.file_url,
            size: row.file_size || f.size,
            date: row.created_at || new Date().toISOString(),
            storagePath: row.storage_path,
          }, ...prev]);
        } catch (err) { console.error("Upload error:", err); }
      }
      setUploading(false);
    };
    inp.click();
  };

  // Download via proxy (cross-origin CDN URLs don't support download attribute).
  // Uses asset.storagePath (the actual bunny location from media_assets)
  // rather than the legacy `path` prop, which was only ever right for the
  // browse-folder list — never for the per-row download.
  const downloadAsset = async (asset) => {
    try {
      const res = await fetch(PROXY_URL, {
        headers: { "x-action": "get", "x-path": asset.storagePath || `${path}/${asset.name}` },
      });
      if (!res.ok) { window.open(asset.url, "_blank"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = asset.name; a.click();
      URL.revokeObjectURL(url);
    } catch { window.open(asset.url, "_blank"); }
  };

  if (loading) return <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>Loading assets...</div>;

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <span style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>{title} ({assets.length})</span>
      {allowUpload && <Btn sm v="secondary" onClick={handleUpload} disabled={uploading}><Ic.up size={11} /> {uploading ? "Uploading..." : "Upload"}</Btn>}
    </div>

    {assets.length === 0 ? <div style={{ padding: compact ? 8 : 16, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No assets yet</div>
    : <div style={{ display: "grid", gridTemplateColumns: compact ? "repeat(auto-fill, minmax(60px, 1fr))" : "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
      {assets.map(a => (
        <div key={a.id || a.name} onClick={() => downloadAsset(a)} style={{ textDecoration: "none", cursor: "pointer" }}>
          <div style={{ background: Z.bg, borderRadius: Ri, overflow: "hidden", border: `1px solid ${Z.bd}`, transition: "border-color 0.1s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = Z.ac}
            onMouseLeave={e => e.currentTarget.style.borderColor = Z.bd}
          >
            {isImage(a.name) ? (
              <img src={a.url} alt={a.name} loading="lazy" style={{ width: "100%", height: compact ? 50 : 80, objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ width: "100%", height: compact ? 50 : 80, display: "flex", alignItems: "center", justifyContent: "center", background: Z.sa }}>
                <span style={{ fontSize: compact ? 16 : 24, color: Z.td }}>{isPdf(a.name) ? "PDF" : "FILE"}</span>
              </div>
            )}
            {!compact && <div style={{ padding: "4px 6px" }}>
              <div style={{ fontSize: 10, color: Z.tx, fontWeight: FW.semi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
              <div style={{ fontSize: 9, color: Z.td }}>{fmtSize(a.size)}</div>
            </div>}
          </div>
        </div>
      ))}
    </div>}
  </div>;
});

AssetPanel.displayName = "AssetPanel";
export default AssetPanel;
