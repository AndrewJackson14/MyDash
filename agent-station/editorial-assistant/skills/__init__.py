"""
Editorial-skill registry.

Each skill is a standalone module exposing:

    def run(story_text: str, story_meta: dict, voice: dict | None) -> list[dict]:
        ...

Phase C lands all four skills (Phase B shipped this file empty).
"""

from __future__ import annotations

from . import ap_style, attribution, headline, voice_match

# Registry consumed by server.py. Keys are the skill slugs the API
# accepts in `POST /check { skills: [...] }`. When adding a 5th
# skill: write `skills/<name>.py` + `skills/<name>.SKILL.md`, then
# import + register here.
SKILLS = {
    "ap_style":    ap_style.run,
    "voice_match": voice_match.run,
    "headline":    headline.run,
    "attribution": attribution.run,
}


# Skills that consume the voice profile. The orchestrator skips
# these when the byline is joint (resolver returned None).
VOICE_DEPENDENT_SKILLS = {"voice_match"}


def list_skills() -> list[str]:
    """Stable-ordered slug list for the /health response."""
    return sorted(SKILLS.keys())
