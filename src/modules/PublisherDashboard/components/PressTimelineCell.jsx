// PressTimelineCell.jsx — single day cell in the Press Timeline Strip.
// Color/border driven by load (count of pubs going to press that day).

import { Z, COND, FS, FW, Ri } from "../../../lib/theme";
import { PRESS_LOAD_BANDS } from "../constants";

// Cell state derives from publication count for that day.
//   0 → empty   1 → light   2 → medium   3+ → heavy
function cellState(load) {
  if (load >= PRESS_LOAD_BANDS.HEAVY_MIN)  return "heavy";
  if (load >= PRESS_LOAD_BANDS.MEDIUM_MIN) return "medium";
  if (load >= PRESS_LOAD_BANDS.LIGHT)      return "light";
  return "empty";
}

export default function PressTimelineCell({
  dayAbbrev,
  date,                 // 'May 1' style short
  publications = [],    // ['PRP', 'ANM']
  fullPublications = [],// ['Paso Robles Press', ...] — for tooltip
  pressDeadlineISO,     // optional, for tooltip suffix
  onClick,
  selected = false,
}) {
  const load = publications.length;
  const state = cellState(load);

  const palette = {
    empty:  { bg: Z.bg,        border: Z.bd,    text: Z.tm },
    light:  { bg: Z.sa,        border: Z.bd,    text: Z.td },
    medium: { bg: Z.wa + "18", border: Z.wa,    text: Z.wa },
    heavy:  { bg: Z.da + "18", border: Z.da,    text: Z.da },
  }[state];

  const tooltip = fullPublications.length
    ? `${fullPublications.join(", ")}${pressDeadlineISO ? ` · ${new Date(pressDeadlineISO).toLocaleString()}` : ""}`
    : "No press deadline";

  return (
    <div
      onClick={onClick}
      title={tooltip}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        padding: "10px 8px",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        outline: selected ? `2px solid ${Z.ac}` : "none",
        borderRadius: Ri,
        color: palette.text,
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 9, fontWeight: FW.heavy, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {dayAbbrev || ""}
      </div>
      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, fontFamily: COND, color: state === "empty" ? Z.tm : Z.tx }}>
        {date || ""}
      </div>
      <div style={{ fontSize: FS.micro, fontWeight: FW.semi, fontFamily: COND, minHeight: 12 }}>
        {publications.length ? publications.join(", ") : ""}
      </div>
    </div>
  );
}
