import React from "react";
import { Z, COND, ACCENT, FS, Ri } from "../../lib/theme";
import { Ic, Btn, Modal } from "../ui";
import {
  formatInTimezone, parseFromTimezone, getBrowserTimezone,
  tzShortLabel, fmtInTimezone,
} from "../../lib/timezone";
import { useModalStack } from "../../hooks/useModalStack";

// ── Preflight Checklist Modal ────────────────────────────────────
// The publish-time picker operates in the publication's home timezone
// (publications.timezone, mig 208) — not the editor's browser zone.
// Reasoning: the audience is anchored to the publication's region, so
// "schedule for 6 AM" should mean 6 AM at the paper's location whether
// the editor is in California or New York. When the editor's browser
// zone differs we surface a helper line showing the equivalent local
// wall-clock so they can sanity-check.
function PreflightModal({ open, onClose, onPublish, checks, scheduledAt, onScheduleChange, publication, onFix }) {
  useModalStack(open, onClose);
  const allPassed = checks.every(c => c.pass);
  const isScheduled = !!scheduledAt;
  const pubTz = publication?.timezone || "America/Los_Angeles";
  const browserTz = getBrowserTimezone();
  const showBrowserHelper = browserTz && browserTz !== pubTz;
  const pubTzLabel = tzShortLabel(pubTz, scheduledAt || undefined);
  const browserTzLabel = tzShortLabel(browserTz, scheduledAt || undefined);
  const labelSuffix = publication?.name ? `${pubTzLabel} — ${publication.name}` : pubTzLabel;
  const minLocal = formatInTimezone(new Date().toISOString(), pubTz);
  const pickerValue = formatInTimezone(scheduledAt, pubTz);
  const fmtScheduledPub = scheduledAt ? fmtInTimezone(scheduledAt, pubTz) : "";
  const fmtScheduledBrowser = scheduledAt && showBrowserHelper ? fmtInTimezone(scheduledAt, browserTz) : "";
  return (
    <Modal open={open} onClose={onClose} title="Publish Preflight Check">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 380 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {checks.map((c) => {
            const fixable = !c.pass && onFix && c.id;
            return (
              <div
                key={c.id || c.label}
                onClick={fixable ? () => onFix(c.id) : undefined}
                role={fixable ? "button" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: Ri,
                  background: c.pass ? (Z.su || "#22c55e") + "10" : Z.da + "10",
                  border: "1px solid " + (c.pass ? (Z.su || "#22c55e") + "30" : Z.da + "30"),
                  cursor: fixable ? "pointer" : "default",
                }}
              >
                <span style={{ fontSize: FS.md }}>{c.pass ? "✓" : "✗"}</span>
                <span style={{ fontSize: FS.sm, fontWeight: 600, color: c.pass ? (Z.su || "#22c55e") : Z.da, fontFamily: COND }}>{c.label}</span>
                {fixable && (
                  <span style={{ marginLeft: "auto", fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>{"→ fix"}</span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
          <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>
            Publish Date & Time <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, color: Z.td || Z.tm }}>({labelSuffix})</span>
          </div>
          <input
            type="datetime-local"
            value={pickerValue}
            min={minLocal}
            onChange={e => onScheduleChange(e.target.value ? parseFromTimezone(e.target.value, pubTz) : null)}
            style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: FS.xs, fontFamily: COND }}
          />
          {isScheduled ? (
            <div style={{ marginTop: 4, fontFamily: COND }}>
              <div style={{ fontSize: FS.xs, fontWeight: 600, color: ACCENT.indigo }}>
                Scheduled: {fmtScheduledPub} {pubTzLabel}
              </div>
              {showBrowserHelper && (
                <div style={{ fontSize: FS.micro, color: Z.tm, marginTop: 2 }}>
                  = {fmtScheduledBrowser} your time ({browserTzLabel})
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: FS.xs, fontWeight: 600, color: Z.su || "#22c55e", fontFamily: COND, marginTop: 4 }}>
              Immediately upon publish
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn sm v="cancel" onClick={onClose}>Cancel</Btn>
          <Btn sm onClick={onPublish} disabled={!allPassed} style={!allPassed ? { opacity: 0.5, cursor: "not-allowed" } : {}}>
            <Ic.send size={11} /> {isScheduled ? "Schedule" : "Publish Now"}
          </Btn>
        </div>
        {!allPassed && <p style={{ fontSize: FS.micro, color: Z.da, fontFamily: COND, margin: 0, textAlign: "right" }}>Fix required items before publishing</p>}
      </div>
    </Modal>
  );
}

export default React.memo(PreflightModal);
