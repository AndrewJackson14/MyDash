"""
Shared Supabase client factory for every agent on the Wednesday Agent Station.

Usage:

    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "shared"))
    from supabase_client import sb

    notes = sb.table("team_notes").select("*").eq("to_user", BOT_ID).execute()

Why a shared module: the Supabase URL and service key are the same for
every agent. No reason for each bot to instantiate its own client.

Environment variables (caller is responsible for loading these via dotenv):
    SUPABASE_URL              required
    SUPABASE_SERVICE_KEY      required (NOT the anon key — agents need
                              service-role to bypass RLS)
"""
import os
from supabase import create_client, Client


# ─── Lazy-init client ──────────────────────────────────
# We don't instantiate at import time because importing this module
# from a script that hasn't loaded its .env yet would crash on KeyError.
# Instead, the first attribute access on `sb` triggers init.

_client: Client | None = None


def _get_client() -> Client:
    """Returns a cached Supabase client. Instantiates on first call."""
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the "
                "environment before importing supabase_client. Make sure "
                "your bot.py calls load_dotenv() before importing from "
                "the shared module."
            )
        _client = create_client(url, key)
    return _client


class _SupabaseProxy:
    """
    Thin proxy that defers client instantiation until first attribute
    access. Lets callers `from supabase_client import sb` at the top of
    their bot.py file even though the env vars haven't been loaded yet.
    """
    def __getattr__(self, name):
        return getattr(_get_client(), name)


sb = _SupabaseProxy()


# ─── Convenience helpers ───────────────────────────────
# These wrap common patterns from the existing MyHelper bot.py so new
# agents don't reinvent them.

def get_team_member(user_id: str) -> dict:
    """Fetch a single team_members row by id. Returns dict with name + role,
    or a fallback dict if the user isn't found."""
    res = sb.table("team_members").select("name,role,email").eq("id", user_id).single().execute()
    return res.data or {"name": "there", "role": None, "email": None}


def get_role_holders(role: str) -> list[dict]:
    """Return all active team_members with a given role.
    Useful for: 'send to all Editor-in-Chief role holders'."""
    res = sb.table("team_members") \
        .select("id,name,email,auth_id") \
        .eq("role", role) \
        .eq("is_active", True) \
        .execute()
    return res.data or []


def get_permission_holders(permission: str, exclude: str | None = None) -> list[str]:
    """Return team_members.id list for active members holding `permission`.
    Optionally exclude a specific id (used to prevent self-escalation
    ping-back, the same way MyHelper excludes the asker from MySupport)."""
    res = sb.table("team_members") \
        .select("id,permissions,is_active") \
        .eq("is_active", True) \
        .execute()
    out = []
    for m in res.data or []:
        perms = m.get("permissions") or []
        if permission in perms and m["id"] != exclude:
            out.append(m["id"])
    return out


def write_team_note(
    *,
    from_user: str,
    to_user: str,
    message: str,
    context_type: str | None = None,
    context_page: str | None = None,
    context_id: str | None = None,
) -> dict:
    """Insert a row into team_notes. Returns the created row.

    context_type values used by agents:
        'press_release_processed'  — Press Processor info note to editors
        'seo_generated'            — SEO Generator toast trigger
        'proposal_drafted'         — Proposal Drafter info note to rep
        'briefing_ready'           — Signal Runner info note to recipient
        'bot_query' / 'bot_reply' / 'bot_escalation' — MyHelper (existing)
    """
    payload = {
        "from_user": from_user,
        "to_user": to_user,
        "message": message,
        "is_read": False,
    }
    if context_type is not None:
        payload["context_type"] = context_type
    if context_page is not None:
        payload["context_page"] = context_page
    if context_id is not None:
        payload["context_id"] = context_id

    res = sb.table("team_notes").insert(payload).execute()
    return (res.data or [{}])[0]
