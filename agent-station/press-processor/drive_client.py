"""
Google Drive API wrapper for the Press Processor.

Watches a single intake folder for new files (PDFs, DOCXs, plain
text). When found, downloads them, returns their content for
processing, then moves them to a sibling 'Processed' folder so the
intake folder stays clean.

OAuth setup:
  Same OAuth credentials and token as the Gmail client. Drive scope
  is added to the consent prompt so a single token covers both.

Scopes used:
  https://www.googleapis.com/auth/drive    (read + move + minimal write)
"""
import logging
import pathlib

logger = logging.getLogger(__name__)

# Lazy imports (same pattern as gmail_client)
_googleapiclient = None


def _ensure_libs():
    global _googleapiclient
    if _googleapiclient is None:
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseDownload
        _googleapiclient = (build, MediaIoBaseDownload)


SCOPES = ["https://www.googleapis.com/auth/drive"]


class DriveClient:
    def __init__(self, credentials_path: str, token_path: str,
                 intake_folder_id: str, processed_folder_id: str):
        _ensure_libs()
        self._credentials_path = pathlib.Path(credentials_path)
        self._token_path = pathlib.Path(token_path)
        self._intake_folder_id = intake_folder_id
        self._processed_folder_id = processed_folder_id
        self._service = None

    def _get_service(self):
        if self._service is not None:
            return self._service

        # Reuse the same OAuth flow as Gmail. The token file must have
        # been created with both gmail.modify AND drive scopes — the
        # bot.py main() should call gmail._get_service() FIRST with
        # both scopes specified so the consent screen authorizes
        # everything in one go.
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request

        if not self._token_path.exists():
            raise FileNotFoundError(
                f"Token file not found at {self._token_path}. "
                "Run gmail_client OAuth flow first to create it."
            )

        creds = Credentials.from_authorized_user_file(str(self._token_path), SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                raise RuntimeError(
                    "Drive credentials invalid and cannot refresh. "
                    "Delete token.json and re-run the bot to re-authorize."
                )

        build, _ = _googleapiclient
        self._service = build("drive", "v3", credentials=creds)
        return self._service

    def list_intake_files(self) -> list[dict]:
        """List files in the intake folder. Returns list of dicts with
        id, name, mimeType, modifiedTime."""
        svc = self._get_service()
        query = (
            f"'{self._intake_folder_id}' in parents "
            "and trashed = false "
            # Skip subfolders (someone might create folders to organize)
            "and mimeType != 'application/vnd.google-apps.folder'"
        )
        res = svc.files().list(
            q=query,
            fields="files(id,name,mimeType,modifiedTime,size)",
            pageSize=20,
            orderBy="modifiedTime",
        ).execute()
        return res.get("files", [])

    def download_file(self, file_id: str) -> bytes:
        """Download a file's binary content."""
        import io
        svc = self._get_service()
        _, MediaIoBaseDownload = _googleapiclient

        # Special case: Google Docs need export, not download
        meta = svc.files().get(fileId=file_id, fields="mimeType").execute()
        mime = meta["mimeType"]

        if mime == "application/vnd.google-apps.document":
            # Export Google Doc as plain text — simplest for press releases
            data = svc.files().export(
                fileId=file_id,
                mimeType="text/plain",
            ).execute()
            return data
        else:
            request = svc.files().get_media(fileId=file_id)
            buf = io.BytesIO()
            downloader = MediaIoBaseDownload(buf, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            return buf.getvalue()

    def move_to_processed(self, file_id: str) -> None:
        """Move a file from intake to the processed folder."""
        svc = self._get_service()
        # Need to remove the intake folder parent and add the processed parent.
        meta = svc.files().get(
            fileId=file_id, fields="parents"
        ).execute()
        prev_parents = ",".join(meta.get("parents", []))
        svc.files().update(
            fileId=file_id,
            addParents=self._processed_folder_id,
            removeParents=prev_parents,
            fields="id, parents",
        ).execute()

    def get_mime_for_extractor(self, drive_mime: str, filename: str) -> str:
        """Map Drive's MIME types to the ones extractors.py expects.
        Google Docs export to text/plain, etc."""
        if drive_mime == "application/vnd.google-apps.document":
            return "text/plain"
        return drive_mime
