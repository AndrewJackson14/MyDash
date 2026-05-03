import React, { useState, useCallback } from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";
import { Btn } from "../../ui";
import { fmtDate } from "../StoryEditor.helpers";
import { formatInTimezone, parseFromTimezone, tzShortLabel } from "../../../lib/timezone";

// Editable publish-date control. Shows the canonical Published / Updated
// dates when collapsed; expands to a TZ-aware datetime-local picker when
// editing. Editors can backdate imported stories or correct an incorrect
// auto-stamp; the picker reads/writes in the publication's editorial
// timezone so the chronological slot lands where the audience expects.
function PublicationDatesPanel({
  isPublished, meta, publication, publicationTz, onSave,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const open = useCallback(() => {
    const existing = meta.first_published_at || meta.published_at;
    setDraft(existing ? formatInTimezone(existing, publicationTz) : "");
    setEditing(true);
  }, [meta.first_published_at, meta.published_at, publicationTz]);

  const submit = useCallback(async () => {
    if (!draft) { setEditing(false); return; }
    const iso = parseFromTimezone(draft, publicationTz);
    if (!iso) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave({ published_at: iso, first_published_at: iso });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft, publicationTz, onSave]);

  if (!isPublished) return null;

  return (
    <div style={{ background: Z.bg, borderRadius: Ri, padding: 10, border: "1px solid " + Z.bd }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Publication Dates</span>
        {!editing && (meta.first_published_at || meta.published_at) && (
          <button onClick={open} title="Change the original publish date" style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: FS.micro, fontFamily: COND, fontWeight: 700, padding: 0 }}>Edit</button>
        )}
      </div>
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            type="datetime-local"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: FS.xs, fontFamily: COND }}
          />
          <div style={{ fontSize: 9, color: Z.tm, fontFamily: COND }}>
            Controls the story's chronological slot on the public site. Time entered as <strong>{tzShortLabel(publicationTz, draft ? parseFromTimezone(draft, publicationTz) : undefined)}</strong>{publication?.name ? ` (${publication.name})` : ""}.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn sm onClick={submit} disabled={saving || !draft} style={{ flex: 1 }}>{saving ? "Saving…" : "Save Date"}</Btn>
            <Btn sm v="cancel" onClick={() => setEditing(false)} disabled={saving}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <>
          {meta.first_published_at && <div style={{ fontSize: FS.xs, color: Z.tx, fontFamily: COND }}>Published: <strong>{fmtDate(meta.first_published_at)}</strong></div>}
          {!meta.first_published_at && meta.published_at && <div style={{ fontSize: FS.xs, color: Z.tx, fontFamily: COND }}>Published: <strong>{fmtDate(meta.published_at)}</strong></div>}
          {meta.slug && <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND, marginTop: 4, wordBreak: "break-all" }} title="URL slug — set automatically on first publish, cannot be changed">Slug: <code style={{ background: Z.sa, padding: "1px 4px", borderRadius: 2, color: Z.tx }}>{meta.slug}</code></div>}
          {meta.last_significant_edit_at && <div style={{ fontSize: FS.xs, color: Z.tx, fontFamily: COND, marginTop: 2 }}>Updated: <strong>{fmtDate(meta.last_significant_edit_at)}</strong></div>}
          {meta.edit_count > 0 && <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND, marginTop: 2 }}>{meta.edit_count} edit{meta.edit_count > 1 ? "s" : ""} since first publish</div>}
        </>
      )}
    </div>
  );
}

export default React.memo(PublicationDatesPanel);
