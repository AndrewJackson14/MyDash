# Phase 1 — Aesthetic Direction

> **Note:** This document describes the Press Room concept. Final typography, color values, and font-delivery decisions live in `01-direction-decisions.md`. Where the two files conflict, `01-direction-decisions.md` wins.

## Aesthetic Name

**Press Room** — a working publication's interior, not its cover.

## Rationale

MyDash is the back-of-house tool for a magazine group. The people using it all day are not readers — they are the staff who make the magazine. The aesthetic should feel like the room where the work happens: a layout desk, a copy editor's monitor, a production board on the wall. Editorial in vocabulary, utilitarian in posture. Confident enough to feel designed; restrained enough to disappear into a workday.

This avoids two failure modes:
1. Generic SaaS dashboard (rounded cards on white, Inter, blue accent, purple gradient somewhere) — looks like every other tool, says nothing about who uses it.
2. Magazine-cover cosplay (huge serif headlines, full-bleed photography, art-directed flourishes) — beautiful for thirty seconds, exhausting at hour six of a workday.

Press Room sits between them. It's a tool that knows it belongs to a publishing house.

## The One Memorable Thing

A persistent thin rule running across the top of every page with a kicker, slug, and revision date — the visual language of a galley proof. It's the first thing a user sees, it's distinctive, and it costs almost nothing in pixels or attention.

Example treatment, top of every page:

```
13 STARS / MYDASH ── PERFORMANCE REVIEW ── REV. 04.26.26 ── EDITORIAL
```

Set in a small monospaced face, letterspaced, hairline rule above and below. It reads as production metadata, which is exactly what it is. Nobody else's dashboard looks like this.

## Spatial Philosophy

Grid-strict, generous vertical rhythm, dense horizontal data. A 12-column grid with hairline rules between major regions instead of card shadows. Tables are tight (8px row padding, not 16) because production staff scan them all day; surrounding chrome is generous (32–48px section gaps) so the density never feels claustrophobic. Asymmetry only at page-header level.

No floating cards with drop shadows. Surfaces are defined by hairlines and background tone, not elevation. This is the second-biggest break from generic SaaS.

## Motion Philosophy

Almost none, with one signature moment. On initial dashboard load, the metadata strip types in as if a wire feed is composing it, the page title fades up, and KPI numbers count from zero to value. After that first paint, motion is reserved for: modal open/close, toast slide-in, and a 2px underline draw on hover for primary links. No page-transition animations, no scroll-triggered reveals, no parallax.

## Texture & Atmosphere

Subtle paper grain on `--paper` only. A 2% opacity SVG noise overlay fixed to the viewport, not scrolling with content. Costs ~3KB. Invisible if you're looking for it, load-bearing if you remove it. Cards stay clean — the grain lives on the page background, which gives the visual hierarchy "stock vs. ink" instead of "shadow vs. no shadow." No gradients anywhere. No glass/blur effects. Hairlines do the structural work shadows usually do.

## What This Locks In

- Every page reads as part of one publication
- Density is honest — tables are tables, not card-wrapped pretend-tables
- One memorable thing (the metadata strip) that costs nothing and signals everything
- A palette with exactly one decision in it (red on warm paper); everything else is monochrome discipline
- A motion budget small enough that the app feels fast on a five-year-old laptop in the editorial office

## What This Forecloses

- No second accent color later. Departments are signaled by the metadata strip's section label, not by recoloring chrome.
- No card shadows being added back in. If something needs to feel elevated, it gets a heavier hairline or a tonal shift, not a shadow.
- No display-serif body copy. The display serif stays in the title/KPI lane.