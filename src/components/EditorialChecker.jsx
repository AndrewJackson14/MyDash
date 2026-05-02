// ============================================================
// EditorialChecker — Editorial Agent for the StoryEditor
//
// Originally Phase E of editorial-assistant-spec.md as the "Check
// Editorial" button. Now the unified entry point ("Editorial Agent")
// for two flows:
//
//   1. Check editorial — original AP/voice/headline/attribution review
//   2. Generate from past story — new flow that takes a previously
//      published story (e.g. last year's Colony Days press release),
//      a freeform "what's new" note, and produces a revised HTML
//      body via the editorial_generate Edge Function.
//
// The Generate path is gated to Publisher / Content Editor / Editor-in-
// Chief / Managing Editor (and admins). The Edge Function re-checks
// permission server-side; the client gate is just for UX.
//
// Wire pattern from the parent:
//
//   <EditorialChecker
//     story={meta}
//     bodyHtml={editor?.getHTML() || fullContent?.body || ""}
//     pubId={meta.publication_id}
//     onSetTitle={(t) => saveMeta("title", t)}
//     viewerRole={currentUser?.role}              // for Generate gate
//     viewerIsAdmin={isAdmin}                     // admin override
//     onApplyGeneratedBody={(html) => editor.commands.setContent(html)}
//   />
//
// The component renders the trigger button + (when active) any of
// the action / picker / panel modals. The parent doesn't manage
// state for it.
// ============================================================
import { useMemo, useState } from "react";
import { Z, COND, FS, FW, R, Ri, ACCENT } from "../lib/theme";
import { Btn, Modal } from "./ui";
import { supabase } from "../lib/supabase";
import RegenerateModal from "./editor/RegenerateModal";

const GENERATE_ROLES = new Set([
  "Publisher", "Support Admin", "Content Editor", "Editor-in-Chief", "Managing Editor",
]);

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

