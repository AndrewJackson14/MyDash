# Voice Profiles — Editorial Assistant

This folder holds editorial voice profiles for the **Editorial Assistant**
agent's `voice_match` skill. Each named profile teaches the assistant
how a specific author writes — sentence rhythms, vocabulary, attribution
style — so that "drift" suggestions match what that person would
actually do, not a generic house standard.

## Roster

| File | Profile | Status |
|---|---|---|
| `_default.md` | 13 Stars house voice (fallback) | Shipped |
| `camille-devaul.md` | Camille DeVaul | Shipped |
| `hayley-mattson.md` | Hayley Mattson | Pending interview |
| `nic-mattson.md` | Nic Mattson | Pending interview |

When a 4th author is added later, drop a new `<their-slug>.md` in this
folder and add the slug to `PROFILE_SLUGS` in `shared/voice_kb.py`. No
other plumbing.

## How resolution works

The agent matches `story.author` (the byline string) against each
profile's `display_name` via simple substring match. First match wins.
No match → falls back to `_default.md`. Joint bylines (containing
` and ` or ` & `) skip `voice_match` entirely.

Adding/editing a profile = create or edit a markdown file in this
folder, push to main. The agent's voice cache invalidates within an
hour and picks up the new content.

## Frontmatter

Two fields. That's it.

```markdown
---
display_name: Camille DeVaul
last_updated: 2026-04-30
---
```

- **`display_name`** — the string the resolver searches for inside
  `story.author`. Must match how the author actually appears in
  bylines on published stories. Verify against `stories.author` in the
  database before locking the value.
- **`last_updated`** — ISO date, human reference only. Bump it when
  you edit the body.

No status field, no aliases, no team-member UUID, no per-publication
variants. The simplification is intentional — see editorial-assistant-spec.md.

## Body structure

Use `camille-devaul.md` as the canonical template. Section order:

1. **Voice Summary** — 3–6 sentences capturing the author's stance,
   priorities, and the texture of their prose. Read like a critic, not
   a checklist.

2. **Sentence Patterns** — concrete, observable patterns. Length
   ranges, punctuation habits (em-dash use, comma splices for
   attribution), opening and closing tendencies. Each bullet should
   be specific enough that a Gemini model can flag drift from it.

3. **Vocabulary Tendencies** —
   - Active vs. passive default
   - Signature phrases the author reaches for
   - Words and constructions the author avoids (PR-speak, jargon,
     specific filler phrases)
   - Local vocabulary (regional identifiers, occupational nouns,
     reader-facing terms)

4. **Attribution Style** —
   - Default verb (almost always *said*)
   - Acceptable alternatives, used sparingly (*added*, *explained*,
     *shared*) — and which ones the author refuses to use
   - First-reference convention (full title + full name)
   - Subsequent-reference convention (last name only, exceptions)
   - Quote placement, block quotes, family/multi-person handling
   - Quote integrity rule

5. **Structural Preferences** —
   - Datelines (CAPS-LOCK regional vs. omitted)
   - Lede shape for hard news / features / breaking
   - Paragraph rhythm (graf 2 expansion vs. quote)
   - Quote rhythm (mixing direct + paraphrased)
   - Kicker patterns
   - Tense conventions

6. **What She/He Avoids** — explicit list of forbidden patterns. PR
   language, editorial commentary, adverbs-with-said, single-word
   paragraphs, etc. The `voice_match` skill flags drift against this
   list.

7. **Long-form / Feature Mode** (optional, if the author shifts modes) —
   what changes for magazine-length features (PRM, ANM, longer pieces).
   What does NOT change.

8. **Sample Passages** — 2–3 real published excerpts under section
   headers (e.g. "Hard news", "Feature", "Community/event"). Block
   quotes preserve authorial voice for the calibration test. Pull from
   the database, not memory.

9. **Notes for the Editor** — explicit "do NOT flag these as drift"
   list. Patterns the author uses deliberately that the agent might
   otherwise flag because they look unusual relative to the default.

## Interview process

Sit with each author for 30–60 minutes. Pull 5–10 of their published
stories from the database first (`SELECT body FROM stories WHERE author
ILIKE '%<name>%' AND status = 'Approved' ORDER BY created_at DESC LIMIT
10`) and have them on hand.

Walk through the section list above with them. Ask:

- "What rules do you break on purpose?" (these go in *Notes for the
  Editor*)
- "Read this paragraph from a story you wrote — what would you change
  if a copy editor 'fixed' it?" (these go in *What She/He Avoids* and
  *Notes for the Editor*)
- "When do you use *added* vs. *said*?" (these go in *Attribution Style*)
- "Show me a kicker you're proud of." (these go in *Structural
  Preferences* and *Sample Passages*)

The author's spoken-aloud answers usually get translated into the
markdown by the interviewer, not transcribed verbatim. The author
reviews the draft profile before merge.

## Testing

After landing a profile, run a calibration test: take one of the
author's recently published stories, pass it through the `voice_match`
skill, expect near-zero false flags. If the agent flags patterns the
author uses deliberately, those patterns belong in *Notes for the
Editor*.

## Maintenance

Profiles drift over time as authors evolve. Bump `last_updated` and
review the body when:

- An author moves between hard news and features regularly
- A copy editor reports the agent flagging too many false positives on
  that author's stories
- The author changes beats (e.g. moves from city hall to features)

Stale profiles are still better than no profile — `_default.md`
catches everything else.
