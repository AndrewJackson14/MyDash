import { useEffect, useState } from "react";
import { Z, COND, FS, FW, Ri } from "../../lib/theme";

// "Refreshed X min ago" + refresh button. Ticks once a minute.
const relative = (ts) => {
  if (!ts) return "just now";
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
};

const RefreshPill = ({ lastFetchedAt, onRefresh, loading }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
  return <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <span style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
      Refreshed {relative(lastFetchedAt)}
    </span>
    <button
      onClick={onRefresh}
      disabled={loading}
      style={{
        padding: "6px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`,
        background: "transparent", color: Z.tx,
        cursor: loading ? "progress" : "pointer",
        fontSize: FS.sm, fontWeight: FW.bold, fontFamily: COND,
        opacity: loading ? 0.5 : 1,
      }}
    >
      {loading ? "Refreshing…" : "Refresh"}
    </button>
  </div>;
};

export default RefreshPill;
