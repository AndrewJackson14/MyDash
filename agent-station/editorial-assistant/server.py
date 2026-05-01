"""
Editorial Assistant — FastAPI server.

Runs on the Mac Mini at http://0.0.0.0:8765, daemonized via launchd
(`station.wednesday.editorial.plist`). The Supabase Edge Function
`editorial_check` forwards story checks here over LAN with an
`X-Mydash-Token` header.

Endpoints:
  GET  /health  — service status, skill registry, voice profile inventory
  POST /check   — run requested skills against a story body, return merged JSON

Phase B shipped /health + a 501 stub for /check. Phase C lands the
four skills (ap_style, voice_match, headline, attribution) and the
parallel orchestrator below.
"""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import os
import sys
import time
import traceback
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

# Make sibling `shared/` package importable when running from either
# the launchd working directory or a local dev shell. Sibling skills/
# package is on the implicit path because we're inside its parent.
THIS_DIR = Path(__file__).resolve().parent
SHARED_DIR = THIS_DIR.parent / "shared"
if str(SHARED_DIR) not in sys.path:
    sys.path.insert(0, str(SHARED_DIR))
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

import voice_kb  # noqa: E402  shared/voice_kb.py
from skills import SKILLS, VOICE_DEPENDENT_SKILLS, list_skills  # noqa: E402


# ── Config ─────────────────────────────────────────────────

SERVICE_NAME = "editorial-assistant"
PORT = int(os.environ.get("EDITORIAL_PORT", "8765"))
MYDASH_TOKEN = os.environ.get("MYDASH_TOKEN", "")

# Per-skill timeout. Single Gemini call usually returns in 3-5s.
# Cap at 30s so a hung skill doesn't block the whole /check response
# past the user's patience window.
SKILL_TIMEOUT_S = int(os.environ.get("SKILL_TIMEOUT_S", "30"))

# Hard cap on parallel workers. Four skills today; this is room to
# grow without unbounded thread expansion.
MAX_SKILL_WORKERS = 6


# ── App ────────────────────────────────────────────────────

app = FastAPI(title="MyDash Editorial Assistant", version="0.2.0")

START_TIME = time.time()


# ── Auth ───────────────────────────────────────────────────


def _require_token(x_mydash_token: Optional[str]) -> None:
    """Verify the shared token set by the Supabase Edge Function. The
    real user JWT is verified server-side in the Edge Function before
    it forwards here, so this is just a defense-in-depth check that
    requests originate from MyDash and not random LAN traffic.

    No token configured = dev mode; we don't reject. This lets local
    curl tests work without exporting the env var."""
    if not MYDASH_TOKEN:
        return
    if not x_mydash_token or x_mydash_token != MYDASH_TOKEN:
        raise HTTPException(status_code=401, detail="invalid_or_missing_token")


