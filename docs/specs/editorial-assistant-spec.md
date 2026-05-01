Editorial Assistant Agent — Build Spec

**Version:** 2.0 (simplified)
**Last updated:** 2026-04-30
**Owner:** Nic Mattson (Support Admin)
**Status:** Ready for implementation

**Changelog from v1.1:**
- Removed Settings UI for voice profile management
- Removed status enum (active/minimal/paused)
- Removed byline_aliases array
- Removed team_member_id resolution
- Removed PR/branch flow
- Voice resolution = simple display_name substring match against story.author byline text
- Adding/editing profiles = create or edit a markdown file in the repo, push, done

---

## Goal

Synchronous editorial-quality agent on the Wednesday Agent Station. Editor clicks "Check Editorial" in StoryEditor, picks skills, gets suggestions back in a side panel.

Four skills ship: `ap_style`, `voice_match`, `headline`, `attribution`.

Three voice profiles: Camille DeVaul, Hayley Mattson, Nic Mattson. One default fallback. That's the whole roster.

---

## Architecture
StoryEditor.jsx
│
▼ click "Check Editorial" → pick skills → submit
│ POST { story_id, body, story_meta, skills }
▼
Supabase Edge Function: editorial_check
│ Forwards to Mac Mini over LAN
▼
http://192.168.0.65:8765/check  (FastAPI on Mac Mini)
│
├── voices.py: simple display_name match → load profile or _default
├── skills/<name>.py runs in parallel (one Gemini call each)
└── returns merged JSON
│
▼
StoryEditor side panel renders suggestions

---

## Files to create
agent-station/editorial-assistant/
├── README.md                              activation guide
├── server.py                              FastAPI entrypoint
├── voices.py                              loads profiles, simple match
├── skills/
│   ├── init.py                        skill registry
│   ├── ap_style.py
│   ├── ap_style.SKILL.md
│   ├── voice_match.py
│   ├── voice_match.SKILL.md
│   ├── headline.py
│   ├── headline.SKILL.md
│   ├── attribution.py
│   └── attribution.SKILL.md
├── requirements.txt                       fastapi, uvicorn, supabase, requests, python-dotenv
├── .env.example
└── station.wednesday.editorial.plist      LaunchAgent
docs/knowledge-base/voices/
├── _default.md                            13 Stars house voice (lifted from press-processor/prompt.py)
├── camille-devaul.md
├── hayley-mattson.md
├── nic-mattson.md
└── README.md                              how to write a voice profile
shared/
└── voice_kb.py                            simple loader, mirrors role_kb.py pattern

---

## Voice profile schema (simplified)

```markdown
---
display_name: Camille DeVaul
last_updated: 2026-04-30
---

# Camille DeVaul — Editorial Voice Profile

[All the prose sections — Voice Summary, Sentence Patterns, etc.]
```

That's it for frontmatter. Two fields. The display_name is what the matcher looks for in the byline. The last_updated is for human reference.

