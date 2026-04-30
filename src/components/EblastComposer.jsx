// ============================================================
// EblastComposer — dedicated advertiser-send composer.
//
// Writes to newsletter_drafts with draft_type='eblast'. Shares the
// send-newsletter edge function and Send Test flow with regular
// newsletters; differs on the compose shape (tiptap body +
// advertiser identity fields + CTA) and the rendered HTML (see
// utils/eblastTemplate.js).
// ============================================================
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import { mergeAttributes } from "@tiptap/core";

// ─── Image with width + href + hard max-width clamp ──────
// Wraps the <img> in an <a> when href is set so ad images can be
// click-targets (very common in eBlasts — logo clicks to advertiser
// homepage, etc). The rendered anchor gets tracked through the
// email-click redirector by the trackifyLinks pass in eblastTemplate.
// On reload, href survives via a data-href attribute we write alongside
// the wrapping anchor, plus a fallback that reads the parent <a>.
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => el.getAttribute("data-width") || null,
        renderHTML: () => ({}),
      },
      href: {
        default: null,
        parseHTML: el => {
          const dh = el.getAttribute("data-href");
          if (dh) return dh;
          const parent = el.parentElement;
          if (parent && parent.tagName === "A" && parent.getAttribute("href")) {
            return parent.getAttribute("href");
          }
          return null;
        },
        renderHTML: () => ({}),
      },
    };
  },
  renderHTML({ HTMLAttributes, node }) {
    const w = node.attrs.width;
    const href = node.attrs.href;
    const styleParts = ["max-width:100%", "height:auto", "display:block", "border-radius:4px"];
    if (w) styleParts.push(`width:${w}`);
    const imgAttrs = mergeAttributes(HTMLAttributes, {
      style: styleParts.join(";"),
      "data-width": w || null,
      "data-href": href || null,
    });
    if (href) {
      return [
        "a",
        { href, target: "_blank", rel: "noopener noreferrer", style: "display:block;text-decoration:none;" },
        ["img", imgAttrs],
      ];
    }
    return ["img", imgAttrs];
  },
});

// Pre-built column block — email-safe (<table>) with placeholder cells
// the user can click into and overwrite. Gutter + padding match the
// rendered email so the editor preview looks like the outbox.
const colBlock = (n) => {
  const cellW = (100 / n).toFixed(2);
  const cells = Array.from({ length: n }).map(() =>
    `<td style="width:${cellW}%;padding:8px;vertical-align:top;"><p>Column content…</p></td>`
  ).join("");
  return `<table data-layout="cols-${n}" style="width:100%;border-collapse:collapse;margin:12px 0;"><tbody><tr>${cells}</tr></tbody></table><p></p>`;
};
const dividerBlock = `<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;" />`;
const spacerBlock = `<div style="height:32px;" aria-hidden="true">&nbsp;</div>`;
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Btn, Inp, TA, Sel, GlassCard, Modal } from "./ui";
import { supabase, isOnline, EDGE_FN_URL } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";
import { generateEblastHtml } from "../utils/eblastTemplate";
import { uploadMedia } from "../lib/media";
import ScheduleModal from "./ScheduleModal";

// eBlast publication allowlist — restricted to the four sender domains
// we have verified SES senders + active newsletter lists for. Adding a
// new pub means seeding newsletter_from_email + verifying with SES
// before it lands in this list.
const NEWSLETTER_PUBS = [
  { value: "pub-atascadero-news",   label: "Atascadero News" },
  { value: "pub-paso-robles-press", label: "Paso Robles Press" },
  { value: "pub-calabasas-style",   label: "Calabasas Style" },
  { value: "pub-the-malibu-times",  label: "The Malibu Times" },
];

