// ============================================================
// EditorialChecker — Phase E of editorial-assistant-spec.md
//
// "Check Editorial" button + skill picker modal + results side
// panel. The trigger sits in the StoryEditor sidebar (next to
// Preflight); the panel slides in over the right edge of the
// editor and shows per-skill collapsible suggestion cards.
//
// Wire pattern from the parent:
//
//   <EditorialChecker
//     story={meta}                     // for story_id, title, category, etc.
//     bodyHtml={fullContent || ""}     // TipTap output; we strip to plain text
//     pubId={meta.publication_id}
//     onSetTitle={(t) => saveMeta("title", t)}   // headline "Use this" handler
//   />
//
// The component renders the trigger button itself + (when active)
// the modal and the side panel. The parent doesn't manage any
// state for it.
// ============================================================
import { useMemo, useState } from "react";
import { Z, COND, FS, FW, R, Ri, ACCENT } from "../lib/theme";
import { Btn, Modal } from "./ui";
import { supabase } from "../lib/supabase";

// ── HTML → plain text ──────────────────────────────────────
//
// TipTap stores HTML; the editorial server expects plain text. The
// browser's DOMParser handles structure and entity decoding without
// pulling in a dep. Block-level elements get a trailing newline so
// paragraph + sentence rhythm is preserved (the AP / voice skills
// reason about paragraph boundaries).

const BLOCK_TAGS = new Set([
  "p", "br", "div", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "section", "article", "aside",
  "header", "footer", "tr", "table", "pre",
]);

function htmlToText(html) {
  if (!html) return "";
  if (typeof window === "undefined") return String(html);
  try {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    let out = "";
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.nodeValue;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName?.toLowerCase();
      if (tag === "br") { out += "\n"; return; }
      for (const child of node.childNodes) walk(child);
      if (BLOCK_TAGS.has(tag)) out += "\n";
    };
    walk(doc.body);
    return out
      .replace(/[ \t]+\n/g, "\n")     // trim trailing spaces on lines
      .replace(/\n{3,}/g, "\n\n")     // collapse 3+ blank lines
      .trim();
  } catch {
    return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

// ── Skill metadata ─────────────────────────────────────────

const SKILLS = [
  { slug: "ap_style",    label: "AP Style",                hint: "Numbers, dates, titles, attribution verbs" },
  { slug: "voice_match", label: "Voice Match",             hint: "Drift from this author's voice profile" },
  { slug: "headline",    label: "Headline alternatives",   hint: "3 options ranked by intent" },
  { slug: "attribution", label: "Attribution",             hint: "Direct quotes lacking source" },
];

const ALL_SKILL_SLUGS = SKILLS.map(s => s.slug);

// ── EditorialChecker ───────────────────────────────────────

export default function EditorialChecker({ story, bodyHtml, pubId, onSetTitle }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked]     = useState(new Set(ALL_SKILL_SLUGS));
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [results, setResults]   = useState(null);  // { story_id, checked_at, results: {...} }

  const togglePick = (slug) => setPicked(prev => {
    const next = new Set(prev);
    next.has(slug) ? next.delete(slug) : next.add(slug);
    return next;
  });

  const runChecks = async () => {
    if (picked.size === 0) return;

    setPickerOpen(false);
    setPanelOpen(true);
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");

      const body = htmlToText(bodyHtml);
      const payload = {
        story_id:   story.id,
        body,
        story_meta: {
          title:          story.title || "",
          author:         story.author || "",
          category:       story.category || "news",
          publication_id: pubId || story.publication_id || "",
          word_limit:     story.word_limit || null,
        },
        skills: Array.from(picked),
      };

      const { data, error: fnErr } = await supabase.functions.invoke("editorial_check", {
        body: payload,
      });
      if (fnErr) throw new Error(fnErr.message || "editorial_check failed");
      if (!data || !data.results) throw new Error("Invalid response from editorial_check");
      setResults(data);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Btn
        sm
        v="secondary"
        onClick={() => setPickerOpen(true)}
        disabled={!bodyHtml || !bodyHtml.trim()}
        title={!bodyHtml ? "Add story body first" : "Run editorial checks"}
        style={{ width: "100%" }}
      >
        ✦ Check Editorial
      </Btn>

      {pickerOpen && (
        <SkillPickerModal
          picked={picked}
          onToggle={togglePick}
          onCancel={() => setPickerOpen(false)}
          onRun={runChecks}
        />
      )}

      {panelOpen && (
        <ResultsSidePanel
          loading={loading}
          error={error}
          results={results}
          requestedSkills={Array.from(picked)}
          onClose={() => setPanelOpen(false)}
          onRetry={runChecks}
          onSetTitle={onSetTitle}
        />
      )}
    </>
  );
}

// ── Skill picker modal ─────────────────────────────────────

