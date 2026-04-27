// ============================================================
// ProposalWizardMobile — Checkpoint 1 stub
//
// Real shell lands in Checkpoint 2. For now this exists so the
// viewport router in ProposalWizard.jsx can render *something*
// when it picks up a <768px viewport — and so a future shell
// drop-in is a single-file change.
//
// Per spec: full-screen takeover, solid Z.bg surface, no glass,
// no backdrop blur. The placeholder honors that while we wait.
// ============================================================
import { Z, COND, FS, FW } from "../../lib/theme";

export default function ProposalWizardMobile({ orch }) {
  const { onClose } = orch;
  return (
    <div
      role="dialog"
      aria-label="Build proposal (mobile)"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: Z.bg, color: Z.tx,
        display: "flex", flexDirection: "column",
        padding: "calc(env(safe-area-inset-top) + 24px) 24px 24px",
        fontFamily: COND,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }}>
        <div style={{ fontSize: FS.xl, fontWeight: FW.heavy, color: Z.tx }}>
          Mobile proposal builder
        </div>
        <div style={{ fontSize: FS.sm, color: Z.tm, maxWidth: 280, lineHeight: 1.5 }}>
          Coming next checkpoint. For now, build proposals on a tablet or laptop.
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          padding: "14px 16px", minHeight: 48,
          background: "transparent",
          border: `1px solid ${Z.bd}`,
          borderRadius: 10,
          color: Z.tx, fontSize: 14, fontWeight: 700, fontFamily: COND,
          cursor: "pointer",
          marginBottom: "env(safe-area-inset-bottom)",
        }}
      >Close</button>
    </div>
  );
}
