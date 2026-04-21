"""
Gmail API wrapper for the Press Processor.

Polls the configured Gmail account's inbox for unread messages, reads
them (including attachments), and applies a "Processed" label so the
agent doesn't re-process the same message on the next poll.

OAuth setup (one-time per machine):
  1. Drop credentials.json (downloaded from Google Cloud Console) at
     the path specified by GMAIL_OAUTH_CREDENTIALS_PATH in .env.
  2. First run will open a browser for OAuth consent and write
     token.json at GMAIL_OAUTH_TOKEN_PATH. That token then refreshes
     itself indefinitely as long as the refresh token doesn't expire
     (≈6 months of inactivity, which won't happen on a polling agent).

Scopes used:
  https://www.googleapis.com/auth/gmail.modify   (read + label + mark-read)

We DON'T use full gmail scope — modify is enough and is the
narrowest permission that lets us mark messages read and apply
labels.
"""
import base64
import logging
import os
import pathlib

logger = logging.getLogger(__name__)

# Lazy imports so the module can be imported without google libs
# installed (useful for the test runner that only exercises extractors).
_googleapiclient = None
_google_auth = None


def _ensure_libs():
    global _googleapiclient, _google_auth
    if _googleapiclient is None:
        from googleapiclient.discovery import build
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from google.auth.transport.requests import Request
        _googleapiclient = build
        _google_auth = (Credentials, InstalledAppFlow, Request)


SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]
PROCESSED_LABEL_NAME = "Processed by Press Bot"


class GmailClient:
    def __init__(self, credentials_path: str, token_path: str):
        _ensure_libs()
        self._credentials_path = pathlib.Path(credentials_path)
        self._token_path = pathlib.Path(token_path)
        self._service = None
        self._processed_label_id = None

    def _get_service(self):
        if self._service is not None:
            return self._service

        Credentials, InstalledAppFlow, Request = _google_auth
        creds = None
        if self._token_path.exists():
            creds = Credentials.from_authorized_user_file(str(self._token_path), SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not self._credentials_path.exists():
                    raise FileNotFoundError(
                        f"OAuth credentials not found at {self._credentials_path}. "
                        "Download from Google Cloud Console (OAuth 2.0 Client IDs → "
                        "Desktop app) and save to that path."
                    )
                flow = InstalledAppFlow.from_client_secrets_file(
                    str(self._credentials_path), SCOPES
                )
                # First-run consent: opens a local browser. Run the bot
                # manually once to authorize, then LaunchAgent picks up
                # the saved token thereafter.
                creds = flow.run_local_server(port=0)
            self._token_path.write_text(creds.to_json())

        self._service = _googleapiclient("gmail", "v1", credentials=creds)
        return self._service

    def _get_or_create_processed_label_id(self) -> str:
        if self._processed_label_id is not None:
            return self._processed_label_id
        svc = self._get_service()
        labels = svc.users().labels().list(userId="me").execute().get("labels", [])
        for label in labels:
            if label["name"] == PROCESSED_LABEL_NAME:
                self._processed_label_id = label["id"]
                return self._processed_label_id
        # Create it
        body = {
            "name": PROCESSED_LABEL_NAME,
            "labelListVisibility": "labelShow",
            "messageListVisibility": "show",
        }
        created = svc.users().labels().create(userId="me", body=body).execute()
        self._processed_label_id = created["id"]
        return self._processed_label_id

    def list_unread(self, max_results: int = 10) -> list[dict]:
        """List unread message metadata. Returns a list of dicts with
        at least 'id' set. Caller passes the id to fetch_message()."""
        svc = self._get_service()
        # Filter: unread, in inbox, not already labeled Processed.
        # The "-label:" syntax excludes our label.
        query = f"is:unread in:inbox -label:\"{PROCESSED_LABEL_NAME}\""
        res = svc.users().messages().list(
            userId="me", q=query, maxResults=max_results
        ).execute()
        return res.get("messages", [])

    def fetch_message(self, message_id: str) -> dict:
        """Fetch a full message by id. Returns a normalized dict:
        {
          'id': str,
          'subject': str,
          'sender': str,
          'body_text': str,
          'attachments': [{'filename': str, 'mime_type': str, 'data': bytes}],
        }
        """
        svc = self._get_service()
        msg = svc.users().messages().get(
            userId="me", id=message_id, format="full"
        ).execute()

        headers = {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}
        subject = headers.get("subject", "")
        sender = headers.get("from", "")

        body_text, attachments = self._walk_parts(svc, message_id, msg["payload"])

        return {
            "id": message_id,
            "subject": subject,
            "sender": sender,
            "body_text": body_text,
            "attachments": attachments,
        }

    def _walk_parts(self, svc, message_id: str, part: dict) -> tuple[str, list[dict]]:
        """Recursively walks MIME parts, accumulating text/plain body
        and binary attachments. text/html is used as fallback only if
        no text/plain part exists."""
        text_plain = []
        text_html = []
        attachments = []

        def walk(p):
            mime = p.get("mimeType", "")
            filename = p.get("filename", "")
            body = p.get("body", {})

            if mime == "text/plain" and body.get("data"):
                text_plain.append(self._decode_b64(body["data"]))
            elif mime == "text/html" and body.get("data") and not filename:
                text_html.append(self._decode_b64(body["data"]))
            elif filename and body.get("attachmentId"):
                # Binary attachment — fetch its data
                att = svc.users().messages().attachments().get(
                    userId="me", messageId=message_id, id=body["attachmentId"]
                ).execute()
                data = base64.urlsafe_b64decode(att["data"].encode("utf-8"))
                attachments.append({
                    "filename": filename,
                    "mime_type": mime,
                    "data": data,
                })
            elif filename and body.get("data"):
                # Inline attachment
                data = base64.urlsafe_b64decode(body["data"].encode("utf-8"))
                attachments.append({
                    "filename": filename,
                    "mime_type": mime,
                    "data": data,
                })

            for sub in p.get("parts", []) or []:
                walk(sub)

        walk(part)

        body_text = "\n\n".join(text_plain).strip()
        if not body_text and text_html:
            # Fallback: strip basic HTML tags. Not perfect but adequate
            # for press release HTML emails.
            import re
            html = "\n\n".join(text_html)
            html = re.sub(r"<style[\s\S]*?</style>", "", html, flags=re.I)
            html = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
            html = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
            html = re.sub(r"</p\s*>", "\n\n", html, flags=re.I)
            html = re.sub(r"<[^>]+>", "", html)
            body_text = re.sub(r"\n{3,}", "\n\n", html).strip()

        return body_text, attachments

    @staticmethod
    def _decode_b64(data_str: str) -> str:
        decoded = base64.urlsafe_b64decode(data_str.encode("utf-8"))
        return decoded.decode("utf-8", errors="ignore")

    def mark_processed(self, message_id: str) -> None:
        """Apply Processed label and mark as read so the message
        doesn't come back on the next poll."""
        svc = self._get_service()
        label_id = self._get_or_create_processed_label_id()
        svc.users().messages().modify(
            userId="me",
            id=message_id,
            body={
                "addLabelIds": [label_id],
                "removeLabelIds": ["UNREAD"],
            },
        ).execute()
