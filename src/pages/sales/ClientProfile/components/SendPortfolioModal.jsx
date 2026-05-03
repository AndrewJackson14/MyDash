import { useState } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../../../../lib/theme";
import { Btn } from "../../../../components/ui";
import { supabase, EDGE_FN_URL } from "../../../../lib/supabase";

// Anthony P5h — modal that calls the send-portfolio edge function.
// Used by PortfolioLinkButton to send a tearsheet portfolio link to
// a client contact. The edge function handles email composition and
// Gmail send; this UI just collects the recipient + optional message.
export default function SendPortfolioModal({ client, onClose }) {
  const contacts = Array.isArray(client?.contacts) ? client.contacts : [];
  const [recipient, setRecipient] = useState(contacts[0]?.email || "");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const send = async () => {
    if (sending || !recipient.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("not signed in");
      const res = await fetch(`${EDGE_FN_URL}/send-portfolio`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: client.id,
          recipient_email: recipient.trim(),
          cc_emails: cc.trim() || undefined,
          custom_message: message.trim() || undefined,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || `send failed: ${res.status}`);
      setResult({ ok: true });
      setTimeout(onClose, 1200);
    } catch (err) {
      setResult({ error: err.message || "send failed" });
    }
    setSending(false);
  };

  return (
    <div onClick={() => !sending && onClose()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: Z.sf, borderRadius: R, padding: 24, width: 460, maxWidth: "94vw",
        border: `1px solid ${Z.bd}`,
      }}>
        <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 4 }}>Send tearsheet portfolio</div>
        <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 14 }}>To {client?.name || "client"} — full archive of every tearsheet</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND, marginBottom: 4 }}>Recipient *</div>
            <input
              type="email"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="client@example.com"
              style={{ width: "100%", padding: "8px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
            />
            {contacts.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {contacts.slice(0, 5).map((c, i) => c?.email && (
                  <button
                    key={i}
                    onClick={() => setRecipient(c.email)}
                    style={{ background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: 999, padding: "2px 8px", cursor: "pointer", fontSize: FS.micro, color: Z.tm, fontFamily: COND }}
                  >
                    {(c.name || c.email).slice(0, 26)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND, marginBottom: 4 }}>CC (comma-separated)</div>
            <input
              type="text"
              value={cc}
              onChange={e => setCc(e.target.value)}
              placeholder="optional"
              style={{ width: "100%", padding: "8px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
            />
          </div>
          <div>
            <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND, marginBottom: 4 }}>Custom note (optional)</div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Bookmark this — it's your permanent tearsheet archive."
              rows={3}
              style={{ width: "100%", padding: "8px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", boxSizing: "border-box", outline: "none", resize: "vertical" }}
            />
          </div>

          {result?.error && <div style={{ fontSize: FS.xs, color: Z.da }}>{result.error}</div>}
          {result?.ok && <div style={{ fontSize: FS.xs, color: Z.go }}>✓ Portfolio sent</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
            <Btn sm v="secondary" onClick={onClose} disabled={sending}>Cancel</Btn>
            <Btn sm onClick={send} disabled={sending || !recipient.trim() || result?.ok}>
              {sending ? "Sending…" : result?.ok ? "Sent" : "Send portfolio"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
