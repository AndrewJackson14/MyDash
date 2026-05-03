import React from "react";
import { Z, COND, ACCENT, FS, DISPLAY, Ri } from "../../lib/theme";
import { fmtDate } from "./StoryEditor.helpers";

import PublicationDatesPanel from "./sidebar/PublicationDatesPanel";
import StatusPanel from "./sidebar/StatusPanel";
import EditorialPanel from "./sidebar/EditorialPanel";
import PublishPanel from "./sidebar/PublishPanel";
import FlagsPanel from "./sidebar/FlagsPanel";
import FeaturedImagePanel from "./sidebar/FeaturedImagePanel";
import StoryLibraryPanel from "./sidebar/StoryLibraryPanel";
import PublicationPicker from "./sidebar/PublicationPicker";
import AuthorPicker from "./sidebar/AuthorPicker";
import FreelancersPanel from "./sidebar/FreelancersPanel";
import CategoryPicker from "./sidebar/CategoryPicker";
import AudienceToggle from "./sidebar/AudienceToggle";
import TypeAndAssigneeRow from "./sidebar/TypeAndAssigneeRow";
import DueDateAndWordLimitRow from "./sidebar/DueDateAndWordLimitRow";
import PrintIssuePicker from "./sidebar/PrintIssuePicker";
import LayoutHandoffPanel from "./LayoutHandoffPanel";
import SEOPanel from "./sidebar/SEOPanel";
import LegalReviewPanel from "./sidebar/LegalReviewPanel";
import NotesPanel from "./sidebar/NotesPanel";
import DangerZonePanel from "./sidebar/DangerZonePanel";
import TimelinePanel from "./sidebar/TimelinePanel";
import ActivityPanel from "./sidebar/ActivityPanel";

