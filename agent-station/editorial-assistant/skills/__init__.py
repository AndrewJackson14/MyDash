"""
Editorial-skill registry.

Each skill is a standalone module (`skills/<name>.py`) exposing:

    def run(story_text: str, story_meta: dict, voice: dict | None) -> list[dict]:
        ...

Plus a `SKILL.md` companion documenting the skill's prompt + return
shape.

Phase B intentionally ships the registry empty — server.py imports
this module at boot to populate `REGISTERED_SKILLS`. Phase C lands
the four skills (ap_style, voice_match, headline, attribution) and
this module's `SKILLS` mapping turns into a real dispatcher.
"""

from __future__ import annotations

# Phase C will replace this with:
#   from . import ap_style, voice_match, headline, attribution
#   SKILLS = {
#       "ap_style":    ap_style.run,
#       "voice_match": voice_match.run,
#       "headline":    headline.run,
#       "attribution": attribution.run,
#   }
SKILLS: dict = {}


def list_skills() -> list[str]:
    """Stable-ordered slug list for the /health response."""
    return sorted(SKILLS.keys())
