# Press Release Processor — Activation Checklist

Auto-triages press releases from Gmail (forward-to inbox) and Google Drive
(intake folder), routes them to the right publication, rewrites in house
voice, and drops them in the editorial queue as Draft stories scored for
newsworthiness.

This is the second agent on the Wednesday Agent Station, after MyHelper.
Pattern follows the same shape: `bot.py` + `shared/` module + LaunchAgent
plist + per-agent `.env`.

---

## What's in this folder

```
press-processor/
├── bot.py                          main orchestrator
├── prompt.py                       Gemini system prompt + geography routing
├── extractors.py                   PDF + DOCX text extraction
├── gmail_client.py                 Gmail API wrapper (OAuth, fetch, label)
├── drive_client.py                 Drive API wrapper (watch folder, move)
├── requirements.txt                Python deps
├── .env.example                    template — copy to .env and fill in
├── station.wednesday.press.plist   LaunchAgent config
└── README.md                       this file
```

Dependencies: `agent-station/shared/gemini.py` and
`agent-station/shared/supabase_client.py` must exist first. See
`agent-station/shared/README.md` for their API surface.

---

## What's already done

- **Migration 088** (`supabase/migrations/088_agent_foundation.sql`) is
  applied to the live DB:
  - Bot identity seeded: `PRESS_BOT_ID=a1111111-0000-0000-0000-000000000001`
  - `stories` gains `source_type`, `source_external_id`, `body_original`
  - `press_release_log` table created with RLS
- **Shared module** (`agent-station/shared/gemini.py`,
  `supabase_client.py`) is committed and deployable.

Confirm with:
```sql
select id, name, role from team_members
where id = 'a1111111-0000-0000-0000-000000000001'::uuid;
-- Should return: 📰 Press Processor / Bot

select count(*) from press_release_log;
-- Should return: 0
```

---

## Setup steps (do these in order)

### 1. Create the Gmail intake address

**Option A — dedicated Google Workspace address (preferred):**

In Google Admin (admin.google.com → Users or Groups), create
`press-intake@13stars.media` as either:
- A new Google Group with "receives external mail" enabled (cheapest),
  with members being the bot's OAuth account, OR
- A new Google Workspace user (one seat license) dedicated to the bot

**Option B — alias on an existing account:**

If adding another seat is overkill, add `press-intake+13stars@...` as
a send-as alias on an existing Workspace account and have the bot
authenticate as that account. The filter step below still works.

Whichever path: **the authenticated Gmail account must be the one whose
inbox the bot reads.** The OAuth consent in step 3 uses that account's
credentials.

### 2. Create the Drive intake folder + subfolder

In Google Drive:

1. Create a folder named **"13 Stars Press Releases — Intake"** in
   the shared team drive (or in the bot account's My Drive).
2. Inside that folder, create a subfolder named **"Processed"**.
3. Grant write access to every team member who should be able to drop
   files there: Hayley, Camille, Nic, Anthony, Cami.
4. **Copy the folder IDs from the URLs.** Each Drive folder URL looks
   like `https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRs`.
   The `1aBc…` part at the end is the folder ID. You'll paste these
   into `.env` as `DRIVE_INTAKE_FOLDER_ID` and `DRIVE_PROCESSED_FOLDER_ID`.

### 3. Set up OAuth credentials

You already have the Google Cloud project. Make sure:

**a) Gmail API and Drive API are enabled** in the project:
- Google Cloud Console → APIs & Services → Library
- Search "Gmail API" → Enable
- Search "Google Drive API" → Enable

**b) OAuth consent screen is configured:**
- APIs & Services → OAuth consent screen
- User type: Internal (if 13 Stars has a Workspace domain) or External
- Scopes to add:
  - `https://www.googleapis.com/auth/gmail.modify`
  - `https://www.googleapis.com/auth/drive`

**c) Create OAuth 2.0 Client ID:**
- APIs & Services → Credentials → + Create Credentials → OAuth client ID
- Application type: **Desktop app**
- Name: "Press Release Processor"
- Download the JSON — save as `credentials.json` locally for step 5.

### 4. Copy files to the Mac Mini

