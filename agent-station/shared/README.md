# Wednesday Agent Station — Shared Module

Shared infrastructure used by every agent (`myhelper/`, `press-processor/`,
`signal-runner/`, `editorial-corpus/`, etc.).

This is the canonical place for:
- The Gemini API client (`gemini.py`)
- The Supabase client factory and convenience helpers (`supabase_client.py`)

If you find yourself writing a Gemini call or a Supabase query in a new
agent that already exists in another agent, lift it here instead.

---

## Why a shared module

Three reasons:

1. **One place changes when external APIs change.** Google's generateContent
   endpoint, Supabase's client interface, Gemini's safety-filter response
   shape — when any of these shift, one file changes, not five.

2. **New agents fill in the blanks.** Once `gemini.py` and
   `supabase_client.py` exist, building a new agent is pulling data,
   calling Gemini, and writing back — no boilerplate to reinvent.

3. **Convention enforcement.** When every agent imports `from
   supabase_client import sb`, every agent uses the same connection,
   the same env vars, the same auth pattern. New agents can't accidentally
   roll their own.

---

## What's NOT in here

- `.env` loading. Each agent loads its own `.env` from its own folder,
  because `dotenv.load_dotenv()` needs a path that's relative to the
  caller, not the shared module. The shared module READS env vars from
  `os.environ` but doesn't load them.
- Agent-specific business logic (corpus building, queue polling, prompt
  composition). Those live in each agent's `bot.py`.
- Logging frameworks. We use `print()` with `[agent-name]` prefixes,
  matching the existing MyHelper pattern. LaunchAgent captures stdout
  to `bot.log` and stderr to `bot.err`. If structured logging becomes
  necessary later, add it here.

---

## How to use from a new agent's `bot.py`

```python
"""
my-new-agent — does the thing.
"""
import os
import pathlib
import sys
from dotenv import load_dotenv

# Load .env from the script's own directory FIRST, then import shared.
# Order matters: shared modules read env vars at first use, so env must
# be loaded before any shared call.
load_dotenv(pathlib.Path(__file__).parent / ".env", override=True)

# Add ../shared to the import path.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "shared"))
from gemini import gemini_call, gemini_embed, extract_confidence
from supabase_client import sb, get_team_member, write_team_note

# ─── Config from .env ──────────────────────────────────
MY_BOT_ID = os.environ["MY_BOT_ID"]


# ─── Main loop ─────────────────────────────────────────
def main():
    while True:
        # ... fetch work, call Gemini, write back ...
        pass


if __name__ == "__main__":
    main()
```

---

## API surface

### `gemini.py`

```python
gemini_call(
    *,
    system_prompt: str,
    user_prompt: str,
    model: str = None,                # defaults to gemini-2.5-flash
    temperature: float = 0.2,
    response_format: str = "text",    # "text" or "json"
    max_output_tokens: int = 2048,
    timeout: int = 60,
    retries: int = 1,
) -> str
    # Returns response text. Raises GeminiError on failure.

gemini_embed(
    text: str,
    *,
    model: str = "text-embedding-004",
    task_type: str = "RETRIEVAL_DOCUMENT",  # or RETRIEVAL_QUERY, etc.
    timeout: int = 30,
) -> list[float]
    # Returns 768-dim embedding. Raises GeminiError on failure.

extract_confidence(text: str) -> tuple[str, float]
    # Pulls "CONFIDENCE: 0.85" off the end of a response.
    # Returns (cleaned_text, confidence_float).

DEFAULT_MODEL  # gemini-2.5-flash
PRO_MODEL      # gemini-2.5-pro
EMBED_MODEL    # text-embedding-004
GeminiError    # exception class for any Gemini failure
```

### `supabase_client.py`