# ── /health ────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    uptime_seconds: float
    skills: List[str]
    profiles_loaded: List[str]
    profiles_failed: List[str]


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Returns service status + the inventory of voice profiles that
    fetched successfully at the moment of the call. A profile listed
    in `profiles_failed` means its markdown file is unreachable —
    typically because it hasn't been authored yet (Hayley, Nic while
    interviews are pending) or GitHub raw is briefly down."""
    loaded: List[str] = []
    failed: List[str] = []
    for slug in voice_kb.list_profile_slugs():
        try:
            voice_kb.load_profile(slug)
            loaded.append(slug)
        except voice_kb.VoiceProfileNotFound:
            failed.append(slug)
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        version=app.version,
        uptime_seconds=round(time.time() - START_TIME, 1),
        skills=list_skills(),
        profiles_loaded=loaded,
        profiles_failed=failed,
    )


# ── /check ─────────────────────────────────────────────────


class CheckRequest(BaseModel):
    story_id: str
    body: str
    story_meta: dict
    skills: List[str]


def _resolve_voice_safe(byline: Optional[str]) -> tuple[Optional[dict], str, Optional[str]]:
    """Wrap the resolver so a missing _default profile (e.g. GitHub
    raw down on cold start) doesn't 500 the whole request. Returns
    (voice_dict_or_None, status, reason).

    status:
      - "resolved"   → voice is the matched/default profile
      - "skipped"    → joint byline; voice is None
      - "unavailable" → resolver raised; voice is None
    """
    try:
        voice = voice_kb.resolve_voice(byline)
    except voice_kb.VoiceProfileNotFound:
        return None, "unavailable", "voice_profiles_unreachable"
    if voice is None:
        return None, "skipped", "joint_byline"
    return voice, "resolved", None


def _run_skill(
    skill_name: str,
    skill_fn,
    story_text: str,
    story_meta: dict,
    voice: Optional[dict],
    voice_status: str,
    voice_reason: Optional[str],
) -> dict:
    """Run a single skill with timing + error capture. Returns a
    dict shaped like the per-skill result the spec defines."""
    started = time.time()

    # voice_match has special skip / fallback semantics. Other skills
    # don't consume voice — pass None and run normally.
    skill_voice: Optional[dict] = voice
    if skill_name not in VOICE_DEPENDENT_SKILLS:
        skill_voice = None
    elif voice_status == "skipped":
        return {
            "status":      "skipped",
            "reason":      voice_reason or "joint_byline",
            "message":     "Voice match skipped — joint byline detected.",
            "duration_ms": 0,
            "suggestions": [],
        }
    elif voice_status == "unavailable":
        return {
            "status":      "skipped",
            "reason":      "voice_profiles_unreachable",
            "message":     "Voice match skipped — voice profiles unreachable.",
            "duration_ms": 0,
            "suggestions": [],
        }

    try:
        suggestions = skill_fn(story_text, story_meta, skill_voice)
        if not isinstance(suggestions, list):
            suggestions = []
    except Exception as e:
        # Don't blow up the whole /check on one skill's failure. The
        # editor's UI marks this skill `error` and the others render
        # normally.
        traceback.print_exc()
        return {
            "status":      "error",
            "error":       str(e),
            "duration_ms": int((time.time() - started) * 1000),
            "suggestions": [],
        }

    out = {
        "status":      "ok",
        "duration_ms": int((time.time() - started) * 1000),
        "suggestions": suggestions,
    }

    # Surface which voice was used for voice_match. Spec section
    # "voice_match fallback case" — show the editor whether they're
    # being scored against a named profile or the house default.
    if skill_name == "voice_match" and voice is not None:
        display = voice.get("display_name") or "(unknown)"
        if display.startswith("13 Stars"):
            out["voice_used"] = f"{display} (default)"
        else:
            out["voice_used"] = display
    return out


@app.post("/check")
def check(
    payload: CheckRequest,
    x_mydash_token: Optional[str] = Header(default=None),
):
    """Run the requested editorial skills against the story body and
    return merged suggestions.

    All skills run in parallel via ThreadPoolExecutor — wall-clock ≈
    slowest single Gemini call. A failed skill returns
    `status: "error"` in its slot; the other skills are unaffected.
    """
    _require_token(x_mydash_token)

    # Validate skill names up front. If the caller asks for an
    # unknown skill, return that as a 400 — better feedback than
    # silently dropping it.
    requested = list(payload.skills or [])
    unknown = [s for s in requested if s not in SKILLS]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail={"error": "unknown_skill", "skills": unknown, "available": list_skills()},
        )

    if not requested:
        # Spec doesn't mandate a default; reject explicitly so the
        # client's intent is unambiguous.
        raise HTTPException(
            status_code=400,
            detail={"error": "no_skills_requested", "available": list_skills()},
        )

    byline = (payload.story_meta or {}).get("author") or ""
    voice, voice_status, voice_reason = _resolve_voice_safe(byline)

    results: dict = {}
    workers = min(len(requested), MAX_SKILL_WORKERS)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(
                _run_skill,
                name,
                SKILLS[name],
                payload.body,
                payload.story_meta or {},
                voice,
                voice_status,
                voice_reason,
            ): name
            for name in requested
        }
        for fut in concurrent.futures.as_completed(futures, timeout=SKILL_TIMEOUT_S + 5):
            name = futures[fut]
            try:
                results[name] = fut.result(timeout=SKILL_TIMEOUT_S)
            except concurrent.futures.TimeoutError:
                results[name] = {
                    "status":      "error",
                    "error":       f"timeout after {SKILL_TIMEOUT_S}s",
                    "suggestions": [],
                }
            except Exception as e:
                traceback.print_exc()
                results[name] = {
                    "status":      "error",
                    "error":       str(e),
                    "suggestions": [],
                }

    return {
        "story_id":   payload.story_id,
        "checked_at": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "results":    results,
    }


# ── Local entrypoint ───────────────────────────────────────


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
        log_level="info",
    )
