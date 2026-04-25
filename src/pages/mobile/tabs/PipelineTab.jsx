// PipelineTab — Spec 056 §4 mobile pipeline.
//
// Desktop shows 6 columns side-by-side; mobile shows ONE stage at
// a time with a horizontal stage strip + swipe navigation. Tap a
// stage in the strip to jump; swipe left/right on the cards area
// to advance/retreat one stage.
//
// Cards show client + amount + next-action. Tap → open client
// detail. Stage advancement (the desktop drag-drop) is moved to
// a long-press action sheet to avoid accidental moves on touch.
import { useMemo, useRef, useState } from "react";
import MobileHeader from "../MobileHeader";
import { TOKENS, SURFACE, INK, ACCENT, GOLD, CARD, fmtMoney, fmtRelative } from "../mobileTokens";

const STAGES = ["Discovery", "Presentation", "Proposal", "Negotiation", "Closed", "Follow-up"];

const STAGE_META = {
  Discovery:    { color: "#5F5E5A", short: "Disc"  },
  Presentation: { color: "#0C447C", short: "Pres"  },
  Proposal:     { color: "#854F0B", short: "Prop"  },
  Negotiation:  { color: "#791F1F", short: "Neg"   },
  Closed:       { color: "#27500A", short: "Won"   },
  "Follow-up":  { color: "#5F5E5A", short: "F-up"  },
};

export default function PipelineTab({ appData, currentUser, jurisdiction, navTo }) {
  const sales = appData.sales || [];
  const clients = appData.clients || [];
  const myId = currentUser?.id;
  const [activeStage, setActiveStage] = useState("Discovery");

  // Group by stage, scoped to this rep.
  const byStage = useMemo(() => {
    const m = {};
    for (const st of STAGES) m[st] = [];
    for (const s of sales) {
      if (myId && s.assignedTo !== myId) continue;
      if (s.status === "Lost") continue;
      const stage = STAGES.includes(s.status) ? s.status : null;
      if (stage) m[stage].push(s);
    }
    // Within each stage: overdue first, then by next-action date,
    // then by amount desc.
    const today = new Date().toISOString().slice(0, 10);
    for (const st of STAGES) {
      m[st].sort((a, b) => {
        const aOver = (a.nextActionDate || "9999") < today ? 0 : 1;
        const bOver = (b.nextActionDate || "9999") < today ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        const aDate = a.nextActionDate || "9999";
        const bDate = b.nextActionDate || "9999";
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        return (b.amount || 0) - (a.amount || 0);
      });
    }
    return m;
  }, [sales, myId]);

  const cn = (id) => clients.find(c => c.id === id)?.name || "—";

  // Swipe navigation between stages
  const touchStart = useRef(null);
  const onTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStart.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(dx) < 60) return;
    const idx = STAGES.indexOf(activeStage);
    if (dx < 0 && idx < STAGES.length - 1) setActiveStage(STAGES[idx + 1]);
    if (dx > 0 && idx > 0) setActiveStage(STAGES[idx - 1]);
    touchStart.current = null;
  };

  const cards = byStage[activeStage] || [];

  return <>
    <MobileHeader title="Pipeline" sub={`${cards.length} in ${activeStage}`} />

    {/* Stage strip — horizontal scroll, current stage underlined */}
    <div style={{
      position: "sticky", top: "calc(env(safe-area-inset-top) + 52px)", zIndex: 9,
      background: SURFACE.elevated,
      borderBottom: `1px solid ${TOKENS.rule}`,
      overflowX: "auto", WebkitOverflowScrolling: "touch",
    }}>
      <div style={{ display: "flex", gap: 4, padding: "8px 10px", whiteSpace: "nowrap" }}>
        {STAGES.map(st => {
          const isActive = activeStage === st;
          const count = byStage[st]?.length || 0;
          const meta = STAGE_META[st];
          return <button key={st} onClick={() => setActiveStage(st)} style={{
            padding: "8px 12px", borderRadius: 8,
            border: "none",
            background: isActive ? meta.color + "15" : "transparent",
            color: isActive ? meta.color : TOKENS.muted,
            fontSize: 13, fontWeight: isActive ? 700 : 500,
            cursor: "pointer", whiteSpace: "nowrap",
            borderBottom: isActive ? `2px solid ${meta.color}` : "2px solid transparent",
          }}>
            {meta.short}<span style={{ marginLeft: 4, opacity: 0.7, fontWeight: 600 }}>{count}</span>
          </button>;
        })}
      </div>
    </div>

    {/* Cards area — swipeable */}
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ padding: "14px 14px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
      {cards.length === 0 ? (
        <div style={{ ...CARD, textAlign: "center", color: TOKENS.muted, fontSize: 14, padding: "32px 14px" }}>
          No deals in {activeStage}.
        </div>
      ) : cards.map(s => {
        const today = new Date().toISOString().slice(0, 10);
        const isOverdue = s.nextActionDate && s.nextActionDate < today && s.status !== "Closed";
        return <div key={s.id} onClick={() => navTo(`/mobile/clients/${s.clientId}`)} style={{
          ...CARD, cursor: "pointer",
          borderLeft: isOverdue ? `3px solid ${TOKENS.urgent}` : CARD.border,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: INK, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cn(s.clientId)}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, flexShrink: 0 }}>{fmtMoney(s.amount || 0)}</div>
          </div>
          <div style={{ fontSize: 12, color: TOKENS.muted }}>
            {s.nextAction?.label || "No next action"}
            {s.nextActionDate && <> · <span style={{ color: isOverdue ? TOKENS.urgent : TOKENS.muted, fontWeight: isOverdue ? 700 : 500 }}>{isOverdue ? "OVERDUE" : s.nextActionDate.slice(5)}</span></>}
          </div>
        </div>;
      })}
    </div>
  </>;
}
