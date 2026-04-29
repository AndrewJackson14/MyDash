# MyDash Role Knowledge Base — Build Spec

**Version:** 1.0
**Last updated:** 2026-04-29
**Owner:** Andrew Jackson
**Status:** Ready for implementation

---

## Goal

Single-source markdown knowledge base, one file per role, that powers:

1. Human onboarding and training
2. Wednesday agent context injection
3. In-app KB viewer (per-role help inside MyDash)

One source of truth, three outputs.

---

## Architecture

```
MyDash/
└── docs/
    └── knowledge-base/
        ├── _meta.json                    # role registry + version
        ├── _shared/
        │   ├── glossary.md               # publications, abbreviations, system terms
        │   ├── workflows.md              # cross-role workflows (ad lifecycle, editorial)
        │   └── tools.md                  # MyDash modules + external integrations
        ├── publisher.md
        ├── editor-in-chief.md
        ├── content-editor.md
        ├── layout-designer.md
        ├── ad-designer.md
        ├── sales-rep.md
        └── office-admin.md
```

**Why Git-only (no DB):**
- Zero schema, no migration, no RLS policy required
- Agents fetch via `https://raw.githubusercontent.com/AndrewJackson14/MyDash/main/docs/knowledge-base/{role}.md`
- In-app viewer reads via Vite static import at build time OR fetches from GitHub raw at runtime
- Version-controlled by default, edits go through PR review

---

## File Structure (per role)

Every role file uses identical YAML frontmatter and section headings so the in-app viewer and agents can parse predictably.

```markdown
---
role: sales-rep
display_name: Sales Representative
team_members: [Dana McGraw, Christie Coyes]
reports_to: publisher
last_updated: 2026-04-29
version: 1.0
---

# Sales Representative

## Role Summary
One-paragraph mission statement.

## Core Responsibilities
Bulleted list — what this role owns end-to-end.

## Daily Workflow
Numbered sequence — what a typical day looks like in MyDash.

## MyDash Modules Used
| Module | Purpose | Permission Level |
|--------|---------|------------------|
| CRM | Lead/client management | Full |
| Ad Proposals | Create/send proposals | Full |
| ... | ... | ... |

## Key Workflows
### Workflow Name
Step-by-step. Reference `_shared/workflows.md#anchor` when shared.

## Decisions This Role Owns
What they can decide without escalation.

## Decisions That Require Escalation
What goes to Publisher / Editor-in-Chief / Office Admin.

## Handoffs
### To [Other Role]
What gets passed, when, and through which MyDash trigger.

### From [Other Role]
What they receive and how it arrives in their queue.

## KPIs & Success Metrics
What's measured. Where it surfaces in MyDash.

## Common Issues & Resolutions
Troubleshooting reference.

