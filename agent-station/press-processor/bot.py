"""
Press Release Processor — auto-triages press releases from Gmail and
Google Drive into draft stories on the editorial queue.

Runs continuously on the Wednesday Agent Station. Polls every 60s.

Pipeline per release:
  1. Pull from Gmail (forward-to inbox) or Drive (intake folder)
  2. Extract text from email body + any PDF/DOCX attachments
  3. Send to Gemini for triage + classification + rewrite (single call,
     JSON-mode response)
  4. Apply routing rules:
       - is_spam OR not is_press_release → log & skip
       - is_duplicate_likely → check stories table, log if dup
       - publication = out_of_geo → log & skip
       - newsworthiness >= 3 → create Draft story, notify editors
       - newsworthiness < 3 → create Draft story with low_priority flag,
                              no notification
  5. Mark source as processed (Gmail label / Drive folder move)
  6. Log the outcome to press_release_log

The Gemini system prompt and routing table live in prompt.py so
prompt tuning doesn't pollute bot logic diffs.
"""
import hashlib
import json
import logging
import os
import pathlib
import sys
import time
import traceback
from datetime import datetime, timezone

from dotenv import load_dotenv

# Load .env from script's own directory FIRST
load_dotenv(pathlib.Path(__file__).parent / ".env", override=True)

# Add ../shared to import path AFTER dotenv loads
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "shared"))
from gemini import gemini_call, GeminiError, DEFAULT_MODEL  # noqa: E402
from supabase_client import sb, get_role_holders, write_team_note  # noqa: E402

from gmail_client import GmailClient  # noqa: E402
from drive_client import DriveClient  # noqa: E402
from extractors import extract_by_mime  # noqa: E402
from prompt import SYSTEM_PROMPT, build_user_prompt  # noqa: E402


# ─── Logging ───────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [press] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("press-processor")


# ─── Config ────────────────────────────────────────────
PRESS_BOT_ID = os.environ["PRESS_BOT_ID"]
GMAIL_CREDENTIALS = os.environ["GMAIL_OAUTH_CREDENTIALS_PATH"]
GMAIL_TOKEN = os.environ["GMAIL_OAUTH_TOKEN_PATH"]
DRIVE_INTAKE = os.environ["DRIVE_INTAKE_FOLDER_ID"]
DRIVE_PROCESSED = os.environ["DRIVE_PROCESSED_FOLDER_ID"]
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "60"))

# Roles to notify when a release becomes a draft
NOTIFY_ROLES = ["Editor-in-Chief", "Content Editor", "Managing Editor"]

# Newsworthiness threshold for creating drafts in the main queue.
# Below this, drafts are still created but flagged low_priority and no
# notification is sent.
DRAFT_THRESHOLD = 3


# ─── Clients ───────────────────────────────────────────
gmail = GmailClient(GMAIL_CREDENTIALS, GMAIL_TOKEN)
drive = DriveClient(GMAIL_CREDENTIALS, GMAIL_TOKEN, DRIVE_INTAKE, DRIVE_PROCESSED)


# ─── Helpers ───────────────────────────────────────────

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_dedup_key(source: str, source_id: str) -> str:
    """Stable hash for the (source, source_id) pair, used to populate
    stories.source_external_id so the same email/file can't create
    two stories on accidental re-processing."""
    return f"{source}:{source_id}"


def already_processed(source: str, source_id: str) -> bool:
    """Check stories.source_external_id for the dedup key. Cheap query
    with the index added in migration 088."""
    key = hash_dedup_key(source, source_id)
    res = sb.table("stories") \
        .select("id") \
        .eq("source_external_id", key) \
        .limit(1) \
        .execute()
    return len(res.data or []) > 0


def find_similar_recent_story(headline: str, days: int = 14) -> str | None:
    """Look for a story with a very similar headline in the last N days.
    Used for is_duplicate_likely checks. Returns the first match's id
    or None."""
    if not headline:
        return None
    # Naive: case-insensitive substring on the first 5 words. Anything
    # smarter belongs in a dedicated dedup pass.
    head_key = " ".join(headline.split()[:5]).lower()
    if len(head_key) < 10:
        return None
    cutoff = (datetime.now(timezone.utc).date()).isoformat()
    res = sb.table("stories") \
        .select("id,title,created_at") \
        .ilike("title", f"%{head_key}%") \
        .gte("created_at", cutoff) \
        .limit(1) \
        .execute()
    if res.data:
        return res.data[0]["id"]
    return None


