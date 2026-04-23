// ============================================================
// useGmailUnread — app-shell hook that polls Gmail every 60s for
// unread inbox messages. Surfaces:
//   - unreadCount (number, renders as sidebar badge on Mail)
//   - unreadMessages (array, lightweight metadata)
//   - onNew (subscribe callback, fires once per newly-arrived id)
//
// Gmail doesn't push to Supabase, so this is polling — cheap and
// bounded (1 list call + <=10 metadata fetches per tick). The
// `seenIds` ref diffs poll-to-poll so the toast only fires for
// NEW unread messages, not every message that's still unread.
// ============================================================
import { useEffect, useState, useRef, useCallback } from "react";
import { checkGmailConnected, fetchUnreadInbox } from "../lib/gmail";

const POLL_MS = 60_000;

export function useGmailUnread(enabled = true) {
  const [connected, setConnected] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState([]);
  const seenIds = useRef(null); // null until first fetch so we don't pop all existing on load
  const listenersRef = useRef(new Set());

  // Caller-facing subscribe: onNew(messages => void). We ref the
  // listeners so they live across re-renders without re-polling.
  const onNew = useCallback((fn) => {
    listenersRef.current.add(fn);
    return () => { listenersRef.current.delete(fn); };
  }, []);

  // Single poll tick. Tolerant of transient 401/403; status flips
  // back to disconnected if auth fails twice in a row (not worth
  // tracking precisely — the next mount will re-check).
  const poll = useCallback(async () => {
    try {
      const msgs = await fetchUnreadInbox(10);
      const ids = msgs.map(m => m.id).filter(Boolean);
      setUnreadMessages(msgs);

      if (seenIds.current === null) {
        // First successful poll — just seed the set so we don't
        // flood the user with toasts for every already-unread mail.
        seenIds.current = new Set(ids);
        return;
      }

      const newOnes = msgs.filter(m => !seenIds.current.has(m.id));
      if (newOnes.length > 0) {
        for (const fn of listenersRef.current) {
          try { fn(newOnes); } catch (e) { console.error("gmail-unread listener:", e); }
        }
      }
      seenIds.current = new Set(ids);
    } catch (err) {
      // Non-fatal — background task, don't flood the console.
      if (!String(err?.message || "").includes("Not authenticated")) {
        console.warn("useGmailUnread poll:", err?.message || err);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer;

    (async () => {
      const ok = await checkGmailConnected();
      if (cancelled) return;
      setConnected(ok);
      if (!ok) return;
      await poll();
      timer = setInterval(poll, POLL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [enabled, poll]);

  return {
    connected,
    unreadCount: unreadMessages.length,
    unreadMessages,
    onNewUnread: onNew,
    refresh: poll,
  };
}