function SkillPickerModal({ picked, onToggle, onCancel, onRun }) {
  return (
    <Modal
      open
      onClose={onCancel}
      title="Run Editorial Checks"
      actions={
        <>
          <Btn v="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn onClick={onRun} disabled={picked.size === 0}>
            Run {picked.size === ALL_SKILL_SLUGS.length ? "All" : `${picked.size} Check${picked.size === 1 ? "" : "s"}`}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SKILLS.map(s => (
          <label
            key={s.slug}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "10px 12px", borderRadius: Ri,
              background: picked.has(s.slug) ? Z.sa : Z.bg,
              border: `1px solid ${Z.bd}`,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={picked.has(s.slug)}
              onChange={() => onToggle(s.slug)}
              style={{ marginTop: 2, accentColor: ACCENT.indigo }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{s.label}</span>
              <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{s.hint}</span>
            </div>
          </label>
        ))}
      </div>
    </Modal>
  );
}

// ── Results side panel ─────────────────────────────────────

function ResultsSidePanel({ loading, error, results, requestedSkills, onClose, onRetry, onSetTitle }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0, right: 0, bottom: 0,
        width: 380, maxWidth: "92vw",
        background: Z.sf,
        borderLeft: `1px solid ${Z.bd}`,
        boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
        zIndex: 9000,
      }}
    >
      {/* Header */}
      <div
        style={{
          flex: "0 0 auto",
          padding: "12px 14px",
          borderBottom: `1px solid ${Z.bd}`,
          display: "flex", alignItems: "center", gap: 8,
          background: Z.bg,
        }}
      >
        <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, letterSpacing: 0.4 }}>
          ✦ Editorial Checks
        </span>
        <span style={{ flex: 1 }} />
        {error && !loading && (
          <Btn sm v="ghost" onClick={onRetry}>Retry</Btn>
        )}
        <Btn sm v="ghost" onClick={onClose} title="Close panel">✕</Btn>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {loading && <PanelLoading skills={requestedSkills} />}
        {!loading && error && <PanelError message={error} />}
        {!loading && !error && results && (
          <PanelResults results={results.results} onSetTitle={onSetTitle} />
        )}
      </div>

      {/* Footer */}
      {results?.checked_at && !loading && !error && (
        <div
          style={{
            flex: "0 0 auto",
            padding: "8px 14px",
            borderTop: `1px solid ${Z.bd}`,
            fontSize: FS.micro, color: Z.tm, fontFamily: COND,
          }}
        >
          Checked {new Date(results.checked_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function PanelLoading({ skills }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND, marginBottom: 4 }}>
        Running {skills.length} check{skills.length === 1 ? "" : "s"}…
      </div>
      {skills.map(slug => {
        const s = SKILLS.find(x => x.slug === slug);
        return (
          <div
            key={slug}
            style={{
              padding: "10px 12px", borderRadius: Ri,
              background: Z.bg, border: `1px solid ${Z.bd}`,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>⟳</span>
            <span style={{ fontSize: FS.sm, color: Z.tx, fontWeight: FW.bold }}>{s?.label || slug}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>checking…</span>
          </div>
        );
      })}
    </div>
  );
}

function PanelError({ message }) {
  return (
    <div
      style={{
        padding: "12px 14px", borderRadius: Ri,
        background: Z.da + "18", border: `1px solid ${Z.da}40`,
        color: Z.da, fontSize: FS.sm,
      }}
    >
      <div style={{ fontWeight: FW.heavy, marginBottom: 4 }}>Check failed</div>
      <div style={{ fontSize: FS.xs, color: Z.tx, fontFamily: COND }}>{message}</div>
    </div>
  );
}

function PanelResults({ results, onSetTitle }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {SKILLS.map(s => {
        const r = results[s.slug];
        if (!r) return null;
        return <SkillSection key={s.slug} skill={s} result={r} onSetTitle={onSetTitle} />;
      })}
    </div>
  );
}

function SkillSection({ skill, result, onSetTitle }) {
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState(new Set());

  const visibleSuggestions = useMemo(() => {
    return (result.suggestions || []).filter((_, i) => !dismissed.has(i));
  }, [result.suggestions, dismissed]);

  const status = result.status;
  const count = visibleSuggestions.length;

  // Header tone derives from status. ok with 0 = clean (green check),
  // ok with N = work to do (amber), error = red, skipped = neutral.
  const headerColor = status === "error" ? Z.da
                    : status === "skipped" ? Z.tm
                    : count === 0 ? Z.go
                    : Z.wa;
  const icon = status === "error" ? "⚠"
             : status === "skipped" ? "—"
             : count === 0 ? "✓"
             : "✓";

  return (
    <div
      style={{
        border: `1px solid ${Z.bd}`,
        borderRadius: Ri,
        background: Z.bg,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8,
          color: Z.tx,
          fontFamily: "inherit",
        }}
      >
        <span style={{ color: headerColor, fontSize: FS.md, fontWeight: FW.heavy }}>{icon}</span>
        <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, flex: 1 }}>{skill.label}</span>
        <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
          {status === "skipped" ? "skipped"
            : status === "error" ? "error"
            : count}
        </span>
        <span style={{ fontSize: FS.sm, color: Z.tm, marginLeft: 4 }}>{open ? "▾" : "▸"}</span>
      </button>

      {/* Voice metadata line for voice_match */}
      {skill.slug === "voice_match" && (result.voice_used || result.message) && (
        <div
          style={{
            padding: "0 12px 8px 30px",
            fontSize: FS.xs, color: Z.tm, fontFamily: COND,
            marginTop: -6,
          }}
        >
          {result.voice_used ? `Voice: ${result.voice_used}` : result.message}
        </div>
      )}

      {open && (
        <div style={{ borderTop: `1px solid ${Z.bd}40`, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {status === "error" && (
            <div style={{ fontSize: FS.xs, color: Z.da, padding: "4px 6px" }}>
              {result.error || "Skill failed"}
            </div>
          )}
          {status === "skipped" && (
            <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, padding: "4px 6px" }}>
              {result.message || result.reason || "Skipped"}
            </div>
          )}
          {visibleSuggestions.length === 0 && status === "ok" && (
            <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, padding: "4px 6px", fontStyle: "italic" }}>
              No suggestions — looks clean.
            </div>
          )}
          {visibleSuggestions.map((s, i) => {
            const realIdx = (result.suggestions || []).indexOf(s);
            return (
              <SuggestionCard
                key={realIdx}
                skill={skill.slug}
                suggestion={s}
                onDismiss={() => setDismissed(d => new Set(d).add(realIdx))}
                onSetTitle={onSetTitle}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({ skill, suggestion, onDismiss, onSetTitle }) {
  // Headline suggestions are shaped { rank, intent, headline }.
  // ap_style / voice_match / attribution share { original, suggested,
  // rationale, severity }.
  if (skill === "headline") {
    return (
      <div
        style={{
          padding: "8px 10px",
          borderRadius: Ri,
          background: Z.sf,
          border: `1px solid ${Z.bd}`,
          display: "flex", flexDirection: "column", gap: 4,
        }}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span
            style={{
              fontSize: FS.micro, fontWeight: FW.heavy,
              color: ACCENT.indigo, fontFamily: COND,
              textTransform: "uppercase", letterSpacing: 0.5,
            }}
          >
            {(suggestion.intent || "option").replace(/_/g, " ")}
          </span>
          <span style={{ flex: 1 }} />
          {onSetTitle && (
            <Btn sm v="ghost" onClick={() => onSetTitle(suggestion.headline)}>Use this</Btn>
          )}
          <Btn sm v="ghost" onClick={onDismiss}>✕</Btn>
        </div>
        <div style={{ fontSize: FS.sm, color: Z.tx, fontWeight: FW.bold, lineHeight: 1.3 }}>
          {suggestion.headline}
        </div>
      </div>
    );
  }

  const sev = suggestion.severity || "minor";
  const sevColor = sev === "critical" ? Z.da : Z.wa;

  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: Ri,
        background: Z.sf,
        border: `1px solid ${Z.bd}`,
        display: "flex", flexDirection: "column", gap: 6,
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span
          style={{
            fontSize: FS.micro, fontWeight: FW.heavy,
            color: sevColor, fontFamily: COND,
            textTransform: "uppercase", letterSpacing: 0.5,
            padding: "1px 6px", borderRadius: 999,
            background: sevColor + "18",
          }}
        >
          {sev}
        </span>
        <span style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>
          {suggestion.rule || suggestion.pattern || ""}
        </span>
        <span style={{ flex: 1 }} />
        <Btn sm v="ghost" onClick={onDismiss}>Dismiss</Btn>
      </div>
      {suggestion.original && (
        <div
          style={{
            fontSize: FS.xs, color: Z.tx, fontFamily: COND,
            background: Z.da + "0c",
            padding: "4px 6px", borderRadius: 4,
            textDecoration: "line-through",
            textDecorationColor: Z.da + "70",
          }}
        >
          {suggestion.original}
        </div>
      )}
      {suggestion.suggested && (
        <div
          style={{
            fontSize: FS.xs, color: Z.tx, fontFamily: COND,
            background: Z.go + "0c",
            padding: "4px 6px", borderRadius: 4,
          }}
        >
          {suggestion.suggested}
        </div>
      )}
      {suggestion.rationale && (
        <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND, fontStyle: "italic" }}>
          {suggestion.rationale}
        </div>
      )}
    </div>
  );
}
