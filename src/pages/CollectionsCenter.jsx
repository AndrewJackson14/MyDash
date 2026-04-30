// ============================================================
// CollectionsCenter — Cami P3. Focused A/R collections workflow.
// Aggregates open invoices into aging buckets (current / 30+ / 60+ /
// 90+ / 120+ days), groups by client, and gives Cami one-click
// statement send via the send-statement edge function. Each client
// row shows total open balance + bucket distribution + last contact
// + send button. Fast iteration on overdue cleanup vs. opening
// individual ClientProfiles one-by-one.
// ============================================================
import { useState, useMemo, useEffect } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri, ACCENT } from "../lib/theme";
import { Btn, Sel, SB, glass as glassStyle, PageHeader } from "../components/ui";
import { supabase, EDGE_FN_URL } from "../lib/supabase";
import { fmtCurrencyWhole as fmtCurrency, fmtDateShort as fmtDate } from "../lib/formatters";

const BUCKET_LABELS = [
  { key: "current", label: "Current", min: -Infinity, max: 0, color: "#16A34A" },
  { key: "1_30",    label: "1–30d",   min: 1,   max: 30,  color: "#D97706" },
  { key: "31_60",   label: "31–60d",  min: 31,  max: 60,  color: "#EA580C" },
  { key: "61_90",   label: "61–90d",  min: 61,  max: 90,  color: "#DC2626" },
  { key: "91_plus", label: "90+",     min: 91,  max: Infinity, color: "#991B1B" },
];

function bucketForDays(days) {
  for (const b of BUCKET_LABELS) {
    if (days >= b.min && days <= b.max) return b.key;
  }
  return "current";
}
function bucketColor(key) {
  return BUCKET_LABELS.find(b => b.key === key)?.color || Z.tm;
}