```bash
# From your dev machine:
rsync -av ~/Documents/Dev/MyDash/agent-station/shared/ \
          wednesdayagentic@192.168.0.65:~/wednesday-station/jobs/shared/

rsync -av ~/Documents/Dev/MyDash/agent-station/press-processor/ \
          wednesdayagentic@192.168.0.65:~/wednesday-station/jobs/press-processor/ \
          --exclude .env --exclude venv --exclude logs --exclude token.json
```

### 5. Configure on the Mac Mini

SSH to the Mac Mini:

```bash
ssh wednesdayagentic@192.168.0.65
cd ~/wednesday-station/jobs/press-processor

# Virtual env
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Log directory
mkdir -p logs

# Put the OAuth credentials JSON in place (copy from your dev machine)
# If you downloaded credentials.json locally in step 3:
scp ~/Downloads/credentials.json \
    wednesdayagentic@192.168.0.65:~/wednesday-station/jobs/press-processor/credentials.json

# Create .env from the template
cp .env.example .env
# Edit .env and fill in:
#   SUPABASE_SERVICE_KEY  (from supabase.com → project → settings → API)
#   GEMINI_API_KEY        (from aistudio.google.com → Get API Key)
#   DRIVE_INTAKE_FOLDER_ID      (from step 2)
#   DRIVE_PROCESSED_FOLDER_ID   (from step 2)
nano .env
```

### 6. First run — authorize OAuth

The first run will open a browser for Google OAuth consent. **Run it
from the Mac Mini in a session where you can see a browser window**
(Screen Sharing from your laptop works; SSH alone won't because the
OAuth flow needs a real browser). After consent, a `token.json` file
is written and all subsequent runs auto-refresh it.

```bash
cd ~/wednesday-station/jobs/press-processor
source venv/bin/activate
python bot.py
```

On first run:
1. Browser opens to Google's OAuth consent screen
2. Sign in as the Gmail account you want the bot to read
   (press-intake@13stars.media)
3. Click "Allow" to grant Gmail.modify + Drive scopes
4. Browser redirects to a "success" page; bot prints
   `"Press Processor starting"` and begins polling

Leave it running for a few minutes with no unread mail / no intake files
to confirm no errors in `logs/bot.err`. Then Ctrl-C and move to step 7.

### 7. Install LaunchAgent

```bash
cp ~/wednesday-station/jobs/press-processor/station.wednesday.press.plist \
   ~/Library/LaunchAgents/

launchctl load ~/Library/LaunchAgents/station.wednesday.press.plist
```

Verify it's running:
```bash
launchctl list | grep press
# Should show: station.wednesday.press
```

Logs land at `~/wednesday-station/jobs/press-processor/logs/bot.log`
and `bot.err`.

To stop:
```bash
launchctl unload ~/Library/LaunchAgents/station.wednesday.press.plist
```

### 8. Smoke test — email path

Send a real-looking press release to `press-intake@13stars.media`. Wait
60-90 seconds. Check:

```sql
-- The agent should have logged it
select created_at, source, triaged_action, newsworthiness,
       publication_assigned, rationale
from press_release_log
order by created_at desc limit 1;

-- And if newsworthiness >= 3, there should be a new Draft story
select id, title, publication_id, status, source_type, created_at
from stories
where source_type = 'press_release'
order by created_at desc limit 1;
```

Expected: one `press_release_log` row, and — if the test release scored
3+ — one `stories` row with `status='Draft'`, `source_type='press_release'`.

Also check MyDash: the Content Editor and Editor-in-Chief should see a
new `team_note` in their Messages from 📰 Press Processor.

### 9. Smoke test — Drive path

Drop a PDF or DOCX into the intake Drive folder. Wait 60-90 seconds.
Same verifications as step 8, but `source='drive'` in the log. The file
should be moved from Intake to Processed automatically.

---

## How it works

**Polling loop** (every 60s):

1. `poll_gmail()` — fetches up to 10 unread messages not already labeled
   "Processed by Press Bot". Walks MIME parts to pull plain-text body +
   binary attachments. Extracts text from PDFs/DOCXs via
   `extractors.extract_by_mime()`.

