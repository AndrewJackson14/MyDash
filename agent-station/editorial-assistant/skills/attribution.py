"""
attribution — flag direct quotes that lack source attribution.

Single Gemini JSON-mode call. Finds direct quotes in the body and
checks each for attribution within the same sentence or the next.
Quotes embedded inside paraphrase passages also count if the
paraphrase already names the source.

Voice profile is unused — attribution rules are uniform across
authors.
"""

from __future__ import annotations

import json
from typing import Optional

import gemini  # noqa: E402


SYSTEM_PROMPT = """You are a copy editor checking attribution in a news
story. Your job: find every DIRECT QUOTE (text in double quotes)
in the story body and verify each one is attributed to a source.

ATTRIBUTION RULES
A direct quote is "attributed" if any of the following is true:
  1. The quote is followed within the same sentence by a tag like
     `, [Name] said` or `, said [Name]` or `, said [Name], [title]`.
  2. The quote is preceded within the same sentence by a tag like
     `[Name] said: "..."` or `[Title Name] told the council, "..."`.
  3. The previous sentence names a specific source AND the current
     sentence is clearly a continuation of that source's quoted
     speech (e.g. multi-sentence quote block, or a follow-up like
     `He added, "..."`).
  4. The quote appears inside a clearly-attributed block quote with
     the speaker named in the lead-in line.

A direct quote is UNATTRIBUTED if:
  - No name appears within 2 sentences before or after the quote,
    only generic references like "officials said" or "residents
    said".
  - The only nearby attribution is a vague phrase like "according
    to reports" or "some have noted".
  - The quote is wedged into a paragraph with multiple speakers and
    it's ambiguous who said it.

DO NOT FLAG
  - Indirect quotes / paraphrases (no double quotes around the speech).
  - Block quotes attributed in a lead-in line.
  - Multi-sentence direct quotes from the same source — only the
    first quote needs attribution; subsequent ones inherit it.
  - Quoted text that is NOT speech: book titles, song titles, scare
    quotes, technical terminology in quotes. Use context to judge.
  - Quotes inside a clearly-flagged email / press release excerpt,
    e.g. "the release stated".

OUTPUT
Return ONLY this JSON object:

  {
    "suggestions": [
      {
        "severity": "critical",
        "original": "the unattributed direct quote, with surrounding sentence context",
        "suggested": "what's missing — typically: 'add attribution: \\"...,\\" [Name] said.'",
        "rationale": "one sentence: why this is unattributed under the rules above"
      }
    ]
  }

The `original` MUST be a verbatim substring of the story body.
Severity is always "critical" for unattributed quotes — there's no
"minor" attribution issue.

If every direct quote in the story is properly attributed, return
{"suggestions": []}. Most published stories should produce zero
flags.
"""


def run(
    story_text: str,
    story_meta: dict,
    voice: Optional[dict],  # unused
) -> list[dict]:
    """Return a list of unattributed-quote flags. Empty list when
    every direct quote is attributed or when the Gemini call fails."""
    if not story_text or not story_text.strip():
        return []

    user_prompt = (
        f"STORY TITLE: {story_meta.get('title', '(untitled)')}\n"
        f"CATEGORY: {story_meta.get('category', 'news')}\n\n"
        f"STORY BODY:\n{story_text}"
    )

    raw = gemini.gemini_call(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        response_format="json",
        temperature=0.1,
        max_output_tokens=2048,
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
        if not all(s.get(k) for k in ("original", "rationale")):
            continue
        out.append({
            "severity":  "critical",
            "original":  str(s["original"]),
            "suggested": str(s.get("suggested") or "Add attribution within the same sentence."),
            "rationale": str(s["rationale"]),
        })
    return out
