"""
headline — three alternative headlines for the story.

Lifted from the press-processor HEADLINE OPTIONS section. Single
Gemini JSON-mode call. Returns three headlines ranked by intent:
most accurate, most engaging, most local.

Voice profile is unused — house headline conventions are uniform
across authors.
"""

from __future__ import annotations

import json
from typing import Optional

import gemini  # noqa: E402


SYSTEM_PROMPT = """You are a copy desk headline writer for 13 Stars Media,
a regional news company on California's Central Coast and in Malibu.

Suggest THREE alternative headlines for the story body provided. Each
headline must:
  - Be 5-9 words.
  - Use AP style title case.
  - State what happened, plain. No clickbait, no questions, no
    listicle openers, no marketing hype.
  - Avoid filler verbs: "could", "may", "set to" only when the
    underlying news is actually conditional.

Rank the three by INTENT:
  1. Most accurate — what happened, neutral and direct.
  2. Most engaging — same facts, sharper hook.
  3. Most local — foreground the regional angle, name the place,
     name the person if a name carries the story.

OUTPUT
Return ONLY this JSON object:

  {
    "suggestions": [
      {
        "rank": 1,
        "intent": "most_accurate",
        "headline": "..."
      },
      {
        "rank": 2,
        "intent": "most_engaging",
        "headline": "..."
      },
      {
        "rank": 3,
        "intent": "most_local",
        "headline": "..."
      }
    ]
  }

If the story body is too thin to derive three meaningful headlines
(under ~50 words of usable content), return as many as you can
support, in rank order. Do not pad with weak options.
"""


def run(
    story_text: str,
    story_meta: dict,
    voice: Optional[dict],  # unused
) -> list[dict]:
    """Return up to three ranked headline suggestions. Empty list on
    Gemini failure or when the body is empty."""
    if not story_text or not story_text.strip():
        return []

    user_prompt = (
        f"CURRENT TITLE: {story_meta.get('title', '(none)')}\n"
        f"CATEGORY: {story_meta.get('category', 'news')}\n\n"
        f"STORY BODY:\n{story_text}"
    )

    raw = gemini.gemini_call(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        response_format="json",
        temperature=0.4,        # a little creative range for engaging variant
        max_output_tokens=512,  # headlines are tiny
    )

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    suggestions = data.get("suggestions", [])
    if not isinstance(suggestions, list):
        return []

    valid_intents = {"most_accurate", "most_engaging", "most_local"}
    out: list[dict] = []
    for s in suggestions:
        if not isinstance(s, dict):
            continue
        headline = s.get("headline")
        if not headline or not isinstance(headline, str):
            continue
        intent = s.get("intent") if s.get("intent") in valid_intents else "most_accurate"
        try:
            rank = int(s.get("rank") or len(out) + 1)
        except (TypeError, ValueError):
            rank = len(out) + 1
        out.append({
            "rank":     rank,
            "intent":   intent,
            "headline": headline.strip(),
        })

    # Sort by rank for stable ordering.
    out.sort(key=lambda x: x["rank"])
    return out[:3]  # cap at 3 even if Gemini was generous
