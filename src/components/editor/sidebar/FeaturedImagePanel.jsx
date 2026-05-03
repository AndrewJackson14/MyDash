import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";

// Read-only preview of the current featured image. Promotion happens
// from the StoryLibraryPanel below (click a tile → set as featured).
// Clear button removes both featured_image_url and featured_image_id
// in a single saveMeta patch.
function FeaturedImagePanel({ featuredImageUrl, onClear }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Featured Image</div>
        {featuredImageUrl && (
          <button onClick={onClear} style={{ background: "none", border: "none", color: Z.da, fontSize: FS.micro, cursor: "pointer", fontFamily: COND, fontWeight: 700 }}>Clear</button>
        )}
      </div>
      {featuredImageUrl ? (
        <img src={featuredImageUrl} alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: Ri, border: "1px solid " + Z.bd }} />
      ) : (
        <div style={{ width: "100%", height: 80, border: "1px dashed " + Z.bd, borderRadius: Ri, background: Z.sa, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.micro, color: Z.tm, fontFamily: COND, textAlign: "center", padding: "0 12px" }}>
          Click a Story Library tile below to set featured
        </div>
      )}
    </div>
  );
}

export default React.memo(FeaturedImagePanel);