2. `poll_drive()` — lists files in the intake folder. Downloads each,
   extracts text, processes, moves to Processed subfolder.

**Per release** (same pipeline regardless of source):

1. **Dedup check.** `stories.source_external_id` is queried for this
   source+id. Skip if already there.

2. **Gemini call.** Single JSON-mode call with the prompt from `prompt.py`.
   Returns newsworthiness, publication, category, headline options, and
   full rewrite.

3. **Routing rules applied:**
   - `is_spam` or `!is_press_release` → log `rejected_spam`, no story
   - `publication_id_suggested == 'out_of_geo'` → log `rejected_out_of_geo`
   - `is_duplicate_likely` AND similar headline exists in last 14 days →
     log `rejected_duplicate`
   - `newsworthiness >= 3` → create Draft story, notify editors via
     `team_notes`
   - `newsworthiness < 3` → create Draft story with `priority='low'`,
     NO notification

4. **Mark source processed.** Gmail label applied + message marked read,
   OR Drive file moved to Processed subfolder.

5. **Log outcome** to `press_release_log`.

**Nothing is destructive.** The original email body and attachment text
are preserved in `press_release_log.raw_body` and
`press_release_log.raw_attachments_text` for audit. The verbatim source
text also ends up in `stories.body_original` for any story that's created.

---

## Tuning the prompt

The system prompt lives in `prompt.py` for easy iteration. The two most
common adjustments:

**Newsworthiness threshold too noisy.** If Camille reports Draft stories
she wouldn't have run, raise `DRAFT_THRESHOLD` in `bot.py` from 3 to 4.
Newsworthiness 3 items still create stories but without notification.

**Wrong publication routing.** Edit `GEOGRAPHY_ROUTING` in `prompt.py` to
add missing neighborhoods or adjust boundaries (e.g., Shandon sometimes
goes to AN instead of PRP depending on the story's focus).

**House voice drift.** Edit `REWRITE RULES` in `SYSTEM_PROMPT`. Add
specific stylistic do's and don'ts Camille calls out.

After any prompt edit, re-deploy:
```bash
rsync -av ~/Documents/Dev/MyDash/agent-station/press-processor/prompt.py \
          wednesdayagentic@192.168.0.65:~/wednesday-station/jobs/press-processor/prompt.py

ssh wednesdayagentic@192.168.0.65 \
  "launchctl unload ~/Library/LaunchAgents/station.wednesday.press.plist && \
   launchctl load ~/Library/LaunchAgents/station.wednesday.press.plist"
```

The bot picks up the new prompt on next poll — no state is lost.

---

## Known limitations (intentional MVP scope)

- **No OCR for scanned PDFs.** `pdfplumber` returns empty text on
  image-only PDFs; the agent logs `error: empty body` and skips. If
  this becomes a pattern, add Tesseract OCR to `extractors.py`.
- **Headline duplicate detection is naive.** Substring match on first 5
  words of the title. Misses semantic duplicates (same story with
  different headline phrasing). Acceptable at current release volume.
- **No multi-publication splits.** If a release genuinely belongs on both
  PRP and AN, the agent picks one as primary and notes the other in
  `cross_pub_suggestion`. Camille then duplicates manually. Auto-split
  is intentionally deferred.
- **Attachments beyond PDF/DOCX ignored.** `.jpg` or `.png` attachments
  are not used (no photo workflow yet). Press photos land on the
  Draft's notes for the editor to handle manually.
- **No retry queue.** If Gemini is down, the release gets `action=error`
  and the source is marked processed. A future enhancement is a retry
  table; for now, errors are recoverable by manually resetting the
  Gmail "Processed" label or moving the Drive file back to Intake.

---

## Success metrics (week 1)

- ≥5 press releases processed per day across both channels
- ≤1 false Draft per day (something scored 3+ that shouldn't have been)
- ≥80% of Draft stories are publication-accurate without re-routing
- Camille reports the agent saves her ≥30 minutes/day on triage

Review `press_release_log` at end of week 1 and tune newsworthiness
threshold and prompt based on actual data.
