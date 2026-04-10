// ============================================================
// EmailTemplates.jsx — Email template editor with TipTap
// Categories: proposal, contract, renewal, invoice, marketing, newsletter
// ============================================================
import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Z, DARK, COND, DISPLAY, R, Ri, FS, FW, ACCENT, INV } from "../lib/theme";
import { Ic, Btn, Inp, Sel, Modal, GlassCard, PageHeader, TB, TabRow, Pill, SB, glass } from "../components/ui";
import { supabase } from "../lib/supabase";

const CATEGORIES = [
  { value: "proposal", label: "Proposals", icon: "📄" },
  { value: "contract", label: "Contracts", icon: "📝" },
  { value: "renewal", label: "Renewals", icon: "🔄" },
  { value: "invoice", label: "Invoices", icon: "💰" },
  { value: "marketing", label: "Marketing", icon: "📣" },
  { value: "newsletter", label: "Newsletters", icon: "📰" },
  { value: "notification", label: "Notifications", icon: "🔔" },
  { value: "other", label: "Other", icon: "📋" },
];

const MERGE_FIELDS = {
  proposal: [
    { key: "{{client_name}}", label: "Client Name" },
    { key: "{{client_contact}}", label: "Client Contact" },
    { key: "{{client_email}}", label: "Client Email" },
    { key: "{{salesperson_name}}", label: "Salesperson" },
    { key: "{{salesperson_email}}", label: "Salesperson Email" },
    { key: "{{salesperson_phone}}", label: "Salesperson Phone" },
    { key: "{{line_items_table}}", label: "Line Items Table" },
    { key: "{{total}}", label: "Total Amount" },
    { key: "{{proposal_date}}", label: "Proposal Date" },
    { key: "{{sign_link}}", label: "Click to Sign Link" },
    { key: "{{company_name}}", label: "Company Name" },
    { key: "{{company_address}}", label: "Company Address" },
    { key: "{{company_phone}}", label: "Company Phone" },
  ],
  contract: [
    { key: "{{client_name}}", label: "Client Name" },
    { key: "{{contract_name}}", label: "Contract Name" },
    { key: "{{start_date}}", label: "Start Date" },
    { key: "{{end_date}}", label: "End Date" },
    { key: "{{total_value}}", label: "Total Value" },
    { key: "{{sign_link}}", label: "Signed Contract Link" },
  ],
  renewal: [
    { key: "{{subscriber_name}}", label: "Subscriber Name" },
    { key: "{{publication_name}}", label: "Publication" },
    { key: "{{expiry_date}}", label: "Expiry Date" },
    { key: "{{renewal_amount}}", label: "Renewal Amount" },
    { key: "{{renew_link}}", label: "Renew Link" },
  ],
  invoice: [
    { key: "{{client_name}}", label: "Client Name" },
    { key: "{{invoice_number}}", label: "Invoice #" },
    { key: "{{amount_due}}", label: "Amount Due" },
    { key: "{{due_date}}", label: "Due Date" },
    { key: "{{line_items_table}}", label: "Line Items Table" },
    { key: "{{pay_link}}", label: "Pay Link" },
  ],
  marketing: [
    { key: "{{recipient_name}}", label: "Recipient Name" },
    { key: "{{publication_name}}", label: "Publication" },
    { key: "{{unsubscribe_link}}", label: "Unsubscribe Link" },
  ],
  newsletter: [
    { key: "{{stories}}", label: "Story List" },
    { key: "{{publication_name}}", label: "Publication" },
    { key: "{{edition_date}}", label: "Edition Date" },
    { key: "{{unsubscribe_link}}", label: "Unsubscribe Link" },
  ],
  notification: [{ key: "{{recipient_name}}", label: "Recipient" }, { key: "{{message}}", label: "Message" }],
  other: [{ key: "{{recipient_name}}", label: "Recipient" }],
};

const isDark = () => Z.bg === DARK.bg;

