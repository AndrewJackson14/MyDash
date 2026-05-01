"""
voice_match — flag drift from the byline author's voice profile.

Skipped by the orchestrator when the byline is joint (`voice` arg
arrives as None). For named authors, the system prompt is the
author's voice profile body + an explicit drift-detection
instruction. For unrecognized bylines, the resolver returns the
`_default` (13 Stars house voice) profile and we score against that.

Returns a list of suggestions with severity, original, suggested,
rationale — same shape as `ap_style` for UI consistency.
"""

from __future__ import annotations

import json
from typing import Optional

import gemini  # noqa: E402


SYSTEM_PROMPT_TEMPLATE = """You are a copy editor checking that a story
matches a specific writer's editorial voice. The voice profile below
describes how this writer normally writes — sentence patterns,
vocabulary, attribution habits, structural preferences, and patterns
they USE DELIBERATELY that should NOT be flagged.

Your job: read the story and flag passages that drift from the
profile. A drift is a passage where this writer would have made a
different choice. Do NOT flag:
- Patterns explicitly listed in "What She/He Avoids" — those are
  drifts and SHOULD be flagged. Read carefully.
- Patterns explicitly listed in "Notes for the Editor" as DELIBERATE.
  Those are NOT drifts.
- Word choices, sentence rhythms, or structural choices that are
  consistent with the profile.
- Anything inside quoted speech. Quotes are preserved verbatim.

Only flag passages that contradict the profile. If the story matches
the writer's voice, return an empty suggestions list. Most published
stories should produce zero or one flag.

VOICE PROFILE:
---
{voice_body}
---

OUTPUT
Return ONLY a JSON object:

  {{
    "suggestions": [
      {{
        "pattern": "short tag like 'PR language' or 'attribution verb' or 'sentence opener'",
        "severity": "critical" | "minor",
        "original": "exact substring from the story",
        "suggested": "what this writer would more likely have written",
        "rationale": "one sentence: which profile rule this drifts from"
      }}
    ]
  }}

The `original` MUST be a verbatim substring of the story body so the
UI can locate and highlight it. Drop suggestions where you can't
ground the original in the text.

Use "critical" for direct contradictions of the writer's avoid-list
(PR language in narration, banned attribution verbs, single-word
paragraphs). Use "minor" for softer drifts (a sentence opener the
writer tends not to use, vocabulary the writer prefers a different
word for).

If the story has no drifts, return {{"suggestions": []}}.
"""


def run(
    story_text: str,
    story_meta: dict,
    voice: Optional[dict],
) -> list[dict]:
    """Return drift suggestions vs. the voice profile.

    voice is None only when the byline is joint — the orchestrator
    catches that case and skips this skill entirely; we still defend
    here in case a caller invokes us directly.

    voice may be the `_default` profile (no named-author match) — we
    still run, just against the house baseline. The orchestrator
    surfaces `voice_used` in the response so the editor knows.
    """
    if voice is None:
        return []
    if not story_text or not story_text.strip():
        return []

    voice_body = voice.get("body") or ""
    if not voice_body.strip():
        return []

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(voice_body=voice_body)
    user_prompt = (
        f"STORY TITLE: {story_meta.get('title', '(untitled)')}\n"
        f"BYLINE: {story_meta.get('author', '(unknown)')}\n"
        f"CATEGORY: {story_meta.get('category', 'news')}\n\n"
        f"STORY BODY:\n{story_text}"
    )

    raw = gemini.gemini_call(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_format="json",
        temperature=0.2,
        max_output_tokens=4096,
    )

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    suggestions = data.get("suggestions", [])
    if not isinstance(suggestions, list):
        return []

    out: list[dict] = []
    for s in suggestions:
        if not isinstance(s, dict):
            continue
        if not all(s.get(k) for k in ("original", "suggested", "rationale")):
            continue
        out.append({
            "pattern":   str(s.get("pattern") or "voice_drift"),
            "severity":  s.get("severity") if s.get("severity") in ("critical", "minor") else "minor",
            "original":  str(s["original"]),
            "suggested": str(s["suggested"]),
            "rationale": str(s["rationale"]),
        })
    return out
