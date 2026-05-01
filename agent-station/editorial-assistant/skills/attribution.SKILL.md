# attribution

Flag direct quotes that lack source attribution. Single Gemini
JSON-mode call. Author-agnostic — attribution rules are uniform.

## Inputs

| arg | type | notes |
|---|---|---|
| `story_text` | str | plain-text story body |
| `story_meta` | dict | `title`, `category` consumed |
| `voice` | dict \| None | unused |

## Output

`list[dict]`. One entry per unattributed direct quote.

```json
{
  "severity":  "critical",
  "original":  "the unattributed quote with surrounding sentence context",
  "suggested": "Add attribution within the same sentence.",
  "rationale": "why this is unattributed under the rules"
}
```

Severity is always `critical`. There's no minor attribution issue —
either a quote is attributed or it isn't.

## What counts as "attributed"

Within the same sentence OR the next:
- `... said [Name]` / `... said [Name], [title]`
- `[Name] said: "..."`
- Multi-sentence quotes from the same source (only first needs the tag)
- Block quotes with a clearly attributed lead-in

## What gets flagged

- Direct quotes with no name within ±2 sentences.
- Vague attribution: "officials said", "according to reports", "some
  have noted" — when no specific name appears.
- Ambiguous quotes in multi-speaker paragraphs.

## What gets NOT flagged

- Paraphrases (no double quotes around speech).
- Block quotes attributed in a lead-in line.
- Multi-sentence quotes from the same source — only first instance.
- Non-speech quoted text: titles, scare quotes, terminology.
- Excerpted release / email content marked as such ("the release stated").

## Calibration target

Camille's published archive should produce zero flags on properly
edited stories. If it produces one consistently on a specific
pattern, the prompt's "DO NOT FLAG" list needs tightening.

## Latency

~2-4s for 800 words. Smaller token budget than ap_style /
voice_match because output is just the unattributed-quote list,
typically empty.