def call_gemini(subject: str, sender: str, raw_text: str) -> dict:
    """Call Gemini with the prompt + release text. Returns parsed JSON.
    Raises GeminiError on failure to call or parse."""
    user_prompt = build_user_prompt(
        subject=subject, sender=sender, raw_text=raw_text
    )
    response_text = gemini_call(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        response_format="json",
        temperature=0.3,
        max_output_tokens=3000,
        timeout=90,
    )
    try:
        return json.loads(response_text)
    except json.JSONDecodeError as e:
        raise GeminiError(f"Could not parse Gemini JSON: {e}; raw: {response_text[:300]}")


def create_story(*, source: str, source_id: str, sender: str,
                 raw_text: str, gemini: dict) -> str:
    """Create a stories row from the Gemini output. Returns story id."""
    # Resolve the publication code to its real id (publications.id is
    # the text code itself per the schema, e.g. 'PRP', 'AN').
    pub_id = gemini["publication_id_suggested"]
    if pub_id == "out_of_geo":
        return None  # caller handles this case before calling us

    # First-choice headline as the title; alternatives stored on
    # the story for the editor to swap in if they prefer.
    headline_options = gemini.get("headline_options", [])
    title = headline_options[0] if headline_options else "(untitled press release)"

    newsworthiness = gemini.get("newsworthiness", 1)
    is_low_priority = newsworthiness < DRAFT_THRESHOLD

    # Build notes JSONB capturing the headline alternatives + Gemini's
    # rationale, so the editor has them inline when reviewing the draft.
    notes = {
        "press_processor": {
            "newsworthiness": newsworthiness,
            "newsworthiness_rationale": gemini.get("newsworthiness_rationale"),
            "headline_alternatives": headline_options[1:],
            "cross_pub_suggestion": gemini.get("cross_pub_suggestion"),
            "category_suggested": gemini.get("category"),
            "is_low_priority": is_low_priority,
            "sender": sender,
            "processed_at": utc_now_iso(),
        }
    }

    payload = {
        "title": title,
        "author_name": "Press Release (auto)",
        "status": "Draft",
        "publication_id": pub_id,
        "category": gemini.get("category", "News").capitalize(),
        "body": gemini.get("rewritten_body", ""),
        "body_original": raw_text,
        "source_type": "press_release",
        "source_external_id": hash_dedup_key(source, source_id),
        "audience": "public",
        "priority": "low" if is_low_priority else "normal",
        "notes": json.dumps(notes),
    }

    res = sb.table("stories").insert(payload).execute()
    if not res.data:
        raise RuntimeError("Story insert returned no data")
    return res.data[0]["id"]


def notify_editors(story_id: str, title: str, pub_id: str, newsworthiness: int) -> None:
    """Send a team_note to each Editor-in-Chief / Content Editor / Managing
    Editor. Skipped for low-priority drafts (newsworthiness < threshold)."""
    if newsworthiness < DRAFT_THRESHOLD:
        return
    score_emoji = "★" * newsworthiness
    msg = (
        f"📰 New press release drafted: {title}\n"
        f"Publication: {pub_id}  ·  Newsworthiness: {score_emoji} ({newsworthiness}/5)"
    )
    for role in NOTIFY_ROLES:
        for member in get_role_holders(role):
            try:
                write_team_note(
                    from_user=PRESS_BOT_ID,
                    to_user=member["id"],
                    message=msg,
                    context_type="press_release_processed",
                    context_page=f"stories?id={story_id}",
                    context_id=story_id,
                )
            except Exception as e:
                log.warning(f"Could not notify {member.get('name')}: {e}")


