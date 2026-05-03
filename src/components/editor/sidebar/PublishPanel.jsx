import React from "react";
import { Z, COND, ACCENT, FS, Ri } from "../../../lib/theme";
import { Ic, Btn } from "../../ui";

// Top-of-stack publish controls. Five mutually-exclusive states drive
// which control set is visible:
//   1. Live + clean       → Update Live | Unpublish
//   2. Live + edits       → Republish (warn) | Unpublish
//   3. Ready, not approved → Approve for Web
//   4. Approved (or live)  → Publish to Web
//   5. Otherwise           → status hint
function PublishPanel({
  isPublished, needsRepublish, currentStage, webApproved, republishedFlash,
  republishing, onPublish, onRepublish, onApprove, onUnpublish,
}) {
  return (
    <>
      {isPublished && !needsRepublish ? (
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: 700, color: Z.su || "#22c55e", fontFamily: COND, marginBottom: 6 }}>
            {republishedFlash > 0 ? "✓ Republished just now" : "✓ Live on Web"}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn sm onClick={onRepublish} disabled={republishing} style={{ flex: 1 }}>{republishing ? "Republishing…" : "↻ Update Live"}</Btn>
            <Btn sm v="secondary" onClick={onUnpublish} style={{ flex: 1, color: Z.da, borderColor: Z.da + "40" }}>Unpublish</Btn>
          </div>
        </div>
      ) : needsRepublish ? (
        <div>
          <div style={{ fontSize: FS.micro, fontWeight: 700, color: Z.wa, fontFamily: COND, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>{"⚠"} Unpublished Changes</div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn sm onClick={onRepublish} disabled={republishing} style={{ flex: 1, background: Z.wa + "18", color: Z.wa, border: "1px solid " + Z.wa + "40" }}>{republishing ? "Republishing…" : "↻ Republish"}</Btn>
            <Btn sm v="secondary" onClick={onUnpublish} style={{ flex: 1, color: Z.da, borderColor: Z.da + "40" }}>Unpublish</Btn>
          </div>
        </div>
      ) : currentStage === "Ready" && !webApproved ? (
        <Btn sm onClick={onApprove} style={{ width: "100%", background: ACCENT.blue + "20", color: ACCENT.blue, border: "1px solid " + ACCENT.blue + "40" }}>{"✓"} Approve for Web</Btn>
      ) : webApproved || isPublished ? (
        <Btn sm onClick={onPublish} style={{ width: "100%" }}><Ic.send size={11} /> Publish to Web</Btn>
      ) : (
        <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, textAlign: "center", padding: 4 }}>Set status to Ready and approve before publishing</div>
      )}
    </>
  );
}

export default React.memo(PublishPanel);