const EmailTemplates = ({ pubs, currentUser }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("proposal");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [previewModal, setPreviewModal] = useState(false);

  // Editor form
  const [form, setForm] = useState({ name: "", category: "proposal", subject: "", publicationId: "", includeLetterhead: true });
  const [saving, setSaving] = useState(false);

  // Load templates
  useEffect(() => {
    supabase.from("email_templates").select("*").order("category").order("name")
      .then(({ data }) => { setTemplates(data || []); setLoading(false); });
  }, []);

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Link.configure({ openOnClick: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: "",
    editorProps: {
      attributes: {
        style: `color: ${Z.tx}; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; outline: none; min-height: 300px; padding: 16px;`,
      },
    },
  });

  // Filter templates
  const filtered = useMemo(() => {
    let list = templates.filter(t => t.category === category);
    if (search) list = list.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [templates, category, search]);

  // Open template for editing
  const openTemplate = (t) => {
    setForm({ name: t.name, category: t.category, subject: t.subject, publicationId: t.publication_id || "", includeLetterhead: t.include_letterhead });
    editor?.commands.setContent(t.html_body || "");
    setEditId(t.id);
  };

  // Create new
  const openCreate = () => {
    setForm({ name: "", category, subject: "", publicationId: "", includeLetterhead: true });
    editor?.commands.setContent("<p>Start writing your template...</p>");
    setEditId(null);
    setCreateModal(false);
  };

  // Save
  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const htmlBody = editor?.getHTML() || "";
    const fields = (MERGE_FIELDS[form.category] || []).filter(f => htmlBody.includes(f.key) || form.subject.includes(f.key)).map(f => f.key);

    const record = {
      name: form.name, category: form.category, subject: form.subject,
      html_body: htmlBody, merge_fields: fields,
      publication_id: form.publicationId || null,
      include_letterhead: form.includeLetterhead,
      updated_by: currentUser?.id || null,
    };

    if (editId) {
      const { data } = await supabase.from("email_templates").update({ ...record, updated_at: new Date().toISOString() }).eq("id", editId).select().single();
      if (data) setTemplates(prev => prev.map(t => t.id === editId ? data : t));
    } else {
      const { data } = await supabase.from("email_templates").insert({ ...record, created_by: currentUser?.id || null }).select().single();
      if (data) { setTemplates(prev => [...prev, data]); setEditId(data.id); }
    }
    setSaving(false);
  };

  // Set as default for category
  const setDefault = async (id) => {
    // Unset all others in this category
    const cat = templates.find(t => t.id === id)?.category;
    await supabase.from("email_templates").update({ is_default: false }).eq("category", cat);
    await supabase.from("email_templates").update({ is_default: true }).eq("id", id);
    setTemplates(prev => prev.map(t => t.category === cat ? { ...t, is_default: t.id === id } : t));
  };

  // Delete
  const deleteTemplate = async (id) => {
    if (!confirm("Delete this template?")) return;
    await supabase.from("email_templates").delete().eq("id", id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (editId === id) { setEditId(null); editor?.commands.setContent(""); }
  };

  // Insert merge field at cursor
  const insertField = (field) => {
    editor?.commands.insertContent(field);
  };

  const activeTemplate = editId ? templates.find(t => t.id === editId) : null;
  const dk = isDark();

  // Toolbar button helper
  const TBtn = ({ icon, active, onClick, title }) => (
    <button onClick={onClick} title={title} style={{
      padding: "4px 8px", borderRadius: 3, border: "none", cursor: "pointer",
      background: active ? Z.ac + "20" : "transparent", color: active ? Z.ac : Z.tm,
      fontSize: 14, fontWeight: 700, lineHeight: 1,
    }}>{icon}</button>
  );

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Email Templates">
      <SB value={search} onChange={setSearch} placeholder="Search templates..." />
      <Btn sm onClick={() => { setCreateModal(true); }}><Ic.plus size={13} /> New Template</Btn>
    </PageHeader>

    {/* Category tabs */}
    <TabRow>
      <TB tabs={CATEGORIES.map(c => `${c.icon} ${c.label}`)} active={`${CATEGORIES.find(c => c.value === category)?.icon} ${CATEGORIES.find(c => c.value === category)?.label}`}
        onChange={v => { const cat = CATEGORIES.find(c => `${c.icon} ${c.label}` === v); if (cat) setCategory(cat.value); }} />
    </TabRow>

    {/* Split: template list + editor */}
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, minHeight: "calc(100vh - 240px)" }}>

      {/* LEFT: Template list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
        {loading && <div style={{ padding: 20, textAlign: "center", color: Z.td }}>Loading...</div>}
        {!loading && filtered.length === 0 && <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No templates in this category</div>}
        {filtered.map(t => (
          <div key={t.id} onClick={() => openTemplate(t)} style={{
            padding: "10px 14px", borderRadius: Ri, cursor: "pointer",
            background: editId === t.id ? Z.ac + "12" : Z.bg,
            borderLeft: editId === t.id ? `3px solid ${Z.ac}` : "3px solid transparent",
            transition: "background 0.1s",
          }}
            onMouseEnter={e => { if (editId !== t.id) e.currentTarget.style.background = Z.sa; }}
            onMouseLeave={e => { if (editId !== t.id) e.currentTarget.style.background = Z.bg; }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{t.name}</span>
              {t.is_default && <span style={{ fontSize: 9, fontWeight: FW.bold, color: Z.go, background: Z.go + "15", padding: "1px 6px", borderRadius: Ri }}>DEFAULT</span>}
            </div>
            <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 2 }}>{t.subject || "No subject"}</div>
          </div>
        ))}
      </div>

      {/* RIGHT: Editor */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {editId || form.name ? <>
          {/* Template settings bar */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Inp label="Template Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Inp label="Email Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Proposal — {{client_name}}" />
            <Sel label="Publication" value={form.publicationId} onChange={e => setForm(f => ({ ...f, publicationId: e.target.value }))} options={[{ value: "", label: "All / Generic" }, ...(pubs || []).map(p => ({ value: p.id, label: p.name }))]} />
          </div>

          {/* Merge fields strip */}
          <div>
            <div style={{ fontSize: 10, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Insert Merge Field</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(MERGE_FIELDS[form.category] || []).map(f => (
                <button key={f.key} onClick={() => insertField(f.key)} style={{
                  padding: "3px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`,
                  background: Z.bg, cursor: "pointer", fontSize: 11, fontWeight: FW.semi,
                  color: Z.ac, fontFamily: COND, transition: "background 0.1s",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = Z.ac + "10"}
                  onMouseLeave={e => e.currentTarget.style.background = Z.bg}
                >{f.label}</button>
              ))}
            </div>
          </div>

          {/* TipTap toolbar */}
          <div style={{ display: "flex", gap: 2, padding: "6px 8px", background: Z.sa, borderRadius: Ri, flexWrap: "wrap", alignItems: "center" }}>
            <TBtn icon="B" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold" />
            <TBtn icon="I" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic" />
            <TBtn icon="U" active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline" />
            <div style={{ width: 1, height: 18, background: Z.bd, margin: "0 4px" }} />
            <TBtn icon="H1" active={editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1" />
            <TBtn icon="H2" active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2" />
            <TBtn icon="¶" active={editor?.isActive("paragraph")} onClick={() => editor?.chain().focus().setParagraph().run()} title="Paragraph" />
            <div style={{ width: 1, height: 18, background: Z.bd, margin: "0 4px" }} />
            <TBtn icon="•" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet List" />
            <TBtn icon="1." active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered List" />
            <div style={{ width: 1, height: 18, background: Z.bd, margin: "0 4px" }} />
            <TBtn icon="←" active={editor?.isActive({ textAlign: "left" })} onClick={() => editor?.chain().focus().setTextAlign("left").run()} title="Left Align" />
            <TBtn icon="↔" active={editor?.isActive({ textAlign: "center" })} onClick={() => editor?.chain().focus().setTextAlign("center").run()} title="Center" />
            <TBtn icon="→" active={editor?.isActive({ textAlign: "right" })} onClick={() => editor?.chain().focus().setTextAlign("right").run()} title="Right Align" />
            <div style={{ width: 1, height: 18, background: Z.bd, margin: "0 4px" }} />
            <TBtn icon="🔗" onClick={() => { const url = prompt("URL:"); if (url) editor?.chain().focus().setLink({ href: url }).run(); }} title="Link" />
            <TBtn icon="—" onClick={() => editor?.chain().focus().setHorizontalRule().run()} title="Horizontal Rule" />
          </div>

          {/* Editor area */}
          <div style={{ flex: 1, border: `1px solid ${Z.bd}`, borderRadius: R, background: dk ? "#12141a" : "#fff", overflow: "auto", minHeight: 350 }}>
            <EditorContent editor={editor} />
          </div>

          {/* Action bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: FS.sm, color: Z.tm, cursor: "pointer" }}>
                <input type="checkbox" checked={form.includeLetterhead} onChange={e => setForm(f => ({ ...f, includeLetterhead: e.target.checked }))} style={{ accentColor: Z.ac }} />
                Include letterhead
              </label>
              {editId && <Btn sm v="ghost" onClick={() => setDefault(editId)}>{activeTemplate?.is_default ? "✓ Default" : "Set as Default"}</Btn>}
              {editId && <Btn sm v="ghost" onClick={() => deleteTemplate(editId)} style={{ color: Z.da }}>Delete</Btn>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn sm v="secondary" onClick={() => setPreviewModal(true)}>Preview</Btn>
              <Btn sm onClick={save} disabled={saving || !form.name.trim()}>{saving ? "Saving..." : editId ? "Save Changes" : "Create Template"}</Btn>
            </div>
          </div>
        </> : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: Z.td }}>
          <div style={{ fontSize: 48 }}>📧</div>
          <div style={{ fontSize: FS.md, fontWeight: FW.bold }}>Select a template or create a new one</div>
          <Btn sm onClick={() => { openCreate(); }}><Ic.plus size={13} /> New Template</Btn>
        </div>}
      </div>
    </div>

    {/* Preview modal */}
    <Modal open={previewModal} onClose={() => setPreviewModal(false)} title="Template Preview" width={700}>
      <div style={{ padding: 20, background: "#fff", borderRadius: R, color: "#1a1a2e" }}>
        {form.includeLetterhead && <div style={{ borderBottom: "2px solid #1a1a2e", paddingBottom: 16, marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#1a1a2e" }}>13 Stars Media Group</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>P.O. Box 427, Paso Robles, CA 93447</div>
            <div style={{ fontSize: 11, color: "#666" }}>(805) 237-6060 · info@13stars.media</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#666" }}>
            <div>{"{{salesperson_name}}"}</div>
            <div>{"{{salesperson_email}}"}</div>
            <div>{"{{salesperson_phone}}"}</div>
          </div>
        </div>}
        <div style={{ fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 4 }}>Subject: {form.subject || "(no subject)"}</div>
        <div dangerouslySetInnerHTML={{ __html: editor?.getHTML() || "" }} style={{ fontSize: 14, lineHeight: 1.6 }} />
      </div>
    </Modal>

    {/* New template modal */}
    <Modal open={createModal} onClose={() => setCreateModal(false)} title="New Template" width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="Template Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Standard Proposal" />
        <Sel label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} options={CATEGORIES.map(c => ({ value: c.value, label: `${c.icon} ${c.label}` }))} />
        <Btn onClick={openCreate} disabled={!form.name.trim()}>Create & Edit</Btn>
      </div>
    </Modal>
  </div>;
};

export default memo(EmailTemplates);