export default function CollectionsCenter({
  isActive, currentUser, invoices, clients, payments, team,
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [search, setSearch] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [sendModalClient, setSendModalClient] = useState(null);
  const [delegateClient, setDelegateClient] = useState(null);

  const cn = (id) => (clients || []).find(c => c.id === id)?.name || "—";
  const cb = (id) => (clients || []).find(c => c.id === id);

  // Open invoices (balanceDue > 0, not paid/void/cancelled)
  const openInvoices = useMemo(() => {
    return (invoices || [])
      .filter(i => i.balanceDue > 0 && !["paid", "void", "cancelled"].includes(i.status))
      .map(i => {
        const days = i.dueDate ? Math.round((new Date(today) - new Date(i.dueDate)) / 86400000) : 0;
        return { ...i, overdueDays: days, bucket: bucketForDays(days) };
      });
  }, [invoices, today]);

  // Aging totals across the full org
  const agingTotals = useMemo(() => {
    const out = {};
    for (const b of BUCKET_LABELS) out[b.key] = { count: 0, total: 0 };
    for (const inv of openInvoices) {
      out[inv.bucket].count++;
      out[inv.bucket].total += inv.balanceDue || 0;
    }
    return out;
  }, [openInvoices]);

  const grandTotal = openInvoices.reduce((s, i) => s + (i.balanceDue || 0), 0);
  const overdueTotal = openInvoices.filter(i => i.bucket !== "current").reduce((s, i) => s + (i.balanceDue || 0), 0);

  // Group by client
  const grouped = useMemo(() => {
    const map = new Map();
    for (const inv of openInvoices) {
      if (!map.has(inv.clientId)) {
        map.set(inv.clientId, {
          clientId: inv.clientId,
          clientName: cn(inv.clientId),
          invoices: [],
          total: 0,
          oldestDays: 0,
          buckets: {},
        });
      }
      const g = map.get(inv.clientId);
      g.invoices.push(inv);
      g.total += inv.balanceDue || 0;
      g.oldestDays = Math.max(g.oldestDays, inv.overdueDays);
      g.buckets[inv.bucket] = (g.buckets[inv.bucket] || 0) + (inv.balanceDue || 0);
    }
    let arr = Array.from(map.values());
    if (bucketFilter !== "all") {
      arr = arr.filter(g => g.invoices.some(i => i.bucket === bucketFilter));
    }
    const q = search.trim().toLowerCase();
    if (q) arr = arr.filter(g => g.clientName.toLowerCase().includes(q));
    // Sort: highest total, breaking ties by oldest days
    arr.sort((a, b) => (b.total - a.total) || (b.oldestDays - a.oldestDays));
    return arr;
  }, [openInvoices, bucketFilter, search, clients]);

  // Recent statement sends (from email_log) — surfaces "last sent"
  // per client so Cami doesn't double-send. Loads on mount.
  const [statementSent, setStatementSent] = useState(new Map()); // client_id → most recent timestamp
  useEffect(() => {
    if (!isActive) return;
    (async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("email_log")
        .select("client_id, created_at")
        .eq("ref_type", "statement")
        .eq("type", "outbound")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      const m = new Map();
      for (const r of (data || [])) {
        if (!m.has(r.client_id)) m.set(r.client_id, r.created_at);
      }
      setStatementSent(m);
    })();
  }, [isActive, sendModalClient]);

  if (!isActive) return null;

  const glass = { ...glassStyle(), borderRadius: R, padding: "16px 18px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 28 }}>
      <PageHeader title="Collections Center" />

      {/* Aging buckets hero */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {BUCKET_LABELS.map(b => {
          const data = agingTotals[b.key];
          const isActiveFilter = bucketFilter === b.key;
          return (
            <button
              key={b.key}
              onClick={() => setBucketFilter(isActiveFilter ? "all" : b.key)}
              style={{
                ...glass,
                padding: "14px 18px",
                background: isActiveFilter ? b.color + "12" : glass.background,
                border: `1px solid ${isActiveFilter ? b.color : Z.bd}`,
                borderRadius: R,
                cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{ fontSize: FS.title, fontWeight: FW.black, color: b.color, fontFamily: DISPLAY }}>{fmtCurrency(data.total)}</div>
              <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{b.label}</div>
              <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginTop: 2 }}>{data.count} invoice{data.count === 1 ? "" : "s"}</div>
            </button>
          );
        })}
      </div>

      {/* Filter bar + grand totals */}
      <div style={glass}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <SB value={search} onChange={setSearch} placeholder="Search clients…" />
            {bucketFilter !== "all" && (
              <button onClick={() => setBucketFilter("all")} style={{ background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: 999, padding: "5px 10px", cursor: "pointer", fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
                Clear filter ({BUCKET_LABELS.find(b => b.key === bucketFilter)?.label}) ×
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>Overdue</div>
              <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: overdueTotal > 0 ? Z.da : Z.go, fontFamily: DISPLAY }}>{fmtCurrency(overdueTotal)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Open</div>
              <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{fmtCurrency(grandTotal)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Client groups */}
      {grouped.length === 0 ? (
        <div style={{ ...glass, textAlign: "center", padding: 60, color: Z.tm }}>
          {bucketFilter !== "all" || search
            ? "No clients match the current filter."
            : "✨ Zero open balances. A/R is fully cleared."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {grouped.map(g => {
            const lastSent = statementSent.get(g.clientId);
            const lastSentAgo = lastSent ? Math.round((Date.now() - new Date(lastSent).getTime()) / 86400000) : null;
            const oldestColor = bucketColor(bucketForDays(g.oldestDays));
            return (
              <div key={g.clientId} style={{ ...glass, borderLeft: `3px solid ${oldestColor}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{g.clientName}</div>
                    <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
                      {g.invoices.length} open invoice{g.invoices.length === 1 ? "" : "s"} · oldest {g.oldestDays > 0 ? `${g.oldestDays}d overdue` : "current"}
                      {lastSent && ` · last statement ${lastSentAgo === 0 ? "today" : lastSentAgo === 1 ? "yesterday" : `${lastSentAgo}d ago`}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Bucket distribution chip row */}
                    <div style={{ display: "flex", gap: 3 }}>
                      {BUCKET_LABELS.map(b => {
                        const amt = g.buckets[b.key] || 0;
                        if (amt <= 0) return null;
                        return (
                          <span key={b.key} title={`${b.label}: ${fmtCurrency(amt)}`} style={{ padding: "2px 6px", borderRadius: Ri, fontSize: FS.micro, fontWeight: FW.bold, color: b.color, background: b.color + "15", fontFamily: COND }}>
                            {fmtCurrency(amt)}
                          </span>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: oldestColor, fontFamily: DISPLAY, minWidth: 100, textAlign: "right" }}>{fmtCurrency(g.total)}</div>
                    <Btn sm v="secondary" onClick={() => setDelegateClient(cb(g.clientId))} title="Hand this off to the client's rep">↪ Delegate</Btn>
                    <Btn sm onClick={() => setSendModalClient(cb(g.clientId))}>✉ Send statement</Btn>
                  </div>
                </div>
                {/* Expandable invoice list */}
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", fontSize: FS.xs, color: Z.tm, fontFamily: COND, fontWeight: FW.semi }}>
                    View {g.invoices.length} invoice{g.invoices.length === 1 ? "" : "s"}
                  </summary>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                    {g.invoices.sort((a, b) => (b.overdueDays - a.overdueDays)).map(inv => {
                      const c = bucketColor(inv.bucket);
                      return (
                        <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: Z.bg, borderRadius: Ri, borderLeft: `2px solid ${c}` }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                            <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>#{inv.invoiceNumber || inv.id?.slice(-6)}</span>
                            <span style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>
                              issued {fmtDate(inv.issueDate)} · due {fmtDate(inv.dueDate)}
                              {inv.overdueDays > 0 && <span style={{ color: c, fontWeight: FW.bold }}> · {inv.overdueDays}d overdue</span>}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{fmtCurrency(inv.balanceDue)}</span>
                            <a href={`/pay/${encodeURIComponent(inv.invoiceNumber || "")}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: FS.micro, color: Z.ac, fontFamily: COND, fontWeight: FW.semi, textDecoration: "none" }}>Pay link ↗</a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}

      {sendModalClient && (
        <SendStatementModal
          client={sendModalClient}
          onClose={() => setSendModalClient(null)}
        />
      )}

      {delegateClient && (
        <DelegateModal
          client={delegateClient}
          team={team}
          currentUser={currentUser}
          invoices={(invoices || []).filter(i => i.clientId === delegateClient.id && i.balanceDue > 0 && !["paid", "void", "cancelled"].includes(i.status))}
          onClose={() => setDelegateClient(null)}
        />
      )}
    </div>
  );
}

// ── Delegate Modal — May Sim P2.1 ────────────────────────────────
// Cami needs to hand off an AR call to the rep who closed the deal.
// Picks a recipient (defaults to the client's primary rep), composes
// a quick message, and fires it as an "urgent" team_note so the rep's
// NotificationPopover surfaces it with an amber border instead of
// blending in with general traffic.
function DelegateModal({ client, team, currentUser, invoices, onClose }) {
  const defaultRepId = client?.repId || "";
  const [repId, setRepId] = useState(defaultRepId);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const totalDue = (invoices || []).reduce((s, i) => s + Number(i.balanceDue || 0), 0);
  const oldestDays = (invoices || []).reduce((m, i) => {
    if (!i.dueDate) return m;
    const d = Math.round((new Date() - new Date(i.dueDate)) / 86400000);
    return d > m ? d : m;
  }, 0);

  const reps = (team || []).filter(t => ["Salesperson", "Sales Manager"].includes(t.role) && t.isActive !== false && !t.isHidden);

  const send = async () => {
    if (!repId) return;
    const rep = (team || []).find(t => t.id === repId);
    if (!rep?.authId) {
      setResult({ ok: false, message: "Selected rep has no auth_id — can't notify." });
      return;
    }
    setSending(true);
    const message = `[Task: AR follow-up] ${client.name} — ${fmtCurrency(totalDue)} open${oldestDays > 0 ? `, ${oldestDays}d overdue` : ""}.${note.trim() ? `\n\n${note.trim()}` : ""}\n\nCan you call the client?`;
    const { error } = await supabase.from("team_notes").insert({
      from_user: currentUser?.authId || currentUser?.id || null,
      to_user: rep.authId,
      message,
      urgency: "urgent",
      context_type: "client",
      context_id: client.id,
      context_page: "/collections",
    });
    setSending(false);
    if (error) { setResult({ ok: false, message: error.message }); return; }
    setResult({ ok: true, message: `Sent to ${rep.name}` });
    setTimeout(onClose, 1200);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...glassStyle(), borderRadius: R, padding: "20px 24px", width: 480, maxWidth: "100%" }}>
        <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 4 }}>Delegate AR follow-up</div>
        <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 14 }}>
          {client.name} · {fmtCurrency(totalDue)} open{oldestDays > 0 ? ` · ${oldestDays}d overdue` : ""}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Send to rep</div>
          <Sel value={repId} onChange={e => setRepId(e.target.value)} options={[
            { value: "", label: "— Select rep —" },
            ...reps.map(r => ({ value: r.id, label: `${r.name}${r.id === defaultRepId ? " (primary)" : ""}` })),
          ]} />
          {!defaultRepId && <div style={{ fontSize: FS.micro, color: Z.wa, marginTop: 4, fontFamily: COND }}>This client has no primary rep on file.</div>}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Add a note (optional)</div>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Tried 3x on the listed number, no callback. Try the cell on the contact card." rows={3} style={{ width: "100%", background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, padding: 8, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
        </div>

        <div style={{ fontSize: FS.xs, color: Z.tm, marginBottom: 14, fontFamily: COND }}>
          Fires as an <span style={{ color: Z.wa, fontWeight: FW.heavy }}>urgent</span> team_note so it stands out in the rep's notifications.
        </div>

        {result && (
          <div style={{ padding: "8px 12px", marginBottom: 10, borderRadius: Ri, background: result.ok ? "rgba(34,197,94,0.12)" : "rgba(232,72,85,0.12)", color: result.ok ? "#16A34A" : "#DC2626", fontSize: FS.sm, fontWeight: FW.semi }}>
            {result.ok ? "✓ " : "⚠ "}{result.message}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
          <Btn sm v="secondary" onClick={onClose} disabled={sending}>Cancel</Btn>
          <Btn sm onClick={send} disabled={sending || !repId || result?.ok}>
            {sending ? "Sending…" : result?.ok ? "Sent" : "↪ Delegate"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Send Statement Modal — mirrors SendTearsheetModal pattern ───
function SendStatementModal({ client, onClose }) {
  const contacts = Array.isArray(client?.contacts) ? client.contacts : [];
  // Default recipient: client.billingEmail if set, else first contact
  const [recipient, setRecipient] = useState(client?.billingEmail || contacts[0]?.email || "");
  const [cc, setCc] = useState((client?.billingCcEmails || []).filter(e => !!e).join(", "));
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
      const res = await fetch(`${EDGE_FN_URL}/send-statement`, {
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
      setResult({ ok: true, ...out });
      setTimeout(onClose, 1400);
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
        <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 4 }}>Send statement</div>
        <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 14 }}>To {client?.name || "client"} — every open invoice with pay links</div>

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
            {client?.billingEmail && client.billingEmail !== recipient && (
              <button
                onClick={() => setRecipient(client.billingEmail)}
                style={{ marginTop: 4, background: "transparent", border: `1px solid ${Z.ac}`, borderRadius: 999, padding: "2px 8px", cursor: "pointer", fontSize: FS.micro, color: Z.ac, fontFamily: COND }}
              >
                Use billing email: {client.billingEmail}
              </button>
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
              placeholder="Just a friendly reminder — let us know if there's anything we can help with."
              rows={3}
              style={{ width: "100%", padding: "8px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", boxSizing: "border-box", outline: "none", resize: "vertical" }}
            />
          </div>

          {result?.error && <div style={{ fontSize: FS.xs, color: Z.da }}>{result.error}</div>}
          {result?.ok && <div style={{ fontSize: FS.xs, color: Z.go }}>✓ Statement sent — {result.invoice_count} invoice{result.invoice_count === 1 ? "" : "s"} · {fmtCurrency(result.total_due)}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
            <Btn sm v="secondary" onClick={onClose} disabled={sending}>Cancel</Btn>
            <Btn sm onClick={send} disabled={sending || !recipient.trim() || result?.ok}>
              {sending ? "Sending…" : result?.ok ? "Sent" : "Send statement"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
