// ============================================================
// DashboardModule — shared wrapper for every new dashboard tile.
//
// Every per-role dashboard card in `src/components/dashboard/` wraps its
// content in this component so we get consistent chrome (glass surface,
// title row, expand/collapse, action slot, loading + empty states) and
// the same localStorage-backed fold behavior everywhere.
//
// Fold state is keyed by (userId?, id). Pass `userId` so two users sharing
// a browser don't clobber each other's preferences; omit it for demo/dev.
// ============================================================
import { useState, useEffect } from "react";
import { Z, FS, FW, DISPLAY, DUR, EASE } from "../../lib/theme";
import { GlassCard } from "../ui";

const FOLD_KEY = (userId, id) => `dashboard.${userId || "anon"}.${id}.expanded`;

export default function DashboardModule({
  id,
  userId,
  title,
  subtitle,
  action,
  defaultExpanded = true,
  collapsible = true,
  loading = false,
  empty = false,
  emptyText = "Nothing here yet.",
  children,
  style,
}) {
  const storageKey = FOLD_KEY(userId, id);
  const [expanded, setExpanded] = useState(() => {
    if (!collapsible) return true;
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "true") return true;
      if (v === "false") return false;
    } catch (e) { /* noop */ }
    return defaultExpanded;
  });

  useEffect(() => {
    if (!collapsible) return;
    try { localStorage.setItem(storageKey, expanded ? "true" : "false"); } catch (e) { /* noop */ }
  }, [expanded, storageKey, collapsible]);

  const toggle = () => { if (collapsible) setExpanded(e => !e); };

  return (
    <GlassCard style={style} noPad>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 20px",
        borderBottom: expanded ? `1px solid ${Z.bd}` : "none",
        cursor: collapsible ? "pointer" : "default",
        userSelect: "none",
      }}
        onClick={toggle}
      >
        {collapsible && (
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 14, height: 14, color: Z.tm,
            fontSize: FS.micro, lineHeight: 1,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: `transform ${DUR.med}ms ${EASE}`,
          }}>▶</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: FS.md, fontWeight: FW.black, color: Z.tx,
            fontFamily: DISPLAY, letterSpacing: "-0.01em",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{title}</div>
          {subtitle && (
            <div style={{
              fontSize: FS.xs, color: Z.tm, marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{subtitle}</div>
          )}
        </div>
        {action && (
          <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
            {action}
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ padding: "16px 20px" }}>
          {loading ? <LoadingSkeleton />
            : empty ? <EmptyState text={emptyText} />
            : children}
        </div>
      )}
    </GlassCard>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <SkelBar w="70%" />
      <SkelBar w="45%" />
      <SkelBar w="60%" />
    </div>
  );
}

function SkelBar({ w }) {
  return <div style={{
    height: 12, width: w, borderRadius: 6,
    background: Z.bd,
    animation: "dashboardModuleSkel 1.2s ease-in-out infinite",
  }} />;
}

function EmptyState({ text }) {
  return (
    <div style={{
      padding: "24px 0", textAlign: "center",
      color: Z.tm, fontSize: FS.sm,
    }}>{text}</div>
  );
}

// Lives once at the bottom of the file; React 18 dedupes on string hash.
if (typeof document !== "undefined" && !document.getElementById("dashboard-module-keyframes")) {
  const s = document.createElement("style");
  s.id = "dashboard-module-keyframes";
  s.textContent = `@keyframes dashboardModuleSkel { 0%,100% { opacity: 0.45; } 50% { opacity: 0.8; } }`;
  document.head.appendChild(s);
}
