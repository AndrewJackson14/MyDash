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
import DOMPurify from "dompurify";
import TextAlign from "@tiptap/extension-text-align";
import { Z, DARK, COND, DISPLAY, R, Ri, FS, FW, ACCENT, INV } from "../lib/theme";
import { Ic, Btn, Inp, Sel, Modal, GlassCard, PageHeader, TB, TabRow, Pill, SB, glass } from "../components/ui";
import { supabase } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";
import { DEFAULT_PROPOSAL_CONFIG, generateProposalHtml } from "../lib/proposalTemplate";
import { generateMarketingHtml } from "../lib/marketingTemplate";
import { generateContractHtml } from "../lib/contractTemplate";
import { generateRenewalHtml } from "../lib/renewalTemplate";
import { generateInvoiceHtml } from "../lib/invoiceTemplate";
import { sendGmailEmail } from "../lib/gmail";

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
  const dialog = useDialog();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("proposal");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [previewModal, setPreviewModal] = useState(false);
  const [composeModal, setComposeModal] = useState(false);
  const [composeRecipients, setComposeRecipients] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeHeroUrl, setComposeHeroUrl] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeResult, setComposeResult] = useState(null);

  // Editor form
  const [form, setForm] = useState({ name: "", category: "proposal", subject: "", publicationIds: [], includeLetterhead: true });
  const [saving, setSaving] = useState(false);
  const [proposalCfg, setPropCfg] = useState({ ...DEFAULT_PROPOSAL_CONFIG });
  const DEFAULT_CONTRACT_CONFIG = {
    confirmationMessage: "Your advertising contract is confirmed",
    newClientNote: "Welcome to the 13 Stars Media Group family! We're excited to help your business reach our readers across the Central Coast.",
    returningClientNote: "Thank you for continuing to advertise with us. We value your partnership and look forward to another successful campaign.",
    legalDisclaimer: "",
    inheritProposalSettings: true,
  };
  const [contractCfg, setContractCfg] = useState({ ...DEFAULT_CONTRACT_CONFIG });
  const DEFAULT_RENEWAL_CONFIG = {
    firstTouchMessage: "Your subscription is expiring soon. Renew today to keep receiving your favorite local news without interruption.",
    secondTouchMessage: "We noticed your subscription is expiring soon and we haven't heard from you yet. We'd hate for you to miss out on the local stories that matter most.",
    thirdTouchMessage: "This is your final reminder — your subscription expires in just a few days. Act now to continue receiving your newspaper at home.",
    firstButtonText: "Renew Now",
    secondButtonText: "Renew Today",
    thirdButtonText: "Renew Before It's Too Late",
    subscriberPortalPath: "/subscribe",
    paymentInstructions: "By phone: (805) 237-6060\nBy mail: Send check to 13 Stars Media Group, P.O. Box 427, Paso Robles, CA 93447\nBy email: subscriptions@13stars.media",
  };
  const [renewalCfg, setRenewalCfg] = useState({ ...DEFAULT_RENEWAL_CONFIG });
  const DEFAULT_INVOICE_CONFIG = {
    paymentInstructions: "Mail check to: 13 Stars Media Group, P.O. Box 427, Paso Robles, CA 93447\nPhone: (805) 237-6060\nEmail: billing@13stars.media",
    firstReminderMessage: "This is a friendly reminder that your invoice is past due. Please remit payment at your earliest convenience.",
    secondReminderMessage: "This is a second notice regarding your outstanding balance. Please contact us if you need to discuss payment arrangements.",
    finalReminderMessage: "FINAL NOTICE: Your account is significantly past due. Immediate payment is required to avoid service interruption.",
    showPastDueBalance: true,
    billingContact: "billing@13stars.media",
  };
  const [invoiceCfg, setInvoiceCfg] = useState({ ...DEFAULT_INVOICE_CONFIG });

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
    } else if (t.category === "contract" && t.config) {
      setContractCfg({ ...DEFAULT_CONTRACT_CONFIG, ...t.config });
    } else if (t.category === "renewal" && t.config) {
      setRenewalCfg({ ...DEFAULT_RENEWAL_CONFIG, ...t.config });
    } else if (t.category === "invoice" && t.config) {
      setInvoiceCfg({ ...DEFAULT_INVOICE_CONFIG, ...t.config });
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
    const isContract = form.category === "contract";
    const isRenewal = form.category === "renewal";
    const isInvoice = form.category === "invoice";
    const isStructured = isProposal || isContract || isRenewal || isInvoice;
    const htmlBody = isStructured ? "" : (editor?.getHTML() || "");
    const fields = isStructured ? [] : (MERGE_FIELDS[form.category] || []).filter(f => htmlBody.includes(f.key) || form.subject.includes(f.key)).map(f => f.key);

    const record = {
      name: form.name, category: form.category,
      subject: isProposal ? "Proposal: {{proposal_name}} — {{client_name}}" : isContract ? "Contract Confirmed — {{client_name}}" : isRenewal ? "Your {{publication_name}} subscription" : isInvoice ? "Invoice {{invoice_number}} — 13 Stars Media Group" : form.subject,
      html_body: htmlBody, merge_fields: fields,
      config: isProposal ? proposalCfg : isContract ? contractCfg : isRenewal ? renewalCfg : isInvoice ? invoiceCfg : null,
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
    if (!await dialog.confirm("Delete this template?")) return;
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
                <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 8 }}>Payment timing is selected by the salesperson per proposal in the Proposal Builder.</div>
                <label style={checkLbl}><input type="checkbox" checked={proposalCfg.groupPaymentsByDate} onChange={e => setPropCfg(c => ({ ...c, groupPaymentsByDate: e.target.checked }))} style={chk} /> Combine same-day payments (when multiple issues share a date)</label>
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
          </> : form.category === "contract" ? <>
            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Confirmation Message</div>
                <textarea value={contractCfg.confirmationMessage} onChange={e => setContractCfg(c => ({ ...c, confirmationMessage: e.target.value }))}
                  rows={2} style={{ width: "100%", padding: "10px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                  placeholder="Your advertising contract is confirmed" />
                <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>Displayed prominently at the top of the contract email.</div>
              </GlassCard>

              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>New Client Welcome Note</div>
                <textarea value={contractCfg.newClientNote} onChange={e => setContractCfg(c => ({ ...c, newClientNote: e.target.value }))}
                  rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                  placeholder="Welcome message for first-time advertisers..." />
                <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>Shown only for clients who have never advertised with you before.</div>
              </GlassCard>

              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Returning Client Note</div>
                <textarea value={contractCfg.returningClientNote} onChange={e => setContractCfg(c => ({ ...c, returningClientNote: e.target.value }))}
                  rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                  placeholder="Thank you message for repeat advertisers..." />
                <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>Shown for clients who have advertised with you before.</div>
              </GlassCard>

              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Legal Disclaimer</div>
                <textarea value={contractCfg.legalDisclaimer} onChange={e => setContractCfg(c => ({ ...c, legalDisclaimer: e.target.value }))}
                  rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                  placeholder="Additional legal language (optional)..." />
                <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>Appended after the standard terms & conditions. Leave blank if not needed.</div>
              </GlassCard>

              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Inherited Settings</div>
                <div style={{ fontSize: FS.sm, color: Z.tm }}>Line items, payment schedule, ad deadline column, and terms & conditions are inherited from your default Proposal template. Changes to the proposal template automatically apply to contracts.</div>
              </GlassCard>
            </div>
          </> : form.category === "renewal" ? <>
            {/* RENEWAL CONFIG FORM */}
            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { key: "first", label: "First Touch (30 days)", msgKey: "firstTouchMessage", btnKey: "firstButtonText", color: "#1A365D" },
                { key: "second", label: "Second Touch (14 days)", msgKey: "secondTouchMessage", btnKey: "secondButtonText", color: "#D97706" },
                { key: "third", label: "Third Touch (7 days)", msgKey: "thirdTouchMessage", btnKey: "thirdButtonText", color: "#C53030" },
              ].map(touch => (
                <GlassCard key={touch.key} style={{ padding: "16px 20px", borderLeft: `3px solid ${touch.color}` }}>
                  <div style={secHead}>{touch.label}</div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Message</div>
                    <textarea value={renewalCfg[touch.msgKey]} onChange={e => setRenewalCfg(c => ({ ...c, [touch.msgKey]: e.target.value }))}
                      rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Button Text</div>
                    <Inp value={renewalCfg[touch.btnKey]} onChange={e => setRenewalCfg(c => ({ ...c, [touch.btnKey]: e.target.value }))} />
                  </div>
                </GlassCard>
              ))}

              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Subscriber Portal</div>
                <Inp label="Portal Path (appended to publication domain)" value={renewalCfg.subscriberPortalPath} onChange={e => setRenewalCfg(c => ({ ...c, subscriberPortalPath: e.target.value }))} placeholder="/subscribe" />
                <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>The "Renew" button links to https://{"{{publication_domain}}"}{renewalCfg.subscriberPortalPath}</div>
              </GlassCard>

              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Alternative Payment Instructions</div>
                <textarea value={renewalCfg.paymentInstructions} onChange={e => setRenewalCfg(c => ({ ...c, paymentInstructions: e.target.value }))}
                  rows={4} style={{ width: "100%", padding: "10px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                  placeholder="By phone: ...\nBy mail: ...\nBy email: ..." />
                <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>Shown below the renew button as alternative options.</div>
              </GlassCard>
            </div>
          </> : form.category === "invoice" ? <>
            {/* INVOICE CONFIG FORM */}
            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Payment Instructions</div>
                <textarea value={invoiceCfg.paymentInstructions} onChange={e => setInvoiceCfg(c => ({ ...c, paymentInstructions: e.target.value }))}
                  rows={4} style={{ width: "100%", padding: "10px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                  placeholder="Mail check to: ...\nPhone: ...\nEmail: ..." />
                <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>Shown at the bottom of every invoice email.</div>
              </GlassCard>

              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Billing Contact</div>
                <Inp value={invoiceCfg.billingContact} onChange={e => setInvoiceCfg(c => ({ ...c, billingContact: e.target.value }))} placeholder="billing@13stars.media" />
                <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>Shown in the invoice footer as the reply-to contact.</div>
              </GlassCard>

              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Overdue Reminder Messages</div>
                {[
                  { key: "firstReminderMessage", label: "First Reminder (7 days past due)", color: "#D97706" },
                  { key: "secondReminderMessage", label: "Second Reminder (14 days past due)", color: "#C53030" },
                  { key: "finalReminderMessage", label: "Final Notice (30 days past due)", color: "#C53030" },
                ].map(r => (
                  <div key={r.key} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: FW.bold, color: r.color, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{r.label}</div>
                    <textarea value={invoiceCfg[r.key]} onChange={e => setInvoiceCfg(c => ({ ...c, [r.key]: e.target.value }))}
                      rows={2} style={{ width: "100%", padding: "8px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                  </div>
                ))}
              </GlassCard>

              <GlassCard style={{ padding: "16px 20px" }}>
                <div style={secHead}>Display Options</div>
                <label style={checkLbl}><input type="checkbox" checked={invoiceCfg.showPastDueBalance} onChange={e => setInvoiceCfg(c => ({ ...c, showPastDueBalance: e.target.checked }))} style={chk} /> Show past due balance on invoices (carry-forward from previous unpaid invoices)</label>
              </GlassCard>
            </div>
          </> : <>
            {/* OTHER CATEGORIES: TipTap editor */}
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
              <TBtn icon="🔗" onClick={async () => { const url = await dialog.prompt("URL:"); if (url) editor?.chain().focus().setLink({ href: url }).run(); }} title="Link" />
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
              {editId && form.category !== "proposal" && <Btn sm v="secondary" onClick={() => { setComposeSubject(form.subject); setComposeRecipients(""); setComposeHeroUrl(""); setComposeResult(null); setComposeModal(true); }}>Compose & Send</Btn>}
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
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(generateProposalHtml({
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
          })) }} />
        </div>
      ) : form.category === "contract" ? (
        <div style={{ background: "#fff", borderRadius: R, overflow: "auto", maxHeight: "70vh" }}>
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(generateContractHtml({
            proposal: { date: new Date().toISOString().slice(0, 10), clientName: "Sample Winery", total: 5596, payTiming: "per_issue", lines: [
              { pubId: "PRP", pubName: "Paso Robles Press", adSize: "Full Page", issueLabel: "Apr 9, 2026", issueDate: "2026-04-09", adDeadline: "2026-04-04", price: 1399 },
              { pubId: "PRP", pubName: "Paso Robles Press", adSize: "Full Page", issueLabel: "Apr 23, 2026", issueDate: "2026-04-23", adDeadline: "2026-04-18", price: 1399 },
              { pubId: "PRP", pubName: "Paso Robles Press", adSize: "Full Page", issueLabel: "May 7, 2026", issueDate: "2026-05-07", adDeadline: "2026-05-02", price: 1399 },
              { pubId: "PRP", pubName: "Paso Robles Press", adSize: "Full Page", issueLabel: "May 21, 2026", issueDate: "2026-05-21", adDeadline: "2026-05-16", price: 1399 },
            ]},
            signature: { signerName: "Jane Smith", signerTitle: "Marketing Director", signedAt: new Date().toISOString() },
            salesperson: { name: "Dana McGraw", email: "dana@13stars.media", phone: "(805) 555-1234" },
            pubs: pubs || [],
            config: contractCfg,
          })) }} />
        </div>
      ) : form.category === "invoice" ? (
        <div style={{ background: "#fff", borderRadius: R, overflow: "auto", maxHeight: "70vh" }}>
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(generateInvoiceHtml({
            invoice: { invoiceNumber: "INV-01234", issueDate: new Date().toISOString().slice(0, 10), dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), total: 2798, balanceDue: 2798, lines: [
              { description: "Paso Robles Press Apr 9, 2026 — Full Page", amount: 1399 },
              { description: "Paso Robles Press Apr 23, 2026 — Full Page", amount: 1399 },
            ]},
            clientName: "Sample Winery",
            config: invoiceCfg,
          })) }} />
        </div>
      ) : form.category === "renewal" ? (
        <div style={{ background: "#fff", borderRadius: R, overflow: "auto", maxHeight: "70vh" }}>
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(generateRenewalHtml({
            subscriberName: "Jane Smith",
            publicationName: "Paso Robles Press",
            expiryDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
            renewalAmount: 59.99,
            renewLink: "https://pasoroblespress.com" + (renewalCfg.subscriberPortalPath || "/subscribe"),
            touch: "first",
            config: renewalCfg,
          })) }} />
        </div>
      ) : (
        <div style={{ padding: 20, background: "#fff", borderRadius: R, color: "#1a1a2e" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 4 }}>Subject: {form.subject || "(no subject)"}</div>
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(editor?.getHTML() || "") }} style={{ fontSize: 14, lineHeight: 1.6 }} />
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

    {/* Compose & Send modal */}
    <Modal open={composeModal} onClose={() => setComposeModal(false)} title="Compose & Send" width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="Recipients (comma-separated)" value={composeRecipients} onChange={e => setComposeRecipients(e.target.value)} placeholder="email@example.com, another@example.com" />
        <Inp label="Subject" value={composeSubject} onChange={e => setComposeSubject(e.target.value)} />
        {form.category === "marketing" && <Inp label="Hero Image URL" value={composeHeroUrl} onChange={e => setComposeHeroUrl(e.target.value)} placeholder="https://cdn.13stars.media/..." />}
        {composeResult && <div style={{ padding: "8px 12px", borderRadius: Ri, fontSize: FS.sm, background: composeResult.success ? Z.go + "10" : Z.da + "10", color: composeResult.success ? Z.go : Z.da }}>{composeResult.message || composeResult.error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setComposeModal(false)}>Cancel</Btn>
          <Btn disabled={!composeRecipients.trim() || !composeSubject.trim() || composeSending} onClick={async () => {
            setComposeSending(true); setComposeResult(null);
            const recipients = composeRecipients.split(",").map(e => e.trim()).filter(e => e.includes("@"));
            const bodyContent = editor?.getHTML() || "";
            let htmlBody;
            if (form.category === "marketing") {
              htmlBody = generateMarketingHtml({
                headline: composeSubject,
                heroImageUrl: composeHeroUrl,
                bodyHtml: bodyContent,
                ctaText: "",
                ctaUrl: "",
                publicationName: form.publicationIds?.length === 1 ? (pubs || []).find(p => p.id === form.publicationIds[0])?.name : "13 Stars Media Group",
                unsubscribeUrl: "#unsubscribe",
              });
            } else {
              // Generic: wrap TipTap content in email-safe layout
              htmlBody = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center">
                <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff">
                <tr><td style="background:#1A365D;height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
                <tr><td style="padding:32px 40px 0;text-align:center"><div style="font-family:Georgia,serif;font-size:24px;color:#1A365D">13 Stars Media Group</div></td></tr>
                <tr><td style="padding:20px 24px 0"><table width="100%"><tr><td style="border-bottom:1.5px solid #C53030;height:1px;font-size:0">&nbsp;</td></tr></table></td></tr>
                <tr><td style="padding:24px 40px"><div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#111;line-height:1.7">${bodyContent}</div></td></tr>
                <tr><td style="padding:24px 40px 32px"><table width="100%"><tr><td style="border-bottom:1px solid #E5E7EB;height:1px;font-size:0">&nbsp;</td></tr></table>
                <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#9CA3AF;text-align:center;margin-top:16px">13 Stars Media Group &middot; 805-237-6060</div></td></tr>
                </table></td></tr></table>`;
            }
            try {
              await sendGmailEmail({ teamMemberId: null, to: recipients, subject: composeSubject, htmlBody, mode: "send" });
              setComposeResult({ success: true, message: `Sent to ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""}` });
            } catch (err) {
              setComposeResult({ error: err.message || "Send failed" });
            }
            setComposeSending(false);
          }}>{composeSending ? "Sending..." : "Send Now"}</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};

export default memo(EmailTemplates);
