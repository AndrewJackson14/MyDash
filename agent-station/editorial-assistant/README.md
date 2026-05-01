# Editorial Assistant — Activation Checklist

Synchronous editorial-quality agent invoked from MyDash StoryEditor.
The editor clicks **Check Editorial**, picks skills, and gets
suggestions back in a side panel. Four skills (ap_style, voice_match,
headline, attribution) and four voice profiles (`_default`,
`camille-devaul`, `hayley-mattson`, `nic-mattson`) per the spec.

This is the third agent on the Wednesday Agent Station, after
MyHelper and Press Processor. Pattern follows the same shape:
`server.py` + `shared/` + LaunchAgent plist + per-agent `.env`.

---

## What's in this folder

```
editorial-assistant/
├── server.py                              FastAPI entrypoint, port 8765
├── skills/
│   ├── __init__.py                        skill registry
│   ├── ap_style.py        / ap_style.SKILL.md
│   ├── voice_match.py     / voice_match.SKILL.md
│   ├── headline.py        / headline.SKILL.md
│   └── attribution.py     / attribution.SKILL.md
├── requirements.txt                       Python deps
├── .env.example                           template — copy to .env, fill in
├── station.wednesday.editorial.plist      LaunchAgent
└── README.md                              this file
```

Shared modules pulled from `agent-station/shared/`:
- `voice_kb.py` — voice profile resolver (this PR's siblings shipped it)
- `gemini.py` — Gemini API client (already in place from press-processor)

---

## Status

- ✅ **Phase B** — folder + voice_kb + /health + plist + configs
- ✅ **Phase C** — four skills (ap_style, voice_match, headline,
  attribution) + parallel orchestrator in /check + skill registry
- ✅ **Phase D** — Supabase Edge Function `editorial_check` bridge
  (verifies JWT, forwards to FastAPI with X-Mydash-Token)
- ⬜ **Phase E** — StoryEditor "Check Editorial" button + side panel
- ⬜ **Phase F** — Press Processor decommissioning
- ⬜ Mac Mini deployment + secrets + LAN routing (manual — see below)

Skills consume Gemini via `agent-station/shared/gemini.py`. Set
`GEMINI_API_KEY` in `.env` before booting in production. Set the
matching `MYDASH_TOKEN` on the Edge Function via `supabase secrets
set MYDASH_TOKEN=<value>`.

---

## Deploying to the Mac Mini

1. SSH or local terminal as `wednesdayagentic` on the Mac Mini.
2. Sync this folder:
   ```bash
   cd ~/wednesday-station/jobs
   git pull origin main
   # if first time:
   #   git clone https://github.com/AndrewJackson14/MyDash mydash-source
   # then symlink or copy editorial-assistant/ + shared/ into ~/wednesday-station/jobs/
   ```
3. Set up the venv:
   ```bash
   cd ~/wednesday-station/jobs/editorial-assistant
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   mkdir -p logs
   cp .env.example .env
   # edit .env: set MYDASH_TOKEN to a fresh `openssl rand -hex 32`
   ```
4. Smoke test in the foreground first:
   ```bash
   source venv/bin/activate
   python server.py
   # in another terminal:
   curl -s http://127.0.0.1:8765/health | jq
   ```
   Expect `status: "ok"`, `profiles_loaded: ["_default", "camille-devaul"]`,
   `profiles_failed: ["hayley-mattson", "nic-mattson"]` (until those
   interviews land).
5. Install the LaunchAgent:
   ```bash
   cp station.wednesday.editorial.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/station.wednesday.editorial.plist
   launchctl list | grep editorial
   tail -f logs/server.log
   ```
6. From a MyDash dev box on the same LAN, hit it:
   ```bash
   curl -s http://192.168.0.65:8765/health | jq
   ```

If port-forwarding for the Supabase Edge Function: NAT 8765 → Mac Mini
with a tight Supabase-egress IP allowlist (see open question 1 in the
spec). Tailscale isn't an option since Supabase isn't on a Tailscale
node.

---

## Smoke-test surface

```bash
# Health
curl -s http://127.0.0.1:8765/health | jq
# → status:ok, skills:["ap_style","attribution","headline","voice_match"],
#   profiles_loaded:["_default","camille-devaul"],
#   profiles_failed:["hayley-mattson","nic-mattson"]  (until interviews land)

# Single-skill run
curl -s -X POST http://127.0.0.1:8765/check \
  -H 'Content-Type: application/json' \
  -H "X-Mydash-Token: $MYDASH_TOKEN" \
  -d '{
    "story_id": "00000000-0000-0000-0000-000000000000",
    "body": "ATASCADERO — The city council voted...",
    "story_meta": { "author": "Camille DeVaul", "category": "news" },
    "skills": ["ap_style"]
  }' | jq

# Full four-skill run
curl -s -X POST http://127.0.0.1:8765/check \
  -H 'Content-Type: application/json' \
  -H "X-Mydash-Token: $MYDASH_TOKEN" \
  -d '{
    "story_id": "00000000-0000-0000-0000-000000000000",
    "body": "<full story body here>",
    "story_meta": { "author": "Camille DeVaul", "category": "news" },
    "skills": ["ap_style","voice_match","headline","attribution"]
  }' | jq
# → results.voice_match.voice_used == "Camille DeVaul"
```

`shared/voice_kb.py` self-test (run from anywhere with Python 3.7+
and `requests`):

```bash
python3 agent-station/shared/voice_kb.py
python3 agent-station/shared/voice_kb.py "Camille DeVaul and Hayley Mattson"
```

---

## Edge Function bridge (Phase D)

[`supabase/functions/editorial_check/index.ts`](../../supabase/functions/editorial_check/index.ts)
verifies the user's JWT and forwards the POST body to the FastAPI
server. The browser never sees `MYDASH_TOKEN`.

**Required Edge Function secrets** (set when the Mac Mini is reachable):

```bash
supabase secrets set MYDASH_TOKEN=<same value as Mac Mini .env>
supabase secrets set EDITORIAL_HOST_URL=http://<wan-or-lan>:8765
```

Until those are set, an authenticated request from MyDash will pass
the auth gate, hit the function, then fail with
`{ error: "upstream_error" | "upstream_timeout" }` because the
default `EDITORIAL_HOST_URL` (127.0.0.1) isn't reachable from the
Edge runtime.

## What's next

- **Phase E** — StoryEditor "Check Editorial" button + skill picker
  modal + side panel.
- **Phase F** — Press Processor decommissioning.

See `docs/specs/editorial-assistant-spec.md` for the full plan.
