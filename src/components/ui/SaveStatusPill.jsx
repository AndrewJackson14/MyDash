import React, { useState, useEffect } from "react";
import { Z, COND, FS, Ri } from "../../lib/theme";
import { Ic } from "./Icons.jsx";

// Shared save-status indicator. Drop-in for any page that wires a
// useSaveStatus instance. Saving / saved / error pill, with retry on
// click when in error state. The 30s tick keeps the timestamp fresh
// without requiring the host page to re-render.
//
// Used by: SalesCRM, ClientProfile (Sales Wave 1).
// Earlier hand-rolled equivalents in StoryEditor + Issue Planning
// remain inline; this component is the canonical version going
// forward.
export function SaveStatusPill({ save }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  if (save.status === "saving") {
    return <span style={pillStyle(Z.tm)}>Saving…</span>;
  }
  if (save.status === "error") {
    return (
      <button
        onClick={() => (save.error?.retry ? save.error.retry() : save.clearError())}
        title={save.error?.message}
        style={{
          ...pillStyle(Z.da), cursor: "pointer",
          border: "1px solid " + Z.da + "40",
          background: Z.da + "12",
          display: "inline-flex", alignItems: "center", gap: 4,
        }}
      >
        <Ic.alert size={11} /> Save failed — retry
      </button>
    );
  }
  if (save.status === "saved" && save.lastSavedAt) {
    return (
      <span style={{ ...pillStyle(Z.su || "#22c55e"), display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Ic.check size={11} /> Saved
      </span>
    );
  }
  return null;
}

const pillStyle = (color) => ({
  fontSize: FS.micro, color, fontFamily: COND, fontWeight: 700,
  padding: "2px 8px", borderRadius: Ri,
});

export default SaveStatusPill;
