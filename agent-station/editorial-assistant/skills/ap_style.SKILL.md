# ap_style

AP Stylebook checker. Author-agnostic. Single Gemini JSON-mode call.

## Inputs

| arg | type | notes |
|---|---|---|
| `story_text` | str | plain-text story body (HTML stripped before this skill sees it) |
| `story_meta` | dict | `title`, `category`, `publication_id`, `word_limit` — only `title` and `category` consumed |
| `voice` | dict \| None | unused (interface parity across skills) |

## Output

`list[dict]`. One entry per detected violation. Empty list when the
story is clean or the Gemini call fails.

```json
{
  "rule":      "AP date abbreviation",
  "severity":  "critical" | "minor",
  "original":  "verbatim substring from story_text",
  "suggested": "corrected substring",
  "rationale": "one sentence explaining the AP rule"
}
```

`original` is guaranteed to be a substring of `story_text` so the UI
can locate it. Suggestions where Gemini can't ground in the story
are dropped before return.

## Severity

- **critical** — copy editor would always catch (percent symbol,
  date format, attribution verb, state abbreviation).
- **minor** — stylistic preferences inside the rule set (specific
  capitalization, address abbreviation when no number).

## What it does NOT do

- **Voice/tone changes.** That's `voice_match`.
- **Headline rewrites.** That's `headline`.
- **Quote edits.** Quotes are preserved verbatim. Attribution issues
  go to `attribution` (which checks for missing attribution, not
  word choice inside the quote).
- **Em-dash → comma.** 13 Stars house style (and Camille's voice
  profile) preserves em-dashes.

## Rules covered (top ~40)

- Numbers: spell-out under 10, figures for ages/percentages/dollars,
  "more than" vs "over", "%" with figures, dollar simplification.
- Dates: abbreviation rules (Jan./Feb./Aug./etc.), no th/st/nd/rd.
- Times: noon/midnight, lowercase a.m./p.m., 10 a.m. not 10:00.
- Titles: cap before name only, occupation lowercase, abbreviation
  rules for Gov./Sen./Rep./Lt. Gov.
- States: AP abbreviations, eight never-abbreviate states.
- Attribution verbs: "said" default, "stated" / "exclaimed" rejected.
- Acronyms: first-reference spelling, "U.S." with periods.
- Punctuation: Oxford comma kept, em-dash preserved, single space
  after period.
- Locations: Central Coast / North County capitalization, Highway
  spelling.
- Addresses: number-bearing vs. standalone.

## Calibration target

Run against a known-clean published story (Camille's archive, post-
copy-edit). Expect ≤ 1 false flag per 800 words. Adjust the prompt
toward that target — don't tighten the model's confidence threshold.

## Latency

Single Gemini 2.5 Flash call, JSON mode, ~3-5s for 800 words. The
parallel orchestrator in `server.py` runs this alongside the other
three skills so wall-clock for a four-skill check ≈ slowest single
call.