## Glossary References
Links to `_shared/glossary.md` terms specific to this role.
```

---

## Discovery Phase (do this first)

Before writing any role file, scan the codebase to extract ground truth.

### 1. Module inventory
List every page/route in MyDash. Identify which roles access each (from route guards, RLS policies, role-based component rendering).

### 2. Permission matrix
Pull from Supabase RLS policies + any frontend role gates. Cross-reference `team_members` table for current role assignments.

### 3. Workflow extraction
Trace key RPCs (`convert_proposal_to_contract`, ad project auto-creation, story publish flow) and document the human steps that wrap them.

### 4. Component-to-role mapping
For each major component (StoryEditor, Ad Projects Kanban, Editorial Dashboard), identify primary user role.

### Discovery output: `_meta.json`

```json
{
  "version": "1.0",
  "last_scan": "2026-04-29",
  "roles": [
    {
      "id": "publisher",
      "display_name": "Publisher",
      "members": ["Hayley Mattson"],
      "modules": ["command-center", "financials", "all-dashboards-readonly"],
      "owns_decisions": [
        "issue-send-to-press",
        "contract-approval",
        "rate-card-changes"
      ]
    }
  ],
  "modules": [
    {
      "id": "ad-projects",
      "path": "/ad-projects",
      "roles": ["ad-designer", "publisher", "editor-in-chief"],
      "primary_role": "ad-designer"
    }
  ]
}
```

---

## Role Files — Sources

For each role, source content from:

- **Andrew's userMemories context** (loaded into agent)
- **Codebase scan** — actual modules and permissions
- **Existing specs** — anything in `~/Library/CloudStorage/ProtonDrive-.../Dev/MyDash/`

### Roles to build

| File | Team Member(s) | Primary Modules |
|------|----------------|------------------|
| `publisher.md` | Hayley Mattson | Command Center, Financials, all-dashboards (read), Issue Sign-Off |
| `editor-in-chief.md` | Andrew Jackson / Nic Mattson | Editorial Dashboard, Web Queue, system admin |
| `content-editor.md` | Camille | StoryEditor, copy editing, web publishing |
| `layout-designer.md` | Anthony | Issue Planning, print layout queue, press handoff |
| `ad-designer.md` | Jen | Ad Projects Kanban, proof routing, revision tracking |
| `sales-rep.md` | Dana McGraw, Christie Coyes | CRM, Proposals, Contracts, renewal pipeline |
| `office-admin.md` | Cami | Billing, AR, Subscriptions, QuickBooks sync |

---

## In-App KB Viewer Component

Build at `src/modules/KnowledgeBase/`:

```
KnowledgeBase/
├── index.tsx              # shell, role selector
├── KBViewer.tsx           # markdown renderer (react-markdown + remark-gfm)
├── KBSidebar.tsx          # TOC + role switcher
├── useKBContent.ts        # hook: imports MD via Vite glob or fetches from GitHub raw
└── constants.ts           # role list, base URL
```

### Behavior

- **Sidebar:** Role list. Current user's role highlighted and default-selected.
- **Search:** Client-side fuzzy match across all roles + shared docs (headings + body).
- **Deep links:** `/kb/sales-rep#contract-conversion` resolves to anchor.
- **Edit on GitHub:** Per-page link that opens the `.md` file in the repo.
- **Tooltip integration:** Any MyDash component can call `<KBLink role="sales-rep" anchor="contract-conversion">Learn more</KBLink>` to deep-link.

---

## Wednesday Agent Integration

Agents fetch role context on init. Add to each agent's system prompt builder:

```
KB_BASE = "https://raw.githubusercontent.com/AndrewJackson14/MyDash/main/docs/knowledge-base"

context = fetch(`${KB_BASE}/_shared/glossary.md`)
       + fetch(`${KB_BASE}/_shared/workflows.md`)
       + fetch(`${KB_BASE}/${agent.primary_role}.md`)
```

- Cache locally with TTL = 1 hour
- Bust cache on `_meta.json` version bump

---

## Build Order

1. Generate `_meta.json` from codebase scan.
2. Write `_shared/glossary.md` and `_shared/workflows.md` first (role files reference them).
3. Build `publisher.md` as the template. **Get Andrew's review before replicating structure.**
4. Generate remaining 6 role files using approved template.
5. Build in-app viewer.
6. Wire `KBLink` component into 2–3 high-traffic MyDash modules as proof-of-concept.

---

## Acceptance Criteria

- [ ] All 7 role files exist with complete frontmatter and all required sections
- [ ] `_meta.json` validates against schema and matches actual codebase routes
- [ ] `_shared/` contains glossary, workflows, tools — no duplication across role files
- [ ] In-app viewer renders all roles; search works; deep links resolve
- [ ] Wednesday agent prompt builder fetches and injects role context successfully
- [ ] One `KBLink` integration shipped in a live module (suggested: Ad Projects Kanban → ad-designer KB)

---

## Notes for Implementer

- **Wait for full Discovery Phase output before generating role files.** Andrew reviews `_meta.json` and `publisher.md` before the other 6 are written.
- **Reference, don't duplicate.** Cross-role workflows (ad lifecycle, editorial flow) live in `_shared/workflows.md`. Role files link in via anchor.
- **Match existing MyDash file conventions.** Decompose modules into shell + constants + subcomponents per Andrew's standing pattern.
- **Git is the source of truth.** No direct edits on the server. All KB updates go through PR.
