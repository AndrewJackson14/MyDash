import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { Z, COND, DISPLAY, FS, FW, Ri, R, INV } from "../lib/theme";
import { Ic, Btn, FileBtn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, FilterBar , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, ListCard, ListDivider, ListGrid, EntityLink } from "../components/ui";
import { useNav } from "../hooks/useNav";
import { fmtDate, fmtCurrency } from "../lib/formatters";
import { uploadMedia } from "../lib/media";
import { supabase } from "../lib/supabase";
import AssetPanel from "../components/AssetPanel";
import EntityThread from "../components/EntityThread";
import { lazy, Suspense } from "react";
// Affidavit workspace + delivery panel — lazy-loaded so the module's
// initial bundle stays light. They drag in html2canvas/pdf-lib only
// when the user actually opens an affidavit.
const AffidavitWorkspace = lazy(() => import("../components/legal/AffidavitWorkspace"));
const DeliveryPanel = lazy(() => import("../components/legal/DeliveryPanel"));

// ─── Constants ──────────────────────────────────────────────
// Publications that qualify as "newspaper of general circulation"
// and can publish legal notices. Map from pub_id → 3-letter code
// used in notice numbers (TMT26001, PRP26001, ATN26001).
const LEGAL_PUB_CODES = {
  "pub-the-malibu-times":  "TMT",
  "pub-paso-robles-press": "PRP",
  "pub-atascadero-news":   "ATN",
};
// Siblings ALWAYS run legals together — picking Paso Robles Press
// auto-runs in Atascadero News and vice-versa. Two separate notice
// numbers are allocated (one per pub).
const LEGAL_SIBLING_GROUPS = [
  ["pub-paso-robles-press", "pub-atascadero-news"],
];
const siblingsFor = (pubId) => {
  const group = LEGAL_SIBLING_GROUPS.find(g => g.includes(pubId));
  return group ? group.filter(p => p !== pubId) : [];
};

const RATE_PLANS = [
  { value: "per_char",          label: "Per Character ($/char)" },
  { value: "probate_flat",      label: "Probate (flat)" },
  { value: "name_change_flat",  label: "Name Change (flat)" },
];

// Strip HTML tags + collapse whitespace for billable-character counting.
// Legal notices are billed on body text only — HTML formatting doesn't
// pad the count.
const htmlToPlainText = (html) => {
  if (!html) return "";
  return String(html)
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
};

// Resolve the effective rate for a (publication, rate plan) pair from
// the pub row. Falls back to the statutory default for per_char if the
// pub has never been configured.
const resolveRate = (pub, plan) => {
  if (!pub) return { amount: 0, unit: "" };
  if (plan === "per_char") return { amount: Number(pub.legalRatePerChar ?? pub.legal_rate_per_char ?? 0.055), unit: "char" };
  if (plan === "probate_flat")     return { amount: Number(pub.legalProbateFlat     ?? pub.legal_probate_flat     ?? 0), unit: "flat" };
  if (plan === "name_change_flat") return { amount: Number(pub.legalNameChangeFlat  ?? pub.legal_name_change_flat  ?? 0), unit: "flat" };
  if (plan === "fbn_flat")         return { amount: Number(pub.legalFbnFlat         ?? pub.legal_fbn_flat         ?? 0), unit: "flat" };
  return { amount: 0, unit: "" };
};