export default function EditorialChecker({
  story, bodyHtml, pubId, onSetTitle,
  viewerId, viewerName, viewerRole, viewerIsAdmin,
  onApplyGeneratedBody, onDraftCreated,
}) {
  const [actionOpen, setActionOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked]     = useState(new Set(ALL_SKILL_SLUGS));
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [results, setResults]   = useState(null);  // { story_id, checked_at, results: {...} }

  // Generate-flow state
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genResult, setGenResult]       = useState(null); // { revised_html, source_title, source_published_at, voice_profile_used }
  const [genError, setGenError]         = useState(null);
  const [genLoading, setGenLoading]     = useState(false);
  // Captured at runGenerate so the audit row can record updates_text
  // length without holding the textarea content past the submit (the
  // textarea state lives inside GenerateModal and resets on close).
  const [lastUpdatesText, setLastUpdatesText] = useState("");

  // Regenerate-as-new-draft state (Phase C of editorial-generate-v2-spec).
  const [regenerateOpen, setRegenerateOpen] = useState(false);

  const canGenerate = !!viewerIsAdmin || GENERATE_ROLES.has(viewerRole);
  // "Published" in this codebase = sent_to_web or sent_to_print. The
  // status enum (Draft / Edit / Ready / Approved) doesn't carry the
  // "live" signal directly. Spec said published-only sources for the
  // Regenerate flow.
  const isStoryPublished = !!(story?.sent_to_web || story?.sentToWeb || story?.sent_to_print || story?.sentToPrint);
  const canRegenerate = canGenerate && isStoryPublished && onDraftCreated;

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

  const runGenerate = async ({ updatesText }) => {
    setGenLoading(true);
    setGenError(null);
    setGenResult(null);
    setLastUpdatesText(updatesText);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("editorial_generate", {
        body: {
          mode:         "in_place",
          story_id:     story.id,
          source_body:  bodyHtml || "",
          updates_text: updatesText,
        },
      });
      if (fnErr) throw new Error(fnErr.message || "editorial_generate failed");
      if (!data?.revised_html) throw new Error("Empty response");
      setGenResult(data);
    } catch (e) {
      setGenError(e?.message || String(e));
    } finally {
      setGenLoading(false);
    }
  };

  const acceptGenerated = async () => {
    if (!genResult?.revised_html || !onApplyGeneratedBody) return;

    // Apply revised body to editor first — audit log write is best-
    // effort and shouldn't block the user's accept action.
    onApplyGeneratedBody(genResult.revised_html);

    // Audit row. activity_log.actor_id FKs people(id), so we use
    // the people row id (currentUser.id), not auth.uid(). For in-
    // place mode, source_story_id === target story id by design.
    try {
      await supabase.from("activity_log").insert({
        type:           "editorial_generate",
        actor_id:       viewerId || null,
        entity_table:   "stories",
        entity_id:      story.id,
        detail:         `Editorial Generate (in-place) — ${story.title || "untitled"}`,
        event_category: "outcome",
        event_source:   "mydash",
        visibility:     "team",
        metadata: {
          mode:                "in_place",
          source_story_id:     story.id,
          source_story_title:  story.title || "(untitled)",
          voice_profile_used:  genResult.voice_profile_used,
          voice_profile_slug:  genResult.voice_profile_slug || null,
          updates_text_length: lastUpdatesText.length,
          revised_html_length: genResult.revised_html.length,
          model:               genResult.model || "claude-sonnet-4-6",
        },
      });
    } catch (e) {
      // Non-fatal — generation already applied to the editor.
      console.error("[editorial_generate] audit log write failed:", e);
    }

    setGenResult(null);
    setGenerateOpen(false);
    setLastUpdatesText("");
  };

  return (
    <>
      <Btn
        sm
        v="secondary"
        onClick={() => setActionOpen(true)}
        title="Editorial Agent — checks + revisions"
        style={{ width: "100%" }}
      >
        ✦ Editorial Agent
      </Btn>

      {actionOpen && (
        <ActionPickerModal
          canGenerate={canGenerate}
          canRegenerate={canRegenerate}
          checkDisabled={!bodyHtml || !bodyHtml.trim()}
          generateDisabled={!bodyHtml || !bodyHtml.trim()}
          onCheck={() => { setActionOpen(false); setPickerOpen(true); }}
          onGenerate={() => { setActionOpen(false); setGenerateOpen(true); }}
          onRegenerate={() => { setActionOpen(false); setRegenerateOpen(true); }}
          onCancel={() => setActionOpen(false)}
        />
      )}

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

      {generateOpen && (
        <GenerateModal
          loading={genLoading}
          error={genError}
          result={genResult}
          onRun={runGenerate}
          onAccept={acceptGenerated}
          onCancel={() => { setGenerateOpen(false); setGenResult(null); setGenError(null); }}
        />
      )}

      {regenerateOpen && (
        <RegenerateModal
          sourceStory={story}
          viewerId={viewerId}
          viewerName={viewerName}
          onCreated={(newStory) => onDraftCreated?.(newStory)}
          onClose={() => setRegenerateOpen(false)}
        />
      )}
    </>
  );
}

// ── Action picker (Check vs Generate) ──────────────────────

function ActionPickerModal({
  canGenerate, canRegenerate,
  checkDisabled, generateDisabled,
  onCheck, onGenerate, onRegenerate, onCancel,
}) {
  return (
    <Modal open onClose={onCancel} title="Editorial Agent">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ActionRow
          icon="🔍"
          title="Check editorial"
          hint="AP style, voice match, headline alternatives, attribution"
          disabled={checkDisabled}
          disabledHint="Add story body first"
          onClick={onCheck}
        />
        {canGenerate && (
          <ActionRow
            icon="↻"
            title="Generate revision"
            hint="Revise the current body with new dates, quotes, names"
            disabled={generateDisabled}
            disabledHint="Paste the source story into the body first"
            onClick={onGenerate}
          />
        )}
        {canRegenerate && (
          <ActionRow
            icon="📋"
            title="Regenerate as new draft"
            hint="Create a fresh draft from this published story with new facts — your byline, blank title"
            onClick={onRegenerate}
          />
        )}
      </div>
    </Modal>
  );
}

