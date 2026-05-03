import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";

// All images uploaded under this story. Click a tile to promote it to
// featured (single-UPDATE patch). Captions are saved on blur and travel
// with the image to StellarPress as figcaption. "Download Originals"
// bundles every full-res variant + a captions.docx for the print team.
function StoryLibraryPanel({
  storyImages, featuredImageUrl, busy, downloading,
  onUpload, onPickFromLibrary, onSetFeatured, onSaveCaption, onDownloadOriginals,
}) {
  return (
    <div id="panel-story-library">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Story Library · {storyImages.length}</div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={onPickFromLibrary}
            disabled={busy}
            style={{ padding: "3px 8px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontSize: FS.micro, fontWeight: 700, fontFamily: COND, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
            title="Pick existing image from this publication's media library"
          >
            + From Library
          </button>
          <button
            onClick={onUpload}
            disabled={busy}
            style={{ padding: "3px 10px", borderRadius: Ri, border: "none", background: Z.ac, color: "#fff", fontSize: FS.micro, fontWeight: 700, fontFamily: COND, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Uploading…" : "+ Upload"}
          </button>
        </div>
      </div>
      {storyImages.length === 0 ? (
        <div style={{ width: "100%", padding: "16px 12px", border: "1px dashed " + Z.bd, borderRadius: Ri, background: Z.sa, fontSize: FS.xs, color: Z.tm, fontFamily: COND, textAlign: "center" }}>
          No images yet. Upload above or pick from the library.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {storyImages.map(img => {
            const isFeatured = featuredImageUrl === img.cdn_url;
            return (
              <div key={img.id} style={{ display: "flex", flexDirection: "column", gap: 3, padding: 4, border: isFeatured ? `2px solid ${Z.ac}` : `1px solid ${Z.bd}`, borderRadius: Ri, background: Z.sa }}>
                <button
                  onClick={() => onSetFeatured(img)}
                  title={isFeatured ? "Currently featured" : "Click to set as featured"}
                  style={{ position: "relative", padding: 0, border: "none", background: "none", cursor: "pointer", overflow: "hidden", borderRadius: Ri, height: 90 }}
                >
                  <img src={img.thumbnail_url || img.cdn_url} alt={img.caption || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: Ri }} />
                  {isFeatured && (
                    <div style={{ position: "absolute", top: 2, right: 2, background: Z.ac, color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: Ri, fontFamily: COND }}>★ Featured</div>
                  )}
                  {/* Dimensions overlay — quick visual sanity check
                      that a designer is grabbing a high-res original. */}
                  {img.width && img.height && (
                    <div style={{ position: "absolute", bottom: 2, left: 2, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 2, fontFamily: COND }}>
                      {img.width}×{img.height}
                    </div>
                  )}
                </button>
                <input
                  defaultValue={img.caption || ""}
                  placeholder="Caption (sent to site as figcaption)"
                  onBlur={(e) => {
                    const next = e.target.value;
                    if ((img.caption || "") !== next) onSaveCaption(img.id, next);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                  style={{ width: "100%", padding: "4px 6px", border: `1px solid ${Z.bd}`, borderRadius: Ri, background: Z.bg, color: Z.tx, fontSize: FS.xs, fontFamily: COND, outline: "none", boxSizing: "border-box" }}
                />
                <div style={{ fontSize: 9, color: Z.td, fontFamily: COND, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={img.file_name}>{img.file_name}</div>
              </div>
            );
          })}
        </div>
      )}
      {storyImages.length > 0 && (
        <button
          onClick={onDownloadOriginals}
          disabled={downloading}
          style={{ marginTop: 6, width: "100%", padding: "5px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tx, fontSize: FS.micro, fontWeight: 700, fontFamily: COND, cursor: downloading ? "default" : "pointer", opacity: downloading ? 0.6 : 1 }}
        >
          {downloading ? "Downloading…" : `↓ Download Originals (${storyImages.length})`}
        </button>
      )}
    </div>
  );
}

export default React.memo(StoryLibraryPanel);
