# headline

Three alternative headlines for the story, ranked by intent (most
accurate, most engaging, most local). Single Gemini JSON-mode call.
Lifted from the press-processor `HEADLINE OPTIONS` section.

## Inputs

| arg | type | notes |
|---|---|---|
| `story_text` | str | plain-text story body |
| `story_meta` | dict | `title` (current headline) + `category` consumed |
| `voice` | dict \| None | unused — house headline conventions are uniform across authors |

## Output

`list[dict]` of up to 3 headlines. May be fewer if the body is too
thin to support three good options.

```json
{
  "rank":     1 | 2 | 3,
  "intent":   "most_accurate" | "most_engaging" | "most_local",
  "headline": "5-9 word AP-title-case headline"
}
```

## Conventions enforced via the prompt

- 5–9 words.
- AP title case.
- No clickbait, no questions, no listicle openers.
- No marketing hype ("amazing", "unbelievable").
- Conditional verbs ("could", "may", "set to") only when the
  underlying news is actually conditional.

## Rank semantics

1. **most_accurate** — what happened, neutral and direct.
2. **most_engaging** — same facts, sharper hook.
3. **most_local** — foreground the place / named local figure.

## What it does NOT do

- Generate kicker lines or subheads.
- Score or reject the existing headline. Editor compares the three
  alternatives to their current title and picks one (or none).
- Voice-tune for a specific writer. House conventions only.

## Latency

Smallest skill in the pack — ~1-2s for 800 words. Headline output
is tiny so `max_output_tokens=512` is plenty.

## Temperature note

Slightly higher (0.4) than other skills to give the "engaging"
variant some hook range. ap_style and attribution stay at 0.1-0.2
for consistency on rule application.
