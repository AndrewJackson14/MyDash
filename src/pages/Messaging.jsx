// ============================================================
// Messaging.jsx — Global team messaging (DMs, groups, contextual threads)
// Built on message_threads + messages tables
// ============================================================
import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { Z, COND, FS, FW, Ri, R, INV } from "../lib/theme";
import { Ic, Btn, Inp, Modal, SB, PageHeader } from "../components/ui";
import { supabase } from "../lib/supabase";
import ChatPanel from "../components/ChatPanel";

const THREAD_TYPES = {
  direct: { label: "Direct", icon: "user", color: Z.ac },
  general: { label: "General", color: Z.tm },
  ad_project: { label: "Ad Project", color: Z.pu },
  sale: { label: "Sale", color: Z.go },
  story: { label: "Story", color: Z.wa },
  client: { label: "Client", color: Z.ac },
};

const fmtTime = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  const now = new Date();
  const diff = now - dt;
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000 && dt.getDate() === now.getDate()) return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const Messaging = memo(({ team, currentUser }) => {
  const [threads, setThreads] = useState([]);
  const [latestMessages, setLatestMessages] = useState({});
  const [activeThread, setActiveThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ type: "direct", title: "", recipientId: "" });

  // ─── Load threads ─────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.id) return;
    (async () => {
      const { data } = await supabase.from("message_threads").select("*").order("updated_at", { ascending: false });
      if (data) {
        // Filter to threads the user participates in (or all for admins)
        const mine = data.filter(t =>
          !t.participants?.length || t.participants.includes(currentUser.id)
        );
        setThreads(mine);

        // Fetch latest message per thread for preview
        const threadIds = mine.map(t => t.id);
        if (threadIds.length > 0) {
          const { data: msgs } = await supabase.from("messages").select("*")
            .in("thread_id", threadIds).order("created_at", { ascending: false });
          if (msgs) {
            const latest = {};
            msgs.forEach(m => { if (!latest[m.thread_id]) latest[m.thread_id] = m; });
            setLatestMessages(latest);
          }
        }
      }
      setLoading(false);
    })();
  }, [currentUser?.id]);

  // ─── Realtime: new messages update previews ───────────
  useEffect(() => {
    const channel = supabase.channel("global-msgs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new;
          setLatestMessages(prev => ({ ...prev, [msg.thread_id]: msg }));
          // Bump thread to top
          setThreads(prev => {
            const idx = prev.findIndex(t => t.id === msg.thread_id);
            if (idx <= 0) return prev;
            const updated = [...prev];
            const [thread] = updated.splice(idx, 1);
            return [thread, ...updated];
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── Create new thread ────────────────────────────────
  const createThread = async () => {
    if (newForm.type === "direct" && !newForm.recipientId) return;
    if (newForm.type !== "direct" && !newForm.title.trim()) return;

    let title = newForm.title.trim();
    let participants = [currentUser.id];

    if (newForm.type === "direct") {
      const recipient = (team || []).find(t => t.id === newForm.recipientId);
      title = `${currentUser.name} ↔ ${recipient?.name || "Unknown"}`;
      participants.push(newForm.recipientId);

      // Check for existing DM thread
      const existing = threads.find(t =>
        t.type === "direct" && t.participants?.includes(currentUser.id) && t.participants?.includes(newForm.recipientId)
      );
      if (existing) {
        setActiveThread(existing.id);
        setShowNew(false);
        return;
      }
    }

    const { data: thread } = await supabase.from("message_threads").insert({
      type: newForm.type, title, participants,
    }).select().single();

    if (thread) {
      setThreads(prev => [thread, ...prev]);
      setActiveThread(thread.id);
      // System message
      await supabase.from("messages").insert({
        thread_id: thread.id, sender_name: "System",
        body: newForm.type === "direct"
          ? `Direct message started by ${currentUser.name}.`
          : `Channel "${title}" created by ${currentUser.name}.`,
        is_system: true,
      });
    }
    setShowNew(false);
    setNewForm({ type: "direct", title: "", recipientId: "" });
  };

  // ─── Filtered threads ────────────────────────────────
  const filtered = useMemo(() => {
    let list = threads;
    if (filter !== "all") list = list.filter(t => t.type === filter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(t => t.title?.toLowerCase().includes(s));
    }
    return list;
  }, [threads, filter, search]);

  const activeThreadData = threads.find(t => t.id === activeThread);

  const tn = (id) => (team || []).find(t => t.id === id)?.name || "Unknown";

  const threadDisplayName = (t) => {
    if (t.type === "direct") {
      const other = (t.participants || []).find(id => id !== currentUser?.id);
      return other ? tn(other) : t.title;
    }
    return t.title || "Untitled";
  };

  const threadIcon = (t) => {
    const meta = THREAD_TYPES[t.type] || THREAD_TYPES.general;
    if (t.type === "direct") {
      const other = (t.participants || []).find(id => id !== currentUser?.id);
      const member = (team || []).find(m => m.id === other);
      const initials = member?.name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
      return (
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: Z.ac + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: FW.bold, color: Z.ac, flexShrink: 0 }}>
          {initials}
        </div>
      );
    }
    return (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: (meta.color || Z.tm) + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Ic.chat size={16} color={meta.color || Z.tm} />
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "calc(100vh - 100px)", borderRadius: Ri, overflow: "hidden", border: `1px solid ${Z.bd}`, background: Z.sf }}>

      {/* Left: Thread List */}
      <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${Z.bd}`, display: "flex", flexDirection: "column", background: Z.bg }}>

        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${Z.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>Messages</span>
          <button onClick={() => setShowNew(true)} style={{
            width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer",
            background: Z.ac, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Ic.edit size={13} color="#fff" />
          </button>
        </div>

        {/* Search + Filters */}
        <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations..."
            style={{ padding: "7px 12px", borderRadius: 20, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontSize: 12, outline: "none", fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[{ k: "all", l: "All" }, { k: "direct", l: "DMs" }, { k: "general", l: "Channels" }, { k: "ad_project", l: "Ad Projects" }].map(f => (
              <button key={f.k} onClick={() => setFilter(f.k)} style={{
                padding: "3px 10px", borderRadius: 14, border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: filter === f.k ? FW.bold : 500,
                background: filter === f.k ? Z.tx + "12" : "transparent",
                color: filter === f.k ? Z.tx : Z.td,
              }}>{f.l}</button>
            ))}
          </div>
        </div>

        {/* Thread List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: 12 }}>Loading...</div>}
          {!loading && filtered.length === 0 && <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: 12 }}>No conversations</div>}
          {filtered.map(t => {
            const latest = latestMessages[t.id];
            const isActive = t.id === activeThread;
            return (
              <div key={t.id} onClick={() => setActiveThread(t.id)} style={{
                display: "flex", gap: 10, padding: "10px 14px", cursor: "pointer",
                background: isActive ? Z.sa : "transparent",
                borderLeft: isActive ? `3px solid ${Z.ac}` : "3px solid transparent",
                transition: "background 0.1s",
              }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = Z.sa; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                {threadIcon(t)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: FW.bold, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {threadDisplayName(t)}
                    </div>
                    <span style={{ fontSize: 10, color: Z.td, flexShrink: 0 }}>{fmtTime(latest?.created_at || t.updated_at)}</span>
                  </div>
                  {latest && (
                    <div style={{ fontSize: 11, color: Z.td, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                      {latest.is_system ? "System: " : latest.sender_id === currentUser?.id ? "You: " : `${latest.sender_name}: `}
                      {latest.body?.slice(0, 60)}
                    </div>
                  )}
                  {!latest && <div style={{ fontSize: 11, color: Z.td, marginTop: 2, fontStyle: "italic" }}>No messages</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Active Conversation */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {activeThread ? (
          <>
            {/* Chat Header */}
            <div style={{ padding: "12px 20px", borderBottom: `1px solid ${Z.bd}`, display: "flex", alignItems: "center", gap: 12, background: Z.sf }}>
              {activeThreadData && threadIcon(activeThreadData)}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: FW.bold, color: Z.tx }}>
                  {activeThreadData ? threadDisplayName(activeThreadData) : ""}
                </div>
                <div style={{ fontSize: 11, color: Z.td }}>
                  {activeThreadData?.type === "direct" ? "Direct message"
                    : THREAD_TYPES[activeThreadData?.type]?.label || "Thread"
                  }
                  {activeThreadData?.participants?.length > 0 && ` · ${activeThreadData.participants.length} member${activeThreadData.participants.length !== 1 ? "s" : ""}`}
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <div style={{ flex: 1 }}>
              <ChatPanel threadId={activeThread} currentUser={currentUser} height="100%" />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
            <Ic.chat size={48} color={Z.bd} />
            <div style={{ fontSize: 16, fontWeight: FW.bold, color: Z.td }}>Select a conversation</div>
            <div style={{ fontSize: 13, color: Z.td }}>or start a new one</div>
            <button onClick={() => setShowNew(true)} style={{
              marginTop: 8, padding: "8px 20px", borderRadius: 20, border: "none", cursor: "pointer",
              background: Z.ac, color: "#fff", fontSize: 13, fontWeight: FW.bold,
            }}>New Message</button>
          </div>
        )}
      </div>

      {/* New Thread Modal */}
      {showNew && (
        <Modal title="New Conversation" onClose={() => setShowNew(false)} width={420}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Type */}
            <div>
              <label style={lbl}>Type</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[{ k: "direct", l: "Direct Message" }, { k: "general", l: "Group Channel" }].map(t => (
                  <button key={t.k} onClick={() => setNewForm(f => ({ ...f, type: t.k }))} style={{
                    flex: 1, padding: "8px 12px", borderRadius: Ri, cursor: "pointer",
                    border: `1px solid ${newForm.type === t.k ? Z.ac : Z.bd}`,
                    background: newForm.type === t.k ? Z.ac + "10" : Z.bg,
                    color: newForm.type === t.k ? Z.ac : Z.tm,
                    fontSize: 12, fontWeight: FW.bold,
                  }}>{t.l}</button>
                ))}
              </div>
            </div>

            {/* DM: Recipient */}
            {newForm.type === "direct" && (
              <div>
                <label style={lbl}>To</label>
                <select value={newForm.recipientId} onChange={(e) => setNewForm(f => ({ ...f, recipientId: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: 13, fontFamily: "inherit" }}>
                  <option value="">Select team member...</option>
                  {(team || []).filter(t => t.id !== currentUser?.id && t.isActive !== false).map(t => (
                    <option key={t.id} value={t.id}>{t.name} · {t.role}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Channel: Name */}
            {newForm.type === "general" && (
              <div>
                <label style={lbl}>Channel Name</label>
                <input value={newForm.title} onChange={(e) => setNewForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Production, Sales Team"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            )}

            <Btn onClick={createThread} style={{ marginTop: 4 }}>Start Conversation</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
});

const lbl = { display: "block", fontSize: 11, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 };

Messaging.displayName = "Messaging";
export default Messaging;
