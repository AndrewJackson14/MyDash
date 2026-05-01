// ============================================================
// RegenerateModal — Phase C of editorial-generate-v2-spec.md
//
// Two-stage modal for the "Regenerate as new draft" flow:
//
//   1. Input  — textarea for the new facts (dates, quotes, names)
//   2. Review — rendered HTML preview of the revised body
//
// On accept:
//   - calls editorial_generate Edge Function with mode=new_draft
//   - INSERTs a new stories row inheriting publication_id + category
//     from the source story, with author = current user, status =
//     Draft, body = revised HTML, title blank, generated_from_id =
//     source.id
//   - writes activity_log row capturing the regeneration
//   - calls onCreated(newStory) so the parent can navigate
//
// Sibling of EditorialChecker.GenerateModal — the spec says don't
// abstract these into a shared base yet; let them diverge in real
// use first.
// ============================================================
import { useState } from "react";
import { Z, COND, FS, FW, Ri, ACCENT } from "../../lib/theme";
import { Btn, Modal } from "../ui";
import { supabase } from "../../lib/supabase";

export default function RegenerateModal({
  sourceStory,    // { id, title, body, publication_id, category, sent_to_web, sent_to_print, ... }
  viewerId,       // people.id of the current user (becomes new draft's author_id)
  viewerName,     // current user display name (becomes new draft's author byline)
  onCreated,      // (newStory) => void  parent navigates to the new draft
  onClose,        // () => void
}) {
  const [updatesText, setUpdatesText] = useState("");
  const [genResult, setGenResult]     = useState(null);   // { revised_html, voice_profile_used, voice_profile_slug, model }
  const [genError, setGenError]       = useState(null);
  const [genLoading, setGenLoading]   = useState(false);
  const [insertError, setInsertError] = useState(null);
  const [inserting, setInserting]     = useState(false);

  const stage  = genResult ? "review" : "input";
  const canRun = updatesText.trim().length > 0 && !genLoading && !inserting;

  // ── Generate (calls Edge Function in new_draft mode) ──
  const runGenerate = async () => {
    setGenLoading(true);
    setGenError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("editorial_generate", {
        body: {
          mode:            "new_draft",
          source_story_id: sourceStory.id,
          source_body:     sourceStory.body || "",
          updates_text:    updatesText.trim(),
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

  // ── Accept (creates new draft + audit log + nav) ──
  const acceptAndCreate = async () => {
    if (!genResult?.revised_html) return;
    setInserting(true);
    setInsertError(null);
    try {
      // Inherit publication_id + category from the source. Note:
      // stories.tags doesn't exist in this schema — spec said "if
      // present, inherit"; it's not, so we skip. Title is intentionally
      // blank — Camille writes a fresh headline. status='Draft' is the
      // canonical initial status (verified against the existing enum).
      const { data: newStory, error: insertErr } = await supabase
        .from("stories")
        .insert({
          publication_id:    sourceStory.publication_id || null,
          category:          sourceStory.category || null,
          author_id:         viewerId || null,
          author:            viewerName || null,
          status:            "Draft",
          body:              genResult.revised_html,
          title:             "",
          generated_from_id: sourceStory.id,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Audit log. Same shape as the in-place flow but with mode=new_draft
      // and entity_id pointing at the new draft (not the source).
      try {
        await supabase.from("activity_log").insert({
          type:           "editorial_generate",
          actor_id:       viewerId || null,
          entity_table:   "stories",
          entity_id:      newStory.id,
          detail:         `Editorial Generate (new draft) — from "${sourceStory.title || "untitled"}"`,
          event_category: "outcome",
          event_source:   "mydash",
          visibility:     "team",
          metadata: {
            mode:                "new_draft",
            source_story_id:     sourceStory.id,
            source_story_title:  sourceStory.title || "(untitled)",
            voice_profile_used:  genResult.voice_profile_used,
            voice_profile_slug:  genResult.voice_profile_slug || null,
            updates_text_length: updatesText.length,
            revised_html_length: genResult.revised_html.length,
            model:               genResult.model || "claude-sonnet-4-6",
          },
        });
      } catch (auditErr) {
        // Non-fatal — draft is already created.
        console.error("[editorial_generate] audit log write failed:", auditErr);
      }

      onCreated?.(newStory);
      onClose();
    } catch (e) {
      setInsertError(e?.message || String(e));
      setInserting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        stage === "input"
          ? `Regenerate "${sourceStory.title || "(untitled)"}" as new draft`
          : "Review new draft"
      }
      width={stage === "review" ? 720 : 560}
      actions={
        stage === "input"
          ? <>
              <Btn v="ghost" onClick={onClose}>Cancel</Btn>
              <Btn onClick={runGenerate} disabled={!canRun}>
                {genLoading ? "Generating…" : "Generate revision"}
              </Btn>
            </>
          : <>
              <Btn v="ghost" onClick={onClose}>Discard</Btn>
              <Btn onClick={acceptAndCreate} disabled={inserting}>
                {inserting ? "Creating draft…" : "Accept & create new draft"}
              </Btn>
            </>
      }
    >
      {stage === "input" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{
            padding: "8px 12px", borderRadius: Ri,
            background: Z.sa, border: `1px solid ${Z.bd}`,
          }}>
            <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginBottom: 2 }}>Source</div>
            <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>
              {sourceStory.title || "(untitled)"}
            </div>
          </div>
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
              Freeform — list dates, times, quotes, names, locations. The agent revises the source's structure with these new facts and creates a new draft under your byline.
            </div>
          </div>
          {genError && (
            <div style={{ padding: "8px 12px", borderRadius: Ri, background: ACCENT.red + "12", color: ACCENT.red, fontSize: FS.sm }}>
              Error: {genError}
            </div>
          )}
        </div>
      )}

      {stage === "review" && genResult && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(genResult.voice_profile_used === "named" || genResult.voice_profile_used === "default") && (
            <div style={{ padding: "6px 10px", background: Z.sa, borderRadius: Ri, border: `1px solid ${Z.bd}` }}>
              <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
                {genResult.voice_profile_used === "named"
                  ? `Voice profile applied: ${genResult.voice_profile_slug || "named"}`
                  : "Default voice guidance applied"}
                {viewerName && ` · byline will be ${viewerName}`}
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
            dangerouslySetInnerHTML={{ __html: genResult.revised_html }}
          />
          <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
            Accepting will create a new Draft story in <strong>{sourceStory.publication_id || "this publication"}</strong> with this body, your byline, and a blank title.
          </div>
          {insertError && (
            <div style={{ padding: "8px 12px", borderRadius: Ri, background: ACCENT.red + "12", color: ACCENT.red, fontSize: FS.sm }}>
              Error creating draft: {insertError}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
