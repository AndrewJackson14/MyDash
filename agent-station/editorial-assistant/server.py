"""
Editorial Assistant — FastAPI server (Phase B skeleton).

Runs on the Mac Mini at http://0.0.0.0:8765, daemonized via launchd
(`station.wednesday.editorial.plist`). The Supabase Edge Function
`editorial_check` forwards story checks here over LAN with an
`X-Mydash-Token` header.

Phase B ships the foundation only:
  - Health endpoint:  GET /health
  - Voice profile inventory loaded at boot via `shared/voice_kb`
  - Skill registry placeholder (skills land in Phase C)
  - Token auth on /check (returns 501 until Phase C)

Skills run in parallel inside `/check` (see Phase C). Wall-clock for
a four-skill check ≈ slowest single Gemini call (~3-6 s).
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel

# Make the sibling `shared/` package importable when running from
# either the launchd working directory or a local dev shell.
THIS_DIR = Path(__file__).resolve().parent
SHARED_DIR = THIS_DIR.parent / "shared"
if str(SHARED_DIR) not in sys.path:
    sys.path.insert(0, str(SHARED_DIR))

import voice_kb  # noqa: E402  shared.voice_kb


# ── Config ─────────────────────────────────────────────────

SERVICE_NAME = "editorial-assistant"
PORT = int(os.environ.get("EDITORIAL_PORT", "8765"))
MYDASH_TOKEN = os.environ.get("MYDASH_TOKEN", "")

# Skill registry — populated in Phase C.
REGISTERED_SKILLS: List[str] = []


# ── App ────────────────────────────────────────────────────

app = FastAPI(title="MyDash Editorial Assistant", version="0.1.0")

START_TIME = time.time()


# ── Auth ───────────────────────────────────────────────────


def _require_token(x_mydash_token: Optional[str]) -> None:
    """Verify the shared token set by the Supabase Edge Function. The
    real user JWT is verified server-side in the Edge Function before
    it forwards here, so this is just a defense-in-depth check that
    requests originate from MyDash and not random LAN traffic."""
    if not MYDASH_TOKEN:
        # No token configured — service is in dev mode. Print a warning
        # rather than reject; this lets local curl tests work without
        # exporting the env var.
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
    typically because the file hasn't been authored yet (Hayley, Nic
    while interviews are pending) or GitHub raw is briefly down."""
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
        skills=REGISTERED_SKILLS,
        profiles_loaded=loaded,
        profiles_failed=failed,
    )


# ── /check (placeholder until Phase C) ─────────────────────


class CheckRequest(BaseModel):
    story_id: str
    body: str
    story_meta: dict
    skills: List[str]


@app.post("/check")
def check(
    payload: CheckRequest,
    request: Request,
    x_mydash_token: Optional[str] = Header(default=None),
):
    """Run the requested editorial skills against the story body and
    return merged suggestions. Skills land in Phase C — this stub
    keeps the route registered for end-to-end smoke tests but returns
    a 501 with the resolved voice so the Edge Function side can be
    iterated against a stable shape."""
    _require_token(x_mydash_token)

    byline = (payload.story_meta or {}).get("author") or ""
    voice = voice_kb.resolve_voice(byline)

    if voice is None:
        voice_used = None
        voice_status = "skipped"
        voice_reason = "joint_byline"
    else:
        voice_used = voice.get("display_name")
        voice_status = "resolved"
        voice_reason = None

    raise HTTPException(
        status_code=501,
        detail={
            "error": "skills_not_implemented",
            "message": "Editorial skills land in Phase C. Voice resolution works.",
            "voice_status": voice_status,
            "voice_used": voice_used,
            "voice_reason": voice_reason,
            "requested_skills": payload.skills,
        },
    )


# ── Local entrypoint ───────────────────────────────────────


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
        log_level="info",
    )