def log_outcome(*, source: str, source_id: str, subject: str, sender: str,
                raw_body: str, raw_attachments_text: str | None,
                action: str, gemini: dict | None,
                story_id: str | None, processing_seconds: float,
                error: str | None) -> None:
    """Insert a row into press_release_log."""
    try:
        payload = {
            "source": source,
            "source_id": source_id,
            "source_subject": (subject or "")[:500],
            "source_sender": (sender or "")[:500],
            "raw_body": raw_body,
            "raw_attachments_text": raw_attachments_text,
            "triaged_action": action,
            "story_id": story_id,
            "gemini_model": DEFAULT_MODEL,
            "processing_seconds": round(processing_seconds, 2),
            "error": error,
        }
        if gemini:
            payload["newsworthiness"] = gemini.get("newsworthiness")
            payload["publication_assigned"] = (
                gemini.get("publication_id_suggested")
                if gemini.get("publication_id_suggested") not in (None, "out_of_geo")
                else None
            )
            payload["rationale"] = gemini.get("newsworthiness_rationale")
            payload["cross_pub_suggestion"] = gemini.get("cross_pub_suggestion")
        sb.table("press_release_log").insert(payload).execute()
    except Exception as e:
        log.warning(f"Could not write press_release_log row (non-fatal): {e}")


# ─── Core processor ────────────────────────────────────

def process_release(
    *,
    source: str,
    source_id: str,
    subject: str,
    sender: str,
    body_text: str,
    attachments_text: str | None,
) -> tuple[str, str | None]:
    """
    Process a single press release. Returns (action, story_id).

    Caller is responsible for marking the source as processed AFTER
    a successful return. If this raises, caller should still mark
    processed (and log the error) so the agent doesn't loop on a
    bad input.
    """
    started = time.time()
    raw_text_combined = body_text
    if attachments_text:
        raw_text_combined += "\n\n--- ATTACHMENTS ---\n\n" + attachments_text

    # Dedup check first, before burning a Gemini call
    if already_processed(source, source_id):
        log.info(f"Already processed {source}:{source_id}, skipping")
        log_outcome(
            source=source, source_id=source_id, subject=subject, sender=sender,
            raw_body=body_text, raw_attachments_text=attachments_text,
            action="rejected_duplicate", gemini=None, story_id=None,
            processing_seconds=time.time() - started, error=None,
        )
        return "rejected_duplicate", None

    # Skip empty inputs
    if not raw_text_combined.strip():
        log.info(f"Empty body/attachments for {source}:{source_id}")
        log_outcome(
            source=source, source_id=source_id, subject=subject, sender=sender,
            raw_body="", raw_attachments_text=None,
            action="rejected_spam", gemini=None, story_id=None,
            processing_seconds=time.time() - started,
            error="empty body",
        )
        return "rejected_spam", None

    # Call Gemini
    try:
        gemini = call_gemini(subject, sender, raw_text_combined[:30000])
    except GeminiError as e:
        log.error(f"Gemini failed for {source}:{source_id}: {e}")
        log_outcome(
            source=source, source_id=source_id, subject=subject, sender=sender,
            raw_body=body_text, raw_attachments_text=attachments_text,
            action="error", gemini=None, story_id=None,
            processing_seconds=time.time() - started, error=str(e),
        )
        return "error", None

    # Apply routing rules
    if gemini.get("is_spam") or not gemini.get("is_press_release", True):
        log.info(f"Spam/not-PR: {subject[:60]}")
        log_outcome(
            source=source, source_id=source_id, subject=subject, sender=sender,
            raw_body=body_text, raw_attachments_text=attachments_text,
            action="rejected_spam", gemini=gemini, story_id=None,
            processing_seconds=time.time() - started, error=None,
        )
        return "rejected_spam", None

    if gemini.get("publication_id_suggested") == "out_of_geo":
        log.info(f"Out of geo: {subject[:60]}")
        log_outcome(
            source=source, source_id=source_id, subject=subject, sender=sender,
            raw_body=body_text, raw_attachments_text=attachments_text,
            action="rejected_out_of_geo", gemini=gemini, story_id=None,
            processing_seconds=time.time() - started, error=None,
        )
        return "rejected_out_of_geo", None

    # Soft duplicate check on headline
    if gemini.get("is_duplicate_likely"):
        first_headline = (gemini.get("headline_options") or [""])[0]
        existing = find_similar_recent_story(first_headline)
        if existing:
            log.info(f"Duplicate of story {existing}: {first_headline[:60]}")
            log_outcome(
                source=source, source_id=source_id, subject=subject, sender=sender,
                raw_body=body_text, raw_attachments_text=attachments_text,
                action="rejected_duplicate", gemini=gemini, story_id=existing,
                processing_seconds=time.time() - started, error=None,
            )
            return "rejected_duplicate", existing

    # Create story
    try:
        story_id = create_story(
            source=source, source_id=source_id,
            sender=sender, raw_text=raw_text_combined,
            gemini=gemini,
        )
    except Exception as e:
        log.error(f"Story create failed: {e}")
        log.error(traceback.format_exc())
        log_outcome(
            source=source, source_id=source_id, subject=subject, sender=sender,
            raw_body=body_text, raw_attachments_text=attachments_text,
            action="error", gemini=gemini, story_id=None,
            processing_seconds=time.time() - started, error=str(e),
        )
        return "error", None

    newsworthiness = gemini.get("newsworthiness", 1)
    action = "drafted" if newsworthiness >= DRAFT_THRESHOLD else "logged_low_score"

    # Notify editors (only for newsworthiness >= threshold)
    notify_editors(
        story_id=story_id,
        title=(gemini.get("headline_options") or ["Press Release"])[0],
        pub_id=gemini["publication_id_suggested"],
        newsworthiness=newsworthiness,
    )

    log_outcome(
        source=source, source_id=source_id, subject=subject, sender=sender,
        raw_body=body_text, raw_attachments_text=attachments_text,
        action=action, gemini=gemini, story_id=story_id,
        processing_seconds=time.time() - started, error=None,
    )
    log.info(
        f"{action}: {gemini['publication_id_suggested']} "
        f"score={newsworthiness} → story {story_id}"
    )
    return action, story_id


