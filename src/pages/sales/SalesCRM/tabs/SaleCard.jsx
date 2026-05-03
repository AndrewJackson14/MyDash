import { memo } from "react";
import { Z, COND, FS, FW, Ri, R, CARD } from "../../../../lib/theme";
import { cardSurface, Ic } from "../../../../components/ui";
import { actInfo, PIPELINE, PIPELINE_COLORS } from "../../constants";

// Memoized pipeline card. Pre-Wave-2 the card was an inline div inside
// the kanban map, so every keystroke in the search box re-rendered all
// 200+ cards. Now the card receives pre-resolved display props
// (clientName, pubName, proofReady, dateColor) and a single stable
// `onAction(kind, sale, extra?)` callback — the parent dispatches the
// action; the card just renders.
//
// Why a single dispatch instead of one callback per button: stability.
// React.memo compares props shallowly; with N inline `() => fn(s)`
// callbacks the comparator always thinks the props are dirty. One
// useCallback'd dispatcher in the parent reuses the same identity
// across renders.
//
// Action kinds: "click" | "client" | "action" | "proof" | "logCall" |
// "logEmail" | "snooze" | "moveStage" | "markLost" | "clone" |
// "adProject" | "dragStart". For "moveStage" the dispatcher receives
// the next-stage string as its third arg.
function SaleCard({
  sale,
  stage,
  clientName,
  pubName,
  proofReady,
  dateColor,
  actLabel,
  actIcon,
  onAction,
}) {
  const isClosed = stage === "Closed";
  const isFollowUp = stage === "Follow-up";
  const ai = actInfo(sale.nextAction);
  const stop = (e) => e.stopPropagation();

  return (
    <div
      onClick={() => onAction?.("click", sale)}
      style={{ ...cardSurface(), borderRadius: R, padding: CARD.pad, paddingLeft: CARD.pad + 14, cursor: "pointer", position: "relative" }}
    >
      {/* Wave 3 Task 3.6 — dedicated grab handle. The card body is
          click-only; only the strip on the left fires drag. Stops the
          touchpad-micro-drift accidental drags reps were getting on
          large pipelines. */}
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", sale.id);
          onAction?.("dragStart", sale);
        }}
        title="Drag to move stage"
        style={{
          position: "absolute", left: 2, top: 2, bottom: 2, width: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "grab", borderRadius: Ri,
          color: Z.td,
        }}
        onClick={stop}
      >
        <Ic.gripVertical size={12} />
      </div>
      <div
        onClick={(e) => { stop(e); onAction?.("client", sale); }}
        style={{ fontWeight: FW.semi, color: Z.ac, fontSize: FS.md, cursor: "pointer", marginBottom: 2, fontFamily: COND }}
        title="Go to profile"
      >{clientName}</div>

      {sale.type !== "TBD" && (
        <div style={{ color: Z.tm, fontSize: FS.sm, marginBottom: 2 }}>{pubName} · {sale.type}</div>
      )}

      {sale.amount > 0 && (
        <div style={{ fontWeight: FW.black, color: Z.su, fontSize: FS.base }}>${sale.amount.toLocaleString()}</div>
      )}

      {proofReady && (
        <div
          onClick={(e) => { stop(e); onAction?.("proof", sale); }}
          style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, padding: "3px 8px", background: Z.wa + "12", border: `1px solid ${Z.wa}30`, borderRadius: Ri, cursor: "pointer" }}
        >
          <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.wa }}>Proof Ready — Sign Off</span>
        </div>
      )}

      {sale.nextAction && (
        <div
          onClick={(e) => { stop(e); onAction?.("action", sale); }}
          style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, padding: "4px 6px", background: `${ai?.color || Z.ac}10`, border: `1px solid ${ai?.color || Z.ac}25`, borderRadius: Ri, cursor: "pointer" }}
        >
          <span style={{ fontSize: FS.sm }}>{actIcon(sale)}</span>
          <span style={{ fontSize: FS.sm, color: ai?.color || Z.ac, fontWeight: FW.bold, flex: 1 }}>{actLabel(sale)}</span>
          {sale.nextActionDate && (
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: dateColor(sale.nextActionDate) }}>
              {sale.nextActionDate.slice(5)}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        {!isClosed && !isFollowUp && (
          <>
            <button onClick={(e) => { stop(e); onAction?.("logCall", sale); }} style={iconBtnStyle()} title="Log call (writes to client comms)"><Ic.phone size={13} /></button>
            <button onClick={(e) => { stop(e); onAction?.("logEmail", sale); }} style={iconBtnStyle()} title="Log email (writes to client comms)"><Ic.mail size={13} /></button>
            <button onClick={(e) => { stop(e); onAction?.("snooze", sale); }} style={iconBtnStyle()} title="Snooze 7 days"><Ic.moon size={13} /></button>
          </>
        )}

        {!isFollowUp && (
          <button
            onClick={(e) => { stop(e); onAction?.("moveStage", sale, PIPELINE[Math.min(PIPELINE.indexOf(stage) + 1, 5)]); }}
            style={{ flex: 1, minHeight: 30, padding: "0 8px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
          ><Ic.arrowRight size={11} /> {PIPELINE[Math.min(PIPELINE.indexOf(stage) + 1, 5)]}</button>
        )}

        {!isClosed && !isFollowUp && (
          <button
            onClick={(e) => { stop(e); onAction?.("markLost", sale); }}
            style={{ ...iconBtnStyle(), border: `1px solid ${Z.da}40`, background: Z.da + "08", color: Z.da }}
            title="Mark deal as lost"
          ><Ic.x size={13} /></button>
        )}

        {(isClosed || isFollowUp) && (
          <button onClick={(e) => { stop(e); onAction?.("clone", sale); }} style={iconBtnStyle()} title="Clone into next issue"><Ic.refresh size={13} /></button>
        )}

        {isClosed && (
          <button
            onClick={(e) => { stop(e); onAction?.("adProject", sale); }}
            style={{ ...iconBtnStyle(), border: `1px solid ${Z.pu}40`, background: Z.pu + "10", color: Z.pu }}
            title="Start ad design project"
          ><Ic.palette size={13} /></button>
        )}
      </div>
    </div>
  );
}

// Wave 4 Tasks 4.1 + 4.9 — Lucide icons replace emoji chrome, and the
// touch target bumps from ~18px to 30px (spec calls for ≥36 on mobile;
// pipeline cards are desktop-primary, so 30 is the row-fit compromise).
const iconBtnStyle = () => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30,
  borderRadius: Ri, border: `1px solid ${Z.bd}`,
  background: Z.sa, cursor: "pointer", color: Z.tm,
});

export { PIPELINE_COLORS };
export default memo(SaleCard);
