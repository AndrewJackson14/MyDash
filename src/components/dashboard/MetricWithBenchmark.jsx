// ============================================================
// MetricWithBenchmark — a stat tile that always shows the number AND
// the context needed to interpret it (comparison to prior period or
// a goal bar).
//
// Design invariant from the dashboard spec: "no metric without a
// benchmark." If you're showing a raw "47" and haven't wired either
// `benchmark` or `goal`, the tile renders a muted "no context" note
// so the gap is obvious at build time.
// ============================================================
import { Z, FS, FW, DISPLAY, COND } from "../../lib/theme";

const ARROW = { up: "▲", down: "▼", flat: "•" };
// Caller decides whether "up" means good (revenue) or bad (churn) via
// `direction`. We only pick the visual accent.
const ARROW_COLOR = {
  up:   (good) => good ? Z.go : Z.da,
  down: (good) => good ? Z.da : Z.go,
  flat: ()     => Z.tm,
};

export default function MetricWithBenchmark({
  label,
  value,
  sublabel,
  benchmark,        // { value, label, direction: 'up' | 'down' | 'flat', good?: boolean }
  goal,             // { value, pctReached, label? }  pctReached: 0..1+
  color,
  icon: Icon,
  onClick,
  style,
}) {
  const tone = color || Z.ac;
  const hasContext = !!benchmark || !!goal;

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 6,
        padding: "14px 16px",
        borderRadius: 12,
        background: Z.sa,
        border: `1px solid ${Z.bd}`,
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.15s, border-color 0.15s",
        ...style,
      }}
      onMouseOver={e => { if (onClick) e.currentTarget.style.borderColor = tone; }}
      onMouseOut={e => { if (onClick) e.currentTarget.style.borderColor = Z.bd; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {Icon && <Icon size={14} color={Z.tm} />}
        <div style={{
          fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm,
          fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.6,
        }}>{label}</div>
      </div>

      <div style={{
        fontSize: FS.xl, fontWeight: FW.black, color: Z.tx,
        fontFamily: DISPLAY, letterSpacing: "-0.02em", lineHeight: 1.1,
      }}>{value}</div>

      {sublabel && (
        <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{sublabel}</div>
      )}

      {benchmark && (
        <BenchmarkLine {...benchmark} />
      )}

      {goal && (
        <GoalBar {...goal} color={tone} />
      )}

      {!hasContext && (
        <div style={{
          fontSize: FS.micro, color: Z.tm, fontFamily: COND,
          fontStyle: "italic", marginTop: 2,
        }}>No benchmark — add one for context.</div>
      )}
    </div>
  );
}

function BenchmarkLine({ value, label, direction = "flat", good = true }) {
  const arrow = ARROW[direction] || ARROW.flat;
  const col = (ARROW_COLOR[direction] || ARROW_COLOR.flat)(good);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      fontSize: FS.xs, color: Z.tm, fontFamily: COND,
    }}>
      <span style={{ color: col, fontWeight: FW.bold }}>{arrow} {value}</span>
      <span>{label}</span>
    </div>
  );
}

function GoalBar({ value, pctReached = 0, label, color }) {
  const pct = Math.max(0, Math.min(pctReached, 1.2));
  const barPct = Math.min(pct, 1) * 100;
  const overshoot = pct > 1;
  const reachedColor = pct >= 1 ? Z.go : pct >= 0.75 ? Z.wa : color;

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{
        height: 6, borderRadius: 3, background: Z.bd,
        overflow: "hidden", position: "relative",
      }}>
        <div style={{
          height: "100%", width: `${barPct}%`, borderRadius: 3,
          background: reachedColor,
          transition: "width 0.3s ease",
        }} />
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        marginTop: 4, fontSize: FS.micro, color: Z.tm, fontFamily: COND,
      }}>
        <span>{label || "Goal"}</span>
        <span style={{ color: overshoot ? Z.go : Z.tm, fontWeight: FW.bold }}>
          {Math.round(pct * 100)}% of {value}
        </span>
      </div>
    </div>
  );
}
