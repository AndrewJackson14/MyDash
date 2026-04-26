// ============================================================
// Step 6 — Brief & Art Source
//
// The DEAL → INTAKE pivot point. Header copy frames the shift.
// Art source toggle gates whether the brief + reference uploads
// appear (We Design) or the rep just confirms camera-ready art
// is incoming.
// ============================================================

import { Z, FS, FW, COND, Ri, R, CARD } from "../../../lib/theme";
import BriefFields from "../parts/BriefFields";
import ReferenceAssetUploader from "../parts/ReferenceAssetUploader";

const StepHeader = ({ title, subtitle, accent }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: Z.tx, fontFamily: COND, letterSpacing: -0.3 }}>{title}</h2>
    {subtitle && (
      <div style={{ fontSize: FS.sm, color: accent ? Z.go : Z.tm, fontFamily: COND, fontWeight: accent ? FW.bold : FW.normal }}>
        {subtitle}
      </div>
    )}
  </div>
);

function ArtSourceCard({ active, title, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "12px 16px",
        borderRadius: Ri,
        border: `1px solid ${active ? Z.ac : Z.bd}`,
        background: active ? Z.ac + "12" : "transparent",
        cursor: "pointer", textAlign: "left",
        fontFamily: COND,
        display: "flex", flexDirection: "column", gap: 4,
      }}
    >
      <div style={{
        fontSize: FS.lg,
        fontWeight: active ? FW.heavy : FW.bold,
        color: active ? Z.ac : Z.tx,
      }}>{active ? "✓ " : ""}{title}</div>
      <div style={{ fontSize: FS.xs, color: Z.tm }}>{sub}</div>
    </button>
  );
}

export default function Step6BriefAndArtSource({
  state, actions, clients, currentUser, validation,
}) {
  const errors = validation?.errors || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 820 }}>
      <StepHeader
        title="Brief & art"
        subtitle="Deal locked — let's gather what we need to build the ad."
        accent
      />

      {/* Art Source */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{
          fontSize: 11, fontWeight: FW.heavy, color: Z.td,
          letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
        }}>Art Source</div>
        <div style={{ display: "flex", gap: 8 }}>
          <ArtSourceCard
            active={state.artSource === "we_design"}
            title="We Design"
            sub="Our team builds the ad from the brief below"
            onClick={() => actions.setArtSource("we_design")}
          />
          <ArtSourceCard
            active={state.artSource === "camera_ready"}
            title="Camera Ready"
            sub="Client provides finished artwork"
            onClick={() => actions.setArtSource("camera_ready")}
          />
        </div>
        {errors.artSource && (
          <div style={{ fontSize: 11, color: Z.da, fontFamily: COND }}>{errors.artSource}</div>
        )}
      </div>

      {/* Brief — We Design only */}
      {state.artSource === "we_design" && (
        <>
          <BriefFields
            brief={state.brief}
            onChange={actions.setBriefField}
            errors={{
              headline: errors.headline,
              style: errors.style,
              colors: errors.colors,
            }}
          />

          <div style={{
            background: Z.sa, borderRadius: R, padding: CARD.pad,
            border: `1px solid ${Z.bd}`,
          }}>
            <ReferenceAssetUploader
              clientId={state.clientId}
              proposalId={state.proposalId}
              uploadedBy={currentUser?.id}
              assets={state.referenceAssets}
              onAdd={actions.addReferenceAsset}
              onUpdate={actions.updateReferenceAsset}
              onRemove={actions.removeReferenceAsset}
            />
          </div>
        </>
      )}

      {state.artSource === "camera_ready" && (
        <div style={{
          background: Z.sa, borderRadius: R, padding: CARD.pad,
          border: `1px solid ${Z.bd}`,
          display: "flex", flexDirection: "column", gap: 6,
          fontFamily: COND,
        }}>
          <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>
            Client will provide finished art
          </div>
          <div style={{ fontSize: FS.sm, color: Z.tm }}>
            On contract conversion, an ad project gets created in <strong>awaiting_art</strong> status.
            Camera-ready files can be attached to the ad project once the client sends them.
          </div>
        </div>
      )}
    </div>
  );
}