function ActionRow({ icon, title, hint, disabled, disabledHint, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? disabledHint : undefined}
      style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "12px 14px", borderRadius: Ri,
        background: Z.bg, border: `1px solid ${Z.bd}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        textAlign: "left", width: "100%",
        fontFamily: "inherit",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = Z.sa; }}
      onMouseLeave={e => { e.currentTarget.style.background = Z.bg; }}
    >
      <span style={{ fontSize: 20, lineHeight: 1, marginTop: 2 }}>{icon}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{title}</span>
        <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{hint}</span>
        {disabled && disabledHint && (
          <span style={{ fontSize: FS.xs, color: Z.tm, fontStyle: "italic" }}>{disabledHint}</span>
        )}
      </div>
      <span style={{ color: Z.tm, fontSize: FS.md, marginTop: 1 }}>›</span>
    </button>
  );
}

// ── Generate modal ─────────────────────────────────────────
//
// Two states in one modal: enter updates → review revised body. The
// source body comes from whatever is currently in the editor — the
// user pastes the previous story's text into the editor before
// triggering this flow. No source picker needed.

function GenerateModal({ loading, error, result, onRun, onAccept, onCancel }) {
  const [updatesText, setUpdatesText] = useState("");

  const stage = result ? "review" : "input";
  const canRun = updatesText.trim().length > 0 && !loading;

  return (
    <Modal
      open
      onClose={onCancel}
      title={stage === "input" ? "Add the new facts" : "Review revised body"}
      width={stage === "review" ? 720 : 560}
      actions={
        stage === "input"
          ? <>
              <Btn v="ghost" onClick={onCancel}>Cancel</Btn>
              <Btn onClick={() => onRun({ updatesText: updatesText.trim() })} disabled={!canRun}>
                {loading ? "Generating…" : "Generate revision"}
              </Btn>
            </>
          : <>
              <Btn v="ghost" onClick={onCancel}>Discard</Btn>
              <Btn onClick={onAccept}>Accept &amp; replace body</Btn>
            </>
      }
    >
      {stage === "input" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tm, fontFamily: COND, display: "block", marginBottom: 4 }}>
              What's changed for this revision
            </label>
            <textarea
              autoFocus
              value={updatesText}
              onChange={e => setUpdatesText(e.target.value)}
              placeholder={
                "Date: Saturday, October 18, 2026\n" +
                "Time: 10am parade, 1pm BBQ in Sunken Gardens\n" +
                "Quote — Mayor Heather Moreno: \"…\"\n" +
                "Grand marshal: …"
              }
              rows={10}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: 10, borderRadius: Ri,
                background: Z.bg, color: Z.tx,
                border: `1px solid ${Z.bd}`,
                fontFamily: "inherit", fontSize: FS.sm, lineHeight: 1.5,
                resize: "vertical",
              }}
            />
            <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 4, fontFamily: COND }}>
              Freeform — list dates, times, quotes, names, locations. The agent revises the current body in place, preserving its structure and voice.
            </div>
          </div>
          {error && (
            <div style={{ padding: "8px 12px", borderRadius: Ri, background: ACCENT.red + "12", color: ACCENT.red, fontSize: FS.sm }}>
              Error: {error}
            </div>
          )}
        </div>
      )}

      {stage === "review" && result && (
        <GenerateReview result={result} />
      )}
    </Modal>
  );
}

function GenerateReview({ result }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(result.voice_profile_used === "named" || result.voice_profile_used === "default") && (
        <div style={{ padding: "6px 10px", background: Z.sa, borderRadius: Ri, border: `1px solid ${Z.bd}` }}>
          <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
            {result.voice_profile_used === "named" ? "Author voice profile applied" : "Default voice guidance applied"}
          </div>
        </div>
      )}
      <div
        style={{
          maxHeight: 480, overflowY: "auto",
          padding: 16, borderRadius: Ri,
          border: `1px solid ${Z.bd}`,
          background: Z.bg,
          fontSize: FS.base, lineHeight: 1.65, color: Z.tx,
        }}
        dangerouslySetInnerHTML={{ __html: result.revised_html }}
      />
      <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
        Accepting will replace the current story body. The next autosave (≈100ms after acceptance) writes it to the database.
      </div>
    </div>
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
