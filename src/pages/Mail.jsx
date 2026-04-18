// ============================================================
// Mail.jsx — Gmail client for MyDash
// 2-column layout: message list + reading pane
// Labels as filter bar, compose as modal overlay
// ============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import DOMPurify from "dompurify";
import Image from "@tiptap/extension-image";
import { Z, COND, DISPLAY, FS, FW, R, Ri } from "../lib/theme";
import { Ic, Btn, Inp, Modal, PageHeader, GlassCard, SB, Pill } from "../components/ui";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { supabase, EDGE_FN_URL } from "../lib/supabase";

// ── Config ───────────────────────────────────────────────────
const PROXY = EDGE_FN_URL + "/gmail-api";
const AUTH_URL = EDGE_FN_URL + "/gmail-auth";

// ── API helpers ──────────────────────────────────────────────
async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

async function gmailCall(action, headers = {}, body = null) {
  const auth = await getAuthHeader();
  if (!auth) throw new Error("Not authenticated");
  const opts = {
    method: body ? "POST" : "GET",
    headers: { Authorization: auth, "x-action": action, ...headers },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(PROXY, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gmail API error");
  return data;
}

// ── Gmail message helpers ────────────────────────────────────
function decodeBase64Url(str) {
  if (!str) return "";
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  try { return atob(padded); } catch { return ""; }
}

function getHeader(msg, name) {
  const h = msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function getBody(msg) {
  const payload = msg.payload;
  if (!payload) return "";

  // Simple body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — find text/html first, then text/plain
  const parts = payload.parts || [];
  const findPart = (parts, mime) => {
    for (const p of parts) {
      if (p.mimeType === mime && p.body?.data) return decodeBase64Url(p.body.data);
      if (p.parts) { const r = findPart(p.parts, mime); if (r) return r; }
    }
    return null;
  };
  return findPart(parts, "text/html") || findPart(parts, "text/plain") || "";
}

function getAttachments(msg) {
  const attachments = [];
  const walk = (parts) => {
    for (const p of (parts || [])) {
      if (p.filename && p.body?.attachmentId) {
        attachments.push({ id: p.body.attachmentId, filename: p.filename, mimeType: p.mimeType, size: p.body.size || 0 });
      }
      if (p.parts) walk(p.parts);
    }
  };
  walk(msg.payload?.parts);
  return attachments;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const isThisYear = d.getFullYear() === now.getFullYear();
  if (isThisYear) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatFullDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function shortenName(str) {
  if (!str) return "";
  const match = str.match(/^"?([^"<]+)/);
  return (match ? match[1] : str).trim();
}

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

// Build RFC 2822 message and base64url encode it
function buildRawMessage({ to, cc, bcc, subject, html, inReplyTo, references, attachments }) {
  const boundary = "boundary_" + Date.now().toString(36);
  const hasAttachments = attachments && attachments.length > 0;

  let msg = "";
  msg += `To: ${to}\r\n`;
  if (cc) msg += `Cc: ${cc}\r\n`;
  if (bcc) msg += `Bcc: ${bcc}\r\n`;
  msg += `Subject: ${subject}\r\n`;
  msg += `MIME-Version: 1.0\r\n`;
  if (inReplyTo) { msg += `In-Reply-To: ${inReplyTo}\r\n`; msg += `References: ${references || inReplyTo}\r\n`; }

  if (hasAttachments) {
    msg += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    msg += `--${boundary}\r\n`;
    msg += `Content-Type: text/html; charset=UTF-8\r\n\r\n`;
    msg += html + "\r\n\r\n";
    for (const att of attachments) {
      msg += `--${boundary}\r\n`;
      msg += `Content-Type: ${att.type}; name="${att.name}"\r\n`;
      msg += `Content-Disposition: attachment; filename="${att.name}"\r\n`;
      msg += `Content-Transfer-Encoding: base64\r\n\r\n`;
      msg += att.data + "\r\n\r\n";
    }
    msg += `--${boundary}--`;
  } else {
    msg += `Content-Type: text/html; charset=UTF-8\r\n\r\n`;
    msg += html;
  }

  // base64url encode
  const encoded = btoa(unescape(encodeURIComponent(msg)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return encoded;
}

// ── System labels ────────────────────────────────────────────
const SYSTEM_LABELS = [
  { id: "INBOX", name: "Inbox", icon: "mail" },
  { id: "STARRED", name: "Starred", icon: "star" },
  { id: "SENT", name: "Sent", icon: "send" },
  { id: "DRAFT", name: "Drafts", icon: "edit" },
  { id: "TRASH", name: "Trash", icon: "close" },
];

// ══════════════════════════════════════════════════════════════
// COMPOSE MODAL
// ══════════════════════════════════════════════════════════════
const ComposeModal = ({ open, onClose, onSent, replyTo, replyAll, forward, signature }) => {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [draftId, setDraftId] = useState(null);
  const draftTimer = useRef(null);
  const fileRef = useRef(null);

  // Pre-fill for reply/forward
  useEffect(() => {
    if (!open) return;
    if (replyTo) {
      const from = getHeader(replyTo, "From");
      const origSubject = getHeader(replyTo, "Subject");
      setTo(replyAll ? [from, ...getHeader(replyTo, "To").split(",")].filter(Boolean).join(", ") : from);
      if (replyAll) { setCc(getHeader(replyTo, "Cc")); setShowCcBcc(!!getHeader(replyTo, "Cc")); }
      setSubject(origSubject.startsWith("Re:") ? origSubject : `Re: ${origSubject}`);
    } else if (forward) {
      const origSubject = getHeader(forward, "Subject");
      setSubject(origSubject.startsWith("Fwd:") ? origSubject : `Fwd: ${origSubject}`);
      setTo("");
    } else {
      setTo(""); setCc(""); setBcc(""); setSubject(""); setShowCcBcc(false);
    }
    setAttachments([]);
    setDraftId(null);
    setError("");
  }, [open, replyTo, replyAll, forward]);

  // Compose editor
  const initialContent = useMemo(() => {
    let content = "<p></p>";
    if (signature) content += `<br><div style="color:#666;font-size:12px">--<br>${signature}</div>`;
    if (replyTo) {
      const date = formatFullDate(getHeader(replyTo, "Date"));
      const from = getHeader(replyTo, "From");
      const body = getBody(replyTo);
      content += `<br><div style="border-left:2px solid #ccc;padding-left:12px;color:#666;margin-top:12px"><p>On ${date}, ${shortenName(from)} wrote:</p>${body}</div>`;
    } else if (forward) {
      const body = getBody(forward);
      content += `<br><div style="margin-top:12px"><p>---------- Forwarded message ----------</p><p>From: ${getHeader(forward, "From")}<br>Date: ${formatFullDate(getHeader(forward, "Date"))}<br>Subject: ${getHeader(forward, "Subject")}</p>${body}</div>`;
    }
    return content;
  }, [open, replyTo, forward, signature]);

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false }), Underline, Image],
    content: initialContent,
    editorProps: { attributes: { style: "outline:none;min-height:200px;font-family:'Source Sans 3',sans-serif;font-size:14px;color:" + Z.tx + ";line-height:1.6" } },
  }, [initialContent]);

  // Auto-save draft every 30 seconds
  useEffect(() => {
    if (!open || !editor) return;
    draftTimer.current = setInterval(async () => {
      if (!to && !subject && !editor.getText()) return;
      try {
        const raw = buildRawMessage({ to, cc, bcc, subject, html: editor.getHTML() });
        const body = { message: { raw } };
        if (draftId) {
          body.id = draftId;
          await gmailCall("update-draft", { "x-draft-id": draftId }, body);
        } else {
          const res = await gmailCall("create-draft", {}, body);
          if (res.id) setDraftId(res.id);
        }
      } catch { /* silent draft save failure */ }
    }, 30000);
    return () => clearInterval(draftTimer.current);
  }, [open, editor, to, cc, bcc, subject, draftId]);

  const handleAttach = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(",")[1];
        setAttachments(prev => [...prev, { name: file.name, type: file.type, size: file.size, data: base64 }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleSend = async () => {
    if (!to.trim()) { setError("Please enter a recipient"); return; }
    setSending(true);
    setError("");
    try {
      const raw = buildRawMessage({
        to, cc, bcc, subject,
        html: editor.getHTML(),
        inReplyTo: replyTo ? getHeader(replyTo, "Message-ID") : undefined,
        references: replyTo ? getHeader(replyTo, "References") || getHeader(replyTo, "Message-ID") : undefined,
        attachments,
      });
      await gmailCall("send", {}, { raw, threadId: replyTo?.threadId || undefined });
      // Delete draft if we had one
      if (draftId) { try { await gmailCall("delete-draft", { "x-draft-id": draftId }); } catch { /* ok */ } }
      onSent?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return <Modal open={open} onClose={onClose} title={replyTo ? "Reply" : forward ? "Forward" : "New Message"} width={640}>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Inp label="To" value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@email.com" />
      {!showCcBcc && <button onClick={() => setShowCcBcc(true)} style={{ alignSelf: "flex-start", background: "none", border: "none", color: Z.ac, fontSize: FS.xs, fontFamily: COND, fontWeight: FW.bold, cursor: "pointer", padding: 0 }}>Cc / Bcc</button>}
      {showCcBcc && <>
        <Inp label="Cc" value={cc} onChange={e => setCc(e.target.value)} />
        <Inp label="Bcc" value={bcc} onChange={e => setBcc(e.target.value)} />
      </>}
      <Inp label="Subject" value={subject} onChange={e => setSubject(e.target.value)} />

      <div style={{ border: `1px solid ${Z.bd}`, borderRadius: Ri, background: Z.sf, minHeight: 250, maxHeight: 400, overflowY: "auto", padding: "12px 16px" }}>
        {editor && <EditorContent editor={editor} />}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {attachments.map((a, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: Ri, fontSize: FS.xs, fontFamily: COND, background: Z.sa, color: Z.tx, border: `1px solid ${Z.bd}` }}>
              {a.name} <span style={{ color: Z.tm }}>{fmtSize(a.size)}</span>
              <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: Z.da, cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>&times;</button>
            </span>
          ))}
        </div>
      )}

      {error && <div style={{ padding: "6px 10px", borderRadius: Ri, background: Z.da + "18", color: Z.da, fontSize: FS.sm, fontWeight: FW.bold }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 4 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={handleAttach} />
          <Btn sm v="ghost" onClick={() => fileRef.current?.click()}>Attach</Btn>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn sm v="secondary" onClick={onClose}>Discard</Btn>
          <Btn sm onClick={handleSend} disabled={sending}>
            {sending ? "Sending..." : <><Ic.send size={11} /> Send</>}
          </Btn>
        </div>
      </div>
    </div>
  </Modal>;
};

// ══════════════════════════════════════════════════════════════
// MAIL PAGE
// ══════════════════════════════════════════════════════════════
const Mail = ({ isActive } = {}) => {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Mail" }], title: "Mail" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  // Connection state
  const [connected, setConnected] = useState(null); // null=loading, true/false
  const [googleEmail, setGoogleEmail] = useState("");

  // Mail state
  const [labels, setLabels] = useState([]);
  const [activeLabel, setActiveLabel] = useState("INBOX");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageToken, setPageToken] = useState(null);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [selectedFull, setSelectedFull] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [search, setSearch] = useState("");
  const [searchActive, setSearchActive] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  // Compose state
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [replyAll, setReplyAll] = useState(false);
  const [forwardMsg, setForwardMsg] = useState(null);

  // ── Check connection ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const auth = await getAuthHeader();
        if (!auth) { setConnected(false); return; }
        const res = await fetch(AUTH_URL + "?action=status", { headers: { Authorization: auth } });
        const data = await res.json();
        setConnected(data.connected);
        setGoogleEmail(data.email || "");
      } catch { setConnected(false); }
    })();
  }, []);

  // ── Listen for OAuth popup callback ──────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "google-auth-success") {
        setConnected(true);
        setGoogleEmail(e.data.email || "");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ── Connect Google Account ───────────────────────────────
  const handleConnect = async () => {
    const auth = await getAuthHeader();
    const res = await fetch(AUTH_URL + "?action=start", { headers: { Authorization: auth } });
    const { url } = await res.json();
    window.open(url, "google-auth", "width=500,height=700,left=200,top=100");
  };

  // ── Disconnect ───────────────────────────────────────────
  const handleDisconnect = async () => {
    const auth = await getAuthHeader();
    await fetch(AUTH_URL + "?action=disconnect", { method: "POST", headers: { Authorization: auth, "x-action": "disconnect" } });
    setConnected(false);
    setGoogleEmail("");
    setMessages([]);
    setSelectedMsg(null);
    setSelectedFull(null);
  };

  // ── Load labels ──────────────────────────────────────────
  useEffect(() => {
    if (!connected) return;
    gmailCall("labels").then(data => {
      if (data.labels) setLabels(data.labels);
    }).catch(() => {});
    // Load unread count
    gmailCall("profile").then(data => {
      if (data.messagesTotal !== undefined) setUnreadCount(data.messagesTotal);
    }).catch(() => {});
  }, [connected]);

  // ── Load messages ────────────────────────────────────────
  const loadMessages = useCallback(async (label, query, token) => {
    setLoading(true);
    try {
      const headers = { "x-max-results": "25" };
      if (label && label !== "ALL") headers["x-label-ids"] = label;
      if (query) headers["x-query"] = query;
      if (token) headers["x-page-token"] = token;

      const listData = await gmailCall("list", headers);
      const msgIds = listData.messages || [];
      setPageToken(listData.nextPageToken || null);

      if (msgIds.length === 0) {
        if (!token) setMessages([]);
        setLoading(false);
        return;
      }

      // Fetch metadata for each message
      const msgPromises = msgIds.map(m =>
        gmailCall("get", { "x-message-id": m.id, "x-format": "metadata" })
      );
      const msgs = await Promise.all(msgPromises);

      if (token) {
        setMessages(prev => [...prev, ...msgs]);
      } else {
        setMessages(msgs);
      }
    } catch (err) {
      console.error("loadMessages error:", err);
      if (!token) setMessages([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!connected) return;
    loadMessages(activeLabel, searchActive, null);
  }, [connected, activeLabel, searchActive, loadMessages]);

  // ── Select message ───────────────────────────────────────
  const selectMessage = async (msg) => {
    setSelectedMsg(msg);
    setLoadingMsg(true);
    try {
      const full = await gmailCall("get", { "x-message-id": msg.id, "x-format": "full" });
      setSelectedFull(full);
      // Mark as read if unread
      if (msg.labelIds?.includes("UNREAD")) {
        await gmailCall("modify", { "x-message-id": msg.id }, { removeLabelIds: ["UNREAD"] });
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, labelIds: (m.labelIds || []).filter(l => l !== "UNREAD") } : m));
      }
    } catch (err) {
      console.error("selectMessage error:", err);
    }
    setLoadingMsg(false);
  };

  // ── Message actions ──────────────────────────────────────
  const toggleStar = async (msg, e) => {
    e?.stopPropagation();
    const starred = msg.labelIds?.includes("STARRED");
    const body = starred ? { removeLabelIds: ["STARRED"] } : { addLabelIds: ["STARRED"] };
    await gmailCall("modify", { "x-message-id": msg.id }, body);
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, labelIds: starred ? m.labelIds.filter(l => l !== "STARRED") : [...(m.labelIds || []), "STARRED"] } : m));
  };

  const archiveMessage = async (msg) => {
    await gmailCall("modify", { "x-message-id": msg.id }, { removeLabelIds: ["INBOX"] });
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    if (selectedMsg?.id === msg.id) { setSelectedMsg(null); setSelectedFull(null); }
  };

  const trashMessage = async (msg) => {
    await gmailCall("trash", { "x-message-id": msg.id });
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    if (selectedMsg?.id === msg.id) { setSelectedMsg(null); setSelectedFull(null); }
  };

  const toggleRead = async (msg) => {
    const unread = msg.labelIds?.includes("UNREAD");
    const body = unread ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] };
    await gmailCall("modify", { "x-message-id": msg.id }, body);
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, labelIds: unread ? m.labelIds.filter(l => l !== "UNREAD") : [...(m.labelIds || []), "UNREAD"] } : m));
  };

  // ── Download attachment ──────────────────────────────────
  const downloadAttachment = async (msgId, att) => {
    const data = await gmailCall("attachment", { "x-message-id": msgId, "x-attachment-id": att.id });
    const bytes = Uint8Array.from(atob(data.data.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: att.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = att.filename; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Search ───────────────────────────────────────────────
  const handleSearch = () => { setSearchActive(search); };

  // ── Custom labels ────────────────────────────────────────
  const customLabels = useMemo(() => {
    return labels.filter(l => l.type === "user").sort((a, b) => a.name.localeCompare(b.name));
  }, [labels]);

  // ── Not connected state ──────────────────────────────────
  if (connected === null) return <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Loading...</div>;

  if (!connected) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Title moved to TopBar via usePageHeader; no inline header. */}
      <GlassCard>
        <div style={{ textAlign: "center", padding: 40 }}>
          <Ic.mail size={48} color={Z.tm} />
          <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx, marginTop: 16, fontFamily: DISPLAY }}>Connect Your Gmail</div>
          <div style={{ fontSize: FS.base, color: Z.tm, marginTop: 8, marginBottom: 24, maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
            Sign in with your Google account to read, compose, and manage email directly from MyDash.
          </div>
          <Btn onClick={handleConnect}>Connect Google Account</Btn>
        </div>
      </GlassCard>
    </div>;
  }

  // ── Connected — show mail ────────────────────────────────
  return <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "calc(100vh - 80px)" }}>
    {/* Action row — title moved to TopBar via usePageHeader. */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
      <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{googleEmail}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <form onSubmit={e => { e.preventDefault(); handleSearch(); }} style={{ display: "flex", gap: 4 }}>
          <SB value={search} onChange={setSearch} placeholder="Search mail..." />
        </form>
        <Btn sm onClick={() => { setReplyTo(null); setForwardMsg(null); setReplyAll(false); setComposeOpen(true); }}>
          <Ic.edit size={12} /> Compose
        </Btn>
      </div>
    </div>

    {/* Label bar */}
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flexShrink: 0 }}>
      {SYSTEM_LABELS.map(l => {
        const iconMap = { INBOX: Ic.mail, SENT: Ic.send, STARRED: Ic.star, DRAFT: Ic.edit, TRASH: Ic.trash, SPAM: Ic.close };
        return (
          <Pill key={l.id} label={l.name} icon={iconMap[l.id] || Ic.tag} active={activeLabel === l.id}
            onClick={() => { setActiveLabel(l.id); setSearchActive(""); setSearch(""); setSelectedMsg(null); setSelectedFull(null); }} />
        );
      })}
      {customLabels.map(l => (
        <Pill key={l.id} label={l.name} icon={Ic.tag} active={activeLabel === l.id}
          onClick={() => { setActiveLabel(l.id); setSearchActive(""); setSearch(""); setSelectedMsg(null); setSelectedFull(null); }} />
      ))}
      {searchActive && (
        <span style={{ padding: "5px 12px", borderRadius: Ri, fontSize: FS.sm, fontWeight: FW.bold, background: Z.wa + "22", color: Z.wa, fontFamily: COND, display: "flex", alignItems: "center", gap: 4 }}>
          Search: "{searchActive}"
          <button onClick={() => { setSearchActive(""); setSearch(""); }} style={{ background: "none", border: "none", color: Z.wa, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>&times;</button>
        </span>
      )}
    </div>

    {/* 2-column layout */}
    <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0, border: `1px solid ${Z.bd}`, borderRadius: R, overflow: "hidden" }}>
      {/* Message list */}
      <div style={{ width: selectedFull ? 360 : "100%", flexShrink: 0, overflowY: "auto", borderRight: selectedFull ? `1px solid ${Z.bd}` : "none", background: Z.sf }}>
        {loading && messages.length === 0 && <div style={{ padding: 24, textAlign: "center", color: Z.tm, fontFamily: COND }}>Loading...</div>}
        {!loading && messages.length === 0 && <div style={{ padding: 24, textAlign: "center", color: Z.tm, fontFamily: COND }}>No messages</div>}
        {messages.map(msg => {
          const from = shortenName(getHeader(msg, "From"));
          const subject = getHeader(msg, "Subject") || "(no subject)";
          const snippet = msg.snippet || "";
          const date = formatDate(getHeader(msg, "Date"));
          const unread = msg.labelIds?.includes("UNREAD");
          const starred = msg.labelIds?.includes("STARRED");
          const isSelected = selectedMsg?.id === msg.id;

          return <div key={msg.id} onClick={() => selectMessage(msg)}
            style={{
              padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${Z.bd}20`,
              background: isSelected ? Z.ac + "12" : unread ? (Z.bg === "#08090D" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)") : "transparent",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = Z.sa; }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = unread ? (Z.bg === "#08090D" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)") : "transparent"; }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={e => toggleStar(msg, e)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 14, color: starred ? "#f59e0b" : Z.bd, lineHeight: 1 }}>
                  {starred ? "\u2605" : "\u2606"}
                </button>
                <span style={{ fontSize: FS.sm, fontWeight: unread ? FW.heavy : FW.medium, color: Z.tx, fontFamily: COND }}>{from}</span>
              </div>
              <span style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND, flexShrink: 0 }}>{date}</span>
            </div>
            <div style={{ fontSize: FS.sm, fontWeight: unread ? FW.bold : FW.normal, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subject}</div>
            <div style={{ fontSize: FS.xs, color: Z.tm, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>{snippet}</div>
          </div>;
        })}
        {pageToken && (
          <div style={{ padding: 12, textAlign: "center" }}>
            <Btn sm v="ghost" onClick={() => loadMessages(activeLabel, searchActive, pageToken)} disabled={loading}>
              {loading ? "Loading..." : "Load More"}
            </Btn>
          </div>
        )}
      </div>

      {/* Reading pane */}
      {selectedFull && (
        <div style={{ flex: 1, overflowY: "auto", background: Z.bg, display: "flex", flexDirection: "column" }}>
          {loadingMsg ? (
            <div style={{ padding: 24, textAlign: "center", color: Z.tm }}>Loading...</div>
          ) : (
            <>
              {/* Message header */}
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${Z.bd}`, flexShrink: 0 }}>
                <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx, marginBottom: 8 }}>{getHeader(selectedFull, "Subject") || "(no subject)"}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{getHeader(selectedFull, "From")}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
                      To: {getHeader(selectedFull, "To")}
                      {getHeader(selectedFull, "Cc") && <span> | Cc: {getHeader(selectedFull, "Cc")}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, flexShrink: 0 }}>{formatFullDate(getHeader(selectedFull, "Date"))}</div>
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
                  <Btn sm v="ghost" onClick={() => { setReplyTo(selectedFull); setReplyAll(false); setForwardMsg(null); setComposeOpen(true); }}>Reply</Btn>
                  <Btn sm v="ghost" onClick={() => { setReplyTo(selectedFull); setReplyAll(true); setForwardMsg(null); setComposeOpen(true); }}>Reply All</Btn>
                  <Btn sm v="ghost" onClick={() => { setForwardMsg(selectedFull); setReplyTo(null); setReplyAll(false); setComposeOpen(true); }}>Forward</Btn>
                  <Btn sm v="ghost" onClick={() => archiveMessage(selectedFull)}>Archive</Btn>
                  <Btn sm v="ghost" onClick={() => trashMessage(selectedFull)}>Delete</Btn>
                  <Btn sm v="ghost" onClick={() => toggleRead(selectedFull)}>
                    {selectedFull.labelIds?.includes("UNREAD") ? "Mark Read" : "Mark Unread"}
                  </Btn>
                </div>
              </div>

              {/* Attachments */}
              {(() => {
                const atts = getAttachments(selectedFull);
                if (atts.length === 0) return null;
                return <div style={{ padding: "8px 20px", borderBottom: `1px solid ${Z.bd}`, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {atts.map((att, i) => (
                    <button key={i} onClick={() => downloadAttachment(selectedFull.id, att)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: Ri, fontSize: FS.xs, fontFamily: COND, fontWeight: FW.semi, background: Z.sa, color: Z.ac, border: `1px solid ${Z.bd}`, cursor: "pointer" }}>
                      {att.filename} <span style={{ color: Z.tm }}>{fmtSize(att.size)}</span>
                    </button>
                  ))}
                </div>;
              })()}

              {/* Message body */}
              <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
                <div
                  style={{ fontSize: FS.base, lineHeight: 1.6, color: Z.tx, wordBreak: "break-word" }}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(getBody(selectedFull)) }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Empty reading pane */}
      {!selectedFull && messages.length > 0 && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: Z.tm, fontFamily: COND }}>
          Select a message to read
        </div>
      )}
    </div>

    {/* Compose Modal */}
    <ComposeModal
      open={composeOpen}
      onClose={() => { setComposeOpen(false); setReplyTo(null); setForwardMsg(null); setReplyAll(false); }}
      onSent={() => { if (activeLabel === "SENT") loadMessages("SENT", "", null); }}
      replyTo={replyTo}
      replyAll={replyAll}
      forward={forwardMsg}
      signature=""
    />
  </div>;
};

export default Mail;
