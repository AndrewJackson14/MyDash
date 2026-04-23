// ============================================================
// EntityThread — collapsible per-entity discussion panel.
//
// Drop-in for any detail view (StoryEditor, AdProjects, Sales,
// ClientProfile, LegalNotices). Pass a (refType, refId) and it
// lazily looks up or creates the matching row in message_threads
// and mounts ChatPanel against it. Self-resolves the signed-in
// user via supabase.auth if no currentUser is passed.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Z, COND, Ri, FS } from "../lib/theme";
import { Ic } from "./ui";
import ChatPanel from "./ChatPanel";
import { getOrCreateThread } from "../lib/threads";
import { supabase } from "../lib/supabase";

export default function EntityThread({
  refType,
  refId,
  title,
  participants,
  currentUser,
  height = 360,
  defaultOpen = false,
  label = "Discussion",
  team,
  // When true, the component renders ChatPanel directly without the
  // collapsible header — used when the host (e.g. a top-bar popover)
  // is providing its own toggle UI. Implies always-open.
  headerless = false,
  // Called whenever the internal message count updates, so an
  // external chrome (top-bar button, sidebar pill) can surface it.
  onMsgCount,
}) {
  // Email context for @mention alerts. Title doubles as the subject-line
  // context; URL falls back to the app root if the embedder didn't set
  // a deep-link. Derived inline so ChatPanel never has to know about
  // the refType/refId structure.
  const emailContext = {
    contextLabel: title || `${label}${refType ? ` · ${refType}` : ""}`,
    contextUrl: typeof window !== "undefined" ? window.location.href : "",
  };
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(defaultOpen);
  const [error, setError] = useState(null);
  const [resolvedUser, setResolvedUser] = useState(currentUser || null);
  const [msgCount, setMsgCount] = useState(null);

  // If the caller didn't hand us a currentUser, derive one from the
  // signed-in session + the team list (match on email). ChatPanel
  // tolerates null but attribution reads nicer with a real name.
  useEffect(() => {
    if (currentUser) { setResolvedUser(currentUser); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email;
      const teamRow = email && Array.isArray(team)
        ? team.find(t => (t.email || "").toLowerCase() === email.toLowerCase())
        : null;
      if (cancelled) return;
      setResolvedUser({
        id: teamRow?.id || data?.user?.id || null,
        name: teamRow?.name || data?.user?.user_metadata?.name || email || "Unknown",
        email: email || null,
      });
    })();
    return () => { cancelled = true; };
  }, [currentUser, team]);

  useEffect(() => {
    if (!refType || !refId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrCreateThread({ refType, refId, title, participants })
      .then(t => { if (!cancelled) setThread(t); })
      .catch(e => { if (!cancelled) setError(e?.message || String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refType, refId]);

  // Count messages once we have a thread so the collapsed header
  // shows something useful (e.g. "Discussion · 3").
  useEffect(() => {
    if (!thread?.id) return;
    let cancelled = false;
    supabase.from("messages").select("id", { count: "exact", head: true })
      .eq("thread_id", thread.id)
      .then(({ count }) => { if (!cancelled) setMsgCount(count ?? 0); });
    return () => { cancelled = true; };
  }, [thread?.id]);

  // Surface the count to any external chrome (top-bar pill, sidebar
  // button) so it can show "Discussion · N" without a second fetch.
  useEffect(() => {
    if (onMsgCount && msgCount != null) onMsgCount(msgCount);
  }, [msgCount, onMsgCount]);

  const headerLabel = useMemo(() => {
    if (msgCount == null) return label;
    return `${label} · ${msgCount}`;
  }, [label, msgCount]);

  if (headerless) {
    return (
      <div style={{ background: Z.bg, borderRadius: Ri, border: "1px solid " + Z.bd, overflow: "hidden" }}>
        {loading && <div style={{ padding: 20, textAlign: "center", color: Z.tm, fontSize: FS.sm, fontFamily: COND }}>Loading discussion…</div>}
        {error && <div style={{ padding: 12, color: Z.da, fontSize: FS.sm, fontFamily: COND }}>Thread failed: {error}</div>}
        {!loading && !error && thread && (
          <ChatPanel threadId={thread.id} currentUser={resolvedUser} team={team} height={height} emailContext={emailContext} onNewMessage={() => setMsgCount(c => (c == null ? 1 : c + 1))} />
        )}
      </div>
    );
  }

  return (
    <div style={{ background: Z.bg, borderRadius: Ri, border: "1px solid " + Z.bd, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", background: "none", border: "none",
          cursor: "pointer", color: Z.tx, fontFamily: COND, fontSize: 11,
          fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
        }}
      >
        <Ic.chat size={14} />
        <span style={{ flex: 1, textAlign: "left" }}>{headerLabel}</span>
        <span style={{ color: Z.tm, fontSize: 12 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid " + Z.bd }}>
          {loading && <div style={{ padding: 20, textAlign: "center", color: Z.tm, fontSize: FS.sm, fontFamily: COND }}>Loading discussion…</div>}
          {error && <div style={{ padding: 12, color: Z.da, fontSize: FS.sm, fontFamily: COND }}>Thread failed: {error}</div>}
          {!loading && !error && thread && (
            <ChatPanel threadId={thread.id} currentUser={resolvedUser} team={team} height={height} emailContext={emailContext} onNewMessage={() => setMsgCount(c => (c == null ? 1 : c + 1))} />
          )}
        </div>
      )}
    </div>
  );
}
