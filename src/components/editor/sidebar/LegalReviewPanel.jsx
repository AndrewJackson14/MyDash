import React from "react";
import { Z, COND, FS } from "../../../lib/theme";
import { Btn } from "../../ui";

// Toggle to require legal sign-off, plus the sign-off button. When
// turned off, both reviewer fields clear in a single saveMeta patch
// so the audit trail doesn't carry stale "reviewed by X" data when the
// gate is removed.
function LegalReviewPanel({ meta, saveMeta, story }) {
  return (
    <div id="panel-legal-review" style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: FS.xs, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: meta.needs_legal_review ? Z.wa : Z.tm, fontFamily: COND, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!meta.needs_legal_review}
            onChange={e => saveMeta({ needs_legal_review: e.target.checked, ...(e.target.checked ? {} : { legal_reviewed_by: null, legal_reviewed_at: null }) })}
            style={{ accentColor: Z.wa }}
          />
          Needs Legal Review
        </label>
        {meta.needs_legal_review && !meta.legal_reviewed_at && (
          <Btn
            sm
            v="secondary"
            onClick={() => saveMeta({ legal_reviewed_by: story.editor_id || null, legal_reviewed_at: new Date().toISOString() })}
            style={{ fontSize: FS.micro, padding: "2px 8px" }}
          >Sign Off</Btn>
        )}
      </div>
      {meta.needs_legal_review && meta.legal_reviewed_at && (
        <div style={{ fontSize: FS.micro, color: Z.su, fontFamily: COND, marginTop: 4 }}>Legal reviewed {new Date(meta.legal_reviewed_at).toLocaleDateString()}</div>
      )}
      {meta.needs_legal_review && !meta.legal_reviewed_at && (
        <div style={{ fontSize: FS.micro, color: Z.wa, fontFamily: COND, marginTop: 4 }}>Awaiting legal sign-off</div>
      )}
    </div>
  );
}

export default React.memo(LegalReviewPanel);
