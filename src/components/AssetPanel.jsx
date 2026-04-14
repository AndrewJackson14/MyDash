// ============================================================
// AssetPanel.jsx — Reusable asset upload/browse component
// Used in Ad Projects (project + global) and Client Profile (global)
// Uploads to BunnyCDN via bunny-storage edge function
// ============================================================
import { useState, useEffect, memo } from "react";
import { Z, FS, FW, Ri, R, COND } from "../lib/theme";
import { Ic, Btn } from "../components/ui";
import { EDGE_FN_URL } from "../lib/supabase";
import { uploadMedia } from "../lib/media";

const PROXY_URL = EDGE_FN_URL + "/bunny-storage";
const CDN_BASE = "https://cdn.13stars.media";

const isImage = (name) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);
const isPdf = (name) => /\.pdf$/i.test(name);
const fmtSize = (bytes) => bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1048576).toFixed(1)}MB`;

const AssetPanel = memo(({ path, title = "Assets", allowUpload = true, compact = false, clientId, adProjectId, publicationId, category = "general" }) => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Load assets from BunnyCDN
  useEffect(() => {
    if (!path) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(PROXY_URL, {
          method: "GET",
          headers: { "x-action": "list", "x-path": path },
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          setAssets(data.filter(f => !f.IsDirectory).map(f => ({
            name: f.ObjectName,
            url: `${CDN_BASE}/${path}/${f.ObjectName}`,
            size: f.Length || 0,
            date: f.LastChanged || f.DateCreated,
          })));
        }
      } catch (err) { console.error("Asset list error:", err); }
      setLoading(false);
    })();
  }, [path]);

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
          setAssets(prev => [...prev, {
            name: row.file_name,
            url: row.cdn_url,
            size: row.file_size || f.size,
            date: row.created_at || new Date().toISOString(),
          }]);
        } catch (err) { console.error("Upload error:", err); }
      }
      setUploading(false);
    };
    inp.click();
  };

  // Download via proxy (cross-origin CDN URLs don't support download attribute)
  const downloadAsset = async (asset) => {
    try {
      const res = await fetch(PROXY_URL, {
        headers: { "x-action": "get", "x-path": `${path}/${asset.name}` },
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
        <div key={a.name} onClick={() => downloadAsset(a)} style={{ textDecoration: "none", cursor: "pointer" }}>
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