// Right-pane orchestrator. Renders the upload-progress strip + each
// panel in order. Each panel is React.memo'd; props are kept narrow so
// memoization actually wins on the high-frequency surfaces (typing in
// the title shouldn't re-render any of these).
function StoryEditorSidebar(props) {
  const {
    // Story / state
    story, meta, setMeta, fullContent, publication, publicationTz,
    isPublished, needsRepublish, currentStage, webApproved,
    republishing, republishedFlash, selectedPubs, filteredIssues,
    storyImages, categories, freelancers, activity, authors,
    pubs, team, currentUser, uploads, downloadingOriginals,
    wordCount,
    editor,
    // Callbacks
    saveMeta, saveImageCaption, savePubDateRange,
    onApprove, onPublish, onRepublish, onUnpublish,
    onSetTitle, onApplyGeneratedBody, onDraftCreated,
    onClearFeatured, onSetFeatured, onUpload, onPickFromLibrary,
    onAddFreelancer, onAuthorCustom,
    onDownloadOriginals, onDelete,
  } = props;

  return (
    <div style={{ width: 320, flexShrink: 0, borderLeft: "1px solid " + Z.bd, background: Z.sf, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Per-file upload progress with cancel. Surfaces at the top
          of the sidebar so it's visible without scrolling, even
          while the editor is busy. */}
      {uploads.size > 0 && (
        <div style={{ background: Z.bg, borderRadius: Ri, padding: 8, border: "1px solid " + Z.bd, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>
            Uploading · {uploads.size}
          </div>
          {Array.from(uploads.entries()).map(([id, u]) => (
            <div key={id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.micro, fontFamily: COND }}>
                <span style={{ color: Z.tm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{u.fileName}</span>
                <button
                  onClick={() => u.abortController.abort()}
                  style={{ background: "none", border: "none", color: Z.da, fontSize: FS.micro, cursor: "pointer", fontWeight: 700 }}
                >Cancel</button>
              </div>
              <div style={{ height: 4, background: Z.sa, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${(u.progress * 100).toFixed(0)}%`, height: "100%", background: Z.ac, transition: "width 0.15s" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <PublicationDatesPanel
        isPublished={isPublished}
        meta={meta}
        publication={publication}
        publicationTz={publicationTz}
        onSave={savePubDateRange}
      />

      <StatusPanel
        status={meta.status}
        isPublished={isPublished}
        onChange={(v) => saveMeta("status", v)}
      />

      <EditorialPanel
        story={story}
        meta={meta}
        fullContent={fullContent}
        editor={editor}
        currentUser={currentUser}
        onDraftCreated={onDraftCreated}
        onSetTitle={onSetTitle}
        onApplyGeneratedBody={onApplyGeneratedBody}
      />

      <div style={{ background: Z.bg, borderRadius: Ri, padding: 10, border: "1px solid " + Z.bd }}>
        <PublishPanel
          isPublished={isPublished}
          needsRepublish={needsRepublish}
          currentStage={currentStage}
          webApproved={webApproved}
          republishedFlash={republishedFlash}
          republishing={republishing}
          onPublish={onPublish}
          onRepublish={onRepublish}
          onApprove={onApprove}
          onUnpublish={onUnpublish}
        />
        <FlagsPanel meta={meta} saveMeta={saveMeta} setMeta={setMeta} />
      </div>

      {/* Scheduled indicator (set via preflight) */}
      {!isPublished && meta.scheduled_at && (
        <div style={{ fontSize: FS.micro, color: ACCENT.indigo, fontFamily: COND, padding: "6px 8px", background: ACCENT.indigo + "10", borderRadius: Ri, border: "1px solid " + ACCENT.indigo + "30" }}>
          Scheduled: {fmtDate(meta.scheduled_at)}
        </div>
      )}

      {/* View on site — only render when the publication has a real
          website configured. Previously this fell back to turning
          the publication name into a fake slug-as-domain (e.g.
          'calabasas-style-magazine' with no TLD) which generated
          broken links. Now: no website_url, no link. */}
      {isPublished && meta.slug && selectedPubs[0] && (() => {
        const site = (pubs || []).find(p => p.id === selectedPubs[0]);
        if (!site?.hasWebsite) return null;
        const raw = (site.websiteUrl || "").trim();
        if (!raw) return null;
        const host = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
        if (!host.includes(".")) return null;
        const href = `https://${host}/${meta.slug}`;
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: "6px 10px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sa, textAlign: "center", fontSize: FS.xs, fontWeight: 600, color: Z.ac, fontFamily: COND, textDecoration: "none" }}>
            View on {host} {"↗"}
          </a>
        );
      })()}

      {/* View count */}
      {meta.view_count > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: Z.sa, borderRadius: Ri }}>
          <span style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Views</span>
          <span style={{ fontSize: FS.md, fontWeight: 700, color: Z.tx, fontFamily: DISPLAY }}>{(meta.view_count || 0).toLocaleString()}</span>
        </div>
      )}

      <FeaturedImagePanel
        featuredImageUrl={meta.featured_image_url}
        onClear={onClearFeatured}
      />

      <StoryLibraryPanel
        storyImages={storyImages}
        featuredImageUrl={meta.featured_image_url}
        busy={uploads.size > 0}
        downloading={downloadingOriginals}
        onUpload={onUpload}
        onPickFromLibrary={onPickFromLibrary}
        onSetFeatured={onSetFeatured}
        onSaveCaption={saveImageCaption}
        onDownloadOriginals={onDownloadOriginals}
      />

      <PublicationPicker
        value={selectedPubs[0]}
        pubs={pubs}
        onChange={(v) => saveMeta("publication", v)}
      />

      <AuthorPicker
        author={meta.author}
        authors={authors}
        freelancers={freelancers}
        onChange={(v) => saveMeta("author", v)}
        onCustom={onAuthorCustom}
      />

      <FreelancersPanel
        freelancers={freelancers}
        onAdd={onAddFreelancer}
      />

      <CategoryPicker
        categoryId={meta.category_id}
        categories={categories}
        onChange={saveMeta}
      />

      <AudienceToggle
        audience={meta.audience}
        onChange={(v) => saveMeta("audience", v)}
      />

      <TypeAndAssigneeRow
        storyType={meta.story_type}
        assignedTo={meta.assigned_to}
        team={team}
        onTypeChange={(v) => saveMeta("story_type", v)}
        onAssigneeChange={(v) => saveMeta("assigned_to", v)}
      />

      <DueDateAndWordLimitRow
        dueDate={meta.due_date}
        wordLimit={meta.word_limit}
        wordCount={wordCount}
        onDueDateChange={(v) => saveMeta("due_date", v)}
        onWordLimitChange={(v) => saveMeta("word_limit", v)}
      />

      <PrintIssuePicker
        printIssueId={meta.print_issue_id}
        filteredIssues={filteredIssues}
        onChange={(v) => saveMeta("print_issue_id", v)}
      />

      <LayoutHandoffPanel
        story={story}
        meta={meta}
        saveMeta={saveMeta}
        team={team}
        currentUser={currentUser}
        dialog={props.dialog}
      />

      <SEOPanel
        meta={meta}
        setMeta={setMeta}
        saveMeta={saveMeta}
        selectedPubs={selectedPubs}
        pubs={pubs}
      />

      <LegalReviewPanel meta={meta} saveMeta={saveMeta} story={story} />

      <NotesPanel meta={meta} setMeta={setMeta} saveMeta={saveMeta} />

      <DangerZonePanel onDelete={onDelete} />

      <TimelinePanel meta={meta} />

      {/* Wednesday Agent's per-story social_posts panel was removed
          with migration 163. The new social-scheduling feature opens
          via the toolbar's "Compose Social Post" hook → SocialComposer
          (lands in Milestone 1 task 5 of _specs/social-scheduling.md). */}

      <ActivityPanel activity={activity} team={team} />
    </div>
  );
}

export default React.memo(StoryEditorSidebar);
