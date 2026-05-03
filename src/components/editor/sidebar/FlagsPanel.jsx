import React from "react";
import { Z, COND, ACCENT, FS, Ri } from "../../../lib/theme";

// Article badges that affect display, not workflow. Featured drives the
// hero placement; Premium gates content behind the paywall; Sponsored
// adds the sponsor disclosure (and surfaces the sponsor-name input).
function FlagsPanel({ meta, saveMeta, setMeta }) {
  return (
    <>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, cursor: "pointer", fontSize: FS.xs, fontFamily: COND, color: Z.tx }}>
        <input type="checkbox" checked={!!meta.is_featured} onChange={e => saveMeta("is_featured", e.target.checked)} style={{ accentColor: Z.wa }} />
        <span style={{ fontWeight: 600 }}>{"★"} Featured Article</span><span style={{ fontSize: FS.micro, color: Z.tm }}>(hero)</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, cursor: "pointer", fontSize: FS.xs, fontFamily: COND, color: Z.tx }}>
        <input type="checkbox" checked={!!meta.is_premium} onChange={e => saveMeta("is_premium", e.target.checked)} style={{ accentColor: ACCENT.indigo }} />
        <span style={{ fontWeight: 600 }}>{"🔒"} Premium</span><span style={{ fontSize: FS.micro, color: Z.tm }}>(paywall)</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, cursor: "pointer", fontSize: FS.xs, fontFamily: COND, color: Z.tx }}>
        <input type="checkbox" checked={!!meta.is_sponsored} onChange={e => saveMeta("is_sponsored", e.target.checked)} style={{ accentColor: Z.wa }} />
        <span style={{ fontWeight: 600 }}>Sponsored</span>
      </label>
      {meta.is_sponsored && (
        <input
          value={meta.sponsor_name || ""}
          onChange={e => setMeta(m => ({ ...m, sponsor_name: e.target.value }))}
          onBlur={e => saveMeta("sponsor_name", e.target.value)}
          placeholder="Sponsor name..."
          style={{ width: "100%", padding: "4px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: FS.xs, fontFamily: COND, marginTop: 2 }}
        />
      )}
    </>
  );
}

export default React.memo(FlagsPanel);
