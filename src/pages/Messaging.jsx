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
import { usePageHeader } from "../contexts/PageHeaderContext";
import { supabase } from "../lib/supabase";
import { fmtTimeRelative as fmtTime } from "../lib/formatters";
import ChatPanel from "../components/ChatPanel";

const MYHELPER_EMAIL = "helper@mydash.local";

// Labels for the polymorphic ref_type values on message_threads.
// Kept in sync with the refType strings passed to <EntityThread /> in
// StoryEditor, AdProjects, ClientProfile, LegalNotices, and the
// Sales Contract modal.
const ENTITY_TYPE_LABELS = {
  story: "Stories",
  ad_project: "Ad Projects",
  client: "Clients",
  contract: "Contracts",
  legal_notice: "Legal Notices",
  sale: "Sales",
};
const ENTITY_TYPE_ORDER = ["story", "ad_project", "client", "contract", "legal_notice", "sale"];

const Messaging = memo(({ team, currentUser, isActive }) => {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Messages" }], title: "Messages" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeOther, setActiveOther] = useState(null); // team_members.id of the other party
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  // "dm" = direct messages (team_notes). "entity" = per-entity threads
  // (message_threads with a ref_type set). Switching tabs keeps each
  // pane's own selection so you don't lose context toggling back.
  const [view, setView] = useState("dm");
  const [entityThreads, setEntityThreads] = useState([]);
  const [entityPreviews, setEntityPreviews] = useState({}); // { [threadId]: latestMessage }
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [entityLoading, setEntityLoading] = useState(false);

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

  // ─── Load entity threads on demand ─────────────────────
  // Pulls every message_threads row that has a ref_type set, so they can
  // be grouped by entity type in the left pane. Previews come from the
  // most recent message per thread (small extra query — keeps previews
  // accurate without subscribing to every thread).
  useEffect(() => {
    if (view !== "entity") return;
    let cancelled = false;
    setEntityLoading(true);
    (async () => {
      const { data: threads, error } = await supabase
        .from("message_threads")
        .select("id, ref_type, ref_id, title, participants, is_archived, updated_at, created_at")
        .not("ref_type", "is", null)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) {
        console.error("Entity threads load error:", error);
        setEntityThreads([]);
        setEntityLoading(false);
        return;
      }
      setEntityThreads(threads || []);
      if (!threads?.length) {
        setEntityPreviews({});
        setEntityLoading(false);
        return;
      }
      const ids = threads.map(t => t.id);
      const { data: msgs } = await supabase
        .from("messages")
        .select("thread_id, body, sender_name, created_at, is_system")
        .in("thread_id", ids)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const previews = {};
      (msgs || []).forEach(m => {
        if (!previews[m.thread_id]) previews[m.thread_id] = m;
      });
      setEntityPreviews(previews);
      setEntityLoading(false);
    })();
    return () => { cancelled = true; };
  }, [view]);

  // ─── Realtime: bubble new entity-thread messages into the preview map
  useEffect(() => {
    if (view !== "entity") return;
    const ch = supabase.channel("entity-thread-previews")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new;
        setEntityPreviews(prev => ({ ...prev, [m.thread_id]: m }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [view]);

  const threadsByType = useMemo(() => {
    const groups = {};
    entityThreads.forEach(t => {
      const key = t.ref_type || "other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [entityThreads]);

  const filteredThreadsByType = useMemo(() => {
    if (!search.trim()) return threadsByType;
    const q = search.toLowerCase();
    const out = {};
    Object.entries(threadsByType).forEach(([type, list]) => {
      const filtered = list.filter(t => {
        const title = (t.title || "").toLowerCase();
        const preview = (entityPreviews[t.id]?.body || "").toLowerCase();
        return title.includes(q) || preview.includes(q);
      });
      if (filtered.length) out[type] = filtered;
    });
    return out;
  }, [threadsByType, entityPreviews, search]);

  const activeThread = useMemo(
    () => entityThreads.find(t => t.id === activeThreadId) || null,
    [entityThreads, activeThreadId],
  );

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
    // If the recipient is MyHelper, tag the note as a bot_query so the
    // bot polling loop picks it up. Page context is null from Messages.
    const isBot = (team || []).find(t => t.id === activeOther)?.email === MYHELPER_EMAIL;
    setSending(true);
    const { data, error } = await supabase.from("team_notes").insert({
      from_user: meId,
      to_user: activeOther,
      message: text,
      context_type: isBot ? "bot_query" : null,
      context_id: null,
    }).select().single();
    setSending(false);
    if (error) { console.error("send failed:", error); return; }
    setDraft("");
    if (data) setNotes(prev => prev.some(x => x.id === data.id) ? prev : [...prev, data]);
  }, [draft, activeOther, meId, sending, team]);

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

  // Team members available to message (everyone except self).
  // MyHelper bot is pinned to the top so it's discoverable; otherwise
  // alphabetical by name. is_hidden=true on the bot row hides it from
  // role-filtered lists everywhere else, but we want it surfaced here.
  const pickerTeam = useMemo(() => {
    const list = (team || []).filter(t => (t.id !== meId && t.isActive !== false) || t.email === MYHELPER_EMAIL);
    return [...list].sort((a, b) => {
      if (a.email === MYHELPER_EMAIL) return -1;
      if (b.email === MYHELPER_EMAIL) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [team, meId]);

  // ─── Render ───────────────────────────────────────────
  const activeName = activeOther ? nameOf(activeOther) : "";
  const activeRole = activeOther ? roleOf(activeOther) : "";

  return (
    <div style={{ display: "flex", height: "calc(100vh - 100px)", borderRadius: Ri, overflow: "hidden", border: `1px solid ${Z.bd}`, background: Z.sf }}>
      {/* ─── Left: conversation list ─── */}
      <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${Z.bd}`, display: "flex", flexDirection: "column", background: Z.bg }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${Z.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>Messages</span>
          {view === "dm" && (
            <button
              onClick={() => setShowPicker(true)}
              style={{ width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer", background: Z.ac, display: "flex", alignItems: "center", justifyContent: "center" }}
              title="New direct message"
            >
              <Ic.edit size={13} color={Z.bg} />
            </button>
          )}
        </div>

        {/* View tabs — Direct (team_notes DMs) vs Entity (ad_project / story / client / etc threads) */}
        <div style={{ display: "flex", borderBottom: `1px solid ${Z.bd}`, background: Z.sf }}>
          {[
            { id: "dm", label: "Direct" },
            { id: "entity", label: "Entity threads" },
          ].map(t => {
            const active = view === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                style={{
                  flex: 1, padding: "8px 10px", border: "none", cursor: "pointer",
                  background: active ? Z.bg : "transparent",
                  color: active ? Z.tx : Z.tm,
                  fontSize: 11, fontWeight: active ? FW.black : FW.bold,
                  fontFamily: COND, letterSpacing: "0.06em", textTransform: "uppercase",
                  borderBottom: active ? `2px solid ${Z.ac}` : "2px solid transparent",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ padding: "8px 12px" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === "dm" ? "Search conversations..." : "Search threads..."}
            style={{ width: "100%", padding: "7px 12px", borderRadius: 20, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {view === "entity" && (
            <>
              {entityLoading && <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: 12 }}>Loading threads...</div>}
              {!entityLoading && entityThreads.length === 0 && (
                <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: 12 }}>No entity threads yet. Threads appear here as stories, ad projects, clients, contracts, and legal notices get discussion activity.</div>
              )}
              {!entityLoading && Object.keys(filteredThreadsByType).length === 0 && entityThreads.length > 0 && (
                <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: 12 }}>No matches</div>
              )}
              {ENTITY_TYPE_ORDER.concat(
                Object.keys(filteredThreadsByType).filter(k => !ENTITY_TYPE_ORDER.includes(k))
              ).map(typeKey => {
                const list = filteredThreadsByType[typeKey];
                if (!list?.length) return null;
                const label = ENTITY_TYPE_LABELS[typeKey] || typeKey;
                return (
                  <div key={typeKey}>
                    <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: FW.black, letterSpacing: "0.08em", textTransform: "uppercase", color: Z.td, fontFamily: COND, background: Z.sf }}>
                      {label} · {list.length}
                    </div>
                    {list.map(th => {
                      const preview = entityPreviews[th.id];
                      const isActive = th.id === activeThreadId;
                      return (
                        <div
                          key={th.id}
                          onClick={() => setActiveThreadId(th.id)}
                          style={{
                            display: "flex", flexDirection: "column", gap: 2,
                            padding: "8px 14px", cursor: "pointer",
                            background: isActive ? Z.sa : "transparent",
                            borderLeft: isActive ? `3px solid ${Z.ac}` : "3px solid transparent",
                          }}
                          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = Z.sa; }}
                          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                            <div style={{ fontSize: 12, fontWeight: FW.bold, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                              {th.title || "Untitled thread"}
                            </div>
                            {preview && <span style={{ fontSize: 10, color: Z.td, flexShrink: 0 }}>{fmtTime(preview.created_at)}</span>}
                          </div>
                          {preview ? (
                            <div style={{ fontSize: 11, color: Z.td, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {preview.is_system ? "· " : `${preview.sender_name || ""}: `}{(preview.body || "").slice(0, 70)}
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: Z.td, fontStyle: "italic" }}>No messages yet</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}

          {view === "dm" && loading && <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: 12 }}>Loading...</div>}
          {view === "dm" && !loading && filteredConvs.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: 12 }}>
              {search ? "No matches" : "No conversations yet. Tap + to start one."}
            </div>
          )}
          {view === "dm" && filteredConvs.map(c => {
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

      {/* ─── Right: active conversation / thread ─── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {view === "entity" && activeThread ? (
          <>
            <div style={{ padding: "12px 20px", borderBottom: `1px solid ${Z.bd}`, display: "flex", alignItems: "center", gap: 12, background: Z.sf }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: Z.ac + "18", color: Z.ac, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: FW.black, textTransform: "uppercase" }}>
                {(activeThread.ref_type || "?").slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: FW.bold, color: Z.tx }}>{activeThread.title || "Untitled thread"}</div>
                <div style={{ fontSize: 11, color: Z.td }}>{ENTITY_TYPE_LABELS[activeThread.ref_type] || activeThread.ref_type}</div>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: Z.bg }}>
              <ChatPanel
                threadId={activeThread.id}
                currentUser={currentUser}
                team={team}
                height="100%"
                placeholder="Message this thread..."
                onNewMessage={(m) => setEntityPreviews(prev => ({ ...prev, [activeThread.id]: m }))}
              />
            </div>
          </>
        ) : view === "dm" && activeOther ? (
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
            <div style={{ fontSize: 16, fontWeight: FW.bold, color: Z.td }}>
              {view === "entity" ? "Select an entity thread" : "Select a conversation"}
            </div>
            <div style={{ fontSize: 13, color: Z.td }}>
              {view === "entity" ? "Threads from stories, ad projects, clients, contracts, and legal notices." : "or start a new one"}
            </div>
            {view === "dm" && (
              <button
                onClick={() => setShowPicker(true)}
                style={{ marginTop: 8, padding: "8px 20px", borderRadius: 20, border: "none", cursor: "pointer", background: Z.ac, color: Z.bg, fontSize: 13, fontWeight: FW.bold }}
              >
                New Message
              </button>
            )}
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
