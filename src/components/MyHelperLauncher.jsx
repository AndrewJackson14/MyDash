// ============================================================
// MyHelperLauncher — Floating chat bubble in bottom-right
//
// Opens a quick-question panel with MyHelper. Sends the current page
// context so MyHelper can tailor answers. Lives outside the routed page
// tree (mount in App.jsx top-level return) so it's visible everywhere
// including modals.
//
// NOTE: This component is STAGED but not yet imported in App.jsx. Add
// the import + mount once the MyHelper people row is seeded and the
// bot.py service is running. See agent-station/myhelper/README (or
// the build handoff doc) for the activation checklist.
// ============================================================
import { useState, useEffect, useRef, useCallback } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, isDark } from "../lib/theme";
import { Btn } from "./ui";
import { supabase } from "../lib/supabase";
import starters from "../../_docs/_starters.json";

const MYHELPER_EMAIL = "helper@mydash.local";

export default function MyHelperLauncher({ currentUser, team, pg, deepLink }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef(null);

  const helper = (team || []).find(t => t.email === MYHELPER_EMAIL);
  const meId = currentUser?.id;
  const myStarters = starters[currentUser?.role] || starters._default || [];

  // Build the page context string (e.g. "sales/pipeline" or "adprojects")
  const pageContext = (pg || "") + (deepLink?.tab ? `/${deepLink.tab}` : "");

  // ─── Load conversation history with MyHelper ─────────
  useEffect(() => {
    if (!meId || !helper?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("team_notes")
        .select("*")
        .or(`and(from_user.eq.${meId},to_user.eq.${helper.id}),and(from_user.eq.${helper.id},to_user.eq.${meId})`)
        .order("created_at", { ascending: true })
        .limit(50);
      if (!cancelled) setMessages(data || []);
    })();
    return () => { cancelled = true; };
  }, [meId, helper?.id]);

  // ─── Unread badge + realtime new-reply push ──────────
  useEffect(() => {
    if (!meId || !helper?.id) return;
    const refreshUnread = async () => {
      const { count } = await supabase
        .from("team_notes")
        .select("*", { count: "exact", head: true })
        .eq("from_user", helper.id)
        .eq("to_user", meId)
        .eq("is_read", false);
      setUnread(count || 0);
    };
    refreshUnread();

    const ch = supabase.channel(`myhelper_${meId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "team_notes",
        filter: `to_user=eq.${meId}`,
      }, (payload) => {
        if (payload.new.from_user === helper.id) {
          setMessages(prev => [...prev, payload.new]);
          if (!open) setUnread(u => u + 1);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [meId, helper?.id, open]);

  // ─── Mark as read when panel opens ───────────────────
  useEffect(() => {
    if (!open || !meId || !helper?.id) return;
    supabase.from("team_notes")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("from_user", helper.id)
      .eq("to_user", meId)
      .eq("is_read", false)
      .then(() => setUnread(0));
  }, [open, meId, helper?.id]);

  // ─── Stale-query detection (warn if bot hasn't replied in 90s) ─
  const [lastSentAt, setLastSentAt] = useState(null);
  const [staleWarn, setStaleWarn] = useState(false);
  useEffect(() => {
    if (!lastSentAt) { setStaleWarn(false); return; }
    const id = setTimeout(() => {
      // Only warn if my last message is still the latest message in the thread
      // (i.e. no bot reply has arrived)
      setMessages(curr => {
        const last = curr[curr.length - 1];
        if (last && last.from_user === meId) setStaleWarn(true);
        return curr;
      });
    }, 90_000);
    return () => clearTimeout(id);
  }, [lastSentAt, meId]);
  useEffect(() => {
    // Clear stale warning once a bot reply lands
    const last = messages[messages.length - 1];
    if (last && last.from_user === helper?.id) setStaleWarn(false);
  }, [messages, helper?.id]);

  // ─── Keyboard shortcut: Cmd+/ or Ctrl+/ ──────────────
  useEffect(() => {
    const handler = (e) => {
      // Don't steal the shortcut if focus is in a text input / contenteditable
      const t = e.target;
      const inEditable = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key === "/" && !inEditable) {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // ─── Auto-scroll to latest ───────────────────────────
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const send = useCallback(async (text) => {
    const body = (text || draft).trim();
    if (!body || !meId || !helper?.id || sending) return;
    setSending(true);
    setDraft("");
    const { data, error } = await supabase.from("team_notes").insert({
      from_user: meId,
      to_user: helper.id,
      message: body,
      context_type: "bot_query",
      context_page: pageContext || null,
      is_read: false,
    }).select().single();
    if (!error && data) {
      setMessages(prev => [...prev, data]);
      setLastSentAt(Date.now());
    }
    setSending(false);
  }, [draft, meId, helper?.id, sending, pageContext]);

  if (!helper) return null;  // MyHelper people row doesn't exist yet

  // Dark mode flips Z.ac to a light tone, which makes the user bubble and
  // floating launcher look white-on-white. Swap to brand blue in dark mode
  // so outgoing bubbles + the launcher circle stay legible.
  const bubbleAccent = isDark() ? "#486b95" : Z.ac;

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? "Close MyHelper" : "Ask MyHelper (⌘/)"}
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          zIndex: 9998,
          width: 56,
          height: 56,
          borderRadius: 28,
          background: bubbleAccent,
          color: "#fff",
          fontSize: 24,
          border: "none",
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          transform: open ? "scale(0.92)" : "scale(1)",
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.transform = "scale(1.08)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = open ? "scale(0.92)" : "scale(1)"; }}
      >
        {open
          ? "×"
          : <img src="/favicon.png" alt="MyHelper" style={{ width: 36, height: 36, objectFit: "contain" }} />
        }
        {!open && unread > 0 && (
          <span style={{
            position: "absolute",
            top: 2,
            right: 2,
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 9,
            background: "#E24B4A",
            color: "#fff",
            fontSize: 10,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid #fff",
          }}>{unread}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          right: 24,
          bottom: 96,
          zIndex: 9999,
          width: 460,
          maxHeight: 680,
          background: Z.sf,
          borderRadius: R,
          border: `1px solid ${Z.bd}`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.28), 0 6px 16px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "inherit",
          animation: "mh-slide 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}>
          <style>{`@keyframes mh-slide { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          {/* Header */}
          <div style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${Z.bd}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 20,
              background: "#08090D",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
              <img src="/favicon.png" alt="" style={{ width: 36, height: 36, objectFit: "contain" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>MyHelper</div>
              <div style={{ fontSize: 13, color: Z.tm, fontFamily: COND }}>
                {pageContext ? `Page: ${pageContext}` : "Ready to help"}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: Z.tm, fontSize: 26, lineHeight: 1, padding: 4,
              }}
              title="Close (Esc)"
            >×</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minHeight: 240,
            maxHeight: 520,
          }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: "center", color: Z.tm, fontSize: 17, padding: "20px 0" }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>👋</div>
                <div style={{ fontSize: 18, color: Z.tx, fontWeight: FW.bold, marginBottom: 6 }}>
                  Hi! I'm MyHelper.
                </div>
                <div style={{ fontSize: 16, color: Z.tm, marginBottom: 20, lineHeight: 1.5 }}>
                  Ask me anything about MyDash — how to find things, how workflows work, where buttons live.
                </div>
                {myStarters.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {myStarters.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => send(s)}
                        style={{
                          padding: "12px 14px",
                          background: Z.bg,
                          border: `1px solid ${Z.bd}`,
                          borderRadius: Ri,
                          cursor: "pointer",
                          fontSize: 17,
                          color: Z.tx,
                          textAlign: "left",
                          fontFamily: "inherit",
                          transition: "background 140ms",
                          lineHeight: 1.4,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = Z.ac + "12"}
                        onMouseLeave={e => e.currentTarget.style.background = Z.bg}
                      >{s}</button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              messages.map(m => {
                const mine = m.from_user === meId;
                return (
                  <div key={m.id} style={{
                    display: "flex",
                    flexDirection: mine ? "row-reverse" : "row",
                    gap: 10,
                  }}>
                    {!mine && <div style={{
                      width: 32, height: 32, borderRadius: 16,
                      background: "#08090D",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, overflow: "hidden",
                    }}>
                      <img src="/favicon.png" alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
                    </div>}
                    <div style={{
                      maxWidth: "78%",
                      padding: "10px 14px",
                      borderRadius: 14,
                      background: mine ? bubbleAccent : Z.bg,
                      color: mine ? "#fff" : Z.tx,
                      fontSize: 17,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>{m.message}</div>
                  </div>
                );
              })
            )}
            {sending && (
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 16,
                  background: "#08090D",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, overflow: "hidden",
                }}>
                  <img src="/favicon.png" alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
                </div>
                <div style={{
                  padding: "10px 14px", borderRadius: 14, background: Z.bg,
                  color: Z.tm, fontSize: 17, fontStyle: "italic",
                }}>Thinking… (complex questions can take ~15s)</div>
              </div>
            )}
            {staleWarn && (
              <div style={{
                padding: "10px 14px", borderRadius: Ri,
                background: "#E24B4A15", color: "#E24B4A",
                fontSize: 15, lineHeight: 1.4,
              }}>
                MyHelper is slow to respond. If this keeps up, message MySupport directly for a faster answer.
              </div>
            )}
          </div>

          {/* Composer */}
          <div style={{
            padding: "12px 14px",
            borderTop: `1px solid ${Z.bd}`,
            display: "flex",
            gap: 8,
          }}>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask a question…"
              autoFocus
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: Ri,
                border: `1px solid ${Z.bd}`,
                background: Z.bg,
                color: Z.tx,
                fontSize: 17,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <Btn onClick={() => send()} disabled={!draft.trim() || sending}>Send</Btn>
          </div>
        </div>
      )}
    </>
  );
}
