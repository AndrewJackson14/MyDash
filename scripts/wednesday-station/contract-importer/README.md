# contract-importer

Wednesday Agent Station LaunchAgent that turns mobile-uploaded paper-contract photos into proposal drafts in MyDash. Picks up `contract_imports` rows in `pending` status, runs the photos through Gemini Vision, writes the structured result back as `extracted` so the mobile reviewer can confirm + convert.

## Architecture

```
mobile (Christie's iPhone)
   │ taps "Upload contract", picks photos
   ▼
Supabase Storage  (bucket: contract-imports/{auth_uid}/{import_id}/...)
   │
   ▼
contract_imports row  (status=pending)
   │
   ▼  ← this worker, polling every ~15s
Gemini Vision API
   │
   ▼  writes structured JSON
contract_imports row  (status=extracted, extracted_json populated)
   │
   ▼
mobile review screen → tap Convert → real proposal in MyDash
```

## Deploy on the Wednesday Agent Station

```bash
ssh wednesdayagentic@192.168.0.65

# Land the code
mkdir -p ~/wednesday-station/jobs ~/wednesday-station/logs
cd ~/wednesday-station/jobs
# Either rsync from your laptop:
#   rsync -avz scripts/wednesday-station/contract-importer/ wednesdayagentic@192.168.0.65:~/wednesday-station/jobs/contract-importer/
# Or git clone the MyDash repo and symlink:
#   git clone https://github.com/AndrewJackson14/MyDash.git ~/wednesday-station/repos/MyDash
#   ln -s ~/wednesday-station/repos/MyDash/scripts/wednesday-station/contract-importer ./contract-importer

cd ~/wednesday-station/jobs/contract-importer
npm install --production

# Env
cp .env.example .env
$EDITOR .env  # paste SUPABASE_SERVICE_ROLE_KEY + GEMINI_API_KEY

# Smoke test (Ctrl-C after one tick to stop)
node --env-file=.env index.mjs

# Install the LaunchAgent
cp station.wednesday.contract-importer.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/station.wednesday.contract-importer.plist

# Verify
launchctl print user/$(id -u)/station.wednesday.contract-importer | head -20
tail -f ~/wednesday-station/logs/contract-importer.out.log
```

## Reload after a code change

```bash
launchctl unload ~/Library/LaunchAgents/station.wednesday.contract-importer.plist
launchctl load   ~/Library/LaunchAgents/station.wednesday.contract-importer.plist
```

## Logs

* stdout: `~/wednesday-station/logs/contract-importer.out.log`
* stderr: `~/wednesday-station/logs/contract-importer.err.log`

## Sanity checks

A healthy worker logs `[contract-importer] starting (model=gemini-2.0-flash, poll=15000ms)` once and then nothing until a row appears. When it processes one you'll see `processing <uuid> (N photos)` followed by `<uuid> → extracted (confidence 0.84)` (or a `failed` line with the reason).

If `claim_pending_contract_import` RPC isn't deployed (it's optional — the worker also has a fallback UPDATE), claims still happen but with slightly weaker concurrency guarantees. Don't run more than one worker at a time.

## Tunables

* `POLL_INTERVAL_MS` — how often to check for new rows. 15s is the default.
* `GEMINI_MODEL` — default `gemini-2.0-flash`. Bump to `gemini-2.0-pro` if `flash` fumbles handwriting too often (slower + higher cost).

## Cost

`gemini-2.0-flash` charges roughly $0.0001 per image input. A 3-photo contract = ~$0.0003. At 50 contracts/week that's ~$0.06/month. Negligible.
