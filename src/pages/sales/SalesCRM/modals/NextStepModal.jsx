import { Z, FS, FW, Ri } from "../../../../lib/theme";
import { Btn, Inp, Modal, Ic } from "../../../../components/ui";
import { ACTION_TYPES } from "../../constants";

// Next-step prompt — fires after a sale's previous action is marked
// done. Lets the rep pick the next action_type + label for the sale.
// Cancelling clears the action entirely (clearAction handler).
export default function NextStepModal({
  open, onClose,
  nextStepAction, setNextStepAction,
  saveNextStep, clearAction,
}) {
  return (
    <Modal open={open} onClose={onClose} title="What's Next?" width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: FS.base, color: Z.tm }}>Action completed! What should the next step be?</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
          {Object.entries(ACTION_TYPES).map(([key, at]) => (
            <button key={key} onClick={() => setNextStepAction({ type: key, label: at.label })} style={{ padding: "8px 4px", borderRadius: Ri, border: `1px solid ${nextStepAction?.type === key ? at.color : Z.bd}`, background: nextStepAction?.type === key ? `${at.color}15` : Z.bg, cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: FS.lg }}>{at.icon}</div>
              <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: nextStepAction?.type === key ? at.color : Z.tm }}>{at.label}</div>
            </button>
          ))}
        </div>
        {nextStepAction && <Inp label="Description" value={nextStepAction.label} onChange={e => setNextStepAction(a => ({ ...a, label: e.target.value }))} />}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={clearAction}>No Next Step</Btn>
          <Btn onClick={saveNextStep} disabled={!nextStepAction}><Ic.check size={12} /> Set Next Step</Btn>
        </div>
      </div>
    </Modal>
  );
}
