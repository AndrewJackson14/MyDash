import { Btn, Inp, Modal, TA, Ic } from "../../../../components/ui";

// Email compose modal — kicked from sale cards' email actions, client
// header email button, and inquiry "Reply". Plain compose: To, Subject,
// Body. The send handler in the parent is responsible for routing to
// Gmail edge fn + logging the comm + closing the saleId's nextAction.
export default function EmailComposeModal({
  open, onClose,
  emailTo, setEmailTo,
  emailSubj, setEmailSubj,
  emailBody, setEmailBody,
  sendEmail,
}) {
  return (
    <Modal open={open} onClose={onClose} title="Compose Email" width={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="To" value={emailTo} onChange={e => setEmailTo(e.target.value)} />
        <Inp label="Subject" value={emailSubj} onChange={e => setEmailSubj(e.target.value)} />
        <TA label="Body" value={emailBody} onChange={e => setEmailBody(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={onClose}>Cancel</Btn>
          <Btn onClick={sendEmail}><Ic.send size={12} /> Send Email</Btn>
        </div>
      </div>
    </Modal>
  );
}
