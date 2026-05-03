import React from "react";
import { Z, COND, ACCENT, FS, Ri } from "../../../lib/theme";
import { Ic, Btn } from "../../ui";
import { fmtDate } from "../StoryEditor.helpers";

// Wave-3 canonical state block. Five mutually-exclusive states drive
// which body is shown:
//   1. Live + clean       → green block, Update Live | Unpublish
//   2. Live + edits       → amber block, Republish | Unpublish
//   3. Ready, not approved → blue Approve-for-Web button
//   4. Approved (or live)  → primary Publish-to-Web button
//   5. Otherwise           → status hint
//
// Below the state body: a scheduled-publish indicator (when set but
// not yet live) and a "View on site" link (when live and the
// publication has a real website configured). All publish-state UI
// lives here — the top bar shows only the workflow Status pill.
function PublishPanel({
  meta, primaryPub,
  isPublished, needsRepublish, currentStage, webApproved, republishedFlash,
  republishing,
  onPublish, onRepublish, onApprove, onUnpublish,
  bare = false,
}) {
  // `bare`: when rendered inside HandoffSection's card we suppress
  // our own card chrome + header so the section's chrome wins.
  const wrapperStyle = bare
    ? { display: "flex", flexDirection: "column", gap: 8 }
    : { background: Z.bg, borderRadius: Ri, padding: 10, border: "1px solid " + Z.bd, display: "flex", flexDirection: "column", gap: 8 };
  return (
    <div style={wrapperStyle}>
      {!bare && <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Publish</div>}

      {isPublished && !needsRepublish && (
        <LiveBlock
          republishedFlash={republishedFlash}
          republishing={republishing}
          onRepublish={onRepublish}
          onUnpublish={onUnpublish}
        />
      )}

      {needsRepublish && (
        <NeedsRepublishBlock
          republishing={republishing}
          onRepublish={onRepublish}
          onUnpublish={onUnpublish}
        />
      )}

      {!isPublished && currentStage === "Ready" && !webApproved && (
        <ApproveBlock onApprove={onApprove} />
      )}

      {!isPublished && (webApproved || isPublished) && currentStage !== "Ready" && (
        <PublishBlock onPublish={onPublish} />
      )}

      {!isPublished && webApproved && currentStage === "Ready" && (
        <PublishBlock onPublish={onPublish} />
      )}

      {!isPublished && !webApproved && currentStage !== "Ready" && (
        <NotReadyHint />
      )}

      {/* Schedule indicator — only when scheduled but not yet live */}
      {!isPublished && meta.scheduled_at && (
        <div style={{ fontSize: FS.micro, color: ACCENT.indigo, fontFamily: COND, padding: "6px 8px", background: ACCENT.indigo + "10", borderRadius: Ri, border: "1px solid " + ACCENT.indigo + "30" }}>
          Scheduled: {fmtDate(meta.scheduled_at)}
        </div>
      )}

      {/* View-on-site link — only when live AND the pub has a real
          websiteUrl. Refuses to render slug-as-domain hostnames (no
          dot in the host means we're staring at "malibu-times" or
          similar — a slug, not a domain) so we don't hand the editor
          a broken link. */}
      {isPublished && meta.slug && primaryPub?.hasWebsite && (() => {
        const raw = (primaryPub.websiteUrl || "").trim();
        if (!raw) return null;
        const host = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
        if (!host.includes(".")) return null;
        const href = `https://${host}/${meta.slug}`;
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: "6px 10px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sa, textAlign: "center", fontSize: FS.xs, fontWeight: 600, color: Z.ac, fontFamily: COND, textDecoration: "none" }}>
            View on {host} {"↗"}
          </a>
        );
      })()}
    </div>
  );
}

function LiveBlock({ republishedFlash, republishing, onRepublish, onUnpublish }) {
  const accent = Z.su || "#22c55e";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: FS.xs, fontWeight: 700, color: accent, fontFamily: COND }}>
        {republishedFlash > 0 ? "✓ Republished just now" : "✓ Live on Web"}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Btn sm onClick={onRepublish} disabled={republishing} style={{ flex: 1 }}>
          {republishing ? "Republishing…" : "↻ Update Live"}
        </Btn>
        <Btn sm v="secondary" onClick={onUnpublish} style={{ flex: 1, color: Z.da, borderColor: Z.da + "40" }}>Unpublish</Btn>
      </div>
    </div>
  );
}

function NeedsRepublishBlock({ republishing, onRepublish, onUnpublish }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: FS.micro, fontWeight: 700, color: Z.wa, fontFamily: COND, display: "flex", alignItems: "center", gap: 4 }}>
        {"⚠"} Unpublished Changes
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Btn sm onClick={onRepublish} disabled={republishing} style={{ flex: 1, background: Z.wa + "18", color: Z.wa, border: "1px solid " + Z.wa + "40" }}>
          {republishing ? "Republishing…" : "↻ Republish"}
        </Btn>
        <Btn sm v="secondary" onClick={onUnpublish} style={{ flex: 1, color: Z.da, borderColor: Z.da + "40" }}>Unpublish</Btn>
      </div>
    </div>
  );
}

function ApproveBlock({ onApprove }) {
  return (
    <Btn sm onClick={onApprove} style={{ width: "100%", background: ACCENT.blue + "20", color: ACCENT.blue, border: "1px solid " + ACCENT.blue + "40" }}>
      {"✓"} Approve for Web
    </Btn>
  );
}

function PublishBlock({ onPublish }) {
  return (
    <Btn sm onClick={onPublish} style={{ width: "100%" }}>
      <Ic.send size={11} /> Publish to Web
    </Btn>
  );
}

function NotReadyHint() {
  return (
    <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, textAlign: "center", padding: 4 }}>
      Set status to Ready and approve before publishing
    </div>
  );
}

export default React.memo(PublishPanel);
