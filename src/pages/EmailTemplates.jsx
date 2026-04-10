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
import { DEFAULT_PROPOSAL_CONFIG, generateProposalHtml } from "../lib/proposalTemplate";

const CATEGORIES = [
  { value: "proposal", label: "Proposals", icon: Ic.file },
  { value: "contract", label: "Contracts", icon: Ic.sign },
  { value: "renewal", label: "Renewals", icon: Ic.clock },
  { value: "invoice", label: "Invoices", icon: Ic.invoice },
  { value: "marketing", label: "Marketing", icon: Ic.send },
  { value: "newsletter", label: "Newsletters", icon: Ic.mail },
  { value: "notification", label: "Notifications", icon: Ic.bell },
  { value: "other", label: "Other", icon: Ic.folder },
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
  const [form, setForm] = useState({ name: "", category: "proposal", subject: "", publicationIds: [], includeLetterhead: true });
  const [saving, setSaving] = useState(false);
  const [proposalCfg, setPropCfg] = useState({ ...DEFAULT_PROPOSAL_CONFIG });

  // Style helpers for proposal config
  const secHead = { fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND, marginBottom: 8 };
  const checkLbl = { display: "flex", alignItems: "center", gap: 6, fontSize: FS.sm, color: Z.tm, cursor: "pointer" };
  const chk = { accentColor: Z.ac };

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
    setForm({ name: t.name, category: t.category, subject: t.subject, publicationIds: t.publication_ids || (t.publication_id ? [t.publication_id] : []), includeLetterhead: t.include_letterhead });
    if (t.category === "proposal" && t.config) {
      setPropCfg({ ...DEFAULT_PROPOSAL_CONFIG, ...t.config });
    } else {
      editor?.commands.setContent(t.html_body || "");
    }
    setEditId(t.id);
  };

  // Create new
  const openCreate = () => {
    if (!form.name.trim()) return;
    editor?.commands.setContent("<p>Start writing your template...</p>");
    setEditId(null);
    setCreateModal(false);
  };

  // Save
  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const isProposal = form.category === "proposal";
    const htmlBody = isProposal ? "" : (editor?.getHTML() || "");
    const fields = isProposal ? [] : (MERGE_FIELDS[form.category] || []).filter(f => htmlBody.includes(f.key) || form.subject.includes(f.key)).map(f => f.key);

    const record = {
      name: form.name, category: form.category,
      subject: isProposal ? "Proposal: {{proposal_name}} — {{client_name}}" : form.subject,
      html_body: htmlBody, merge_fields: fields,
      config: isProposal ? proposalCfg : null,
      publication_id: form.publicationIds.length === 1 ? form.publicationIds[0] : null,
      publication_ids: form.publicationIds.length > 0 ? form.publicationIds : null,
      include_letterhead: true,
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
      <TB tabs={CATEGORIES.map(c => c.label)} active={CATEGORIES.find(c => c.value === category)?.label}
        onChange={v => { const cat = CATEGORIES.find(c => c.label === v); if (cat) setCategory(cat.value); }} />
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

      {/* RIGHT: Editor or Config */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {editId || form.name ? <>
          {/* Template name + subject */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Inp label="Template Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <div>
              <div style={{ fontSize: 10, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Publications</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(pubs || []).map(p => {
                  const sel = form.publicationIds.includes(p.id);
                  return <button key={p.id} onClick={() => setForm(f => ({ ...f, publicationIds: sel ? f.publicationIds.filter(x => x !== p.id) : [...f.publicationIds, p.id] }))} style={{ padding: "4px 10px", borderRadius: Ri, border: `1px solid ${sel ? Z.ac : Z.bd}`, background: sel ? Z.ac + "15" : Z.bg, cursor: "pointer", fontSize: FS.xs, fontWeight: sel ? FW.bold : FW.normal, color: sel ? Z.ac : Z.tm }}>{p.name}</button>;
                })}
                {form.publicationIds.length === 0 && <span style={{ fontSize: FS.xs, color: Z.td, padding: "4px 0" }}>All / Generic</span>}
              </div>
            </div>
          </div>

          {/* PROPOSAL CONFIG FORM — structured, not freeform */}
          {form.category === "proposal" ? <>
            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Header settings */}
              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Header</div>
                <div style={{ display: "flex", gap: 16 }}>
                  <label style={checkLbl}><input type="checkbox" checked={proposalCfg.showSalespersonContact} onChange={e => setPropCfg(c => ({ ...c, showSalespersonContact: e.target.checked }))} style={chk} /> Show salesperson contact</label>
                  <label style={checkLbl}><input type="checkbox" checked={proposalCfg.showClientContact} onChange={e => setPropCfg(c => ({ ...c, showClientContact: e.target.checked }))} style={chk} /> Show client contact</label>
                </div>
              </GlassCard>

              {/* Introduction */}
              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Default Introduction</div>
                <textarea value={proposalCfg.defaultIntro} onChange={e => setPropCfg(c => ({ ...c, defaultIntro: e.target.value }))}
                  rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                  placeholder="Default greeting paragraph — salesperson can override per proposal" />
                <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>Salesperson can customize this per proposal. Supports {"{{client_name}}"} merge field.</div>
              </GlassCard>

              {/* Line items table config */}
              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Line Items Table</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                  <label style={checkLbl}><input type="checkbox" checked={proposalCfg.groupByPublication} onChange={e => setPropCfg(c => ({ ...c, groupByPublication: e.target.checked }))} style={chk} /> Group by publication</label>
                  <label style={checkLbl}><input type="checkbox" checked={proposalCfg.showSubtotals} onChange={e => setPropCfg(c => ({ ...c, showSubtotals: e.target.checked }))} style={chk} /> Show subtotals per pub</label>
                  <label style={checkLbl}><input type="checkbox" checked={proposalCfg.showIssueDates} onChange={e => setPropCfg(c => ({ ...c, showIssueDates: e.target.checked }))} style={chk} /> Show issue dates</label>
                  <label style={checkLbl}><input type="checkbox" checked={proposalCfg.showAdSize} onChange={e => setPropCfg(c => ({ ...c, showAdSize: e.target.checked }))} style={chk} /> Show ad size</label>
                  <label style={checkLbl}><input type="checkbox" checked={proposalCfg.showIndividualRates} onChange={e => setPropCfg(c => ({ ...c, showIndividualRates: e.target.checked }))} style={chk} /> Show individual rates</label>
                </div>
              </GlassCard>

              {/* Payment schedule */}
              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Payment Schedule</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {[["per_issue", "Per issue publish date"], ["monthly", "Monthly installments"], ["lump_sum", "Lump sum upfront"]].map(([v, l]) => (
                    <button key={v} onClick={() => setPropCfg(c => ({ ...c, paymentTiming: v }))} style={{ padding: "6px 14px", borderRadius: Ri, border: `1px solid ${proposalCfg.paymentTiming === v ? Z.ac : Z.bd}`, background: proposalCfg.paymentTiming === v ? Z.ac + "15" : Z.bg, cursor: "pointer", fontSize: FS.xs, fontWeight: proposalCfg.paymentTiming === v ? FW.bold : FW.normal, color: proposalCfg.paymentTiming === v ? Z.ac : Z.tm }}>{l}</button>
                  ))}
                </div>
                <label style={checkLbl}><input type="checkbox" checked={proposalCfg.groupPaymentsByDate} onChange={e => setPropCfg(c => ({ ...c, groupPaymentsByDate: e.target.checked }))} style={chk} /> Combine same-day payments</label>
              </GlassCard>

              {/* Closing */}
              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Closing</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10 }}>
                  <Inp label="Sign Button Text" value={proposalCfg.signButtonText} onChange={e => setPropCfg(c => ({ ...c, signButtonText: e.target.value }))} />
                  <Inp label="Valid (days)" type="number" value={proposalCfg.validityDays} onChange={e => setPropCfg(c => ({ ...c, validityDays: Number(e.target.value) }))} />
                </div>
              </GlassCard>

              {/* Terms */}
              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Terms & Conditions</div>
                <textarea value={(proposalCfg.terms || []).join("\n")} onChange={e => setPropCfg(c => ({ ...c, terms: e.target.value.split("\n").filter(l => l.trim()) }))}
                  rows={6} style={{ width: "100%", padding: "10px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                  placeholder="One term per line..." />
              </GlassCard>
            </div>
          </> : <>
            {/* NON-PROPOSAL: TipTap editor */}
            <Inp label="Email Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Your renewal is coming up" />

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
              <div style={{ width: 1, height: 18, background: Z.bd, margin: "0 4px" }} />
              <TBtn icon="•" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet List" />
              <TBtn icon="1." active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered List" />
              <div style={{ width: 1, height: 18, background: Z.bd, margin: "0 4px" }} />
              <TBtn icon="🔗" onClick={() => { const url = prompt("URL:"); if (url) editor?.chain().focus().setLink({ href: url }).run(); }} title="Link" />
            </div>

            {/* Editor area */}
            <div style={{ flex: 1, border: `1px solid ${Z.bd}`, borderRadius: R, background: dk ? "#12141a" : "#fff", overflow: "auto", minHeight: 350 }}>
              <EditorContent editor={editor} />
            </div>
          </>}

          {/* Action bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6 }}>
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
          <Btn sm onClick={() => setCreateModal(true)}><Ic.plus size={13} /> New Template</Btn>
        </div>}
      </div>
    </div>

    {/* Preview modal */}
    <Modal open={previewModal} onClose={() => setPreviewModal(false)} title="Template Preview" width={720}>
      {form.category === "proposal" ? (
        <div style={{ background: "#fff", borderRadius: R, overflow: "auto", maxHeight: "70vh" }}>
          <div dangerouslySetInnerHTML={{ __html: generateProposalHtml({
            config: proposalCfg,
            proposal: { date: new Date().toISOString().slice(0, 10), total: 5596, lines: [
              { pubId: "PRP", pubName: "Paso Robles Press", adSize: "Full Page", issueLabel: "Apr 9, 2026", issueDate: "2026-04-09", price: 1399 },
              { pubId: "PRP", pubName: "Paso Robles Press", adSize: "Full Page", issueLabel: "Apr 23, 2026", issueDate: "2026-04-23", price: 1399 },
              { pubId: "PRP", pubName: "Paso Robles Press", adSize: "Full Page", issueLabel: "May 7, 2026", issueDate: "2026-05-07", price: 1399 },
              { pubId: "PRP", pubName: "Paso Robles Press", adSize: "Full Page", issueLabel: "May 21, 2026", issueDate: "2026-05-21", price: 1399 },
            ]},
            client: { name: "Sample Winery", contacts: [{ name: "Jane Smith", email: "jane@samplewinery.com" }] },
            salesperson: { name: "Dana McGraw", email: "dana@13stars.media", phone: "(805) 555-1234" },
            pubs: pubs || [],
            signLink: "#preview",
          }) }} />
        </div>
      ) : (
        <div style={{ padding: 20, background: "#fff", borderRadius: R, color: "#1a1a2e" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 4 }}>Subject: {form.subject || "(no subject)"}</div>
          <div dangerouslySetInnerHTML={{ __html: editor?.getHTML() || "" }} style={{ fontSize: 14, lineHeight: 1.6 }} />
        </div>
      )}
    </Modal>

    {/* New template modal */}
    <Modal open={createModal} onClose={() => setCreateModal(false)} title="New Template" width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="Template Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Standard Proposal" />
        <Sel label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} options={CATEGORIES.map(c => ({ value: c.value, label: c.label }))} />
        <Btn onClick={openCreate} disabled={!form.name.trim()}>Create & Edit</Btn>
      </div>
    </Modal>
  </div>;
};

export default memo(EmailTemplates);
