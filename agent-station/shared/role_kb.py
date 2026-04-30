"""
Shared Role-KB context fetcher for Wednesday Agent Station bots.

Every agent's bot.py can pull its primary-role context (plus the
two _shared docs) into its system prompt:

    from role_kb import get_role_context
    role_text = get_role_context("sales-rep")
    system_prompt = "Background context:\\n" + role_text + "\\n\\n" + base_prompt

Source: GitHub raw (main branch). Cached on disk with a 1-hour TTL —
the role docs change rarely, no need to fetch on every invocation.
Cache invalidation also keys on `_meta.json` version so a manual
version bump in a docs PR forces a refresh.

Why fetch from GitHub raw vs. checked-in copy: agents run on a
separate cron host (Wednesday); they don't always have the latest
MyDash checkout. Fetching from the canonical source means the
moment a docs PR merges, agent context updates within an hour.

Env vars (optional):
    KB_BASE          override the default GitHub raw URL
    KB_CACHE_DIR     where to store cached files (default ~/.cache/wed-agents/role-kb)
    KB_CACHE_TTL     seconds (default 3600 = 1 hour)
"""

import json
import os
import pathlib
import time

import requests


KB_BASE = os.environ.get(
    "KB_BASE",
    "https://raw.githubusercontent.com/AndrewJackson14/MyDash/main/docs/knowledge-base",
)
CACHE_DIR = pathlib.Path(
    os.environ.get(
        "KB_CACHE_DIR",
        os.path.expanduser("~/.cache/wed-agents/role-kb"),
    )
)
CACHE_TTL = int(os.environ.get("KB_CACHE_TTL", "3600"))

# The two _shared docs every agent gets, regardless of role.
SHARED_DOCS = ["glossary.md", "workflows.md"]


def _cache_path(name: str) -> pathlib.Path:
    """Maps a doc name (e.g. 'sales-rep.md', '_meta.json',
    '_shared/glossary.md') to a flat filename in the cache dir."""
    safe = name.replace("/", "__")
    return CACHE_DIR / safe


def _fresh(path: pathlib.Path) -> bool:
    if not path.exists():
        return False
    age = time.time() - path.stat().st_mtime
    return age < CACHE_TTL


def _fetch(name: str) -> str:
    """Fetch one doc from GitHub raw, cache to disk, return text.
    Cache is read-through: if the on-disk copy is fresh, returns it
    without a network round-trip."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = _cache_path(name)
    if _fresh(cached):
        return cached.read_text()

    url = f"{KB_BASE}/{name}"
    try:
        res = requests.get(url, timeout=10)
        res.raise_for_status()
        cached.write_text(res.text)
        return res.text
    except Exception as e:
        # Fall back to a stale cached copy if available — better
        # than no context when GitHub is briefly unreachable.
        if cached.exists():
            print(f"[role_kb] fetch failed ({name}): {e}; using stale cache.")
            return cached.read_text()
        raise


def _check_version_bump():
    """Read _meta.json; if its version differs from the cached
    sentinel, blow the cache so all docs refetch."""
    try:
        meta_text = _fetch("_meta.json")
        meta = json.loads(meta_text)
        version = str(meta.get("version", ""))
    except Exception:
        return  # Soft-fail; next call retries.
    sentinel = CACHE_DIR / ".version"
    prev = sentinel.read_text().strip() if sentinel.exists() else ""
    if version and version != prev:
        # Version bump — clear all role/shared docs, keep _meta.json.
        for f in CACHE_DIR.glob("*"):
            if f.name not in {"_meta.json", ".version"}:
                f.unlink()
        sentinel.write_text(version)


def get_role_context(role_slug: str) -> str:
    """Returns the concatenated context for an agent whose primary role
    is `role_slug`. Format:

        # Glossary
        <_shared/glossary.md body>

        # Workflows
        <_shared/workflows.md body>

        # <Role display name>
        <{role_slug}.md body>

    Frontmatter blocks are stripped so they don't pollute the prompt
    token budget."""
    _check_version_bump()
    parts = []
    for shared in SHARED_DOCS:
        try:
            text = _fetch(f"_shared/{shared}")
            parts.append(_strip_frontmatter(text))
        except Exception as e:
            print(f"[role_kb] shared/{shared} unavailable: {e}")

    try:
        role_text = _fetch(f"{role_slug}.md")
        parts.append(_strip_frontmatter(role_text))
    except Exception as e:
        print(f"[role_kb] role {role_slug} unavailable: {e}")

    return "\n\n---\n\n".join(parts)


def _strip_frontmatter(text: str) -> str:
    """Drop the YAML frontmatter (between two `---` lines at the
    top) so the LLM's prompt budget doesn't pay for metadata."""
    if not text.startswith("---"):
        return text
    end = text.find("\n---", 3)
    if end < 0:
        return text
    return text[end + 4 :].lstrip("\n")


# ── Self-test (`python -m role_kb sales-rep`) ───────────────────
if __name__ == "__main__":
    import sys

    role = sys.argv[1] if len(sys.argv) > 1 else "publisher"
    ctx = get_role_context(role)
    print(f"[role_kb] {role} → {len(ctx)} chars")
    print(ctx[:500] + ("…" if len(ctx) > 500 else ""))