# ─── Source pollers ────────────────────────────────────

def poll_gmail():
    """Pull unread mail from intake inbox, process each message."""
    try:
        messages = gmail.list_unread(max_results=10)
    except Exception as e:
        log.error(f"Gmail list failed: {e}")
        return

    for msg_meta in messages:
        msg_id = msg_meta["id"]
        try:
            msg = gmail.fetch_message(msg_id)
        except Exception as e:
            log.error(f"Gmail fetch failed for {msg_id}: {e}")
            continue

        # Extract attachment text if any
        attachments_text = None
        if msg["attachments"]:
            chunks = []
            for att in msg["attachments"]:
                txt = extract_by_mime(att["data"], att["mime_type"], att["filename"])
                if txt:
                    chunks.append(f"[{att['filename']}]\n{txt}")
            attachments_text = "\n\n".join(chunks) if chunks else None

        try:
            process_release(
                source="email",
                source_id=msg_id,
                subject=msg["subject"],
                sender=msg["sender"],
                body_text=msg["body_text"],
                attachments_text=attachments_text,
            )
        except Exception as e:
            log.error(f"process_release threw for gmail {msg_id}: {e}")
            log.error(traceback.format_exc())
            # Still mark processed — otherwise we'll loop forever on
            # the same broken message.

        try:
            gmail.mark_processed(msg_id)
        except Exception as e:
            log.warning(f"Could not mark gmail {msg_id} processed: {e}")


def poll_drive():
    """List files in the intake Drive folder, process each, then move
    to Processed."""
    try:
        files = drive.list_intake_files()
    except Exception as e:
        log.error(f"Drive list failed: {e}")
        return

    for f in files:
        file_id = f["id"]
        try:
            content = drive.download_file(file_id)
        except Exception as e:
            log.error(f"Drive download failed for {f['name']}: {e}")
            continue

        # Extract text per the file type
        mime_for_extract = drive.get_mime_for_extractor(f["mimeType"], f["name"])
        text = extract_by_mime(content, mime_for_extract, f["name"])
        if not text:
            log.warning(f"No text extracted from {f['name']}; skipping")
            try:
                drive.move_to_processed(file_id)
            except Exception as e:
                log.warning(f"Could not move {f['name']}: {e}")
            continue

        try:
            process_release(
                source="drive",
                source_id=file_id,
                subject=f["name"],
                sender="(Drive intake)",
                body_text=text,
                attachments_text=None,
            )
        except Exception as e:
            log.error(f"process_release threw for drive {f['name']}: {e}")
            log.error(traceback.format_exc())

        try:
            drive.move_to_processed(file_id)
        except Exception as e:
            log.warning(f"Could not move {f['name']}: {e}")


# ─── Main loop ─────────────────────────────────────────

def main():
    log.info(f"Press Processor starting (poll every {POLL_INTERVAL}s)")
    while True:
        try:
            poll_gmail()
            poll_drive()
        except KeyboardInterrupt:
            log.info("Interrupted, shutting down")
            break
        except Exception as e:
            log.error(f"Unhandled error in main loop: {e}")
            log.error(traceback.format_exc())
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
