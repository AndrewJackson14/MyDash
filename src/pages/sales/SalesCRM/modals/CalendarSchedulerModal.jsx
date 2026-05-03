import { Btn, Inp, Modal, Sel, TA } from "../../../../components/ui";

// Calendar scheduler — meetings + calls with a client. Saving writes a
// "Scheduled: …" comm to the client and clears the originating sale's
// nextAction (via completeAction). calSaleId may be null when invoked
// from the client header (no specific sale context).
export default function CalendarSchedulerModal({
  open, onClose,
  schEvent, setSchEvent,
  calSaleId, sales,
  persist, addComm, today, currentUser,
  completeAction,
}) {
  return (
    <Modal open={open} onClose={onClose} title="📅 Schedule" width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="Title" value={schEvent.title} onChange={e => setSchEvent(x => ({ ...x, title: e.target.value }))} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Inp label="Date" type="date" value={schEvent.date} onChange={e => setSchEvent(x => ({ ...x, date: e.target.value }))} />
          <Inp label="Time" type="time" value={schEvent.time} onChange={e => setSchEvent(x => ({ ...x, time: e.target.value }))} />
          <Sel label="Duration" value={schEvent.duration} onChange={e => setSchEvent(x => ({ ...x, duration: +e.target.value }))} options={[{ value: 15, label: "15 min" }, { value: 30, label: "30 min" }, { value: 60, label: "1 hour" }]} />
        </div>
        <TA label="Notes" value={schEvent.notes} onChange={e => setSchEvent(x => ({ ...x, notes: e.target.value }))} placeholder="Agenda..." />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={onClose}>Cancel</Btn>
          <Btn onClick={async () => {
            if (calSaleId) {
              const s = sales.find(x => x.id === calSaleId);
              if (s) {
                await persist(() => addComm(s.clientId, {
                  id: "cm" + Date.now(), type: "Comment",
                  author: currentUser?.name || "Account Manager",
                  date: today,
                  note: `Scheduled: ${schEvent.title} on ${schEvent.date} at ${schEvent.time}`,
                }));
                completeAction(calSaleId, `Scheduled: ${schEvent.title} ${schEvent.date}`);
              }
            }
            onClose();
          }}>Schedule</Btn>
        </div>
      </div>
    </Modal>
  );
}
