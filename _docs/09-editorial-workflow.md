---
id: editorial-workflow
module: Editorial
audience: editor
last_verified: 2026-04-19
---

# Editorial — story stages, web queue, print queue

Every story moves through a status pipeline:

`Draft → Needs Editing → Edited → Approved → Web Approved → Sent to Web / Sent to Press → Published`

**Assigning a story:** on the Editorial board, click **+ Story**. Pick a publication, assign a writer, set a due date, and optionally link an issue. Category and word-count target help downstream planning.

**Writer's view:** writers see only stories assigned to them (or stories where author_name matches their name for legacy rows). Filter chips at the top let them show/hide completed work.

**Editor review:** editors see the full queue and can move stories between stages. Inline comments live in the Comments tab on the story detail.

**Web approval:** on the story detail, toggle **Approve for Web**. Setting `scheduled_at` publishes automatically at that time; leaving it empty publishes when someone hits **Publish to Web**.

**Print publishing:** once a story is placed on a specific issue via the flatplan (`print_issue_id` set), its print stage advances: `none → on_page → proofread → approved → sent_to_press`. Place-on-page happens in the flatplan UI.

**Cross-publish:** from the story detail, **Cross-Publish** makes a copy in a sister publication. Useful for regional stories that run in multiple papers.

**Web queue:** the **Web Approved** column on the Editorial board is the "about to go live" queue. Content Editors review SEO title, meta, featured image, and slug before publishing.
