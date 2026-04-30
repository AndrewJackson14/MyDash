// ============================================================
// ReferenceAssetUploader — drop zone + asset list for Step 6
//
// On file select: creates a placeholder entry, kicks off
// uploadMedia, updates the entry with the returned media_assets
// row id and thumbnail URL. Caption is auto-populated from
// filename via CAPTION_PATTERNS; rep can edit inline.
//
// All uploads tag category='proposal_intake' and source_proposal_id
// (if known). On contract conversion, the migration-161 RPC re-tags
// these to the first ad_project so the designer sees them in queue.
// ============================================================

import { useRef, useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { uploadMedia } from "../../../lib/media";
import { Z, FS, FW, COND, Ri, R, INV } from "../../../lib/theme";
import { Btn } from "../../ui/Primitives";
import Ic from "../../ui/Icons";
import {
  REFERENCE_ASSET_MIME_ALLOWLIST,
  REFERENCE_ASSET_MAX_BYTES,
  CAPTION_PATTERNS,
  FIRST_FILE_FALLBACK_CAPTION,
} from "../proposalWizardConstants";

function smartCaption(fileName, isFirstFile) {
  const base = (fileName || "").toLowerCase();
  for (const { pattern, caption } of CAPTION_PATTERNS) {
    if (pattern.test(base)) return caption;
  }
  return isFirstFile ? FIRST_FILE_FALLBACK_CAPTION : "";
}

function rejectReason(file) {
  if (file.size > REFERENCE_ASSET_MAX_BYTES) {
    return `${file.name}: too large (max ${Math.round(REFERENCE_ASSET_MAX_BYTES / 1024 / 1024)}MB)`;
  }
  // Some browsers leave file.type empty for HEIC/PSD — accept by extension fallback.
  const t = (file.type || "").toLowerCase();
  if (REFERENCE_ASSET_MIME_ALLOWLIST.includes(t)) return null;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (["heic", "heif", "psd", "ai", "eps"].includes(ext)) return null;
  return `${file.name}: file type not supported`;
}

export default function ReferenceAssetUploader({
  clientId,
  proposalId,
  uploadedBy,
  assets,
  onAdd,
  onUpdate,
  onRemove,
}) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);

  // Re-stamp source_proposal_id on assets uploaded before the proposal
  // row existed. Fires whenever proposalId becomes truthy.
  useEffect(() => {
    if (!proposalId) return;
    const unstamped = assets.filter(a => a.mediaAssetId && !a.stamped);
    if (unstamped.length === 0) return;
    (async () => {
      try {
        const ids = unstamped.map(a => a.mediaAssetId);
        const { error } = await supabase
          .from("media_assets")
          .update({ source_proposal_id: proposalId })
          .in("id", ids);
        if (!error) {
          unstamped.forEach(a => onUpdate(a.id, { stamped: true }));
        }
      } catch (e) {
        // non-fatal — RPC re-tag on conversion will still work via category match
        console.warn("source_proposal_id re-stamp failed:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId, assets.length]);

  const startUpload = async (asset, file) => {
    onUpdate(asset.id, { uploadStatus: "uploading", uploadProgress: 0 });
    try {
      const row = await uploadMedia(file, {
        clientId,
        category: "proposal_intake",
        sourceProposalId: proposalId || null,
        uploadedBy: uploadedBy || null,
        caption: asset.caption || null,
      });
      onUpdate(asset.id, {
        uploadStatus: "done",
        uploadProgress: 100,
        mediaAssetId: row.id,
        thumbnailUrl: row.thumbnail_url || row.cdn_url || null,
        cdnUrl: row.cdn_url || null,
        stamped: !!proposalId,
      });
    } catch (err) {
      onUpdate(asset.id, {
        uploadStatus: "error",
        uploadError: err?.message || String(err),
      });
    }
  };

  const handleFiles = (fileList) => {
    setErrorBanner(null);
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const rejects = [];
    const accepted = [];
    files.forEach(f => {
      const r = rejectReason(f);
      if (r) rejects.push(r); else accepted.push(f);
    });
    if (rejects.length > 0) setErrorBanner(rejects.join(" · "));

    accepted.forEach((file, idx) => {
      const isFirst = assets.length === 0 && idx === 0;
      const id = `ra_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const asset = {
        id,
        mediaAssetId: null,
        fileName: file.name,
        thumbnailUrl: null,
        cdnUrl: null,
        caption: smartCaption(file.name, isFirst),
        uploadStatus: "uploading",
        uploadProgress: 0,
        stamped: false,
      };
      onAdd(asset);
      // Kick off the upload after the state add lands
      setTimeout(() => startUpload(asset, file), 0);
    });
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td,
        letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
      }}>Reference Materials</div>
      <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
        Storefront photos, logos, reference ads — anything Jen should see. Skip if you have nothing yet.
      </div>

      {/* Drop zone */}
      <label
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          padding: 22,
          background: dragOver ? Z.ac + "10" : Z.bg,
          border: `2px dashed ${dragOver ? Z.ac : Z.bd}`,
          borderRadius: R,
          cursor: "pointer", fontFamily: COND,
        }}
      >
        <span style={{ fontSize: FS.title, color: Z.tm }}>⬆</span>
        <div style={{ fontSize: FS.base, color: Z.tx, fontWeight: FW.bold }}>
          Drag files here or <span style={{ color: "var(--action)", textDecoration: "underline" }}>browse</span>
        </div>
        <div style={{ fontSize: FS.xs, color: Z.tm, textAlign: "center" }}>
          JPG, PNG, HEIC, WebP, GIF, PDF, AI, EPS, SVG, PSD · 25 MB max per file
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={REFERENCE_ASSET_MIME_ALLOWLIST.join(",") + ",.heic,.heif,.psd,.ai,.eps"}
          onChange={e => handleFiles(e.target.files)}
          style={{ display: "none" }}
        />
      </label>

      {errorBanner && (
        <div style={{
          fontSize: FS.sm, color: Z.da, fontFamily: COND,
          padding: "6px 10px", background: Z.da + "10",
          border: `1px solid ${Z.da}40`, borderRadius: Ri,
        }}>{errorBanner}</div>
      )}

      {/* Asset rows */}
      {assets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {assets.map(a => (
            <div
              key={a.id}
              style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr auto 28px",
                gap: 10, alignItems: "center",
                padding: 8,
                background: Z.bg,
                border: `1px solid ${a.uploadStatus === "error" ? Z.da : Z.bd}`,
                borderRadius: R,
              }}
            >
              {/* Thumb */}
              <div style={{
                width: 48, height: 48, borderRadius: Ri,
                background: Z.sa, overflow: "hidden",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: Z.tm, fontSize: FS.xs,
              }}>
                {a.thumbnailUrl
                  ? <img src={a.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : a.uploadStatus === "uploading"
                    ? <span style={{ fontFamily: COND }}>↑</span>
                    : <Ic.image size={18} color={Z.tm} />}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <div style={{
                  fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx,
                  fontFamily: COND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{a.fileName}</div>
                <input
                  value={a.caption || ""}
                  onChange={e => onUpdate(a.id, { caption: e.target.value })}
                  onBlur={async e => {
                    if (!a.mediaAssetId) return;
                    try {
                      await supabase.from("media_assets")
                        .update({ caption: e.target.value || null })
                        .eq("id", a.mediaAssetId);
                    } catch {}
                  }}
                  placeholder="Caption (e.g. Storefront)"
                  style={{
                    background: "rgba(128,128,128,0.10)",
                    border: "1px solid rgba(128,128,128,0.20)",
                    borderRadius: Ri,
                    padding: "4px 8px",
                    color: Z.tx, fontSize: FS.xs, fontFamily: COND, outline: "none",
                  }}
                />
                {a.uploadStatus === "error" && (
                  <span style={{ fontSize: FS.micro, color: Z.da, fontFamily: COND }}>{a.uploadError}</span>
                )}
              </div>

              {/* Status / retry */}
              <div style={{ minWidth: 60, textAlign: "right" }}>
                {a.uploadStatus === "uploading" && (
                  <span style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>Uploading…</span>
                )}
                {a.uploadStatus === "done" && (
                  <Ic.check size={14} color={Z.go} />
                )}
                {a.uploadStatus === "error" && (
                  <Btn sm v="secondary" onClick={() => {
                    // Retry — needs original File, but we don't keep it. Surface
                    // a soft message guiding the rep to re-upload.
                    setErrorBanner(`Couldn't retry ${a.fileName} automatically. Re-upload from your device.`);
                    onRemove(a.id);
                  }}>Retry</Btn>
                )}
              </div>

              <button
                onClick={async () => {
                  if (a.mediaAssetId) {
                    try {
                      await supabase.from("media_assets").delete().eq("id", a.mediaAssetId);
                    } catch {}
                  }
                  onRemove(a.id);
                }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: Z.da, fontSize: 18, fontWeight: 900, padding: 4,
                }}
                aria-label="Remove file"
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
