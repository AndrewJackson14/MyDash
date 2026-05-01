# voice_match

Flag drift from the byline author's editorial voice profile. Single
Gemini JSON-mode call. The system prompt is the resolved voice
profile body + a drift-detection instruction.

## Inputs

| arg | type | notes |
|---|---|---|
| `story_text` | str | plain-text story body |
| `story_meta` | dict | `title`, `author`, `category`, `publication_id` |
| `voice` | dict \| None | output of `voice_kb.resolve_voice(byline)` |

## When voice is None

Joint byline detected (`" and "` or `" & "` in the byline string).
Orchestrator skips this skill entirely and the response says:

```json
"voice_match": {
  "status": "skipped",
  "reason": "joint_byline",
  "message": "Voice match skipped — joint byline detected.",
  "suggestions": []
}
```

Per spec v2: "If a name actually contains 'and' (uncommon), we'll
deal with it then." No regex.

## When voice is _default

No named-author match. Skill still runs against the house voice
profile. Response surfaces:

```json
"voice_match": {
  "status": "ok",
  "voice_used": "13 Stars house voice (default)",
  "suggestions": [...]
}
```

## Output

`list[dict]`. Same shape as ap_style for UI consistency.

```json
{
  "pattern":   "PR language",
  "severity":  "critical" | "minor",
  "original":  "verbatim substring from story_text",
  "suggested": "what this writer would more likely have written",
  "rationale": "which profile rule this drifts from"
}
```

## What it does NOT flag

- **Patterns listed in "Notes for the Editor"** as deliberate.
  Camille's em-dashes, sentence fragments for emphasis, multiple
  attribution verbs, etc.
- **Quoted speech.** Quotes are preserved verbatim.
- **AP rules.** That's `ap_style`.
- **Headlines.** That's `headline`.

## What "drift" means here

A passage where this writer would have made a different choice. The
profile lists both the writer's habits AND their explicit avoid-list.
Drifts are passages contradicting either.

Examples for Camille's profile:
- "thrilled to announce" → critical (PR language; on her avoid list)
- "John, the chairman, said angrily" → critical (adverbs paired with said)
- "The event was widely praised" → minor (passive + editorial commentary)

## Severity

- **critical** — direct contradiction of an avoid-list item or a
  pattern the profile flags as forbidden.
- **minor** — softer drift; a sentence opener the writer tends not
  to use, vocabulary the writer prefers a different word for.

## Calibration target

Camille's recently published stories should produce ≤ 1 flag per
800 words. If the skill flags her deliberate em-dashes, that
pattern needs to land in her profile's "Notes for the Editor"
section and we re-test.

## Latency

~3-5s for 800 words. Voice profile body adds ~3-9k tokens to the
system prompt; Gemini 2.5 Flash handles that in stride.
