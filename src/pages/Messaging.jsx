// ============================================================
// Messaging.jsx — Team direct messages, backed by team_notes.
//
// One inbox, grouped by the other team member. Left pane lists
// conversations (other party, latest preview, unread count). Right
// pane renders the full thread with a composer. Shares the same
// team_notes table as the NotificationPopover and TeamMemberProfile
// Messages tab so sends and reads stay consistent across surfaces.
// ============================================================
import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { Z, COND, FS, FW, Ri, R } from "../lib/theme";
import { Ic, Btn, Modal } from "../components/ui";
import { supabase } from "../lib/supabase";
import { fmtTimeRelative as fmtTime } from "../lib/formatters";

const Messaging = memo(({ team, currentUser }) => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeOther, setActiveOther] = useState(null); // team_members.id of the other party
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const meId = currentUser?.id || null;

  // ─── Load every DM this user is part of ───────────────
  useEffect(() => {
    if (!meId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // DMs are team_notes rows with no context_id attached. context_type
      // may be "general" (legacy default) or null — we only exclude rows
      // tied to a specific entity (ad_project, sale, story, task, etc).
      const { data, error } = await supabase
        .from("team_notes")
        .select("*")
        .or(`from_user.eq.${meId},to_user.eq.${meId}`)
        .is("context_id", null)
        .order("created_at", { ascending: true });
      if (error) console.error("Messaging load error:", error);
      if (!cancelled) {
        setNotes(data || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [meId]);

  // ─── Realtime: new DMs land without reload ────────────
  useEffect(() => {
    if (!meId) return;
    const ch = supabase.channel(`messaging_${meId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_notes" }, (payload) => {
        const n = payload.new;
        if (n.context_id) return; // contextual threads belong to ad projects etc
        if (n.from_user !== meId && n.to_user !== meId) return;
        setNotes(prev => prev.some(x => x.id === n.id) ? prev : [...prev, n]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "team_notes" }, (payload) => {
        const n = payload.new;
        if (n.from_user !== meId && n.to_user !== meId) return;
        setNotes(prev => prev.map(x => x.id === n.id ? n : x));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [meId]);

  // ─── Group into conversations by the other-party id ───
  // Each conversation: { otherId, messages[], latest, unread }
  const conversations = useMemo(() => {
    const byOther = new Map();
    for (const n of notes) {
      const otherId = n.from_user === meId ? n.to_user : n.from_user;
      if (!otherId) continue;
      if (otherId === meId) continue; // skip self-messages
      if (!byOther.has(otherId)) byOther.set(otherId, { otherId, messages: [], unread: 0 });
      const conv = byOther.get(otherId);
      conv.messages.push(n);
      if (n.to_user === meId && !n.is_read) conv.unread += 1;
    }
    const list = Array.from(byOther.values());
    list.forEach(c => { c.latest = c.messages[c.messages.length - 1]; });
    list.sort((a, b) => (b.latest?.created_at || "").localeCompare(a.latest?.created_at || ""));
    return list;
  }, [notes, meId]);

  const teamById = useMemo(() => {
    const m = new Map();
    for (const t of (team || [])) m.set(t.id, t);
    return m;
  }, [team]);

  const nameOf = (id) => teamById.get(id)?.name || "Unknown";
  const roleOf = (id) => teamById.get(id)?.role || "";

  // ─── Active conversation view ─────────────────────────
  const activeConv = useMemo(() => {
    if (!activeOther) return null;
    return conversations.find(c => c.otherId === activeOther)
      || { otherId: activeOther, messages: [], unread: 0, latest: null };
  }, [conversations, activeOther]);

  // Auto-scroll to bottom when the active conversation updates
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeConv?.messages.length, activeOther]);

  // Mark unread messages from the active partner as read when opened
  useEffect(() => {
    if (!activeConv || !meId) return;
    const unreadIds = activeConv.messages
      .filter(m => m.to_user === meId && !m.is_read)
      .map(m => m.id);
    if (unreadIds.length === 0) return;
    (async () => {
      const nowIso = new Date().toISOString();
      await supabase.from("team_notes").update({ is_read: true, read_at: nowIso }).in("id", unreadIds);
      setNotes(prev => prev.map(n => unreadIds.includes(n.id) ? { ...n, is_read: true, read_at: nowIso } : n));
    })();
  }, [activeOther, activeConv?.messages.length, meId]);

  // ─── Send ─────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !activeOther || !meId || sending) return;
    setSending(true);
    const { data, error } = await supabase.from("team_notes").insert({
      from_user: meId,
      to_user: activeOther,
      message: text,
      context_type: null,
      context_id: null,
    }).select().single();
    setSending(false);
    if (error) { console.error("send failed:", error); return; }
    setDraft("");
    if (data) setNotes(prev => prev.some(x => x.id === data.id) ? prev : [...prev, data]);
  }, [draft, activeOther, meId, sending]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // ─── Search filter over the conversation list ─────────
  const filteredConvs = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => {
      const name = nameOf(c.otherId).toLowerCase();
      const body = (c.latest?.message || "").toLowerCase();
      return name.includes(q) || body.includes(q);
    });
  }, [conversations, search, teamById]);

  // ─── New DM: pick a team member to start or jump to ───
  const pickTeamMember = (id) => {
    setShowPicker(false);
    setActiveOther(id);
  };

  // Team members available to message (everyone except self)
  const pickerTeam = (team || []).filter(t => t.id !== meId && t.isActive !== false);

  // ─── Render ───────────────────────────────────────────
  const activeName = activeOther ? nameOf(activeOther) : "";
  const activeRole = activeOther ? roleOf(activeOther) : "";

  return (
    <div style={{ display: "flex", height: "calc(100vh - 100px)", borderRadius: Ri, overflow: "hidden", border: `1px solid ${Z.bd}`, background: Z.sf }}>
      {/* ─── Left: conversation list ─── */}
      <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${Z.bd}`, display: "flex", flexDirection: "column", background: Z.bg }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${Z.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>Messages</span>
          <button
            onClick={() => setShowPicker(true)}
            style={{ width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer", background: Z.ac, display: "flex", alignItems: "center", justifyContent: "center" }}
            title="New direct message"
          >
            <Ic.edit size={13} color={Z.bg} />
          </button>
        </div>

        <div style={{ padding: "8px 12px" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            style={{ width: "100%", padding: "7px 12px", borderRadius: 20, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: 12 }}>Loading...</div>}
          {!loading && filteredConvs.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: 12 }}>
              {search ? "No matches" : "No conversations yet. Tap + to start one."}
            </div>
          )}
          {filteredConvs.map(c => {
            const other = teamById.get(c.otherId);
            const name = other?.name || "Unknown";
            const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
            const isActive = c.otherId === activeOther;
            const fromMe = c.latest?.from_user === meId;
            return (
              <div
                key={c.otherId}
                onClick={() => setActiveOther(c.otherId)}
                style={{
                  display: "flex", gap: 10, padding: "10px 14px", cursor: "pointer",
                  background: isActive ? Z.sa : "transparent",
                  borderLeft: isActive ? `3px solid ${Z.ac}` : "3px solid transparent",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = Z.sa; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: Z.ac + "18", color: Z.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: FW.black, flexShrink: 0 }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: c.unread > 0 ? FW.black : FW.bold, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {name}
                    </div>
                    <span style={{ fontSize: 10, color: Z.td, flexShrink: 0 }}>{fmtTime(c.latest?.created_at)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <div style={{ fontSize: 11, color: c.unread > 0 ? Z.tx : Z.td, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: c.unread > 0 ? FW.semi : 400 }}>
                      {fromMe ? "You: " : ""}{(c.latest?.message || "").slice(0, 60)}
                    </div>
                    {c.unread > 0 && (
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, borderRadius: 9, padding: "0 6px", background: Z.ac, color: "#fff", fontSize: 10, fontWeight: FW.black, flexShrink: 0 }}>
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Right: active conversation ─── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {activeOther ? (
          <>
            {/* Header */}
            <div style={{ padding: "12px 20px", borderBottom: `1px solid ${Z.bd}`, display: "flex", alignItems: "center", gap: 12, background: Z.sf }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: Z.ac + "18", color: Z.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: FW.black }}>
                {activeName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: FW.bold, color: Z.tx }}>{activeName}</div>
                <div style={{ fontSize: 11, color: Z.td }}>{activeRole || "Direct message"}</div>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 6, background: Z.bg }}>
              {activeConv.messages.length === 0 && (
                <div style={{ padding: 30, textAlign: "center", color: Z.td, fontSize: 13 }}>
                  No messages yet. Start the conversation below.
                </div>
              )}
              {activeConv.messages.map((m, i) => {
                const isMe = m.from_user === meId;
                const prev = activeConv.messages[i - 1];
                const grouped = prev && prev.from_user === m.from_user && (new Date(m.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000;
                return (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: isMe ? "flex-end" : "flex-start",
                      maxWidth: "72%",
                      padding: "8px 12px",
                      borderRadius: 14,
                      background: isMe ? Z.ac : Z.sf,
                      color: isMe ? Z.bg : Z.tx,
                      border: isMe ? "none" : `1px solid ${Z.bd}`,
                      marginTop: grouped ? 2 : 8,
                    }}
                  >
                    <div style={{ fontSize: FS.sm, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.message}</div>
                    <div style={{ fontSize: 9, marginTop: 3, opacity: 0.6, textAlign: isMe ? "right" : "left" }}>{fmtTime(m.created_at)}</div>
                  </div>
                );
              })}
            </div>

            {/* Composer */}
            <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderTop: `1px solid ${Z.bd}`, background: Z.sf, alignItems: "flex-end" }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Message ${activeName.split(" ")[0] || "…"}`}
                rows={1}
                disabled={sending}
                style={{
                  flex: 1, resize: "none",
                  padding: "9px 14px",
                  borderRadius: 18,
                  border: `1px solid ${Z.bd}`,
                  background: Z.bg,
                  color: Z.tx,
                  fontSize: FS.sm,
                  fontFamily: "inherit",
                  outline: "none",
                  minHeight: 18,
                  maxHeight: 140,
                  lineHeight: 1.4,
                }}
              />
              <button
                onClick={send}
                disabled={!draft.trim() || sending}
                style={{
                  width: 38, height: 38, borderRadius: "50%", border: "none",
                  cursor: draft.trim() && !sending ? "pointer" : "default",
                  background: draft.trim() ? Z.ac : Z.sa,
                  opacity: draft.trim() ? 1 : 0.4,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
                aria-label="Send"
              >
                <Ic.send size={14} color={draft.trim() ? Z.bg : Z.td} />
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
            <Ic.chat size={48} color={Z.bd} />
            <div style={{ fontSize: 16, fontWeight: FW.bold, color: Z.td }}>Select a conversation</div>
            <div style={{ fontSize: 13, color: Z.td }}>or start a new one</div>
            <button
              onClick={() => setShowPicker(true)}
              style={{ marginTop: 8, padding: "8px 20px", borderRadius: 20, border: "none", cursor: "pointer", background: Z.ac, color: Z.bg, fontSize: 13, fontWeight: FW.bold }}
            >
              New Message
            </button>
          </div>
        )}
      </div>

      {/* ─── New-DM picker modal ─── */}
      <Modal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        title="New Direct Message"
        width={420}
        actions={<Btn v="cancel" onClick={() => setShowPicker(false)}>Cancel</Btn>}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 420, overflowY: "auto" }}>
          {pickerTeam.length === 0 && <div style={{ padding: 16, color: Z.td, fontSize: 13, textAlign: "center" }}>No other team members to message.</div>}
          {pickerTeam.map(t => {
            const initials = (t.name || "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div
                key={t.id}
                onClick={() => pickTeamMember(t.id)}
                style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", cursor: "pointer", borderRadius: Ri }}
                onMouseEnter={(e) => e.currentTarget.style.background = Z.sa}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: Z.ac + "18", color: Z.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: FW.black }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: FW.bold, color: Z.tx }}>{t.name}</div>
                  {t.role && <div style={{ fontSize: 11, color: Z.td }}>{t.role}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
});

Messaging.displayName = "Messaging";
export default Messaging;
