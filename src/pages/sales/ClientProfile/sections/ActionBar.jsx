import { Z, COND, FS, FW, Ri } from "../../../../lib/theme";
import { useDialog } from "../../../../hooks/useDialog";

// Shared style for the four header action buttons (Call · Email ·
// Proposal · Meeting). Tinted by the verb's accent color so the row
// reads as four distinct surfaces, not a quartet of grey boxes.
function actionBtnStyle(enabled, accent) {
  return {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 6, padding: "12px 4px", minHeight: 64,
    background: enabled ? `${accent}10` : Z.sa,
    color: enabled ? accent : Z.td,
    border: `1px solid ${enabled ? `${accent}40` : Z.bd}`,
    borderRadius: Ri,
    fontSize: FS.xs, fontWeight: FW.heavy,
    fontFamily: COND, letterSpacing: 0.5, textTransform: "uppercase",
    textDecoration: "none",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.5,
  };
}

// Tier 2 CP-3 — Call · Email · Proposal · Meeting in thumb reach. Each
// kicks the right modal/handler in the parent. tel: link is native;
// the others go through onOpenEmail / onOpenProposal / onOpenMeeting
// callbacks the parent owns.
export default function ActionBar({
  vc, primaryContact, currentUser, today,
  persist, appData,
  onOpenEmail, onOpenProposal, onOpenMeeting,
}) {
  const dialog = useDialog();

  // Wave 3 Task 3.10 — tap-to-call confirmation. Previously a tap
  // unconditionally wrote a "Tapped to call" comm even when the rep
  // dismissed the system dialer without dialing. Now we open the
  // dialer, then ~1.5s later prompt for outcome (connected /
  // voicemail / skip). "Skip" writes nothing.
  const handleTapToCall = (e) => {
    if (!primaryContact.phone) { e.preventDefault(); return; }
    // Dialer opens via the native href — don't preventDefault here.
    setTimeout(async () => {
      const result = await dialog.choose("How did the call go?", [
        { value: "connected", label: "Connected — log it" },
        { value: "voicemail", label: "Voicemail — log it" },
        { value: "skip", label: "Didn't connect — skip log" },
      ]);
      if (!result || result === "skip") return;
      const note = result === "connected"
        ? `Called ${primaryContact.phone} — connected`
        : `Called ${primaryContact.phone} — left voicemail`;
      persist(() => appData.addComm(vc.id, {
        id: "cm" + Date.now(), type: "Call",
        author: currentUser?.name || "Account Manager",
        date: today,
        note,
      }));
    }, 1500);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
      <a
        href={primaryContact.phone ? `tel:${primaryContact.phone.replace(/[^0-9+]/g, "")}` : undefined}
        onClick={handleTapToCall}
        style={actionBtnStyle(primaryContact.phone, Z.ac)}
        title={primaryContact.phone || "No phone on file"}
      >
        <span style={{ fontSize: FS.xl, lineHeight: 1 }}>📞</span>
        <span>Call</span>
      </a>
      <button
        type="button"
        onClick={() => onOpenEmail?.(vc)}
        disabled={!primaryContact.email || !onOpenEmail}
        style={actionBtnStyle(primaryContact.email && onOpenEmail, Z.ac)}
        title={primaryContact.email || "No email on file"}
      >
        <span style={{ fontSize: FS.xl, lineHeight: 1 }}>✉️</span>
        <span>Email</span>
      </button>
      <button
        type="button"
        onClick={() => onOpenProposal?.(vc.id)}
        disabled={!onOpenProposal}
        style={actionBtnStyle(!!onOpenProposal, Z.go)}
        title="Build a proposal pre-filled for this client"
      >
        <span style={{ fontSize: FS.xl, lineHeight: 1 }}>📄</span>
        <span>Proposal</span>
      </button>
      <button
        type="button"
        onClick={() => onOpenMeeting?.(vc)}
        disabled={!onOpenMeeting}
        style={actionBtnStyle(!!onOpenMeeting, Z.pu)}
        title="Schedule a meeting with this client"
      >
        <span style={{ fontSize: FS.xl, lineHeight: 1 }}>📅</span>
        <span>Meeting</span>
      </button>
    </div>
  );
}