`_default.md` has the same shape — just `display_name: 13 Stars house voice` (or omit; it's the fallback).

---

## Voice resolution algorithm

```python
def resolve_voice(story_author: str) -> dict:
    """
    Match story.author byline against display_name in each profile.
    First match wins. Falls back to _default.md if no match.
    Skips voice_match entirely if joint byline detected.
    """
    if not story_author:
        return load("_default")

    # Joint byline → skip
    if " and " in story_author or " & " in story_author:
        return None  # caller skips voice_match

    # Try each profile (excluding _default)
    for profile_slug in list_profiles():
        if profile_slug == "_default":
            continue
        profile = load(profile_slug)
        if profile["display_name"] in story_author:
            return profile

    # No match → fallback
    return load("_default")
```

That's the entire algorithm. ~15 lines.

**Joint byline detection:** simple ` and ` or ` & ` substring check. No regex needed for v1. If a name actually contains "and" (uncommon), we'll deal with it then.

**Bot-drafted stories** (`"Press Release (auto)"`): caught by the no-match path, fall to `_default.md`. No special case needed. Good enough.

---

## `shared/voice_kb.py`

Mirrors `shared/role_kb.py` pattern exactly: GitHub raw fetch, 1-hour TTL on-disk cache, fallback to stale on network error.

API:

```python
load_profile(slug: str) -> dict
    # Returns { "display_name": str, "body": str (markdown) }
    # Raises VoiceProfileNotFound if file doesn't exist.

list_profile_slugs() -> list[str]
    # Returns ["_default", "camille-devaul", "hayley-mattson", "nic-mattson"]
    # Reads from a manifest or directory listing — see implementer note below.

resolve_voice(byline: str) -> dict | None
    # Implements the algorithm above. Returns None for joint bylines.
```

**Implementer note on `list_profile_slugs`:** GitHub raw doesn't support directory listing. Two options:

1. Maintain a `voices/_manifest.json` file that lists the slugs. Update it when adding a profile. Simple, explicit.
2. Hardcode the list in `voice_kb.py`. Update the constant when adding a profile. Even simpler at this scale.

Pick option 2 for v1. With three authors, the constant is:

```python
PROFILE_SLUGS = ["camille-devaul", "hayley-mattson", "nic-mattson"]
```

When a 4th author is added, edit this constant in the same PR that adds the markdown file.

---

## Server (`server.py`)

FastAPI on `0.0.0.0:8765`. Single endpoint `POST /check`.

**Request:**
```json
{
  "story_id": "<uuid>",
  "body": "<plain text>",
  "story_meta": {
    "title": "...",
    "author": "Camille DeVaul",
    "category": "news",
    "publication_id": "AN",
    "word_limit": 800
  },
  "skills": ["ap_style", "voice_match", "headline", "attribution"]
}
```

**Response:**
```json
{
  "story_id": "<uuid>",
  "checked_at": "2026-04-30T15:42:00Z",
  "results": {
    "ap_style": { "status": "ok", "duration_ms": 4231, "suggestions": [...] },
    "voice_match": {
      "status": "ok",
      "voice_used": "Camille DeVaul",
      "suggestions": [...]
    },
    "headline": {...},
    "attribution": {...}
  }
}
```

**voice_match skip case (joint byline):**
```json
"voice_match": {
  "status": "skipped",
  "reason": "joint_byline",
  "message": "Voice match skipped — joint byline detected.",
  "suggestions": []
}
```

**voice_match fallback case (no match → default):**
```json
"voice_match": {
  "status": "ok",
  "voice_used": "13 Stars house voice (default)",
  "suggestions": [...]
}
```

**Concurrency:** Skills run in parallel via `concurrent.futures.ThreadPoolExecutor`. Wall-clock ≈ slowest single Gemini call (~3-6s).

**Auth:** `X-Mydash-Token` header set by Edge Function. Real user auth lives in Edge Function (verifies JWT).

**Health endpoint:** `GET /health` returns `{ status, skills, profiles_loaded }`.

---

## The four skills

Each skill is a standalone Python module:

```python
def run(story_text: str, story_meta: dict, voice: dict | None) -> list[dict]:
    """
    voice: profile dict from resolve_voice(). None for non-voice skills,
           or for voice_match when byline is joint.
    Returns: list of suggestion dicts.
    """
```

### `ap_style`
Single Gemini JSON-mode call. System prompt encodes top ~40 AP rules. Returns suggestions with line, original, suggested, rationale.

### `voice_match`
Skip if `voice is None` (joint byline). Otherwise system prompt = voice profile body + instruction to flag drift. Falls back to `_default.md` automatically via the resolver.

### `headline`
Returns 3 alternative headlines. Lifted from press-processor/prompt.py HEADLINE OPTIONS section.

### `attribution`
Single Gemini call. Finds direct quotes, flags any without attribution within 2 sentences.

Each skill ≤ 300 lines including its prompt.

---

## Press Processor removal

Before Phase A starts:

1. Lift the entire `REWRITE RULES` and `HEADLINE OPTIONS` sections from `agent-station/press-processor/prompt.py` into the new `_default.md` voice profile. This preserves the editorial work that's already encoded there.

After Editorial Assistant is live and confirmed working:

2. Stop launchd: `launchctl unload ~/Library/LaunchAgents/station.wednesday.press.plist`
3. Delete on Mac Mini: `rm -rf ~/wednesday-station/jobs/press-processor` and `rm ~/Library/LaunchAgents/station.wednesday.press.plist`
4. Delete in repo: `rm -rf agent-station/press-processor/`
5. Mark `PRESS_BOT_ID` team_member as `is_active = false` (kept for FK integrity on archived stories)

Existing press-release-drafted stories in the archive continue to render fine — their `author` field is `"Press Release (auto)"` which falls through the no-match path to `_default.md`.

---

## StoryEditor UI

### Trigger
"Check Editorial" button in the metadata sidebar, next to existing Preflight.

### Skill picker modal
┌────────────────────────────────────┐
│  Run Editorial Checks              │
├────────────────────────────────────┤
│  ☑ AP Style                        │
│  ☑ Voice Match                     │
│  ☑ Headline alternatives           │
│  ☑ Attribution                     │
│                                    │
│  [Cancel]  [Run Checks]            │
└────────────────────────────────────┘

All four checked by default. No voice override dropdown (with three named authors, the auto-resolver is right almost every time; if she wants to check against a specific voice, she can edit the byline temporarily and re-run).

### Side panel results

Header per skill shows count + voice used (for voice_match):
┌────────────────────────────────────┐
│  Editorial Checks         ⋯     ✕  │
├────────────────────────────────────┤
│  ✓ AP Style                  4 ▾   │
│  ✓ Voice Match               2 ▾   │
│    Voice: Camille DeVaul           │
│  ✓ Headline                  3 ▾   │
│  ✓ Attribution               0 ▾   │
└────────────────────────────────────┘

Skip case:
│  — Voice Match           skipped   │
│    Joint byline detected.          │

Fallback case:
│  ✓ Voice Match               1 ▾   │
│    Voice: 13 Stars house default   │

Each suggestion card: severity badge, original text, suggested text, rationale, Accept/Dismiss.

---

## Edge Function bridge

`supabase/functions/editorial_check/index.ts`. Verifies JWT, forwards to Mac Mini at `http://<tailscale-or-port-forward>:8765/check` with `X-Mydash-Token` header.

---

## Adding a new author later

Hayley or Camille wants a 4th author profile (say, a regular freelancer):

1. Create `docs/knowledge-base/voices/their-name.md` with the standard schema
2. Add their slug to the `PROFILE_SLUGS` constant in `shared/voice_kb.py`
3. PR + merge
4. Cache invalidates within an hour, agent picks up the new profile

No Settings UI needed. No status enum. No alias management. Just a file + one line of Python.

---

## Acceptance criteria

- [ ] FastAPI server runs on Mac Mini at port 8765, daemonized via launchd
- [ ] `/health` returns 200 with skills + profile count
- [ ] Edge Function deployed, JWT auth working, forwards to Mac Mini
- [ ] Four skills functional, each with a SKILL.md companion
- [ ] Voice profiles for `_default`, Camille DeVaul, Hayley Mattson, Nic Mattson exist in `docs/knowledge-base/voices/`
- [ ] `_default.md` contains lifted REWRITE RULES from press-processor prompt
- [ ] `shared/voice_kb.py` implements simple display_name resolver + joint-byline skip
- [ ] StoryEditor "Check Editorial" button + modal + side panel work end-to-end
- [ ] Side panel shows which voice profile was used (or skip reason)
- [ ] Calibration test passes for Camille (her own published story → near-zero false flags)
- [ ] `13stars-skills-inventory.md` updated with skills + voice profiles section
- [ ] Latency: median end-to-end check (4 skills) ≤ 8 seconds
- [ ] Press Processor removed from agent-station/, Mac Mini, and LaunchAgents

---

## Out of scope

- Settings UI for voice profile management
- Status enum (active/minimal/paused)
- Byline alias management
- Per-publication voice variants
- Joint byline merged voice analysis
- `copyfit` skill (existing word-count UI handles it)
- Auto-generating profiles from story corpora
- Background editorial monitoring (runs only when invoked)
- TipTap inline-suggestions plugin (Phase 2)
- SSE streaming (Phase 2)

---

## Open implementation questions

1. **Tailscale vs. port forwarding** for Edge Function → Mac Mini. Recommend port-forward 8765 with IP allowlist (Supabase Edge IPs). Tailscale would need Supabase to be on a Tailscale node, which it isn't.

2. **Plain-text vs. HTML body input.** StoryEditor stores TipTap HTML; server expects plain text. Recommend client-side conversion using existing `lib/sanitizeHtml.js` neighborhood.

---

## Build order

### Phase A: Voice profiles (no agent code yet)
1. Create `docs/knowledge-base/voices/` folder + README
2. Lift REWRITE RULES + HEADLINE OPTIONS from `press-processor/prompt.py` into `_default.md`
3. Pull team_members UUIDs for the three authors (informational only — not stored in profiles)
4. Walk through Camille's profile with her (interview process documented in voices/README.md)
5. Hayley and Nic profiles
6. PR everything to main

### Phase B: Server foundation
7. `agent-station/editorial-assistant/` folder structure
8. `shared/voice_kb.py` with PROFILE_SLUGS constant + self-test
9. `server.py` skeleton with `/health`
10. Deploy to Mac Mini, smoke-test from curl
11. LaunchAgent plist

### Phase C: Skills end-to-end
12. `ap_style.py` + SKILL.md
13. Server route handles single skill
14. Test from curl
15. Build remaining three skills (`voice_match`, `headline`, `attribution`)
16. Server runs all four in parallel

### Phase D: Edge Function bridge
17. `supabase/functions/editorial_check/index.ts`
18. Curl test through Edge Function

### Phase E: StoryEditor UI
19. "Check Editorial" button + skill picker modal
20. Side panel with per-skill collapse + voice profile metadata
21. Accept / Dismiss handlers
22. Loading / error states

### Phase F: Press Processor removal
23. Confirm `_default.md` has the lifted content
24. Stop launchd, delete from Mac Mini and repo
25. Mark `PRESS_BOT_ID` inactive

### Phase G: Calibration + inventory
26. Calibration test on Camille
27. Update `13stars-skills-inventory.md`
28. Brief Camille and Hayley on usage

---

## Notes for implementer

- **Lift `_default.md` BEFORE deleting Press Processor.** That prompt content is the canonical 13 Stars house voice.
- **Don't skip Phase A.** Voice profiles are human-authored. Sit with Camille first.
- **`shared/voice_kb.py` mirrors `shared/role_kb.py`.** Same TTL cache, same fallback-to-stale, same version-bump invalidation. Read role_kb.py first.
- **Keep skills small.** ≤ 300 lines each including prompts.
- **Skill prompts inline in their module.** No separate prompt.py.
- **Test with real published stories** from the database, not synthetic data.
- **Don't wire StoryEditor before the server works from curl.** Debug skill output via curl first.