```python
sb
    # Lazily-initialized Supabase client. Use like:
    #   sb.table("stories").select("*").eq("id", story_id).execute()

get_team_member(user_id: str) -> dict
    # Returns {name, role, email} or fallback dict if not found.

get_role_holders(role: str) -> list[dict]
    # Returns active team_members with the given role.
    # Useful for: "send to all Editor-in-Chief role holders".

get_permission_holders(permission: str, exclude: str = None) -> list[str]
    # Returns team_members.id list of active members holding `permission`.
    # Optional exclude prevents self-ping (e.g. asker excluded from
    # MySupport escalation).

write_team_note(
    *,
    from_user: str,
    to_user: str,
    message: str,
    context_type: str = None,
    context_page: str = None,
    context_id: str = None,
) -> dict
    # Inserts a team_notes row. Returns the created row.
```

---

## Per-agent .env contract

Every agent's `.env` must contain at minimum:

```
SUPABASE_URL=https://hqywacyhpllapdwccmaw.supabase.co
SUPABASE_SERVICE_KEY=<service role key from Supabase project settings>
GEMINI_API_KEY=<single shared Gemini key>
GEMINI_MODEL=gemini-2.5-flash      # optional override
```

Plus agent-specific values like `PRESS_BOT_ID`, `GMAIL_INTAKE_ADDRESS`,
`DRIVE_INTAKE_FOLDER_ID`, etc., documented in each agent's own README.

The same `GEMINI_API_KEY` is shared across all agents per the locked
spec decision (no per-agent budget tracking yet). If costs become
material at month 3, swap to per-agent keys via Google Cloud Console
and update each `.env` independently — no code changes needed in the
shared module.

---

## Bot identity UUIDs (from migration 088)

These are hardcoded in migration 088 and should be referenced by literal
in each agent's `.env`:

```
MYHELPER_ID=13b6fd61-4215-4813-9058-762c10d24e1a   (existing, migration 074)
PRESS_BOT_ID=a1111111-0000-0000-0000-000000000001
SEO_BOT_ID=a2222222-0000-0000-0000-000000000002
PROPOSAL_BOT_ID=a3333333-0000-0000-0000-000000000003
SIGNAL_BOT_ID=a4444444-0000-0000-0000-000000000004
```

Editorial Assistant doesn't need a bot identity — its tools are
synchronous Edge Function calls from the editor UI, no team_notes
written.

---

## Deployment to the Mac Mini

The `~/Documents/Dev/MyDash/agent-station/` folder is the source of
truth in git. Deploy to the Mac Mini at 192.168.0.65 via rsync:

```bash
# From the Mac Mini, after pulling the repo:
rsync -av ~/Documents/Dev/MyDash/agent-station/shared/ \
          ~/wednesday-station/jobs/shared/

# Each agent then references shared via the relative path:
#   sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "shared"))
```

Existing MyHelper deployment lives at
`/Users/wednesdayagentic/wednesday-station/jobs/myhelper/` — new agents
follow the same convention: `wednesday-station/jobs/<agent-name>/`,
with `wednesday-station/jobs/shared/` alongside.

**One-time setup per agent on the Mac Mini:**

```bash
cd ~/wednesday-station/jobs/<agent-name>
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt   # supabase, requests, python-dotenv, etc.
```

LaunchAgent plist gets installed once:

```bash
cp station.wednesday.<agent-name>.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/station.wednesday.<agent-name>.plist
```

Logs land in the agent's own `logs/bot.log` and `logs/bot.err`.

---

## Testing locally

To smoke-test a new agent on your dev machine before deploying:

```bash
cd ~/Documents/Dev/MyDash/agent-station/<agent-name>
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Make sure .env is filled in (copy from .env.example).
python bot.py
```

The agent will run against the live Supabase database (because there's
only one — there's no separate dev DB at this scale), so be careful
with anything destructive. Most agents are write-once-and-done per
input, so re-running them is safe — but the Press Processor will
re-process emails it's already seen if you mark them unread, etc.

Use a dedicated test team_member (e.g., a row with email `test@mydash.local`)
as the "asker" for any interaction tests, so test traffic doesn't
mingle with real team activity.
