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
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Btn, Inp, TA, Sel, GlassCard, Modal } from "./ui";
import { supabase, isOnline, EDGE_FN_URL } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";
import { generateEblastHtml } from "../utils/eblastTemplate";

const NEWSLETTER_PUBS = [
  { value: "pub-the-malibu-times",  label: "The Malibu Times" },
  { value: "pub-paso-robles-press", label: "Paso Robles Press" },
  { value: "pub-atascadero-news",   label: "Atascadero News" },
];

// ─── Mini tiptap toolbar ────────────────────────────────────
function EblastToolbar({ editor }) {
  if (!editor) return null;
  const btn = (active, onClick, label) => (
    <button type="button" onClick={onClick} style={{
      padding: "4px 8px", borderRadius: Ri, border: "none",
      background: active ? Z.ac + "20" : "transparent",
      color: active ? Z.ac : Z.tm, cursor: "pointer",
      fontSize: 12, fontWeight: active ? 700 : 500, minHeight: 26,
      fontFamily: COND,
    }}>{label}</button>
  );
  const setLink = () => {
    const prev = editor.getAttributes("link").href || "";
    const url = window.prompt("Link URL (leave empty to remove):", prev);
    if (url === null) return;
    if (url === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().setLink({ href: url.startsWith("http") ? url : "https://" + url }).run();
  };
  const insertImage = () => {
    const url = window.prompt("Image URL:");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };
  return (
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
      {btn(false, insertImage, "Image")}
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
  const previewRef = useRef(null);

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
        .select("id, name, organization, contact_name, city")
        .or(`name.ilike.%${clientSearch}%,organization.ilike.%${clientSearch}%,contact_name.ilike.%${clientSearch}%`)
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
      Image.configure({ inline: false }),
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
    if (!draft.advertiser_name) updateField("advertiser_name", c.organization || c.name);
    setClientSearch("");
    setClients([]);
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
    const headers = {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
      "x-draft-id": draftId,
    };
    if (testEmail) headers["x-test-email"] = testEmail;
    const res = await fetch(EDGE_FN_URL + "/send-newsletter", { method: "POST", headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 207) throw new Error(data.error || `Send failed (${res.status})`);
    return data;
  };

  const sendTest = async () => {
    if (!draft) return;
    const address = await dialog.prompt("Send a test to which email?", { defaultValue: currentUser?.email || "" });
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

  const sendNow = async () => {
    if (!draft) return;
    const count = subCounts[draft.publication_id] || 0;
    const ok = await dialog.confirm(
      `Send this eBlast to ${count.toLocaleString()} subscribers?`,
      { confirmText: "Send to All", variant: "warning" }
    );
    if (!ok) return;
    setSending(true);
    try {
      const id = await persistSendReady();
      const res = await invokeSend(id, null);
      await dialog.alert(`Sent to ${res.sent} of ${res.sent + res.failed}${res.failed ? ` — ${res.failed} failed` : ""}.`);
      const { data } = await supabase.from("newsletter_drafts").select("*").eq("id", id).single();
      if (data) setDraft(data);
    } catch (err) {
      await dialog.alert("Send failed: " + err.message);
    }
    setSending(false);
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
                          <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{c.organization || c.name}</div>
                          {c.contact_name && <div style={{ fontSize: FS.xs, color: Z.tm }}>{c.contact_name}{c.city ? ` · ${c.city}` : ""}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {selectedClient && (
                <div style={{ padding: "6px 10px", background: Z.ac + "15", borderRadius: Ri, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: FS.xs, fontFamily: COND, color: Z.ac }}>
                  <span>Linked to client</span>
                  <button onClick={() => updateField("client_id", null)} style={{ background: "none", border: "none", color: Z.da, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Detach</button>
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
              <EblastToolbar editor={editor} />
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

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Btn sm v="secondary" onClick={saveOnly} disabled={saving || draft.status === "sent"}>
                {saving ? "Saving…" : saved ? "✓ Saved" : "Save Draft"}
              </Btn>
              <Btn sm v="ghost" onClick={sendTest} disabled={sending || draft.status === "sent"}>Send Test</Btn>
              <Btn sm v="warning" onClick={sendNow} disabled={sending || draft.status === "sent"}>
                {sending ? "Sending…" : `Send to ${(subCounts[draft.publication_id] || 0).toLocaleString()}`}
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
