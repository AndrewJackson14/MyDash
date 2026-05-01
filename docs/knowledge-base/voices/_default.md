---
display_name: 13 Stars house voice
last_updated: 2026-04-30
---

# 13 Stars House Voice — Default Editorial Profile

The fallback voice profile. Used when a story's byline doesn't match any
named author profile (Camille DeVaul, Hayley Mattson, Nic Mattson) and
for press-release-drafted stories whose `author` field is
`"Press Release (auto)"`.

These rules are lifted directly from the press-processor Gemini system
prompt (`agent-station/press-processor/prompt.py`) so the editorial
quality bar that's already encoded there carries forward into the
Editorial Assistant agent's `voice_match` skill.

## Voice Summary

Direct, neutral, community-focused. The 13 Stars house voice serves
regional readers on California's Central Coast and in Malibu. It reports
news without editorializing, leads with substance, and trusts quotes to
carry emotion.

## Rewrite Rules

When rewriting a story to house voice (newsworthiness ≥ 3):

- **Lede paragraph names WHO, WHAT, WHEN, WHERE in plain language.**
  Get the actor, action, and location into the first or second sentence.
- **Attribution preserved verbatim from source quotes.** Do not modify
  quoted text, only the surrounding narrative.
- **AP style** for dates, numbers, titles, abbreviations, state names.
- **Direct, neutral, community-focused tone.** No editorializing, no
  judgment in narration.
- **No marketing language.** Strip:
  - *"excited to announce"*
  - *"thrilled to offer"*
  - *"proud to introduce"*
  - *"pleased to partner"*
  - any variant of corporate enthusiasm in narration
- **Word counts by newsworthiness:**
  - **4–5** (hard news, multi-source impact): 250–450 words
  - **3** (routine but reportable): 150–250 words
  - **1–2** (borderline / promotional): 100–150 words, but score honestly
    so the agent skips creating a draft

## Headline Options

When suggesting headlines (returned as 3 alternatives):

- **Three options, each 5–9 words.**
- **AP style title case.**
- **No clickbait, no questions, no listicle openers.**
- **Ranked by intent:**
  1. **First option = most accurate.** What happened, plain.
  2. **Second option = most engaging.** Same facts, sharper hook.
  3. **Third option = most local.** Foreground the regional angle.

## What This Voice Avoids

- **Editorial commentary in narration.** Stays neutral; lets quotes
  carry emotion.
- **PR language.** *excited to announce*, *thrilled to*, *proud to*.
- **Adverbs paired with said.** No *"said quickly"*, *"said angrily"*.
- **Trailing modifiers** (*"...he said, smiling"*).
- **Filler phrases.** *"in order to"*, *"going forward"*, *"the fact that"*.
- **Single-word paragraphs.**
- **Listicle patterns** in news copy.

## Notes for the Editor

The `voice_match` skill should treat these as the baseline house voice.
Any author-specific patterns that diverge from this baseline (e.g.
Camille's deliberate em-dash usage) belong in that author's named
profile, not here.

When this profile is selected (no byline match found), the side panel
in StoryEditor should display:

> Voice: 13 Stars house voice (default)

so the editor knows the suggestions are against the house baseline,
not a personalized profile.
