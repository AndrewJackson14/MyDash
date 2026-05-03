import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";
import { Ic } from "../../ui";

// Visually groups Web publish + Print hand-off under a single
// "Hand-off" section so editors don't confuse the two destinations.
// Each row gets a row-icon + label; the actual control set comes
// from PublishPanel (Web) and LayoutHandoffPanel (Print). Rows are
// separated by a hairline divider.
function HandoffSection({ webBody, printBody }) {
  return (
    <div style={{ background: Z.bg, borderRadius: Ri, padding: 12, border: "1px solid " + Z.bd }}>
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 10 }}>Hand-off</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Row icon={<Ic.globe size={14} />} label="Web" subLabel="Publish to public site">
          {webBody}
        </Row>
        <div style={{ borderTop: "1px solid " + Z.bd, margin: "2px -2px" }} />
        <Row icon={<Ic.news size={14} />} label="Print" subLabel="Hand off to layout designer">
          {printBody}
        </Row>
      </div>
    </div>
  );
}

function Row({ icon, label, subLabel, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ color: Z.tm }}>{icon}</span>
        <span style={{ fontSize: FS.sm, fontWeight: 700, color: Z.tx, fontFamily: COND }}>{label}</span>
        <span style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>{subLabel}</span>
      </div>
      {children}
    </div>
  );
}

export default React.memo(HandoffSection);
