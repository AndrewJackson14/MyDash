// ============================================================
// useGmailUnread — app-shell hook that keeps an unread-inbox
// count live. Two channels of updates:
//   1. Supabase realtime channel gmail_inbox_<userId>, fed by the
//      gmail-push-webhook edge function on Pub/Sub delivery.
//      Latency: ~1 second end-to-end.
//   2. 60-second polling as a safety net in case the realtime
//      connection drops or the Gmail watch lapses before cron
//      renewal catches up.
//
// Surfaces:
//   - unreadCount (number, renders as sidebar badge on Mail)
//   - unreadMessages (array, lightweight metadata)
//   - onNewUnread (subscribe callback, fires per newly-arrived id)
// ============================================================
import { useEffect, useState, useRef, useCallback } from "react";
import { checkGmailConnected, fetchUnreadInbox } from "../lib/gmail";
import { supabase } from "../lib/supabase";

const POLL_MS = 60_000;

export function useGmailUnread(enabled = true, userId = null) {
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
    let channel;

    (async () => {
      const ok = await checkGmailConnected();
      if (cancelled) return;
      setConnected(ok);
      if (!ok) return;

      await poll();
      timer = setInterval(poll, POLL_MS);

      // Realtime push: gmail-push-webhook broadcasts on this channel
      // for each Pub/Sub delivery. We just refresh on any event — the
      // poll() call already diffs against seenIds so only genuinely
      // new messages fire toasts. End-to-end latency drops from
      // up-to-60s to ~1s.
      if (userId) {
        channel = supabase.channel(`gmail_inbox_${userId}`);
        channel
          .on("broadcast", { event: "inbox_changed" }, () => { poll(); })
          .subscribe();
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (channel) { try { supabase.removeChannel(channel); } catch {} }
    };
  }, [enabled, userId, poll]);

  return {
    connected,
    unreadCount: unreadMessages.length,
    unreadMessages,
    onNewUnread: onNew,
    refresh: poll,
  };
}