// ─── Mini tiptap toolbar ────────────────────────────────────
function EblastToolbar({ editor, onImageClick, imageUploading }) {
  if (!editor) return null;
  const btn = (active, onClick, label, disabled) => (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      padding: "4px 8px", borderRadius: Ri, border: "none",
      background: active ? Z.ac + "20" : "transparent",
      color: active ? Z.ac : Z.tm,
      cursor: disabled ? "default" : "pointer",
      fontSize: FS.sm, fontWeight: active ? 700 : 500, minHeight: 26,
      fontFamily: COND, opacity: disabled ? 0.5 : 1,
    }}>{label}</button>
  );
  const setLink = () => {
    const prev = editor.getAttributes("link").href || "";
    const url = window.prompt("Link URL (leave empty to remove):", prev);
    if (url === null) return;
    if (url === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().setLink({ href: url.startsWith("http") ? url : "https://" + url }).run();
  };
  const imageActive = editor.isActive("image");
  const currentImgWidth = imageActive ? editor.getAttributes("image").width : null;
  const currentImgHref = imageActive ? editor.getAttributes("image").href : null;
  const setImgWidth = (w) => editor.chain().focus().updateAttributes("image", { width: w }).run();
  const setImgHref = () => {
    const prev = editor.getAttributes("image").href || "";
    const url = window.prompt("Link URL for this image (leave empty to remove):", prev);
    if (url === null) return;
    const cleaned = url.trim();
    const final = cleaned
      ? (cleaned.startsWith("http") ? cleaned : "https://" + cleaned)
      : null;
    editor.chain().focus().updateAttributes("image", { href: final }).run();
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 2, padding: "4px 6px", borderBottom: `1px solid ${Z.bd}`, background: Z.sa, flexWrap: "wrap" }}>
        {btn(editor.isActive("bold"),      () => editor.chain().focus().toggleBold().run(),      <strong>B</strong>)}
        {btn(editor.isActive("italic"),    () => editor.chain().focus().toggleItalic().run(),    <em>I</em>)}
        {btn(editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), <u>U</u>)}
        <div style={{ width: 1, background: Z.bd, margin: "0 4px" }} />
        {btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "H2")}
        {btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "H3")}
        <div style={{ width: 1, background: Z.bd, margin: "0 4px" }} />
        {btn(editor.isActive("bulletList"),  () => editor.chain().focus().toggleBulletList().run(),  "• List")}
        {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "1. List")}
        <div style={{ width: 1, background: Z.bd, margin: "0 4px" }} />
        {btn(editor.isActive("link"), setLink, "Link")}
        {btn(false, onImageClick, imageUploading ? "Uploading…" : "+ Image", imageUploading)}
        <div style={{ width: 1, background: Z.bd, margin: "0 4px" }} />
        {btn(false, () => editor.chain().focus().insertContent(colBlock(2)).run(),   "+ 2 Cols")}
        {btn(false, () => editor.chain().focus().insertContent(colBlock(3)).run(),   "+ 3 Cols")}
        {btn(false, () => editor.chain().focus().insertContent(dividerBlock).run(), "+ Divider")}
        {btn(false, () => editor.chain().focus().insertContent(spacerBlock).run(),  "+ Spacer")}
      </div>
      {imageActive && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 10px", borderBottom: `1px solid ${Z.bd}`, background: Z.bg, flexWrap: "wrap" }}>
          <span style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginRight: 4 }}>Image size:</span>
          {["25%", "50%", "75%", "100%"].map(w => (
            <button key={w} type="button" onClick={() => setImgWidth(w)} style={{
              padding: "3px 10px", borderRadius: Ri, border: "1px solid " + Z.bd,
              background: currentImgWidth === w ? Z.ac : Z.sf,
              color: currentImgWidth === w ? "#fff" : Z.tm,
              fontSize: FS.xs, fontWeight: currentImgWidth === w ? 700 : 500,
              fontFamily: COND, cursor: "pointer",
            }}>{w}</button>
          ))}
          <button type="button" onClick={() => setImgWidth(null)} style={{ padding: "3px 10px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tm, fontSize: FS.xs, fontFamily: COND, cursor: "pointer" }}>Auto</button>
          <div style={{ width: 1, height: 20, background: Z.bd, margin: "0 6px" }} />
          <button type="button" onClick={setImgHref} style={{
            padding: "3px 10px", borderRadius: Ri, border: "1px solid " + Z.bd,
            background: currentImgHref ? Z.ac + "20" : Z.sf,
            color: currentImgHref ? Z.ac : Z.tm,
            fontSize: FS.xs, fontWeight: currentImgHref ? 700 : 500,
            fontFamily: COND, cursor: "pointer", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={currentImgHref || "Add a click-through URL"}>
            {currentImgHref ? `🔗 ${currentImgHref.replace(/^https?:\/\//, "")}` : "🔗 Link to URL…"}
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPOSER
// ═══════════════════════════════════════════════════════════
export default function EblastComposer({ pubs, currentUser }) {
  const dialog = useDialog();
  const [draft, setDraft] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [subCounts, setSubCounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newDraftOpen, setNewDraftOpen] = useState(false);
  const [newDraftPub, setNewDraftPub] = useState(NEWSLETTER_PUBS[0].value);
  const [creating, setCreating] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const previewRef = useRef(null);
  const imageFileRef = useRef(null);

  // ─── Load eblast drafts + subscriber counts ──────────────
  useEffect(() => {
    if (!isOnline()) return;
    supabase.from("newsletter_drafts")
      .select("*")
      .eq("draft_type", "eblast")
      .order("updated_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setDrafts(data || []));

    NEWSLETTER_PUBS.forEach(p => {
      supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true })
        .eq("publication_id", p.value).eq("status", "active")
        .then(({ count }) => setSubCounts(prev => ({ ...prev, [p.value]: count || 0 })));
    });
  }, []);

  // ─── Live client typeahead (debounced) ────────────────────
  useEffect(() => {
    if (!clientSearch || clientSearch.length < 2) { setClients([]); return; }
    const t = setTimeout(() => {
      supabase.from("clients")
        .select("id, name, city, category")
        .ilike("name", `%${clientSearch}%`)
        .order("name")
        .limit(8)
        .then(({ data }) => setClients(data || []));
    }, 250);
    return () => clearTimeout(t);
  }, [clientSearch]);

  // ─── Tiptap editor ────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, horizontalRule: false, codeBlock: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      ResizableImage.configure({ inline: false }),
    ],
    content: draft?.body_html || "<p>Write the advertiser's message here…</p>",
    editorProps: {
      attributes: {
        class: "eblast-body-editor",
        style: "outline: none; min-height: 260px; padding: 16px; font-size: 15px; line-height: 1.6;",
      },
    },
    onUpdate: ({ editor }) => {
      setDraft(d => d ? { ...d, body_html: editor.getHTML() } : d);
      setSaved(false);
    },
  }, [draft?.id]);

  // Keep editor in sync if the user switches draft
  useEffect(() => {
    if (!editor || !draft) return;
    if ((editor.getHTML() || "") !== (draft.body_html || "")) {
      editor.commands.setContent(draft.body_html || "<p></p>", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id, editor]);

  // ─── Preview HTML ─────────────────────────────────────────
  const previewHtml = useMemo(() => {
    if (!draft) return "";
    return generateEblastHtml({ ...draft, pubId: draft.publication_id, forSending: false });
  }, [draft]);

  useEffect(() => {
    if (!previewRef.current || !previewHtml) return;
    const doc = previewRef.current.contentDocument;
    if (doc) { doc.open(); doc.write(previewHtml); doc.close(); }
  }, [previewHtml]);

  // ─── Mutations ────────────────────────────────────────────
  const openNewDraftModal = () => {
    setNewDraftPub(NEWSLETTER_PUBS[0].value);
    setNewDraftOpen(true);
  };

  const createDraft = async () => {
    if (!newDraftPub) return;
    setCreating(true);
    const row = {
      draft_type: "eblast",
      publication_id: newDraftPub,
      subject: "Dedicated send",
      preheader: "",
      advertiser_name: "",
      advertiser_website: "",
      advertiser_logo_url: "",
      advertiser_address: "",
      advertiser_phone: "",
      body_html: "<p>Write the advertiser's message here.</p>",
      cta_text: "",
      cta_url: "",
      status: "draft",
      created_by: currentUser?.authId || null,
    };
    const { data, error } = await supabase.from("newsletter_drafts").insert(row).select().single();
    setCreating(false);
    if (error) { await dialog.alert("Create failed: " + error.message); return; }
    setDrafts(prev => [data, ...prev]);
    setDraft(data);
    setNewDraftOpen(false);
  };

  const updateField = (key, value) => {
    setDraft(d => d ? ({ ...d, [key]: value }) : d);
    setSaved(false);
  };

  const attachClient = (c) => {
    updateField("client_id", c.id);
    if (!draft.advertiser_name) updateField("advertiser_name", c.name);
    setClientSearch("");
    setClients([]);
  };

  // Inline image upload — pipes through uploadMedia so the image lands
  // on Bunny CDN (and gets stored in media_assets tagged to this pub
  // for reuse). The compressed main variant is what gets inserted.
  const handleImagePick = () => imageFileRef.current?.click();
  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    setImageUploading(true);
    try {
      const row = await uploadMedia(file, {
        category: "eblast_image",
        publicationId: draft.publication_id,
      });
      editor.chain().focus().setImage({ src: row.cdn_url, alt: file.name }).run();
    } catch (err) {
      await dialog.alert("Image upload failed: " + err.message);
    }
    setImageUploading(false);
  };

  // Build send-ready HTML (with tracking), persist html_body, flip
  // to approved. Returns draft.id for the send call.
  const persistSendReady = useCallback(async () => {
    if (!draft) return null;
    const html = generateEblastHtml({ ...draft, pubId: draft.publication_id, forSending: true });
    const { error } = await supabase.from("newsletter_drafts").update({
      subject: draft.subject, preheader: draft.preheader,
      advertiser_name: draft.advertiser_name, advertiser_website: draft.advertiser_website,
      advertiser_logo_url: draft.advertiser_logo_url,
      advertiser_address: draft.advertiser_address, advertiser_phone: draft.advertiser_phone,
      body_html: draft.body_html,
      cta_text: draft.cta_text, cta_url: draft.cta_url,
      client_id: draft.client_id || null,
      html_body: html,
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: currentUser?.authId || null,
    }).eq("id", draft.id);
    if (error) throw new Error(error.message);
    setDraft(d => d ? { ...d, html_body: html, status: "approved" } : d);
    return draft.id;
  }, [draft, currentUser]);

  const saveOnly = async () => {
    if (!draft) return;
    setSaving(true);
    const { error } = await supabase.from("newsletter_drafts").update({
      subject: draft.subject, preheader: draft.preheader,
      advertiser_name: draft.advertiser_name, advertiser_website: draft.advertiser_website,
      advertiser_logo_url: draft.advertiser_logo_url,
      advertiser_address: draft.advertiser_address, advertiser_phone: draft.advertiser_phone,
      body_html: draft.body_html,
      cta_text: draft.cta_text, cta_url: draft.cta_url,
      client_id: draft.client_id || null,
    }).eq("id", draft.id);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    else await dialog.alert("Save failed: " + error.message);
    setSaving(false);
  };

  const invokeSend = async (draftId, testEmail) => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) throw new Error("Not signed in");
    // Supabase's edge gateway requires BOTH apikey (anon) AND Authorization
    // (user JWT). Omit either and the platform layer 401s before our code runs.
    const headers = {
      "Content-Type": "application/json",
      "apikey": supabase.supabaseKey || "",
      "Authorization": "Bearer " + token,
      "x-draft-id": draftId,
    };
    if (testEmail) headers["x-test-email"] = testEmail;
    const res = await fetch(EDGE_FN_URL + "/send-newsletter", { method: "POST", headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 207) throw new Error(data.error || `Send failed (${res.status})`);
    return data;
  };

  // Scheduling — stamps scheduled_at + recurrence + status, same HTML
  // rendering as sendNow. The pg_cron tick fires it at go-time.
  const scheduleSend = async ({ scheduled_at, recurrence }) => {
    if (!draft) return;
    // Build the send-ready HTML now so the content is frozen at schedule time.
    const html = generateEblastHtml({ ...draft, pubId: draft.publication_id, forSending: true });
    const { error } = await supabase.from("newsletter_drafts").update({
      subject: draft.subject, preheader: draft.preheader,
      advertiser_name: draft.advertiser_name, advertiser_website: draft.advertiser_website,
      advertiser_logo_url: draft.advertiser_logo_url,
      advertiser_address: draft.advertiser_address, advertiser_phone: draft.advertiser_phone,
      body_html: draft.body_html,
      cta_text: draft.cta_text, cta_url: draft.cta_url,
      client_id: draft.client_id || null,
      html_body: html,
      status: "scheduled",
      scheduled_at,
      recurrence,
    }).eq("id", draft.id);
    if (error) { await dialog.alert("Schedule failed: " + error.message); return; }
    const { data: fresh } = await supabase.from("newsletter_drafts").select("*").eq("id", draft.id).single();
    if (fresh) setDraft(fresh);
  };

  const cancelSchedule = async () => {
    if (!draft) return;
    const ok = await dialog.confirm("Cancel the scheduled send?");
    if (!ok) return;
    await supabase.from("newsletter_drafts").update({
      status: "approved",
      scheduled_at: null,
      recurrence: null,
    }).eq("id", draft.id);
    const { data: fresh } = await supabase.from("newsletter_drafts").select("*").eq("id", draft.id).single();
    if (fresh) setDraft(fresh);
  };

  const sendTest = async () => {
    if (!draft) return;
    const address = await dialog.prompt("Send a test to which email?", currentUser?.email || "");
    if (!address) return;
    setSending(true);
    try {
      const id = await persistSendReady();
      const res = await invokeSend(id, address.trim());
      await dialog.alert(res.sent === 1 ? `Test sent to ${address}.` : `Test failed: ${res.errors?.[0] || "unknown"}`);
    } catch (err) {
      await dialog.alert("Test failed: " + err.message);
    }
    setSending(false);
  };

  // Poll the draft until status leaves 'sending'. Updates draft state in
  // place so the UI can show a live "Sent N of TOTAL" counter off the
  // draft.recipient_count heartbeat the edge function writes every 50.
  const [sendProgress, setSendProgress] = useState(null); // { sent, total } or null
  const pollDraftUntilDone = async (id, total) => {
    // Seed with the current value so the counter doesn't flash 0 → 4,296
    // each time auto-resume kicks off a new polling round.
    const { data: seed } = await supabase.from("newsletter_drafts")
      .select("recipient_count").eq("id", id).single();
    setSendProgress({ sent: seed?.recipient_count || 0, total });
    for (let i = 0; i < 600; i++) { // max ~30min at 3s ticks
      await new Promise(r => setTimeout(r, 3000));
      const { data } = await supabase.from("newsletter_drafts")
        .select("status, recipient_count, last_error")
        .eq("id", id).single();
      if (!data) break;
      setSendProgress(prev => ({ sent: Math.max(prev?.sent || 0, data.recipient_count || 0), total }));
      if (data.status !== "sending") {
        // Don't clear progress here — the auto-resume loop may immediately
        // start another round; clearing would flash empty state. The
        // outer sendNow clears it after the final round.
        return data;
      }
    }
    return null;
  };

  // Auto-chain sends: Supabase edge functions cap at ~150s wall clock.
  // One invocation clears ~2,000 emails at our throughput, so larger
  // lists need multiple back-to-back invocations. When a run finishes
  // with status='approved' (incomplete — send function's dedup path),
  // we fire another invocation and keep the polling UI alive.
  const runSendWithAutoResume = async (id, totalExpected) => {
    const MAX_ROUNDS = 10;
    let lastFinal = null;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await invokeSend(id, null);
      if (!res.queued) {
        // Synchronous result (small list or test path).
        const { data } = await supabase.from("newsletter_drafts").select("*").eq("id", id).single();
        lastFinal = data;
        break;
      }
      const final = await pollDraftUntilDone(id, totalExpected);
      if (!final) return null; // polling timed out
      lastFinal = final;
      // 'approved' means the send function ran out of wall clock time
      // with work remaining. Fire another round.
      const done = final.status === "sent" || final.status === "failed";
      if (done) break;
    }
    return lastFinal;
  };

  const sendNow = async () => {
    if (!draft) return;
    const count = subCounts[draft.publication_id] || 0;
    const ok = await dialog.confirm(
      `Send this eBlast to ${count.toLocaleString()} subscribers?`
    );
    if (!ok) return;
    setSending(true);
    try {
      const id = await persistSendReady();
      const final = await runSendWithAutoResume(id, count);
      if (final) {
        await dialog.alert(
          final.status === "failed"
            ? `Send failed: ${final.last_error || "unknown error"}`
            : `Sent to ${final.recipient_count || 0} of ${count} subscribers.`
        );
        const { data } = await supabase.from("newsletter_drafts").select("*").eq("id", id).single();
        if (data) setDraft(data);
      } else {
        await dialog.alert("Send is taking longer than expected. Check back in a few minutes — it's still running in the background.");
      }
    } catch (err) {
      await dialog.alert("Send failed: " + err.message);
    }
    setSending(false);
    setSendProgress(null);
  };

  const selectedClient = draft?.client_id ? { id: draft.client_id } : null;

  // ═══ RENDER ═══════════════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Draft selector row */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Sel
          value={draft?.id || ""}
          onChange={e => setDraft(drafts.find(d => d.id === e.target.value) || null)}
          options={[{ value: "", label: drafts.length ? "Select an eBlast draft…" : "No eBlast drafts yet" }, ...drafts.map(d => ({
            value: d.id,
            label: `${d.advertiser_name || "(no advertiser)"} · ${NEWSLETTER_PUBS.find(p => p.value === d.publication_id)?.label || d.publication_id} · ${d.status}`,
          }))]}
          style={{ minWidth: 320 }}
        />
        <Btn sm onClick={openNewDraftModal}>+ New eBlast</Btn>
      </div>

      {!draft ? (
        <GlassCard><div style={{ padding: 32, textAlign: "center", color: Z.td, fontSize: FS.base, fontFamily: COND }}>
          Start a new eBlast draft or pick one from the list above.
        </div></GlassCard>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(380px, 1fr) minmax(440px, 1fr)", gap: 14, alignItems: "start" }}>

          {/* ═══ LEFT: COMPOSE ═══ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            <GlassCard>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontFamily: COND }}>Send Details</div>
              <Sel label="Publication" value={draft.publication_id}
                onChange={e => updateField("publication_id", e.target.value)}
                options={NEWSLETTER_PUBS.map(p => ({
                  value: p.value,
                  label: `${p.label} — ${(subCounts[p.value] || 0).toLocaleString()} subscribers`,
                }))} />
              <div style={{ marginTop: 8 }}>
                <Inp label="Subject" value={draft.subject || ""} onChange={e => updateField("subject", e.target.value)} placeholder="A special offer from [Advertiser]" />
              </div>
              <div style={{ marginTop: 8 }}>
                <Inp label="Preheader (inbox preview)" value={draft.preheader || ""} onChange={e => updateField("preheader", e.target.value)} placeholder="Short teaser shown next to the subject line" />
              </div>
            </GlassCard>

            <GlassCard>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontFamily: COND }}>Advertiser</div>

              {!selectedClient && (
                <div style={{ marginBottom: 10, position: "relative" }}>
                  <Inp label="Link to client (optional)" value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    placeholder="Search client by name or organization…" />
                  {clients.length > 0 && (
                    <div style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, marginTop: 2, background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", maxHeight: 240, overflowY: "auto" }}>
                      {clients.map(c => (
                        <button key={c.id} type="button" onClick={() => attachClient(c)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer", borderBottom: `1px solid ${Z.bd}20`, fontFamily: COND }}>
                          <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{c.name}</div>
                          {(c.city || c.category) && <div style={{ fontSize: FS.xs, color: Z.tm }}>{[c.category, c.city].filter(Boolean).join(" · ")}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {selectedClient && (
                <div style={{ padding: "6px 10px", background: Z.ac + "15", borderRadius: Ri, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: FS.xs, fontFamily: COND, color: Z.ac }}>
                  <span>Linked to client</span>
                  <button onClick={() => updateField("client_id", null)} style={{ background: "none", border: "none", color: Z.da, cursor: "pointer", fontSize: FS.xs, fontWeight: 700 }}>Detach</button>
                </div>
              )}

              <Inp label="Advertiser Name" value={draft.advertiser_name || ""} onChange={e => updateField("advertiser_name", e.target.value)} placeholder="e.g. Central Coast Dental" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <Inp label="Website" value={draft.advertiser_website || ""} onChange={e => updateField("advertiser_website", e.target.value)} placeholder="centralcoastdental.com" />
                <Inp label="Phone" value={draft.advertiser_phone || ""} onChange={e => updateField("advertiser_phone", e.target.value)} placeholder="(805) 555-0123" />
              </div>
              <div style={{ marginTop: 8 }}>
                <Inp label="Logo URL" value={draft.advertiser_logo_url || ""} onChange={e => updateField("advertiser_logo_url", e.target.value)} placeholder="https://…/logo.png" />
              </div>
              <div style={{ marginTop: 8 }}>
                <Inp label="Address" value={draft.advertiser_address || ""} onChange={e => updateField("advertiser_address", e.target.value)} placeholder="123 Main St, Paso Robles, CA 93446" />
              </div>
            </GlassCard>

            <GlassCard style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${Z.bd}`, background: Z.sa, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Message Body</span>
                <span style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND }}>Rich text · images ok</span>
              </div>
              <EblastToolbar editor={editor} onImageClick={handleImagePick} imageUploading={imageUploading} />
              <input ref={imageFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageFile} />
              <div style={{ background: Z.sf, cursor: "text" }} onClick={() => editor?.chain().focus().run()}>
                <EditorContent editor={editor} />
              </div>
            </GlassCard>

            <GlassCard>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontFamily: COND }}>Call-to-Action (optional)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                <Inp label="Button Text" value={draft.cta_text || ""} onChange={e => updateField("cta_text", e.target.value)} placeholder="Book Now" />
                <Inp label="Button URL" value={draft.cta_url || ""} onChange={e => updateField("cta_url", e.target.value)} placeholder="https://…" />
              </div>
            </GlassCard>

            {/* Scheduled-send banner */}
            {draft.status === "scheduled" && draft.scheduled_at && (
              <div style={{ padding: "10px 14px", borderRadius: Ri, background: Z.ac + "18", border: `1px solid ${Z.ac}40`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: FS.sm, color: Z.ac, fontFamily: COND }}>
                  <strong>Scheduled</strong> for {new Date(draft.scheduled_at).toLocaleString("en-US", {
                    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    timeZone: "America/Los_Angeles", timeZoneName: "short",
                  })}
                  {draft.recurrence?.type && <span style={{ marginLeft: 6, opacity: 0.75 }}>· repeats {draft.recurrence.type}</span>}
                </div>
                <Btn sm v="ghost" onClick={cancelSchedule} style={{ color: Z.da }}>Cancel schedule</Btn>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Btn sm v="secondary" onClick={saveOnly} disabled={saving || draft.status === "sent"}>
                {saving ? "Saving…" : saved ? "✓ Saved" : "Save Draft"}
              </Btn>
              <Btn sm v="ghost" onClick={sendTest} disabled={sending || draft.status === "sent"}>Send Test</Btn>
              <Btn sm v="ghost" onClick={() => setScheduleOpen(true)} disabled={sending || draft.status === "sent"}>
                {draft.status === "scheduled" ? "Reschedule" : "Schedule"}
              </Btn>
              <Btn sm v="warning" onClick={sendNow} disabled={sending || draft.status === "sent"}>
                {sendProgress
                  ? `Sending ${sendProgress.sent.toLocaleString()} / ${sendProgress.total.toLocaleString()}…`
                  : sending ? "Sending…" : `Send to ${(subCounts[draft.publication_id] || 0).toLocaleString()}`}
              </Btn>
              {draft.status === "sent" && <span style={{ fontSize: FS.xs, color: Z.su, fontWeight: FW.bold, fontFamily: COND }}>Sent · {draft.recipient_count} recipients</span>}
            </div>
          </div>

          {/* ═══ RIGHT: LIVE PREVIEW ═══ */}
          <GlassCard style={{ padding: 0, overflow: "hidden", position: "sticky", top: 12 }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${Z.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", fontFamily: COND }}>Live Preview</span>
              <span style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND }}>Subject: {draft.subject || "(no subject)"}</span>
            </div>
            <iframe ref={previewRef} title="eBlast Preview" style={{ width: "100%", height: 800, border: "none", background: "#f5f5f5" }} />
          </GlassCard>
        </div>
      )}

      {/* Schedule modal */}
      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSchedule={scheduleSend}
        currentScheduledAt={draft?.scheduled_at}
        currentRecurrence={draft?.recurrence}
        draftLabel={draft?.subject || "this eBlast"}
      />

      {/* New eBlast modal — proper dropdown instead of a raw text
          prompt. onSubmit wires Enter-to-create. */}
      <Modal
        open={newDraftOpen}
        onClose={() => !creating && setNewDraftOpen(false)}
        title="Start a new eBlast"
        width={480}
        onSubmit={createDraft}
        actions={<>
          <Btn sm v="secondary" onClick={() => setNewDraftOpen(false)} disabled={creating}>Cancel</Btn>
          <Btn sm onClick={createDraft} disabled={creating}>{creating ? "Creating…" : "Create Draft"}</Btn>
        </>}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
            Pick the publication that will send this eBlast. Subscriber count is the active newsletter list for that pub — you'll confirm before anything goes out.
          </div>
          <Sel
            label="Publication"
            value={newDraftPub}
            onChange={e => setNewDraftPub(e.target.value)}
            options={NEWSLETTER_PUBS.map(p => ({
              value: p.value,
              label: `${p.label} — ${(subCounts[p.value] || 0).toLocaleString()} subscribers`,
            }))}
          />
        </div>
      </Modal>
    </div>
  );
}
