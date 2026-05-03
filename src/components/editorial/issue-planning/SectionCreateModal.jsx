import React, { useState, useEffect, useRef } from "react";
import { Z, COND, ACCENT, FS, Ri } from "../../../lib/theme";
import { Btn, Modal } from "../../ui";
import { useModalStack } from "../../../hooks/useModalStack";

// IP Wave 3 — replaces the 3-step window.prompt dance with one
// themed modal. Validates label + start page inline so a typo
// surfaces before submit. Esc routes through useModalStack so
// nested modals close in the right order.
function SectionCreateModal({
  open,
  onClose,
  onCreate,           // ({ label, startPage, kind }) => Promise<void>
  pubType,            // "Newspaper" | "Magazine" | … — drives kind hint
  issuePageCount,     // upper bound for start-page validation
}) {
  const [label, setLabel]         = useState("");
  const [startPage, setStartPage] = useState("");
  const [kind, setKind]           = useState("main");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState(null);
  const labelRef = useRef(null);

  useModalStack(open, onClose);

  useEffect(() => {
    if (open) {
      setLabel(""); setStartPage(""); setKind("main");
      setError(null); setSubmitting(false);
      setTimeout(() => labelRef.current?.focus(), 30);
    }
  }, [open]);

  const submit = async () => {
    setError(null);
    const trimmed = label.trim();
    if (!trimmed) { setError("Section name is required"); return; }
    const startN = startPage === "" ? 1 : parseInt(startPage, 10);
    if (isNaN(startN) || startN < 1 || (issuePageCount && startN > issuePageCount)) {
      setError(`Start page must be between 1 and ${issuePageCount || "the issue page count"}`);
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({ label: trimmed, startPage: startN, kind });
      onClose();
    } catch (e) {
      setError(e?.message || "Could not save section");
      setSubmitting(false);
    }
  };

  if (!open) return null;
  const kindHint = pubType === "Newspaper"
    ? "Main resets newspaper page numbering (A1, A2 → B1, B2). Sub is a label only."
    : "For magazines, kind doesn't affect numbering — both are label-only.";

  return (
    <Modal open onClose={onClose} title="New Section" width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={labelStyle}>Section name</label>
          <input
            ref={labelRef}
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="A, Sports, B…"
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Start page</label>
          <input
            type="number"
            min={1}
            max={issuePageCount || undefined}
            value={startPage}
            onChange={e => setStartPage(e.target.value)}
            placeholder="1"
            style={inputStyle}
          />
          <div style={hintStyle}>Leave blank to start at page 1.</div>
        </div>
        <div>
          <label style={labelStyle}>Kind</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[["main", "Main"], ["sub", "Sub"]].map(([v, l]) => {
              const sel = kind === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setKind(v)}
                  style={{
                    flex: 1, padding: "6px 12px", borderRadius: Ri,
                    border: `1px solid ${sel ? Z.ac : Z.bd}`,
                    background: sel ? Z.ac + "15" : "transparent",
                    color: sel ? Z.ac : Z.tm,
                    cursor: "pointer", fontSize: FS.sm,
                    fontWeight: sel ? 700 : 600, fontFamily: COND,
                  }}
                >{l}</button>
              );
            })}
          </div>
          <div style={hintStyle}>{kindHint}</div>
        </div>
        {error && (
          <div style={{ padding: "8px 12px", borderRadius: Ri, background: (ACCENT.red || Z.da) + "12", color: (ACCENT.red || Z.da), fontSize: FS.sm, fontFamily: COND }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn sm v="cancel" onClick={onClose} disabled={submitting}>Cancel</Btn>
          <Btn sm onClick={submit} disabled={submitting || !label.trim()}>
            {submitting ? "Creating…" : "Create section"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

const labelStyle = {
  fontSize: FS.xs, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: Z.tm, fontFamily: COND,
  display: "block", marginBottom: 4,
};
const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "6px 8px", borderRadius: Ri,
  border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx,
  fontSize: FS.sm, fontFamily: COND, outline: "none",
};
const hintStyle = {
  fontSize: FS.micro, color: Z.tm, fontFamily: COND, marginTop: 4,
};

export default React.memo(SectionCreateModal);
