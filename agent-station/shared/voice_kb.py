"""
Shared Voice-KB context fetcher for the Editorial Assistant agent.

Mirrors `role_kb.py` exactly: GitHub-raw fetch with on-disk TTL cache,
fallback to stale on network error. Profiles live under
`docs/knowledge-base/voices/` in the MyDash repo and are author-
maintained markdown files with two-field frontmatter:

    ---
    display_name: Camille DeVaul
    last_updated: 2026-04-30
    ---

Public API:
    load_profile(slug)       → {"display_name", "body", "last_updated"}
    list_profile_slugs()     → ["_default", "camille-devaul", ...]
    resolve_voice(byline)    → profile dict, or None for joint bylines

Resolution algorithm (~15 lines):
    1. Empty byline                 → _default
    2. Joint byline ('and' / '&')   → None  (caller skips voice_match)
    3. Substring match on display_name in any named profile → that profile
    4. No match                     → _default

Adding a 4th author later: drop a markdown file under
`docs/knowledge-base/voices/<slug>.md`, add the slug to `PROFILE_SLUGS`
below in the same PR, push. Cache invalidates within an hour and the
agent picks up the new profile.

Env vars (optional):
    KB_BASE          override the default GitHub raw URL
    VOICE_CACHE_DIR  where to store cached profile files
                     (default ~/.cache/wed-agents/voice-kb)
    VOICE_CACHE_TTL  seconds (default 3600 = 1 hour)
"""

from __future__ import annotations

import os
import pathlib
import time

import requests


KB_BASE = os.environ.get(
    "KB_BASE",
    "https://raw.githubusercontent.com/AndrewJackson14/MyDash/main/docs/knowledge-base",
)
VOICE_BASE = f"{KB_BASE}/voices"

CACHE_DIR = pathlib.Path(
    os.environ.get(
        "VOICE_CACHE_DIR",
        os.path.expanduser("~/.cache/wed-agents/voice-kb"),
    )
)
CACHE_TTL = int(os.environ.get("VOICE_CACHE_TTL", "3600"))

# Hardcoded slug list per spec v2 (option 2). When a 4th author is
# added, edit this constant in the same PR that adds the markdown file.
# `_default` is the fallback profile and is excluded from author
# matching.
PROFILE_SLUGS = ["camille-devaul", "hayley-mattson", "nic-mattson"]


# ── Cache + fetch ──────────────────────────────────────────


def _cache_path(slug: str) -> pathlib.Path:
    return CACHE_DIR / f"{slug}.md"


def _fresh(path: pathlib.Path) -> bool:
    if not path.exists():
        return False
    age = time.time() - path.stat().st_mtime
    return age < CACHE_TTL


def _fetch(slug: str) -> str:
    """Fetch one voice profile from GitHub raw, cache to disk, return
    the markdown text. Read-through cache: if the on-disk copy is fresh,
    no network round-trip. On fetch error, falls back to a stale cached
    copy if one exists — better than no profile when GitHub is briefly
    unreachable."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = _cache_path(slug)
    if _fresh(cached):
        return cached.read_text()

    url = f"{VOICE_BASE}/{slug}.md"
    try:
        res = requests.get(url, timeout=10)
        res.raise_for_status()
        cached.write_text(res.text)
        return res.text
    except Exception as e:
        if cached.exists():
            print(f"[voice_kb] fetch failed ({slug}): {e}; using stale cache.")
            return cached.read_text()
        raise


# ── Frontmatter parser ─────────────────────────────────────


def _parse(text: str) -> dict:
    """Split YAML frontmatter from body. Returns:
        {"display_name": str, "last_updated": str | None, "body": str}
    Frontmatter is two-field per spec v2 — minimal parser, no PyYAML
    dep. Anything beyond display_name + last_updated is ignored."""
    out = {"display_name": None, "last_updated": None, "body": text}

    if not text.startswith("---"):
        return out

    end = text.find("\n---", 3)
    if end < 0:
        return out

    fm = text[3:end]
    body = text[end + 4 :].lstrip("\n")
    out["body"] = body

    for line in fm.strip().splitlines():
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key == "display_name":
            out["display_name"] = val
        elif key == "last_updated":
            out["last_updated"] = val
    return out


# ── Public API ─────────────────────────────────────────────


class VoiceProfileNotFound(Exception):
    """Raised when a profile file can't be found (or fetched and is not
    in the stale cache)."""


def load_profile(slug: str) -> dict:
    """Returns the parsed profile for `slug`. Raises
    VoiceProfileNotFound if the file isn't reachable and isn't in the
    stale cache."""
    try:
        text = _fetch(slug)
    except Exception as e:
        raise VoiceProfileNotFound(f"voice profile {slug!r} unavailable: {e}") from e
    return _parse(text)


def list_profile_slugs() -> list[str]:
    """Returns ['_default', <named slugs from PROFILE_SLUGS>]. Order
    is intentional: _default is listed first for inventory purposes,
    but resolve_voice() skips it during named-author matching."""
    return ["_default", *PROFILE_SLUGS]


def resolve_voice(byline: str | None) -> dict | None:
    """Match a story byline to a voice profile.

    Returns a profile dict for any successful match (named author or
    fallback to _default). Returns None when the byline is a joint
    byline — the caller (voice_match skill) should skip the check
    entirely in that case rather than running it against an arbitrary
    co-author.

    Algorithm:
      1. No byline                        → _default
      2. Joint byline ('and' / '&')       → None
      3. display_name substring in byline → that profile (first match wins)
      4. No author match                  → _default
    """
    if not byline or not byline.strip():
        return load_profile("_default")

    if " and " in byline or " & " in byline:
        return None

    for slug in PROFILE_SLUGS:
        try:
            profile = load_profile(slug)
        except VoiceProfileNotFound:
            continue
        display_name = profile.get("display_name")
        if display_name and display_name in byline:
            return profile

    return load_profile("_default")


# ── Self-test (`python -m voice_kb [byline]`) ─────────────────


if __name__ == "__main__":
    import sys

    print(f"[voice_kb] cache dir: {CACHE_DIR}")
    print(f"[voice_kb] base url:  {VOICE_BASE}")
    print(f"[voice_kb] slugs:     {list_profile_slugs()}")
    print()

    # Smoke each slug — confirm fetch + parse works.
    for slug in list_profile_slugs():
        try:
            p = load_profile(slug)
            display = p.get("display_name") or "(no display_name)"
            body_len = len(p.get("body", ""))
            print(f"  {slug:20s}  display={display!r:40s}  body={body_len} chars")
        except Exception as e:
            print(f"  {slug:20s}  ERROR: {e}")

    print()

    # Resolve test cases.
    cases = [
        sys.argv[1] if len(sys.argv) > 1 else "Camille DeVaul",
        "Camille DeVaul",
        "By Camille DeVaul, Atascadero News",
        "Hayley Mattson",
        "Camille DeVaul and Hayley Mattson",  # joint
        "Press Release (auto)",                # bot byline → fallback
        "",                                    # empty → fallback
    ]
    seen = set()
    for byline in cases:
        if byline in seen:
            continue
        seen.add(byline)
        result = resolve_voice(byline)
        if result is None:
            print(f"  resolve({byline!r:50s}) → None (joint byline; skip voice_match)")
        else:
            print(f"  resolve({byline!r:50s}) → {result.get('display_name')!r}")
