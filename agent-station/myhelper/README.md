# MyHelper — Activation Checklist

Everything required for the MyHelper bot to go live. Assumes the
**digital-ad-workflow session has already committed and pushed its
changes** — this is the tail-end of the week's work.

## What's already done (committed, live)

- **Migration 074** (`supabase/migrations/074_myhelper_foundation.sql`)
  is applied to the live DB:
  - `team_role` enum gained `'Bot'`
  - `team_notes.context_page text` column added
  - `bot_query_log` table created with RLS
- **`_docs/`** contains the 10 seed markdown files + `_starters.json`
- **`src/components/MyHelperLauncher.jsx`** is staged but **not imported
  anywhere yet** (no App.jsx edits to avoid cross-session collision)
- **`agent-station/myhelper/bot.py`** is written with the blocker fixes
  from the design review:
  - Pure-numpy cosine similarity (no sqlite-vss / sqlite-vec)
  - Retrieval-distance-gated escalation (not LLM self-report)
  - Zero-retrieval short-circuit and hard-floor pre-LLM escalation
  - Asker exclusion from MySupport recipients (no ping-back loop)
  - Stateless-safe prompt (bot commits to action, doesn't ask follow-ups)

## What to activate, in order

### 1. Seed the MyHelper team_members row

```sql
insert into team_members (id, name, role, email, phone, is_active, is_hidden, permissions, module_permissions)
values (
  gen_random_uuid(),
  '🤖 MyHelper',
  'Bot',
  'helper@mydash.local',
  '',
  true,
  true,      -- is_hidden = true so MyHelper doesn't appear in team dropdowns
  array['bot']::text[],
  array['messaging']::text[]
)
returning id;
```

**Copy the returned UUID — this is `MYHELPER_ID`.**

### 2. Grant MySupport to whoever is on-call today

```sql
update team_members
set permissions = array_append(permissions, 'mysupport')
where email = 'president@statesmen.org';  -- adjust
```

### 3. Deploy bot.py to the Mac Mini agent station

```bash
# On the Mac Mini (192.168.0.65)
mkdir -p ~/agent-station/myhelper
rsync -av ~/Documents/Dev/MyDash/agent-station/myhelper/bot.py \
          ~/agent-station/myhelper/bot.py
rsync -av ~/Documents/Dev/MyDash/_docs/ \
          ~/agent-station/myhelper/_docs/

cd ~/agent-station/myhelper
python3 -m venv venv && source venv/bin/activate
pip install supabase requests numpy

ollama pull nomic-embed-text     # one-time
ollama pull gemma3:27b           # one-time (or use a smaller model — see note)

cat > .env <<EOF
SUPABASE_URL=https://hqywacyhpllapdwccmaw.supabase.co
SUPABASE_SERVICE_KEY=<paste from Supabase project settings>
MYHELPER_ID=<paste UUID from step 1>
DOCS_DIR=/Users/<user>/agent-station/myhelper/_docs
CHAT_MODEL=gemma3:27b
EOF

set -a; source .env; set +a
python bot.py
```

Wrap in launchd later for persistence.

**Model choice:** `gemma3:27b` is the default but expect 15–30s latency
on Mac Mini hardware for a help-desk-style query. If users complain,
swap to `llama3.1:8b` — quality drop is acceptable for doc-grounded
Q&A, latency drops to 3–5s.

### 4. Enable the launcher in the UI

Two edits in `src/App.jsx` — do these as a single commit named
`feat: mount MyHelper launcher` once the bot.py service is verified
working end-to-end:

```jsx
// Near the other eager imports (top of file)
import MyHelperLauncher from "./components/MyHelperLauncher";

// Inside the top-level return, just before the closing
// </PageHeaderProvider> tag:
<MyHelperLauncher
  currentUser={currentUser}
  team={team}
  pg={pg}
  deepLink={deepLink}
/>
```

The component is already written; these are the only App.jsx edits needed.

### 5. Messaging page polish (optional, same commit)

In `src/pages/Messaging.jsx` — pin MyHelper to the top of the team
picker and tag outbound messages from the Messages page with the
`bot_query` context_type:

```js
const MYHELPER_EMAIL = "helper@mydash.local";

// In the picker sort:
const sortedPickerTeam = [...team].sort((a, b) => {
  if (a.email === MYHELPER_EMAIL) return -1;
  if (b.email === MYHELPER_EMAIL) return 1;
  return a.name.localeCompare(b.name);
});

// In the send handler:
const isBot = team.find(t => t.id === activeOther)?.email === MYHELPER_EMAIL;
await supabase.from("team_notes").insert({
  from_user: meId,
  to_user: activeOther,
  message: draft.trim(),
  context_type: isBot ? "bot_query" : null,
  // context_page stays null from the Messages page (no page context)
  is_read: false,
});
```

Not strictly required — MyHelper works from the floating launcher
alone. The Messaging integration is what makes conversation history
discoverable in the normal workflow.

### 6. Smoke test

```sql
-- As a test user, insert a fake bot query
insert into team_notes (from_user, to_user, message, context_type, context_page, is_read)
values (
  '<your-own-team-member-id>',
  '<MYHELPER_ID>',
  'How do I create a proposal?',
  'bot_query',
  'sales/pipeline',
  false
);
```

Within 5–30 seconds (poll interval + LLM latency) a reply from
MyHelper should land. Check `bot_query_log` for the entry:

```sql
select question, confidence, escalated, page_context, created_at
from bot_query_log order by created_at desc limit 5;
```

### 7. Monday-morning onboarding blast

Once the bot has run cleanly for a day or two, send the greeting to
every active non-bot team member:

```sql
insert into team_notes (from_user, to_user, message, context_type, is_read)
select
  '<MYHELPER_ID>',
  tm.id,
  E'👋 Hi ' || split_part(tm.name, ' ', 1) || E'! I''m MyHelper.\n\n'
    E'Ask me anything about how to use MyDash — how to find a client, '
    E'how to build a proposal, what a button does, where something lives. '
    E'I''ll answer from the docs, or ping MySupport if I don''t know.\n\n'
    E'You can reach me two ways:\n'
    E'• Click the 🤖 button in the bottom-right of any page\n'
    E'• Or open Messages and message me directly\n\n'
    E'Try me: just send a question.',
  'bot_reply',
  false
from team_members tm
where tm.is_active = true
  and tm.is_hidden = false
  and tm.role <> 'Bot'
  and tm.id <> '<MYHELPER_ID>';
```

## Known limitations (intentional MVP scope)

- No live data queries — the bot answers from docs only
- No multi-turn memory — each question is stateless
- No streaming — "Thinking…" placeholder is the only progress indicator
- No admin UI for `bot_query_log` yet (use SQL or build next iteration)
- `_docs/_starters.json` is imported directly in the component; edits
  require a rebuild + redeploy (acceptable at 20-file scale)

## Success metrics (week 1)

- ≥1 team member says *"MyHelper actually helped me find that"*
- 0 reports of wrong information
- ≥30 `bot_query_log` entries with ≥70% non-escalated