// ─── Rich-text body editor (minimal toolbar: B/I/U + lists) ──────────
function NoticeBodyEditor({ valueHtml, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, horizontalRule: false, blockquote: false }),
      Underline,
    ],
    content: valueHtml || "",
    // ProseMirror draws a default browser focus outline on the
    // contenteditable. Kill it + make the editable fill its wrapper
    // so clicks anywhere in the scroll box focus + place the caret.
    editorProps: {
      attributes: {
        class: "notice-body-tiptap",
        style: "outline: none; min-height: 160px; width: 100%;",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  // Keep external value changes in sync (e.g. form reset).
  useEffect(() => {
    if (!editor) return;
    if ((editor.getHTML() || "") !== (valueHtml || "")) editor.commands.setContent(valueHtml || "", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueHtml, editor]);
  if (!editor) return null;
  const TBtn = ({ onClick, active, children, title }) => (
    <button type="button" onClick={onClick} title={title} style={{
      padding: "4px 8px", borderRadius: Ri, border: "none",
      background: active ? Z.ac + "20" : "transparent",
      color: active ? Z.ac : Z.tm, cursor: "pointer",
      fontSize: 13, fontWeight: active ? 700 : 500, minWidth: 26, height: 26,
    }}>{children}</button>
  );
  return (
    <div style={{ border: `1px solid ${Z.bd}`, borderRadius: Ri, background: Z.sf, overflow: "hidden" }}>
      {/* Scoped CSS — lists flush to the left margin (default ul/ol
          padding-left was 40px, pushing bullets past the text start)
          and a belt-and-suspenders outline-none on the editable. */}
      <style>{`
        .notice-body-tiptap { outline: none !important; }
        .notice-body-tiptap p { margin: 0 0 6px; }
        .notice-body-tiptap ul, .notice-body-tiptap ol { padding-left: 18px; margin: 0 0 6px; }
        .notice-body-tiptap li { margin: 0; }
        .notice-body-tiptap li > p { margin: 0; }
      `}</style>
      <div style={{ display: "flex", gap: 2, padding: "4px 6px", borderBottom: `1px solid ${Z.bd}`, background: Z.sa }}>
        <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><strong>B</strong></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><em>I</em></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><u>U</u></TBtn>
        <div style={{ width: 1, background: Z.bd, margin: "0 4px" }} />
        <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()}  active={editor.isActive("bulletList")}  title="Bullets">• List</TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered">1. List</TBtn>
      </div>
      {/* Click anywhere in this scroll box → focus the editor so the
          caret lands where the user clicked (empty region included). */}
      <div
        onClick={() => editor.chain().focus().run()}
        style={{ padding: "10px 12px", minHeight: 180, maxHeight: 360, overflowY: "auto", fontSize: 13, color: Z.tx, lineHeight: 1.55, cursor: "text" }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ─── Live client search (contains-match, not prefix) ─────────────────
function ClientSearch({ clients, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = value ? (clients || []).find(c => c.id === value) : null;
  // contains-match on name; case-insensitive. Caps at 12 matches to
  // keep the dropdown reasonable. Sorts by name for predictability.
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return (clients || [])
      .filter(c => (c.name || "").toLowerCase().includes(q))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .slice(0, 12);
  }, [clients, query]);
  if (selected) {
    return (
      <div>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Client</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: Z.sa, borderRadius: Ri, border: `1px solid ${Z.bd}` }}>
          <span style={{ flex: 1, fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{selected.name}</span>
          <button type="button" onClick={() => { onChange(""); setQuery(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 12 }}>Change</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: "relative" }}>
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Client</div>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Type to search clients…"
        style={{ width: "100%", padding: "8px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontSize: FS.md, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
      />
      {open && query.trim() && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri, boxShadow: "0 12px 32px rgba(0,0,0,0.18)", zIndex: 50, maxHeight: 280, overflowY: "auto" }}>
          {matches.length === 0 && (
            <div style={{ padding: "12px 14px", fontSize: 12, color: Z.tm, fontStyle: "italic" }}>
              No matches — the client will be created from the notice form.
            </div>
          )}
          {matches.map(c => (
            <div key={c.id} onMouseDown={(e) => { e.preventDefault(); onChange(c.id); setQuery(""); setOpen(false); }}
              style={{ padding: "8px 12px", cursor: "pointer", borderBottom: `1px solid ${Z.bd}`, fontSize: 13 }}
              onMouseEnter={e => e.currentTarget.style.background = Z.sa}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ fontWeight: FW.bold, color: Z.tx }}>{c.name}</div>
              {c.city && <div style={{ fontSize: 10, color: Z.tm }}>{c.city}{c.state ? ", " + c.state : ""}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Legacy constant kept for historical reads on already-saved rows ─
const NOTICE_TYPES = [
  { value: "fictitious_business", label: "Fictitious Business Name" },
  { value: "name_change", label: "Name Change" },
  { value: "probate", label: "Probate" },
  { value: "trustee_sale", label: "Trustee Sale" },
  { value: "government", label: "Government Notice" },
  { value: "other", label: "Other" },
];
// Pipeline now ends at "delivered" — the affidavit is sent and the
// intake invoice carries a delivery note. Legacy "billed" stays in
// the enum for old rows but is no longer offered as a forward step.
const NOTICE_STATUSES = [
  "received", "proofing", "approved", "placed", "published",
  "affidavit_draft", "affidavit_ready", "delivered",
];
const STATUS_LABELS = {
  received: "Received", proofing: "Proofing", approved: "Approved",
  placed: "Placed", published: "Published",
  affidavit_draft: "Draft Affidavit",
  affidavit_ready: "Ready to Send",
  delivered: "Delivered",
  billed: "Billed",     // legacy; rendered if a row is still on this status
};
const STATUS_COLORS = {
  received: { bg: Z.sa, text: Z.tm },
  proofing: { bg: Z.sa, text: Z.tx },
  approved: { bg: Z.sa, text: Z.tx },
  placed: { bg: Z.sa, text: Z.tx },
  published: { bg: Z.sa, text: Z.tx },
  affidavit_draft: { bg: Z.sa, text: Z.wa },
  affidavit_ready: { bg: Z.sa, text: Z.ac },
  delivered: { bg: Z.su + "20", text: Z.su },
  billed: { bg: Z.sa, text: Z.td },
};


const today = new Date().toISOString().slice(0, 10);

const NoticeBadge = ({ status }) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS.received;
  return <span style={{ display: "inline-flex", padding: "3px 10px", borderRadius: Ri, fontSize: FS.xs, fontWeight: FW.bold, background: c.bg, color: c.text, whiteSpace: "nowrap" }}>{STATUS_LABELS[status] || status}</span>;
};

// Step indicator for workflow
const StepBar = ({ current }) => {
  const idx = NOTICE_STATUSES.indexOf(current);
  return <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
    {NOTICE_STATUSES.map((s, i) => {
      const done = i <= idx;
      const active = i === idx;
      return <div key={s} style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <div style={{
          width: active ? 22 : 16, height: active ? 22 : 16, borderRadius: R,
          background: done ? (STATUS_COLORS[s]?.text || Z.su) : Z.sa,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: FW.black, color: done ? INV.light : Z.td,
          transition: "all 0.2s",
          border: active ? `2px solid ${STATUS_COLORS[s]?.text || Z.su}` : "2px solid transparent",
        }}>{done ? "✓" : i + 1}</div>
        {i < NOTICE_STATUSES.length - 1 && <div style={{ width: 20, height: 2, background: done && i < idx ? Z.su : Z.bd }} />}
      </div>;
    })}
  </div>;
};

// ─── Module ─────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────
// Helpers + sub-views for the Schedule + This-Issue tabs.
// Spec §6.4 / §6.5 — replace Cami's .numbers file + APRIL LEGALS.pages.
// ────────────────────────────────────────────────────────────

// Derive a human-readable Legal Type from the notice title. Cami's
// type taxonomy is wider than the kind/rate_plan enum can express, so
// this regex mapper handles the 20+ variants she actually files.
function deriveLegalType(notice) {
  const t = (notice.title || "").toLowerCase();
  if (/fictitious business name|\bfbn\b/.test(t)) return "FBN";
  if (/abandonment/.test(t)) return "ABANDONMENT OF FBN";
  if (/order to show cause|name change/.test(t)) return "NAME CHANGE";
  if (/trustee.*sale|notice of sale|t\.s\.|servicelink/.test(t)) return "TRUSTEE SALE";
  if (/petition.*probate|probate/.test(t)) return "PROBATE";
  if (/summons/.test(t)) return "SUMMONS";
  if (/public hearing/.test(t)) return "PUBLIC HEARING";
  if (/city of malibu/.test(t)) return "CITY OF MALIBU";
  if (/lien sale/.test(t)) return "LIEN SALE";
  if (/storage|self-storage|mini-storage/.test(t)) return "STORAGE LIEN";
  if (/bid|invitation to bid|rfp|request for proposal/.test(t)) return "BID / RFP";
  if (/ordinance/.test(t)) return "ORDINANCE";
  if (/election/.test(t)) return "ELECTION";
  if (/daily journal/.test(t)) return "DAILY JOURNAL";
  return (notice.kind || notice.noticeType || "OTHER").toUpperCase().replace(/_/g, " ");
}

function pubGroupOf(pubId, pubs) {
  const p = (pubs || []).find(x => x.id === pubId);
  return p?.legal_pub_group || p?.legalPubGroup || null;
}

function ScheduleView({ notices, pubs }) {
  const [groupFilter, setGroupFilter] = useState("all"); // all | prp_atn | malibu

  const rows = useMemo(() => {
    const list = notices
      .filter(n => (n.kind || "legal_notice") !== "fbn")
      .filter(n => {
        if (groupFilter === "all") return true;
        return pubGroupOf(n.publicationId, pubs) === groupFilter;
      })
      .map(n => {
        const dates = (n.run_dates || n.runDates || []).filter(Boolean).slice().sort();
        return {
          id: n.id,
          legalType: deriveLegalType(n),
          fileNumber: n.file_number || n.fileNumber || "",
          name: n.title || n.organization || n.contactName || "",
          startDate: dates[0] || "",
          endDate: dates[dates.length - 1] || dates[0] || "",
          legalNumber: n.notice_number || n.noticeNumber || "",
          delivered: n.status === "delivered" || n.affidavit_status === "delivered" || n.affidavitStatus === "delivered",
          group: pubGroupOf(n.publicationId, pubs) || "—",
        };
      })
      .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
    return list;
  }, [notices, pubs, groupFilter]);

  // Group by start-date week (Sun-anchored) for the visual separator
  // rows that match Cami's spreadsheet layout.
  const weekOf = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso + "T12:00:00");
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  };

  const exportCsv = () => {
    const header = ["Legal Type", "FILE #", "Name", "Start Date", "End Date", "Legal#", "Delivered"];
    const lines = [header.join(",")];
    rows.forEach(r => {
      const cells = [r.legalType, r.fileNumber, r.name, r.startDate, r.endDate, r.legalNumber, r.delivered ? "Y" : ""];
      lines.push(cells.map(csvCell).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `legal-schedule-${groupFilter}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  let lastWeek = null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {[
          { k: "all", l: "All" },
          { k: "prp_atn", l: "PRP / ATN" },
          { k: "malibu", l: "Malibu" },
        ].map(opt => (
          <button key={opt.k} onClick={() => setGroupFilter(opt.k)} style={{
            padding: "5px 12px", borderRadius: 14,
            border: `1px solid ${groupFilter === opt.k ? Z.ac : Z.bd}`,
            background: groupFilter === opt.k ? Z.ac + "15" : "transparent",
            color: groupFilter === opt.k ? Z.ac : Z.tx,
            cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: COND,
          }}>{opt.l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: Z.tm, fontFamily: COND }}>{rows.length} notice{rows.length === 1 ? "" : "s"}</span>
        <Btn sm v="secondary" onClick={exportCsv}>Export CSV</Btn>
      </div>
      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: Z.sa, borderBottom: `1px solid ${Z.bd}` }}>
              {["Legal Type", "FILE #", "Name", "Start Date", "End Date", "Legal#", "✓"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: Z.tm, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: COND }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: Z.td }}>No notices match this filter.</td></tr>
            )}
            {rows.map((r, i) => {
              const wk = weekOf(r.startDate);
              const sep = wk !== lastWeek;
              lastWeek = wk;
              return (
                <Fragment key={r.id}>
                  {sep && i > 0 && (
                    <tr><td colSpan={7} style={{ padding: 0 }}><div style={{ height: 6, background: Z.bg }} /></td></tr>
                  )}
                  <tr style={{ borderBottom: `1px solid ${Z.bd}` }}>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{r.legalType}</td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap", color: Z.tm }}>{r.fileNumber}</td>
                    <td style={{ padding: "6px 10px", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{r.startDate}</td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{r.endDate}</td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap", fontWeight: 700 }}>{r.legalNumber}</td>
                    <td style={{ padding: "6px 10px", color: r.delivered ? Z.su : Z.td }}>{r.delivered ? "✓" : ""}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}

function csvCell(v) {
  const s = String(v == null ? "" : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function ThisIssueView({ notices, pubs, issues }) {
  const newspapers = (pubs || []).filter(p => LEGAL_PUB_CODES[p.id]);
  const [pubId, setPubId] = useState(newspapers[0]?.id || "");
  const pubIssues = useMemo(() => (issues || []).filter(i => i.pubId === pubId).sort((a, b) => a.date.localeCompare(b.date)), [issues, pubId]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = pubIssues.find(i => i.date >= today) || pubIssues[pubIssues.length - 1];
  const [issueId, setIssueId] = useState(upcoming?.id || "");

  useEffect(() => {
    if (!pubIssues.length) { setIssueId(""); return; }
    const has = pubIssues.find(i => i.id === issueId);
    if (!has) setIssueId((pubIssues.find(i => i.date >= today) || pubIssues[pubIssues.length - 1])?.id || "");
  }, [pubIssues, issueId, today]);

  const issue = pubIssues.find(i => i.id === issueId);
  const matched = useMemo(() => {
    if (!issue) return [];
    return notices
      .filter(n => n.publicationId === pubId)
      .filter(n => (n.run_dates || n.runDates || []).includes(issue.date))
      .sort((a, b) => String(a.notice_number || "").localeCompare(String(b.notice_number || ""), undefined, { numeric: true }));
  }, [notices, pubId, issue]);

  const copyAll = async () => {
    const text = matched.map(n => `${n.title || ""}\n\n${htmlToPlainText(n.body_html || n.bodyHtml || "")}\n\nLEGAL ${n.notice_number || ""}`).join("\n\n———\n\n");
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Sel value={pubId} onChange={e => setPubId(e.target.value)} options={newspapers.map(p => ({ value: p.id, label: p.name }))} style={{ minWidth: 200 }} />
        <Sel value={issueId} onChange={e => setIssueId(e.target.value)} options={pubIssues.map(i => ({ value: i.id, label: `${i.label} — ${i.date}` }))} style={{ minWidth: 220 }} disabled={!pubIssues.length} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: Z.tm, fontFamily: COND }}>{matched.length} notice{matched.length === 1 ? "" : "s"}</span>
        <Btn sm v="secondary" onClick={copyAll} disabled={!matched.length}>Copy All</Btn>
      </div>
      {!matched.length ? (
        <GlassCard style={{ padding: 24, textAlign: "center", color: Z.td }}>
          {issue ? "No notices run in this issue." : "Select a publication + issue."}
        </GlassCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {matched.map(n => (
            <GlassCard key={n.id} style={{ padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: Z.ac, fontFamily: COND, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {deriveLegalType(n)} · {n.notice_number || ""}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: Z.tx, marginTop: 4 }}>{n.title}</div>
              <div style={{ fontSize: 12, color: Z.tx, lineHeight: 1.5, marginTop: 8, whiteSpace: "pre-wrap" }}>
                {htmlToPlainText(n.body_html || n.bodyHtml || "")}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: Z.tm, marginTop: 10, fontFamily: COND }}>
                LEGAL {n.notice_number || ""}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

const LegalNotices = ({ legalNotices, setLegalNotices, legalNoticeIssues, setLegalNoticeIssues, pubs, issues, team, bus, clients, insertClient, insertInvoice, insertLegalNotice, currentUser, isActive, onNavigate }) => {
  const nav = useNav(onNavigate);
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Legal Notices" }], title: "Legal Notices" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  const [tab, setTab] = useState("Active");
  const [sr, setSr] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [noticeModal, setNoticeModal] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [editId, setEditId] = useState(null);
  // Pending scan attachment(s) to be uploaded & tagged once the notice is saved
  const [pendingScans, setPendingScans] = useState([]);
  // Affidavit workflow surfaces — IDs only, full notice + publication
  // resolved by lookup. Workspace is a full-page takeover; Delivery
  // panel is a modal that floats over the list.
  const [affidavitNoticeId, setAffidavitNoticeId] = useState(null);
  const [deliveryNoticeId, setDeliveryNoticeId] = useState(null);
  // Editions cache for the workspace's Page Source pane. Loaded on
  // demand when the workspace opens — only need this publication's
  // recent editions, not the global catalog.
  const [editionsCache, setEditionsCache] = useState([]);
  useEffect(() => {
    if (!affidavitNoticeId) return;
    const notice = (legalNotices || []).find(n => n.id === affidavitNoticeId);
    if (!notice?.publicationId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("editions")
        .select("id, publication_id, slug, page_count, page_images_base_url, page_image_format, publish_date")
        .eq("publication_id", notice.publicationId)
        .order("publish_date", { ascending: false })
        .limit(60);
      if (!cancelled) setEditionsCache(data || []);
    })();
    return () => { cancelled = true; };
  }, [affidavitNoticeId, legalNotices]);

  // Generate All queue — { ids[], index } when active, null otherwise.
  // No DB row backs the queue; on Exit / page change the queue clears
  // and individual notice statuses are the only persisted state.
  const [queue, setQueue] = useState(null);
  const queueCurrentId = queue ? queue.ids[queue.index] : null;
  const startQueue = (notices) => {
    // Order: oldest run_date first, then by notice_number ascending.
    const eligible = notices.filter(n => ["published", "affidavit_draft"].includes(n.status));
    if (!eligible.length) return;
    const sorted = [...eligible].sort((a, b) => {
      const ad = (a.run_dates || a.runDates || [])[0] || "";
      const bd = (b.run_dates || b.runDates || [])[0] || "";
      if (ad !== bd) return ad.localeCompare(bd);
      return String(a.notice_number || "").localeCompare(String(b.notice_number || ""), undefined, { numeric: true });
    });
    const ids = sorted.map(n => n.id);
    setQueue({ ids, index: 0 });
    setAffidavitNoticeId(ids[0]);
  };
  const queueAdvance = () => {
    if (!queue) return;
    if (queue.index + 1 >= queue.ids.length) { setQueue(null); setAffidavitNoticeId(null); setDeliveryNoticeId(null); return; }
    setQueue({ ...queue, index: queue.index + 1 });
    setDeliveryNoticeId(null);
    setAffidavitNoticeId(queue.ids[queue.index + 1]);
  };
  const queueBack = () => {
    if (!queue || queue.index <= 0) return;
    setQueue({ ...queue, index: queue.index - 1 });
    setDeliveryNoticeId(null);
    setAffidavitNoticeId(queue.ids[queue.index - 1]);
  };
  const queueExit = () => { setQueue(null); setAffidavitNoticeId(null); setDeliveryNoticeId(null); };

  // Action handler: routes a row to the right next surface based on
  // its current status. Used by the row-level affidavit button + the
  // queue.
  const openNextAffidavitAction = (notice) => {
    const status = notice.status || notice.affidavitStatus || "";
    if (status === "delivered") {
      // View-only — open PDF.
      if (notice.affidavit_pdf_url || notice.affidavitPdfUrl) {
        window.open(notice.affidavit_pdf_url || notice.affidavitPdfUrl, "_blank");
      }
      return;
    }
    if (status === "affidavit_ready") {
      setDeliveryNoticeId(notice.id);
      return;
    }
    // published / affidavit_draft → open the workspace.
    setAffidavitNoticeId(notice.id);
  };

  // Listing excludes FBNs — they're created + managed from ClientProfile.
  const all = (legalNotices || []).filter(n => (n.kind || "legal_notice") !== "fbn");
  const allIssueLinks = legalNoticeIssues || [];
  // Only pubs with a legal code + general-circulation status can publish.
  const newspapers = pubs.filter(p => LEGAL_PUB_CODES[p.id]);

  const pn = (pid) => pubs.find(p => p.id === pid)?.name || "";
  const tn = (tid) => team?.find(t => t.id === tid)?.name || "";

  // ─── Form ───────────────────────────────────────────────
  // New shape: title + rich-text body, run_dates array, per-pub rate
  // plan. Legacy fields retained as empty defaults for back-compat on
  // save, but the UI no longer surfaces contact/org/email/phone.
  const blank = {
    clientId: "",
    title: "",
    kind: "legal_notice",
    status: "received",
    publicationId: newspapers[0]?.id || "",
    ratePlan: "per_char",
    ratePerChar: 0.055,
    flatRate: 0,
    runDates: [""],
    issuesRequested: 1,           // derived from runDates.length, but stored for legacy reads
    bodyHtml: "",
    content: "",                  // legacy plain-text for bill-line description
    totalAmount: 0,
    notes: "",
    noticeNumber: null,
  };
  const [form, setForm] = useState(blank);

  // Rate × characters × runs (per_char), or flatRate × runs (flat plans).
  // Character count comes from HTML-stripped body so formatting markup
  // doesn't inflate the bill.
  const calcTotal = (f) => {
    const runs = Math.max(1, (f.runDates || []).filter(Boolean).length || f.issuesRequested || 1);
    if (f.ratePlan === "per_char") {
      const chars = htmlToPlainText(f.bodyHtml || f.content || "").length;
      return Math.round(Number(f.ratePerChar || 0) * chars * runs * 100) / 100;
    }
    return Math.round(Number(f.flatRate || 0) * runs * 100) / 100;
  };

  const updateForm = (updates) => {
    setForm(f => {
      const next = { ...f, ...updates };
      next.totalAmount = calcTotal(next);
      return next;
    });
  };

  // Just stores the selected client id; contact fields are gone.
  const pickClient = (clientId) => updateForm({ clientId: clientId || "" });

  // Resolve the effective pricing for (publication, plan) and push the
  // values into the form whenever either changes — so the rate field
  // auto-populates with the configured per-pub flat or per-char rate.
  useEffect(() => {
    const pub = (pubs || []).find(p => p.id === form.publicationId);
    const { amount, unit } = resolveRate(pub, form.ratePlan);
    if (unit === "char") updateForm({ ratePerChar: amount });
    else                 updateForm({ flatRate: amount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.publicationId, form.ratePlan]);

  // Keep runDates array length in sync with issuesRequested — if the
  // user bumps it from 1 → 3, two blank date slots appear.
  useEffect(() => {
    setForm(f => {
      const target = Math.max(1, Number(f.issuesRequested) || 1);
      if ((f.runDates || []).length === target) return f;
      const next = [...(f.runDates || [])];
      while (next.length < target) next.push("");
      next.length = target;
      return { ...f, runDates: next };
    });
  }, [form.issuesRequested]);

  // ─── Stats ──────────────────────────────────────────────
  const active = all.filter(n => !["published", "billed"].includes(n.status));
  const pendingProof = all.filter(n => n.status === "proofing").length;
  const awaitingPlacement = all.filter(n => n.status === "approved").length;
  const revenueThisMonth = all.filter(n => n.createdAt?.startsWith(today.slice(0, 7))).reduce((s, n) => s + (n.totalAmount || 0), 0);
  const unbilledAmount = all.filter(n => n.status === "published").reduce((s, n) => s + (n.totalAmount || 0), 0);

  // ─── CRUD ───────────────────────────────────────────────
  const openNew = () => {
    setEditId(null);
    setForm({ ...blank });
    setNoticeModal(true);
  };

  const openEdit = (notice) => {
    setEditId(notice.id);
    setForm({ ...notice });
    setNoticeModal(true);
  };

  const saveNotice = async () => {
    // New required fields: client + title + body + publication + at
    // least one run date. Contact fields are gone.
    const hasBody = (htmlToPlainText(form.bodyHtml) || form.content || "").trim().length > 0;
    const runDates = (form.runDates || []).filter(Boolean);
    if (!form.clientId || !form.title?.trim() || !hasBody || !form.publicationId || runDates.length === 0) return;

    const total = calcTotal({ ...form, runDates });
    const nowIso = new Date().toISOString();

    // Allocate one notice number from the shared sequence (per migration
    // 106b). PRP+ATN share 'prp_atn' → "CM <N>"; TMT is 'malibu' → "MALIBU
    // <N>". Sibling-pub allocation is skipped now that PRP+ATN are one
    // sequence — the single CM number IS the shared identifier.
    let noticeNumber = form.noticeNumber || null;
    let siblingNumbers = {};
    if (!editId) {
      const year = new Date().getFullYear();
      try {
        const { data } = await supabase.rpc("next_legal_notice_number_v2", { p_pub_id: form.publicationId, p_year: year });
        if (data != null) noticeNumber = String(data);
      } catch (err) { console.error("notice_number allocation failed:", err); }
    }

    // Append run-date lines + pub codes to the printed body. Pure-text
    // block appended to the HTML as a <div> so rich-text preserves it.
    const allNumbers = [noticeNumber, ...Object.values(siblingNumbers)].filter(Boolean);
    const runDateLines = runDates
      .map(d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
    const appendBlock = noticeNumber ? (
      `<hr /><div style="font-family: monospace; font-size: 11px; color: #525e72; margin-top: 12px;">` +
      `<div>Notice ID: ${allNumbers.join(" / ")}</div>` +
      runDateLines.map(l => `<div>Run date: ${l}</div>`).join("") +
      `</div>`
    ) : "";
    const finalHtml = (form.bodyHtml || "") + (editId ? "" : appendBlock);
    const finalText = htmlToPlainText(finalHtml);

    const noticeRow = {
      ...form,
      noticeNumber,
      runDates,
      issuesRequested: runDates.length,
      bodyHtml: finalHtml,
      content: finalText,
      totalAmount: total,
      clientId: form.clientId,
      updatedAt: nowIso,
    };

    if (editId) {
      setLegalNotices(prev => (prev || []).map(n => n.id === editId ? { ...n, ...noticeRow } : n));
    } else {
      // Insert via the app-data helper so we get a real DB-generated
      // UUID back — critical for downstream features (EntityThread,
      // ad_project FKs, etc.) that reject non-UUID string ids.
      let newNotice = null;
      if (insertLegalNotice) {
        try { newNotice = await insertLegalNotice({ ...noticeRow, createdAt: nowIso }); } catch (err) { console.error("insertLegalNotice threw:", err); }
      }
      if (!newNotice) newNotice = { ...noticeRow, id: "ln-" + Date.now(), createdAt: nowIso };
      setLegalNotices(prev => [...(prev || []), newNotice]);

      // Upload any attached scan files and tag them to this legal notice.
      if (pendingScans.length > 0) {
        for (const f of pendingScans) {
          try {
            await uploadMedia(f, {
              category: "legal_scan",
              legalNoticeId: newNotice.id,
              publicationId: form.publicationId || null,
              clientId: form.clientId,
              uploadedBy: currentUser?.id || null,
              caption: `Legal Notice — ${form.title || noticeNumber || ""}`,
            });
          } catch (err) { console.error("Legal scan upload failed:", err); }
        }
        setPendingScans([]);
      }

      // Auto-invoice: skipped if "Save as Draft" was used.
      if (insertInvoice && form.clientId && total > 0 && !form.skipInvoice) {
        const due = new Date(); due.setDate(due.getDate() + 30);
        const lineDesc = form.ratePlan === "per_char"
          ? `${form.title} — ${finalText.length} chars × ${runDates.length} run${runDates.length > 1 ? "s" : ""} @ $${Number(form.ratePerChar).toFixed(4)}/char${allNumbers.length ? ` (${allNumbers.join(" / ")})` : ""}`
          : `${form.title} — $${Number(form.flatRate).toFixed(2)} × ${runDates.length} run${runDates.length > 1 ? "s" : ""}${allNumbers.length ? ` (${allNumbers.join(" / ")})` : ""}`;
        await insertInvoice({
          clientId: form.clientId,
          status: "sent",
          billingSchedule: "lump_sum",
          subtotal: total,
          total,
          balanceDue: total,
          issueDate: nowIso.slice(0, 10),
          dueDate: due.toISOString().slice(0, 10),
          notes: `Legal Notice — ${form.title}${allNumbers.length ? ` (${allNumbers.join(" / ")})` : ""}`,
          lines: [{
            description: lineDesc,
            productType: "legal_notice",
            legalNoticeId: newNotice.id,
            quantity: 1,
            unitPrice: total,
            total,
          }],
        });
      }
    }
    setNoticeModal(false);
  };

  const advanceStatus = (noticeId) => {
    const notice = all.find(n => n.id === noticeId);
    setLegalNotices(prev => (prev || []).map(n => {
      if (n.id !== noticeId) return n;
      const idx = NOTICE_STATUSES.indexOf(n.status);
      if (idx >= NOTICE_STATUSES.length - 1) return n;
      const next = NOTICE_STATUSES[idx + 1];
      const updates = { status: next, updatedAt: new Date().toISOString() };
      if (next === "approved") updates.proofApprovedAt = new Date().toISOString();
      if (next === "placed") updates.placedBy = team?.[0]?.id || "";
      if (next === "published") { updates.verifiedBy = team?.[0]?.id || ""; updates.verifiedAt = new Date().toISOString(); }
      if (next === "published" && bus) bus.emit("legal.published", { noticeId, contactName: n.contactName || n.organization, totalAmount: n.totalAmount });
      return { ...n, ...updates };
    }));
  };

  const revertStatus = (noticeId) => {
    setLegalNotices(prev => (prev || []).map(n => {
      if (n.id !== noticeId) return n;
      const idx = NOTICE_STATUSES.indexOf(n.status);
      if (idx <= 0) return n;
      return { ...n, status: NOTICE_STATUSES[idx - 1], updatedAt: new Date().toISOString() };
    }));
  };

  const assignIssue = (noticeId, issueId) => {
    const exists = allIssueLinks.some(li => li.legalNoticeId === noticeId && li.issueId === issueId);
    if (exists) return;
    setLegalNoticeIssues(prev => [...(prev || []), { id: "lni-" + Date.now(), legalNoticeId: noticeId, issueId, pageNumber: null }]);
  };

  const removeIssueLink = (linkId) => {
    setLegalNoticeIssues(prev => (prev || []).filter(li => li.id !== linkId));
  };

  // ─── Filtering ──────────────────────────────────────────
  // Renamed from `isActive` to avoid shadowing the prop of the same name
  // that the page now accepts for usePageHeader gating.
  const isActiveTab = tab === "Active";
  let filtered = isActiveTab ? active : all;
  if (statusFilter !== "all") filtered = filtered.filter(n => n.status === statusFilter);
  if (sr) {
    const q = sr.toLowerCase();
    filtered = filtered.filter(n => n.contactName?.toLowerCase().includes(q) || n.organization?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q));
  }
  filtered = filtered.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  // ─── Detail View ────────────────────────────────────────
  const viewNotice = all.find(n => n.id === viewId);
  const viewIssueLinks = allIssueLinks.filter(li => li.legalNoticeId === viewId);

  if (viewNotice) {
    const nextStatus = NOTICE_STATUSES[NOTICE_STATUSES.indexOf(viewNotice.status) + 1];
    const availableIssues = issues.filter(i => i.pubId === viewNotice.publicationId && i.date >= today).slice(0, 12);

    const clientName = (clients || []).find(c => c.id === viewNotice.clientId)?.name || "(no client)";
    const isUuid = typeof viewNotice.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(viewNotice.id);
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={() => setViewId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: FS.base, fontWeight: FW.bold, fontFamily: COND, textAlign: "left", padding: 0 }}>← Back to Legal Notices</button>

      {/* 75 / 25 two-column layout — everything on the left, Discussion
          pinned to the right rail full-height. */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{clientName}</h2>
              {viewNotice.title && <div style={{ fontSize: FS.md, color: Z.tm, marginBottom: 4 }}>{viewNotice.title}</div>}
              <div style={{ fontSize: FS.sm, color: Z.ac }}>{pn(viewNotice.publicationId)} · {viewNotice.issuesRequested} issue{viewNotice.issuesRequested > 1 ? "s" : ""}{viewNotice.noticeNumber ? ` · ${viewNotice.noticeNumber}` : ""}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 24, fontWeight: FW.black, color: Z.su, fontFamily: DISPLAY }}>{fmtCurrency(viewNotice.totalAmount)}</div>
              <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 2 }}>
                {viewNotice.ratePlan === "per_char"
                  ? `${htmlToPlainText(viewNotice.bodyHtml || viewNotice.content || "").length.toLocaleString()} chars × $${Number(viewNotice.ratePerChar || 0.055).toFixed(4)}/char × ${viewNotice.issuesRequested} run${viewNotice.issuesRequested > 1 ? "s" : ""}`
                  : `$${Number(viewNotice.flatRate || 0).toFixed(2)} flat × ${viewNotice.issuesRequested} run${viewNotice.issuesRequested > 1 ? "s" : ""}`}
              </div>
            </div>
          </div>

          {/* Workflow stepper */}
          <GlassCard style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <StepBar current={viewNotice.status} />
            <div style={{ display: "flex", gap: 6 }}>
              {NOTICE_STATUSES.indexOf(viewNotice.status) > 0 && <Btn sm v="ghost" onClick={() => revertStatus(viewNotice.id)}>← Back</Btn>}
              {nextStatus && <Btn sm onClick={() => advanceStatus(viewNotice.id)}>
                {nextStatus === "proofing" ? "Send to Proofing" :
                 nextStatus === "approved" ? "Mark Approved" :
                 nextStatus === "placed" ? "Mark Placed" :
                 nextStatus === "published" ? "Mark Published" :
                 nextStatus === "billed" ? "Mark Billed" : "Advance"} →
              </Btn>}
              <Btn sm v="ghost" onClick={() => { setViewId(null); openEdit(viewNotice); }}>Edit</Btn>
            </div>
          </GlassCard>

          {/* Notice Content — rich text render (body_html), plain-text fallback */}
          <GlassCard>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Notice Text</div>
            {viewNotice.bodyHtml
              ? <div style={{ fontSize: FS.base, color: Z.tx, lineHeight: 1.6, padding: 16, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}`, fontFamily: "'Source Sans 3', serif" }} dangerouslySetInnerHTML={{ __html: viewNotice.bodyHtml }} />
              : <div style={{ fontSize: FS.base, color: Z.tx, whiteSpace: "pre-wrap", lineHeight: 1.6, padding: 16, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}`, fontFamily: "'Source Sans 3', serif" }}>{viewNotice.content}</div>
            }
            <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 6 }}>
              {htmlToPlainText(viewNotice.bodyHtml || viewNotice.content || "").length.toLocaleString()} characters
            </div>
          </GlassCard>

      {/* Issue Assignments */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Issue Placements</div>
        {viewIssueLinks.length === 0 && <div style={{ fontSize: FS.base, color: Z.td, padding: "4px 0" }}>No issues assigned yet</div>}
        {viewIssueLinks.map(li => {
          const iss = issues.find(i => i.id === li.issueId);
          return <div key={li.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: Z.bg, borderRadius: Ri, marginBottom: 4 }}>
            <div>
              <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{iss?.label || li.issueId}</span>
              <span style={{ fontSize: FS.xs, color: Z.td, marginLeft: 8 }}>{iss?.date ? fmtDate(iss.date) : ""}</span>
              {li.pageNumber && <span style={{ fontSize: FS.xs, color: Z.ac, marginLeft: 8 }}>Page {li.pageNumber}</span>}
            </div>
            <button onClick={() => removeIssueLink(li.id)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: FS.xs, fontWeight: FW.bold }}>Remove</button>
          </div>;
        })}
        {viewIssueLinks.length < viewNotice.issuesRequested && <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: FS.xs, color: Z.wa, fontWeight: FW.semi, marginBottom: 4 }}>{viewNotice.issuesRequested - viewIssueLinks.length} more issue{viewNotice.issuesRequested - viewIssueLinks.length > 1 ? "s" : ""} needed</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {availableIssues.filter(i => !viewIssueLinks.some(li => li.issueId === i.id)).slice(0, 8).map(iss =>
              <button key={iss.id} onClick={() => assignIssue(viewNotice.id, iss.id)} style={{ padding: "6px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>
                + {iss.label}
              </button>
            )}
          </div>
        </div>}
      </GlassCard>

      {/* Workflow details */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Workflow Details</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Received</div><div style={{ fontSize: FS.base, color: Z.tx }}>{fmtDate(viewNotice.createdAt?.slice(0, 10))}</div></div>
          {viewNotice.proofApprovedAt && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Proof Approved</div><div style={{ fontSize: FS.base, color: Z.su }}>{fmtDate(viewNotice.proofApprovedAt.slice(0, 10))}</div></div>}
          {viewNotice.placedBy && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Placed By</div><div style={{ fontSize: FS.base, color: Z.tx }}>{tn(viewNotice.placedBy)}</div></div>}
          {viewNotice.verifiedBy && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Verified By</div><div style={{ fontSize: FS.base, color: Z.su }}>{tn(viewNotice.verifiedBy)}</div></div>}
          {viewNotice.verifiedAt && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Verified At</div><div style={{ fontSize: FS.base, color: Z.tx }}>{fmtDate(viewNotice.verifiedAt.slice(0, 10))}</div></div>}
        </div>
        {viewNotice.notes && <div style={{ marginTop: 10 }}><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Notes</div><div style={{ fontSize: FS.base, color: Z.tm, marginTop: 2 }}>{viewNotice.notes}</div></div>}
      </GlassCard>

          {/* Attached scans — the pendingScans uploads at create time
              landed in media_assets tagged with legal_notice_id. This
              panel surfaces them on the notice detail view so the
              scans are actually visible after save. */}
          <GlassCard>
            <AssetPanel
              legalNoticeId={viewNotice.id}
              title="Attached Scans"
              allowUpload={false}
            />
          </GlassCard>
        </div>

        {/* Right rail (25%) — Discussion. Guard against non-UUID legacy
            notice ids; EntityThread writes to message_threads.ref_id which
            is uuid-typed and would 500 on "ln-…" keys. */}
        <div style={{ minWidth: 0 }}>
          {isUuid
            ? <EntityThread
                refType="legal_notice"
                refId={viewNotice.id}
                title={`Legal notice: ${viewNotice.title || viewNotice.noticeNumber || clientName}`}
                team={team}
                currentUser={currentUser}
                height={600}
                defaultOpen
              />
            : <GlassCard><div style={{ fontSize: FS.sm, color: Z.td, padding: 8 }}>Discussion unavailable on legacy notices — save this notice again to enable threading.</div></GlassCard>}
        </div>
      </div>
    </div>;
  }

  // ─── Main Render ────────────────────────────────────────
  // Sticky queue bar — rendered above the takeover AND above the list
  // when the user is in batch-processing mode. Acts as nav within the
  // queue plus an emergency exit.
  const queueBar = queue ? (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: Z.ac + "12", border: `1px solid ${Z.ac}40`, borderRadius: Ri }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: Z.ac, fontFamily: COND, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Affidavit Queue
      </span>
      <span style={{ fontSize: 12, color: Z.tx, fontFamily: COND }}>
        {queue.index + 1} of {queue.ids.length}
        {queueCurrentId && (() => {
          const n = (legalNotices || []).find(x => x.id === queueCurrentId);
          return n ? ` · ${n.notice_number || ""} · ${n.title || ""}`.replace(/\s+·\s+$/, "") : "";
        })()}
      </span>
      <div style={{ flex: 1 }} />
      <Btn sm v="ghost" disabled={queue.index <= 0} onClick={queueBack}>← Back</Btn>
      <Btn sm v="secondary" onClick={queueAdvance}>Skip</Btn>
      <Btn sm onClick={queueAdvance}>Next →</Btn>
      <Btn sm v="cancel" onClick={queueExit}>Exit queue</Btn>
    </div>
  ) : null;

  // Affidavit workspace is a full-page takeover — short-circuit the
  // list render when one is open. Back button on the workspace clears
  // the ID (or advances if the user is in queue mode).
  if (affidavitNoticeId) {
    const notice = (legalNotices || []).find(n => n.id === affidavitNoticeId);
    const publication = notice ? (pubs || []).find(p => p.id === notice.publicationId) : null;
    if (!notice) { setAffidavitNoticeId(null); return null; }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {queueBar}
        <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Loading workspace…</div>}>
          <AffidavitWorkspace
            notice={notice}
            publication={publication}
            currentUser={currentUser}
            editions={editionsCache}
            onClose={() => { if (queue) queueAdvance(); else setAffidavitNoticeId(null); }}
            onStatusChange={(newStatus) => {
              setLegalNotices(prev => prev.map(n => n.id === notice.id ? { ...n, status: newStatus } : n));
              // Lock → ready: open delivery panel automatically per spec.
              if (newStatus === "affidavit_ready") {
                setAffidavitNoticeId(null);
                setDeliveryNoticeId(notice.id);
              }
            }}
          />
        </Suspense>
      </div>
    );
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {queueBar}
    {/* Action row — title moved to TopBar via usePageHeader. */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      {(tab === "Active" || tab === "All") && <SB value={sr} onChange={setSr} placeholder="Search notices..." />}
      {/* Generate All — eligible when any visible notice is published or
          mid-affidavit. Builds the queue from the current filtered list
          so search + filter narrowing carries through. */}
      {(tab === "Active" || tab === "All") && (() => {
        const eligibleVisible = filtered.filter(n => ["published", "affidavit_draft"].includes(n.status));
        if (!eligibleVisible.length) return null;
        return <Btn sm v="secondary" onClick={() => startQueue(eligibleVisible)}>Generate All Affidavits ({eligibleVisible.length})</Btn>;
      })()}
      <Btn sm onClick={openNew}><Ic.plus size={13} /> New Legal Notice</Btn>
    </div>

    <TabRow><TB tabs={["Active", "All", "Schedule", "This Issue", "Revenue"]} active={tab} onChange={setTab} />{(tab === "Active" || tab === "All") && <><TabPipe /><TB tabs={["All", ...NOTICE_STATUSES.map(s => STATUS_LABELS[s])]} active={statusFilter === "all" ? "All" : STATUS_LABELS[statusFilter] || "All"} onChange={v => { if (v === "All") setStatusFilter("all"); else { const match = Object.entries(STATUS_LABELS).find(([k, l]) => l === v); setStatusFilter(match ? match[0] : "all"); } }} /></>}</TabRow>

    {/* ════════ STATS ════════ */}
    {(tab === "Active" || tab === "All") && <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
      <Stat label="Active Notices" value={active.length} />
      <Stat label="Pending Proof" value={pendingProof} color={pendingProof > 0 ? Z.pu : Z.su} />
      <Stat label="Awaiting Placement" value={awaitingPlacement} color={awaitingPlacement > 0 ? Z.wa : Z.su} />
      <Stat label="Unbilled" value={fmtCurrency(unbilledAmount)} color={unbilledAmount > 0 ? Z.wa : Z.su} />
    </div>}

    {/* ════════ ACTIVE / ALL TABS ════════ */}
    {(tab === "Active" || tab === "All") && <>
      <div style={{ fontSize: FS.sm, color: Z.td }}>{filtered.length} notice{filtered.length !== 1 ? "s" : ""}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && <GlassCard><div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.base }}>No legal notices found</div></GlassCard>}
        {filtered.map(n => {
          const linkedIssues = allIssueLinks.filter(li => li.legalNoticeId === n.id);
          return <GlassCard key={n.id} style={{ padding: 16, cursor: "pointer" }} onClick={() => setViewId(n.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <NoticeBadge status={n.status} />
                  <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>{NOTICE_TYPES.find(t => t.value === n.noticeType)?.label}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: FW.heavy, color: Z.tx }}>
                  {n.clientId
                    ? <EntityLink onClick={nav.toClient(n.clientId)}>{n.organization || n.contactName}</EntityLink>
                    : (n.organization || n.contactName)}
                </div>
                <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>
                  {n.contactName}{n.organization ? ` · ${n.organization}` : ""} ·{" "}
                  {n.publicationId
                    ? <EntityLink onClick={nav.toPublication(n.publicationId)} muted>{pn(n.publicationId)}</EntityLink>
                    : pn(n.publicationId)}
                </div>
                <div style={{ fontSize: FS.sm, color: Z.td, marginTop: 3 }}>
                  {n.issuesRequested} issue{n.issuesRequested > 1 ? "s" : ""} · {linkedIssues.length}/{n.issuesRequested} assigned · {n.lineCount > 0 ? `${n.lineCount} lines` : "Flat rate"}
                </div>
                {/* Attachments uploaded via the StellarPress Submit FBN form
                     (or future admin uploads) land here. Click to open in
                     a new tab — usually a scan of the notarized form. */}
                {(n.attachments || []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {n.attachments.map((url, i) => {
                      const fname = decodeURIComponent((url || "").split("/").pop() || `file-${i + 1}`);
                      const short = fname.length > 28 ? fname.slice(0, 25) + "…" : fname;
                      return <a key={i} href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 11, fontWeight: 600, color: Z.ac, fontFamily: COND,
                        padding: "2px 8px", borderRadius: 3, background: Z.ac + "12",
                        textDecoration: "none",
                      }}>📎 {short}</a>;
                    })}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", minWidth: 100 }}>
                <div style={{ fontSize: 18, fontWeight: FW.black, color: Z.su }}>{fmtCurrency(n.totalAmount)}</div>
                <div style={{ fontSize: FS.xs, color: Z.td }}>{fmtDate(n.createdAt?.slice(0, 10))}</div>
                {/* Affidavit action — context-dependent label per spec
                    §6.2. Suppressed before Published; switches to View
                    once delivered. */}
                {(["published", "affidavit_draft", "affidavit_ready", "delivered"]).includes(n.status) && (
                  <Btn
                    sm
                    v={n.status === "delivered" ? "ghost" : (n.status === "affidavit_ready" ? "primary" : "secondary")}
                    onClick={(e) => { e.stopPropagation(); openNextAffidavitAction(n); }}
                    style={{ marginTop: 6, whiteSpace: "nowrap" }}
                  >
                    {n.status === "published" ? "Generate Affidavit"
                      : n.status === "affidavit_draft" ? "Resume Affidavit"
                      : n.status === "affidavit_ready" ? "Deliver"
                      : "View Affidavit"}
                  </Btn>
                )}
              </div>
            </div>
            {/* Mini step bar */}
            <div style={{ marginTop: 8 }}><StepBar current={n.status} /></div>
          </GlassCard>;
        })}
      </div>
    </>}

    {/* ════════ SCHEDULE TAB ════════ */}
    {tab === "Schedule" && <ScheduleView notices={all} pubs={pubs} />}

    {/* ════════ THIS ISSUE TAB ════════ */}
    {tab === "This Issue" && <ThisIssueView notices={all} pubs={pubs} issues={issues} />}

    {/* ════════ REVENUE TAB ════════ */}
    {tab === "Revenue" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <Stat label="This Month" value={fmtCurrency(revenueThisMonth)} />
        <Stat label="Total Billed" value={fmtCurrency(all.filter(n => n.status === "billed").reduce((s, n) => s + (n.totalAmount || 0), 0))} />
        <Stat label="Unbilled (Published)" value={fmtCurrency(unbilledAmount)} color={unbilledAmount > 0 ? Z.wa : Z.su} />
      </div>

      {/* By notice type */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue by Notice Type</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {NOTICE_TYPES.map(nt => {
            const typeNotices = all.filter(n => n.noticeType === nt.value);
            const typeRev = typeNotices.reduce((s, n) => s + (n.totalAmount || 0), 0);
            if (typeNotices.length === 0) return null;
            return <div key={nt.value} style={{ display: "grid", gridTemplateColumns: "180px 1fr 80px 80px", gap: 10, alignItems: "center", padding: "10px 14px", background: Z.bg, borderRadius: R }}>
              <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{nt.label}</span>
              <div style={{ height: 12, background: Z.sa, borderRadius: R, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, (typeRev / Math.max(revenueThisMonth || 1, 1)) * 100)}%`, background: Z.ac, borderRadius: R }} />
              </div>
              <span style={{ fontSize: FS.sm, color: Z.td, textAlign: "right" }}>{typeNotices.length}</span>
              <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.su, textAlign: "right" }}>{fmtCurrency(typeRev)}</span>
            </div>;
          }).filter(Boolean)}
          {all.length === 0 && <div style={{ fontSize: FS.base, color: Z.td, padding: "8px 0", textAlign: "center" }}>No legal notice revenue data</div>}
        </div>
      </GlassCard>

      {/* By publication */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue by Publication</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {newspapers.map(pub => {
            const pubNotices = all.filter(n => n.publicationId === pub.id);
            const pubRev = pubNotices.reduce((s, n) => s + (n.totalAmount || 0), 0);
            return <div key={pub.id} style={{ display: "grid", gridTemplateColumns: "12px 1fr 80px 80px", gap: 10, alignItems: "center", padding: "10px 14px", background: Z.bg, borderRadius: R }}>
              <div style={{ width: 10, height: 10, borderRadius: R, background: Z.tm }} />
              <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{pub.name}</span>
              <span style={{ fontSize: FS.sm, color: Z.td, textAlign: "right" }}>{pubNotices.length} notices</span>
              <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.su, textAlign: "right" }}>{fmtCurrency(pubRev)}</span>
            </div>;
          })}
        </div>
      </GlassCard>
    </>}

    {/* ════════ CREATE/EDIT MODAL ════════ */}
    <Modal
      open={noticeModal}
      onClose={() => setNoticeModal(false)}
      title={editId ? "Edit Legal Notice" : "New Legal Notice"}
      width={640}
      onSubmit={saveNotice}
      actions={<>
        <Btn v="cancel" onClick={() => setNoticeModal(false)}>Cancel</Btn>
        {!editId && <Btn v="secondary" onClick={() => { updateForm({ skipInvoice: true }); saveNotice(); }} disabled={!form.clientId || !form.title?.trim()}>Save as Draft</Btn>}
        <Btn onClick={saveNotice} disabled={!form.clientId || !form.title?.trim() || (form.runDates || []).filter(Boolean).length === 0}>{editId ? "Save Changes" : "Save & Invoice"}</Btn>
      </>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Client — live contains-match search (replaces prior curated dropdown) */}
        {!editId && <ClientSearch clients={clients} value={form.clientId} onChange={pickClient} />}

        <Inp label="Notice Title" value={form.title} onChange={e => updateForm({ title: e.target.value })} placeholder="e.g. Notice of Trustee's Sale — 123 Main St" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Publication" value={form.publicationId} onChange={e => updateForm({ publicationId: e.target.value })} options={newspapers.map(p => ({ value: p.id, label: p.name + (siblingsFor(p.id).length ? " (+sibling)" : "") }))} />
          <Sel label="Rate Plan" value={form.ratePlan} onChange={e => updateForm({ ratePlan: e.target.value })} options={RATE_PLANS} />
        </div>

        {/* Notice body — rich text with minimal toolbar (B/I/U + lists) */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Notice Text</div>
          <NoticeBodyEditor valueHtml={form.bodyHtml} onChange={html => updateForm({ bodyHtml: html, content: htmlToPlainText(html) })} />
          <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>
            {htmlToPlainText(form.bodyHtml || "").length.toLocaleString()} characters · {(form.bodyHtml || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length} words
          </div>
        </div>

        {/* Run dates — one picker per issue. Incrementing issuesRequested
            adds blank slots automatically via the sync effect. */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Issues to Run</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <input type="number" min="1" max="12" value={form.issuesRequested} onChange={e => updateForm({ issuesRequested: Math.max(1, Number(e.target.value) || 1) })}
              style={{ width: 80, padding: "6px 8px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontSize: FS.md, outline: "none" }} />
            <span style={{ fontSize: FS.xs, color: Z.tm }}>{siblingsFor(form.publicationId).length > 0 ? "Runs in " + [form.publicationId, ...siblingsFor(form.publicationId)].map(id => pn(id)).join(" + ") : `Runs in ${pn(form.publicationId)}`}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {(form.runDates || []).map((d, i) => (
              <div key={i}>
                <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Run #{i + 1}</div>
                <input type="date" value={d || ""} onChange={e => updateForm({ runDates: form.runDates.map((x, j) => j === i ? e.target.value : x) })}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontSize: FS.sm, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
          </div>
        </div>

        {/* Auto-Calculated Total + rate field directly below it */}
        {(() => {
          const runs = (form.runDates || []).filter(Boolean).length || 1;
          const chars = htmlToPlainText(form.bodyHtml || "").length;
          const total = calcTotal(form);
          const isPerChar = form.ratePlan === "per_char";
          return (
            <div style={{ padding: "12px 16px", background: Z.sa, borderRadius: R }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>Auto-Calculated Total</span>
                <span style={{ fontSize: 24, fontWeight: FW.black, color: Z.su, fontFamily: DISPLAY }}>{fmtCurrency(total)}</span>
              </div>
              <div style={{ fontSize: FS.xs, color: Z.td, fontFamily: COND, marginBottom: 8 }}>
                {isPerChar
                  ? <>${Number(form.ratePerChar || 0).toFixed(4)}/char × {chars.toLocaleString()} char{chars === 1 ? "" : "s"} × {runs} run{runs > 1 ? "s" : ""}</>
                  : <>${Number(form.flatRate || 0).toFixed(2)} flat × {runs} run{runs > 1 ? "s" : ""}</>
                }
              </div>
              {/* Rate field — moved below the total per spec; replaces the
                  prior per-row rate input. Default is the pub's configured
                  legal_rate_per_char ($0.055) or the matching flat rate. */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4 }}>
                {isPerChar ? (
                  <Inp label="Rate per Character ($)" type="number" step="0.001" min="0" value={form.ratePerChar}
                    onChange={e => updateForm({ ratePerChar: Number(e.target.value) || 0 })} />
                ) : (
                  <Inp label="Flat Rate ($)" type="number" step="0.01" min="0" value={form.flatRate}
                    onChange={e => updateForm({ flatRate: Number(e.target.value) || 0 })} />
                )}
              </div>
            </div>
          );
        })()}

        <TA label="Notes (internal)" value={form.notes} onChange={e => updateForm({ notes: e.target.value })} rows={2} />

        {/* Scan attachments — uploaded + tagged to this notice on save */}
        {!editId && <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Attach Scans (Optional)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FileBtn sm multiple accept="image/*,application/pdf" onChange={e => setPendingScans(Array.from(e.target.files || []))}>Choose Files</FileBtn>
            <span style={{ fontSize: FS.xs, color: Z.tm }}>{pendingScans.length > 0 ? `${pendingScans.length} file${pendingScans.length > 1 ? "s" : ""} ready to upload on save` : "No file chosen"}</span>
          </div>
        </div>}
      </div>
    </Modal>

    {/* Delivery Panel — opens after Lock Affidavit or via the row's
        Deliver action on an affidavit_ready notice. */}
    {deliveryNoticeId && (() => {
      const n = (legalNotices || []).find(x => x.id === deliveryNoticeId);
      if (!n) return null;
      const publication = (pubs || []).find(p => p.id === n.publicationId) || null;
      const client = (clients || []).find(c => c.id === n.clientId) || null;
      return (
        <Suspense fallback={null}>
          <DeliveryPanel
            open
            onClose={() => setDeliveryNoticeId(null)}
            notice={n}
            publication={publication}
            client={client}
            currentUser={currentUser}
            onDelivered={() => {
              setLegalNotices(prev => prev.map(x => x.id === n.id ? { ...x, status: "delivered" } : x));
              if (queue) queueAdvance(); else setDeliveryNoticeId(null);
            }}
          />
        </Suspense>
      );
    })()}
  </div>;
};

export default LegalNotices;
