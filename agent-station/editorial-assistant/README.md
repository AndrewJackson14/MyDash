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
│   └── __init__.py                        skill registry (empty in Phase B)
├── requirements.txt                       Python deps (Phase B subset)
├── .env.example                           template — copy to .env, fill in
├── station.wednesday.editorial.plist      LaunchAgent
└── README.md                              this file
```

Phase C will add:

```
skills/
├── ap_style.py
├── ap_style.SKILL.md
├── voice_match.py
├── voice_match.SKILL.md
├── headline.py
├── headline.SKILL.md
├── attribution.py
└── attribution.SKILL.md
```

Dependencies: `agent-station/shared/voice_kb.py` ships in this PR.
Phase C will also pull `agent-station/shared/gemini.py` (already
written by the press-processor work).

---

## Phase B status (this PR)

- ✅ Folder structure
- ✅ `agent-station/shared/voice_kb.py` — GitHub raw fetch + 1-hour
  TTL + stale-on-error fallback. Mirrors `role_kb.py`.
- ✅ `server.py` skeleton with `/health`. `/check` route registered
  but returns 501 with the resolved voice profile so the Edge
  Function side can iterate against a stable shape before Phase C.
- ✅ LaunchAgent plist
- ✅ `.env.example`
- ✅ `requirements.txt` (FastAPI + voice_kb deps only — Gemini lands
  in Phase C)
- ⬜ Mac Mini deployment + smoke test (manual — see below)

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

## Phase B smoke-test surface

```bash
# Health
curl -s http://127.0.0.1:8765/health | jq

# /check returns 501 in Phase B but the voice resolver works.
curl -s -X POST http://127.0.0.1:8765/check \
  -H 'Content-Type: application/json' \
  -H "X-Mydash-Token: $MYDASH_TOKEN" \
  -d '{
    "story_id": "00000000-0000-0000-0000-000000000000",
    "body": "ATASCADERO — The city council voted...",
    "story_meta": { "author": "Camille DeVaul", "category": "news" },
    "skills": ["ap_style"]
  }' | jq
# → 501 with detail.voice_used == "Camille DeVaul"
```

`shared/voice_kb.py` self-test (run from anywhere with Python 3.7+
and `requests`):

```bash
python3 agent-station/shared/voice_kb.py
python3 agent-station/shared/voice_kb.py "Camille DeVaul and Hayley Mattson"
```

---

## What's next (not in this PR)

- **Phase C** — four skills land in `skills/`. `/check` becomes real.
  Each skill ≤ 300 lines including its prompt.
- **Phase D** — Supabase Edge Function `editorial_check` forwards to
  this server with JWT verification.
- **Phase E** — StoryEditor "Check Editorial" button + side panel.
- **Phase F** — Press Processor decommissioning.

See `docs/specs/editorial-assistant-spec.md` for the full plan.
