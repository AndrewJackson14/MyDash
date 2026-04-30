// ============================================================
// ChatPanel.jsx — Reusable messaging component
// Used in Ad Projects, Sales, Stories, and global Messaging page
// ============================================================
import { useState, useEffect, useRef, memo, useCallback } from "react";
import { Z, FS, FW, Ri, R, COND } from "../lib/theme";
import { Ic } from "./ui";
import { supabase } from "../lib/supabase";
import Lightbox from "./Lightbox";

import { fmtTimeRelative as fmtTime } from "../lib/formatters";
import { tokenizeMessage, activeMentionAtCaret, insertMention, parseMentions } from "../lib/mentions";

// Client-side image downscale to ~maxLong px on the long edge so we
// don't blow through CDN egress (and keep edge-function bodies sane).
// Returns a Blob (JPEG) + the new dimensions. Falls back to the
// original blob if anything goes wrong.
async function downscaleImage(file, maxLong = 2000, quality = 0.86) {
  try {
    const bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (longEdge <= maxLong) {
      return { blob: file, width: bitmap.width, height: bitmap.height };
    }
    const scale = maxLong / longEdge;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
    return { blob: blob || file, width: w, height: h };
  } catch {
    return { blob: file, width: null, height: null };
  }
}

function detectKind(file) {
  if (file.type?.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name || "")) return "pdf";
  return "file";
}

function fmtBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const ChatPanel = memo(({ threadId, currentUser, team, height = 400, placeholder = "Type a message...", onNewMessage, emailContext }) => {
  const [messages, setMessages] = useState([]);
  // attachments by message_id; loaded with messages, kept in sync with realtime.
  const [attachByMsg, setAttachByMsg] = useState({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const didLoad = useRef(false);
  // Pending uploads — already on BunnyCDN but not yet attached to a sent
  // message. They get linked when the user hits Send.
  const [pending, setPending] = useState([]); // { id, kind, cdn_url, bunny_path, filename, byte_size, width, height, status }
  const [uploading, setUploading] = useState(false);
  // Lightbox state — { images, index } when open.
  const [lightbox, setLightbox] = useState(null);
  // @-mention picker state — { query, start, end } when user is typing
  // an @token, null otherwise. Rendered as an absolute-positioned
  // dropdown above the composer.
  const [mention, setMention] = useState(null);
  const [mentionIdx, setMentionIdx] = useState(0);

  const mentionMatches = (team || [])
    .filter(t => t.isActive !== false && !t.isHidden && !t.is_hidden && t.id !== currentUser?.id)
    .filter(t => !mention?.query || (t.name || "").toLowerCase().includes(mention.query.toLowerCase()))
    .slice(0, 6);

  const applyMention = (member) => {
    if (!mention || !member) return;
    const { text, nextCaret } = insertMention(input, mention, member);
    setInput(text);
    setMention(null);
    setMentionIdx(0);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    }, 0);
  };

  // Load messages + their attachments.
  useEffect(() => {
    if (!threadId) return;
    didLoad.current = false;
    (async () => {
      const { data: msgs } = await supabase.from("messages").select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(200);
      const ordered = (msgs || []).reverse();
      setMessages(ordered);
      const ids = ordered.map(m => m.id);
      if (ids.length) {
        const { data: atts } = await supabase.from("message_attachments")
          .select("*").in("message_id", ids).order("created_at", { ascending: true });
        const byMsg = {};
        (atts || []).forEach(a => { (byMsg[a.message_id] ||= []).push(a); });
        setAttachByMsg(byMsg);
      } else {
        setAttachByMsg({});
      }
      didLoad.current = true;
    })();
  }, [threadId]);

  // Realtime subscription — messages + attachments for this thread.
  // UPDATE/DELETE on messages also flow through so an edit / pin / unpin
  // / delete from one tab updates every other open tab live.
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase.channel(`msgs-${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          setMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]);
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_attachments", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const a = payload.new;
          setAttachByMsg(prev => {
            const cur = prev[a.message_id] || [];
            if (cur.some(x => x.id === a.id)) return prev;
            return { ...prev, [a.message_id]: [...cur, a] };
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  // ── Per-message actions (edit / delete / pin) ───────────────
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const startEdit = (m) => { setEditingId(m.id); setEditDraft(m.body || ""); };
  const cancelEdit = () => { setEditingId(null); setEditDraft(""); };
  const saveEdit = async (m) => {
    const next = editDraft.trim();
    if (!next || next === (m.body || "")) { cancelEdit(); return; }
    const tagIds = Array.from(new Set(parseMentions(next).map(x => x.id))).filter(Boolean);
    const { data, error } = await supabase.from("messages")
      .update({ body: next, tagged_user_ids: tagIds, edited_at: new Date().toISOString() })
      .eq("id", m.id)
      .select()
      .single();
    if (error) { console.error("Edit failed:", error.message); return; }
    if (data) setMessages(prev => prev.map(x => x.id === m.id ? { ...x, ...data } : x));
    cancelEdit();
  };
  const deleteMessage = async (m) => {
    if (!window.confirm("Delete this message?")) return;
    const { error } = await supabase.from("messages").delete().eq("id", m.id);
    if (error) { console.error("Delete failed:", error.message); return; }
    setMessages(prev => prev.filter(x => x.id !== m.id));
    setAttachByMsg(prev => { const n = { ...prev }; delete n[m.id]; return n; });
  };
  const togglePin = async (m) => {
    const next = !m.is_pinned;
    const patch = next
      ? { is_pinned: true, pinned_at: new Date().toISOString(), pinned_by: currentUser?.id || null }
      : { is_pinned: false, pinned_at: null, pinned_by: null };
    const { data, error } = await supabase.from("messages").update(patch).eq("id", m.id).select().single();
    if (error) { console.error("Pin toggle failed:", error.message); return; }
    if (data) setMessages(prev => prev.map(x => x.id === m.id ? { ...x, ...data } : x));
  };

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && didLoad.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Upload one File/Blob through the discussion-attachment-upload edge fn.
  // Returns the inserted-pending entry (or null on failure).
  const uploadFile = useCallback(async (file, originalName) => {
    if (!threadId) return null;
    const kind = detectKind(file);
    const localId = "tmp-" + crypto.randomUUID();
    setPending(prev => [...prev, { id: localId, kind, filename: originalName || file.name || "file", byte_size: file.size || 0, status: "uploading" }]);
    setUploading(true);
    try {
      let blobToSend = file;
      let widthOut = null, heightOut = null;
      if (kind === "image") {
        const r = await downscaleImage(file, 2000, 0.86);
        blobToSend = r.blob;
        widthOut = r.width; heightOut = r.height;
      }
      const fd = new FormData();
      fd.append("thread_id", threadId);
      fd.append("kind", kind);
      // The browser File constructor preserves filename through FormData,
      // but a Blob from canvas does not — wrap as File.
      const upName = (originalName || file.name || (kind === "image" ? "image.jpg" : "file"));
      const upFile = blobToSend instanceof File ? blobToSend : new File([blobToSend], upName, { type: blobToSend.type || file.type || "application/octet-stream" });
      fd.append("file", upFile, upName);
      if (widthOut) fd.append("width", String(widthOut));
      if (heightOut) fd.append("height", String(heightOut));

      // supabase.functions.invoke can't carry FormData (it stringifies the
      // body), so we POST the multipart payload directly using the same
      // session token + apikey the SDK would attach.
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const apiKey = supabase.supabaseKey || "";
      const baseUrl = supabase.supabaseUrl || "";
      const url = `${baseUrl}/functions/v1/discussion-attachment-upload`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(apiKey ? { apikey: apiKey } : {}),
        },
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPending(prev => prev.map(p => p.id === localId ? { ...p, status: "error", error: json.error || `HTTP ${res.status}` } : p));
        return null;
      }
      setPending(prev => prev.map(p => p.id === localId ? {
        ...p,
        status: "ready",
        cdn_url: json.cdn_url,
        bunny_path: json.bunny_path,
        filename: json.filename,
        byte_size: json.byte_size,
        kind: json.kind,
        width: json.width,
        height: json.height,
      } : p));
      return localId;
    } catch (err) {
      setPending(prev => prev.map(p => p.id === localId ? { ...p, status: "error", error: String(err?.message || err) } : p));
      return null;
    } finally {
      setUploading(false);
    }
  }, [threadId]);

  // Paste handler — extract image blobs from clipboard.
  const onPaste = useCallback((e) => {
    const items = e.clipboardData?.items || [];
    const images = [];
    for (const it of items) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) images.push(f);
      }
    }
    if (images.length === 0) return;
    e.preventDefault();
    images.forEach((img, i) => {
      // If the pasted image is unnamed (clipboard image), give it a sensible name.
      const named = img.name && img.name !== "image.png"
        ? img
        : new File([img], `pasted-${Date.now()}-${i}.${(img.type.split("/")[1] || "png")}`, { type: img.type });
      uploadFile(named, named.name);
    });
  }, [uploadFile]);

  const onAttachClick = () => fileInputRef.current?.click();
  const onFilePicked = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => uploadFile(f, f.name));
    if (e.target) e.target.value = "";
  };
  const removePending = (id) => setPending(prev => prev.filter(p => p.id !== id));

  // Send message — also fires a notification row per @-tagged user
  // so they see the bell badge without having to open the thread.
  const send = async () => {
    const ready = pending.filter(p => p.status === "ready");
    const stillUploading = pending.some(p => p.status === "uploading");
    if (stillUploading) return;
    if (!input.trim() && ready.length === 0) return;
    if (sending || !threadId) return;
    setSending(true);
    const body = input.trim();
    setInput("");
    const tagIds = Array.from(new Set(parseMentions(body).map(m => m.id))).filter(Boolean);
    const { data: msg } = await supabase.from("messages").insert({
      thread_id: threadId, sender_id: currentUser?.id || null,
      sender_name: currentUser?.name || "Unknown", body,
      tagged_user_ids: tagIds,
    }).select().single();
    if (msg) {
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      onNewMessage?.(msg);

      // Bind any ready attachments to this message.
      if (ready.length) {
        const rows = ready.map(p => ({
          message_id: msg.id, thread_id: threadId, kind: p.kind,
          bunny_path: p.bunny_path, cdn_url: p.cdn_url, filename: p.filename,
          byte_size: p.byte_size, width: p.width || null, height: p.height || null,
        }));
        const { data: inserted } = await supabase.from("message_attachments").insert(rows).select();
        if (inserted) {
          setAttachByMsg(prev => ({ ...prev, [msg.id]: [...(prev[msg.id] || []), ...inserted] }));
        }
        setPending(prev => prev.filter(p => p.status !== "ready"));
      }

      // Mention notifications: in-app + email.
      const mentioned = tagIds.filter(id => id !== currentUser?.id);
      if (mentioned.length) {
        const preview = body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1").slice(0, 120);
        const rows = mentioned.map(uid => ({
          user_id: uid,
          title: `${currentUser?.name || "Someone"} mentioned you`,
          detail: preview,
          type: "mention",
          link: emailContext?.contextUrl || "",
        }));
        supabase.from("notifications").insert(rows).then(() => {}).catch(() => {});

        supabase.functions.invoke("notify-mention", {
          body: {
            mentionedUserIds: mentioned,
            senderName: currentUser?.name || "Someone",
            body,
            contextLabel: emailContext?.contextLabel || "a discussion",
            contextUrl: emailContext?.contextUrl || "",
          },
        }).then(() => {}).catch(() => {});
      }
    }
    setSending(false);
  };

  const handleKey = (e) => {
    if (mention && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx(i => (i + 1) % mentionMatches.length); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIdx(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyMention(mentionMatches[mentionIdx]); return; }
      if (e.key === "Escape") { e.preventDefault(); setMention(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Track input + caret so we can detect a pending @token.
  const onInputChange = (e) => {
    const next = e.target.value;
    setInput(next);
    const caret = e.target.selectionStart ?? next.length;
    const m = activeMentionAtCaret(next, caret);
    setMention(m);
    setMentionIdx(0);
  };

  // Build the thread-wide image gallery for lightbox cycling.
  const allImages = [];
  Object.values(attachByMsg).forEach(arr => {
    (arr || []).forEach(a => { if (a.kind === "image") allImages.push({ url: a.cdn_url, alt: a.filename }); });
  });
  const openLightbox = (cdn_url) => {
    const idx = allImages.findIndex(im => im.url === cdn_url);
    setLightbox({ images: allImages, index: idx >= 0 ? idx : 0 });
  };

  // Render a single message bubble with hover actions (edit/delete/pin).
  // pinnedView=true shrinks the bubble for the sticky pinned section.
  const renderMessage = (m, { pinnedView } = {}) => {
    const isMe = m.sender_id === currentUser?.id;
    const isSys = m.is_system;
    const atts = attachByMsg[m.id] || [];
    const isEditing = editingId === m.id;
    return (
      <div
        key={(pinnedView ? "pin-" : "") + m.id}
        style={{
          position: "relative",
          padding: "6px 10px", borderRadius: Ri, maxWidth: isSys ? "100%" : "85%",
          alignSelf: isSys ? "center" : isMe ? "flex-end" : "flex-start",
          background: isSys ? Z.sa : isMe ? Z.ac + "12" : Z.bg,
          border: isSys ? "none" : `1px solid ${m.is_pinned ? Z.wa : (isMe ? Z.ac + "25" : Z.bd)}`,
          opacity: pinnedView ? 0.95 : 1,
        }}
      >
        {/* Header row: author + pin badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          {!isSys && !isMe && <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.ac }}>{m.sender_name}</span>}
          {isSys && <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td }}>SYSTEM</span>}
          {m.is_pinned && <span title="Pinned" style={{ fontSize: 9, fontWeight: 800, color: Z.wa, background: Z.wa + "20", padding: "1px 5px", borderRadius: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>📌 Pinned</span>}
        </div>

        {/* Body — edit mode swaps in a textarea */}
        {isEditing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(m); }
              }}
              autoFocus
              style={{ width: "100%", minHeight: 60, padding: "6px 8px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", fontSize: FS.xs }}>
              <button onClick={cancelEdit} style={{ background: "none", border: "none", color: Z.tm, cursor: "pointer", padding: "2px 8px" }}>Cancel</button>
              <button onClick={() => saveEdit(m)} style={{ background: Z.ac, color: "#fff", border: "none", cursor: "pointer", padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>Save</button>
            </div>
          </div>
        ) : (m.body || "").length > 0 && (
          <div style={{ fontSize: FS.sm, color: isSys ? Z.tm : Z.tx, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
            {tokenizeMessage(m.body || "").map((seg, i) => seg.type === "mention"
              ? <span key={i} style={{ display: "inline-block", padding: "0 5px", margin: "0 1px", borderRadius: 3, background: "color-mix(in srgb, var(--action) 18%, transparent)", color: "var(--action)", fontWeight: FW.bold }}>@{seg.name}</span>
              : <span key={i}>{seg.value}</span>
            )}
          </div>
        )}

        {/* Attachments — hidden in pinned-view to keep the strip compact. */}
        {!pinnedView && atts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: (m.body || "").length ? 6 : 0 }}>
            {atts.map(a => a.kind === "image" ? (
              <img
                key={a.id}
                src={a.cdn_url}
                alt={a.filename}
                onClick={() => openLightbox(a.cdn_url)}
                style={{ maxWidth: 220, maxHeight: 200, borderRadius: 4, border: "1px solid " + Z.bd, cursor: "zoom-in", display: "block" }}
              />
            ) : (
              <a key={a.id} href={a.cdn_url} target="_blank" rel="noreferrer" style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: Ri,
                textDecoration: "none", color: Z.tx, fontSize: FS.sm, maxWidth: 240,
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 4,
                  background: a.kind === "pdf" ? "#dc2626" : Z.tm, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 800, flexShrink: 0,
                }}>{a.kind === "pdf" ? "PDF" : "FILE"}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div title={a.filename} style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.filename}</div>
                  <div style={{ fontSize: FS.micro, color: Z.tm }}>{fmtBytes(a.byte_size)}</div>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Footer: timestamp + edited tag */}
        <div style={{ fontSize: FS.micro, color: Z.td, marginTop: 2, textAlign: isMe ? "right" : "left" }}>
          {fmtTime(m.created_at)}{m.edited_at && <span style={{ marginLeft: 4, fontStyle: "italic" }}>· edited</span>}
        </div>

        {/* Hover actions — pin always available; edit/delete only on
            own non-system messages and not while another bubble is in
            edit mode. */}
        {!isSys && !isEditing && !pinnedView && (
          <div style={{ position: "absolute", top: -10, right: 6, display: "flex", gap: 2, background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: 12, padding: "1px 4px", opacity: 0, transition: "opacity 0.1s" }} className="msg-actions">
            <button onClick={() => togglePin(m)} title={m.is_pinned ? "Unpin" : "Pin to top"} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontSize: FS.sm, color: m.is_pinned ? Z.wa : Z.tm }}>📌</button>
            {isMe && <button onClick={() => startEdit(m)} title="Edit" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontSize: FS.xs, color: Z.tm }}>✎</button>}
            {isMe && <button onClick={() => deleteMessage(m)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontSize: FS.xs, color: Z.da }}>🗑</button>}
          </div>
        )}
      </div>
    );
  };

  // Pinned section state — sorted by pinned_at desc (newest pin top).
  const pinnedMessages = messages
    .filter(m => m.is_pinned)
    .sort((a, b) => (b.pinned_at || "").localeCompare(a.pinned_at || ""));

  if (!threadId) return <div style={{ padding: 20, color: Z.td, fontSize: FS.sm, textAlign: "center" }}>No conversation</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height, borderRadius: Ri, overflow: "hidden" }}>
      {/* Hover affordance — hover any bubble shows its action chip. */}
      <style>{`.msg-bubble-wrap:hover .msg-actions { opacity: 1 !important; }`}</style>

      {/* Pinned strip — sticky-top above the scroll container. */}
      {pinnedMessages.length > 0 && (
        <div style={{ borderBottom: `1px solid ${Z.bd}`, background: Z.wa + "08", padding: "6px 10px", flexShrink: 0, maxHeight: 220, overflowY: "auto" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: Z.wa, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: COND, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            📌 Pinned
            <span style={{ color: Z.tm, fontWeight: 600 }}>{pinnedMessages.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {pinnedMessages.map(m => (
              <div key={"pin-" + m.id} className="msg-bubble-wrap" style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: FS.sm }}>
                <span style={{ fontWeight: 700, color: Z.ac, flexShrink: 0 }}>{m.sender_name}:</span>
                <span title={m.body || ""} style={{ flex: 1, color: Z.tx, whiteSpace: "pre-wrap", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {tokenizeMessage(m.body || "").map((seg, i) => seg.type === "mention"
                    ? <span key={i} style={{ color: "var(--action)", fontWeight: 700 }}>@{seg.name}</span>
                    : <span key={i}>{seg.value}</span>
                  )}
                </span>
                <button onClick={() => togglePin(m)} title="Unpin" style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: FS.xs, padding: 0, flexShrink: 0 }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {messages.length === 0 && <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No messages yet</div>}
        {messages.map(m => (
          <div key={m.id} className="msg-bubble-wrap" style={{ display: "flex", flexDirection: "column", alignItems: m.is_system ? "center" : (m.sender_id === currentUser?.id ? "flex-end" : "flex-start") }}>
            {renderMessage(m)}
          </div>
        ))}
      </div>

      {/* Pending uploads above the composer */}
      {pending.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 10px 0" }}>
          {pending.map(p => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 8px", borderRadius: 12, fontSize: FS.xs,
              background: p.status === "error" ? "rgba(220,38,38,0.1)" : Z.sa,
              border: `1px solid ${p.status === "error" ? "#dc2626" : Z.bd}`,
              color: p.status === "error" ? "#dc2626" : Z.tx,
            }}>
              <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 9, color: Z.tm }}>{p.kind}</span>
              <span title={p.filename} style={{ maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.filename}</span>
              {p.status === "uploading" && <span style={{ color: Z.tm }}>uploading…</span>}
              {p.status === "error" && <span title={p.error}>failed</span>}
              <button onClick={() => removePending(p.id)} style={{ background: "none", border: "none", color: Z.tm, cursor: "pointer", padding: 0, fontSize: FS.md, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ position: "relative", display: "flex", gap: 6, padding: "8px 10px", borderTop: `1px solid ${Z.bd}`, background: Z.sf, alignItems: "center" }}>
        {/* Mention picker — shown when the user is typing an @token. */}
        {mention && mentionMatches.length > 0 && (
          <div style={{ position: "absolute", left: 10, right: 50, bottom: "100%", marginBottom: 4, background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", overflow: "hidden", zIndex: 40 }}>
            {mentionMatches.map((m, i) => {
              const active = i === mentionIdx;
              return (
                <div
                  key={m.id}
                  onMouseDown={(e) => { e.preventDefault(); applyMention(m); }}
                  onMouseEnter={() => setMentionIdx(i)}
                  style={{ padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: active ? Z.ac + "18" : "transparent" }}
                >
                  <span style={{ fontSize: FS.xs, fontWeight: FW.black, color: Z.tx }}>{m.name}</span>
                  {m.role && <span style={{ fontSize: FS.micro, color: Z.tm }}>{m.role}</span>}
                </div>
              );
            })}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.xlsx,.doc,.docx,.xls,.ppt,.pptx,.zip"
          multiple
          onChange={onFilePicked}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={onAttachClick}
          title="Attach files"
          style={{ width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer", background: "transparent", color: Z.tm, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Ic.attach size={16} />
        </button>
        <input
          ref={inputRef}
          value={input} onChange={onInputChange}
          onPaste={onPaste}
          onKeyUp={(e) => { const m = activeMentionAtCaret(e.target.value, e.target.selectionStart ?? 0); setMention(m); }}
          onKeyDown={handleKey}
          placeholder={placeholder}
          style={{ flex: 1, padding: "8px 12px", borderRadius: 20, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, outline: "none", fontFamily: "inherit" }}
        />
        <button onClick={send} disabled={(!input.trim() && pending.filter(p => p.status === "ready").length === 0) || sending || pending.some(p => p.status === "uploading")} style={{
          width: 34, height: 34, borderRadius: "50%", border: "none",
          cursor: (input.trim() || pending.some(p => p.status === "ready")) ? "pointer" : "default",
          background: (input.trim() || pending.some(p => p.status === "ready")) ? Z.ac : Z.sa, display: "flex", alignItems: "center", justifyContent: "center",
          opacity: (input.trim() || pending.some(p => p.status === "ready")) ? 1 : 0.4, transition: "background 0.15s",
        }}>
          <Ic.send size={14} color={(input.trim() || pending.some(p => p.status === "ready")) ? "#fff" : Z.td} />
        </button>
      </div>

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndex={(i) => setLightbox(lb => lb ? { ...lb, index: i } : null)}
        />
      )}
    </div>
  );
});

ChatPanel.displayName = "ChatPanel";
export default ChatPanel;
