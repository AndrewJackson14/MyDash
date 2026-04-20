#!/usr/bin/env python3
"""
import_archives.py
Walks /Users/nicholasmattson/Library/CloudStorage/SynologyDrive-Archive/Newspapers/Archive,
finds every */PDF*/To Web/*.pdf, compresses with Ghostscript /ebook (medium),
uploads PDF + matching JPG cover to BunnyCDN, and inserts an editions row
in Supabase. Idempotent: skips files whose target slug already exists.

Run from anywhere; reads MyDash/.env for credentials.
  python3 import_archives.py [--limit N] [--dry-run] [--pub PUB_ID]
"""
import argparse
import concurrent.futures as cf
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

import urllib.request
import urllib.error
import json

ARCHIVE_ROOT = Path("/Users/nicholasmattson/Library/CloudStorage/SynologyDrive-Archive/Newspapers/Archive")
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
LOG_PATH = Path("/tmp/import_archives.log")

# ── Pub mapping: filename prefix → MyDash publication_id ──────────────
PUB_MAP = {
    "atascadero news": "pub-atascadero-news",
    "paso robles press": "pub-paso-robles-press",
    "avila beach life": "pub-abl",
    "morro bay life": "pub-morro-bay-life",
    "santa ynez valley star": "pub-santa-ynez-valley-st",
    "santa ynez star": "pub-santa-ynez-valley-st",
    "the malibu times": "pub-the-malibu-times",
    "malibu times": "pub-the-malibu-times",
}

PUB_SLUG = {
    "pub-atascadero-news": "atascadero-news",
    "pub-paso-robles-press": "paso-robles-press",
    "pub-abl": "avila-beach-life",
    "pub-morro-bay-life": "morro-bay-life",
    "pub-santa-ynez-valley-st": "santa-ynez-valley-star",
    "pub-the-malibu-times": "the-malibu-times",
}

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

# ── Env loader ────────────────────────────────────────────────────────
def load_env():
    env = {}
    if not ENV_PATH.exists():
        sys.exit(f"FATAL: {ENV_PATH} not found")
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    url = env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("FATAL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required in .env")
    return url.rstrip("/"), key

# ── Filename parsing ──────────────────────────────────────────────────
# Examples:
#   "Atascadero News • January 4, 2024.pdf"
#   "Paso Robles Press • February 15, 2024.pdf"
#   "Morro Bay Life • October 2022.pdf"   (monthly, day-less)
def parse_filename(fname: str):
    stem = Path(fname).stem
    # Split on the bullet (U+2022). Some files use a hyphen instead.
    parts = re.split(r"\s*[•·-]\s*", stem, maxsplit=1)
    if len(parts) != 2:
        return None
    pub_raw, date_raw = parts
    pub_key = pub_raw.strip().lower()
    pub_id = PUB_MAP.get(pub_key)
    if not pub_id:
        return None
    # Date variants:
    #   "January 4, 2024" (full)
    #   "Jan 4, 2024"
    #   "October 2022" (month-only → first of month)
    m = re.match(r"([A-Za-z]+)\s+(\d{1,2})\s*,\s*(\d{4})", date_raw)
    if m:
        month = MONTHS.get(m.group(1).lower())
        if not month: return None
        try:
            d = datetime(int(m.group(3)), month, int(m.group(2))).date()
        except ValueError:
            return None
    else:
        m = re.match(r"([A-Za-z]+)\s+(\d{4})", date_raw)
        if not m: return None
        month = MONTHS.get(m.group(1).lower())
        if not month: return None
        d = datetime(int(m.group(2)), month, 1).date()
    return pub_id, d, stem  # stem preserved for human-readable title

# ── Walk ──────────────────────────────────────────────────────────────
def walk_pdfs():
    """Yield (Path, pub_id, date, title) for every web PDF found."""
    found = []
    for pdf in ARCHIVE_ROOT.rglob("*.pdf"):
        # Only files inside a "To Web" folder.
        if "To Web" not in pdf.parts:
            continue
        meta = parse_filename(pdf.name)
        if not meta:
            continue
        pub_id, date, title = meta
        found.append((pdf, pub_id, date, title))
    return found

# ── Supabase REST helpers ─────────────────────────────────────────────
def supa_request(url, key, method, path, body=None, headers=None):
    full = f"{url}{path}"
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if headers: h.update(headers)
    req = urllib.request.Request(full, method=method, headers=h)
    if body is not None:
        req.data = body if isinstance(body, bytes) else json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def existing_slugs(url, key, pub_id):
    """Return a set of slugs already in editions for this pub."""
    code, body = supa_request(
        url, key, "GET",
        f"/rest/v1/editions?publication_id=eq.{pub_id}&select=slug&limit=10000"
    )
    if code != 200:
        sys.exit(f"FATAL: failed to load existing slugs ({code}): {body[:200]}")
    return {row["slug"] for row in json.loads(body) if row.get("slug")}

def insert_edition(url, key, row):
    code, body = supa_request(
        url, key, "POST", "/rest/v1/editions",
        body=row,
        headers={"Prefer": "return=minimal"},
    )
    return code in (201, 204), code, body

# ── Bunny upload via edge function ────────────────────────────────────
def bunny_upload(url, key, local_path, remote_path, remote_filename, content_type):
    edge = f"{url}/functions/v1/bunny-storage"
    with open(local_path, "rb") as f:
        body = f.read()
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": content_type,
        "x-action": "upload",
        "x-path": remote_path,
        "x-filename": quote(remote_filename),
    }
    req = urllib.request.Request(edge, data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.loads(r.read())
        return data.get("cdnUrl"), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}: {e.read()[:200]}"
    except Exception as e:
        return None, str(e)

# ── Compression ───────────────────────────────────────────────────────
def compress_pdf(src: Path, dst: Path):
    """Ghostscript /ebook = ~150dpi, medium quality, ~70% reduction.
    Adobe-produced PDFs commonly trigger benign warnings ("error executing
    PDF token") and gs exits 1 even though the output is fine. Trust the
    output file existence + size rather than the exit code."""
    cmd = [
        "gs", "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER",
        "-sDEVICE=pdfwrite",
        "-dPDFSETTINGS=/ebook",
        "-dCompatibilityLevel=1.4",
        f"-sOutputFile={dst}",
        str(src),
    ]
    r = subprocess.run(cmd, capture_output=True, timeout=900)
    # Accept any run that produced a non-trivial output PDF.
    if dst.exists() and dst.stat().st_size > 1024:
        return True, None
    return False, r.stderr.decode("utf-8", "replace")[:300] or "no output"

# ── Per-file pipeline ─────────────────────────────────────────────────
def process_one(pdf_path, pub_id, date, title, sb_url, sb_key, dry_run, log_fn):
    pub_slug = PUB_SLUG[pub_id]
    slug = f"{pub_slug}-{date.isoformat()}"
    year = str(date.year)
    remote_path = f"editions/{pub_slug}/{year}"

    if dry_run:
        log_fn(f"[DRY] {slug}  ({pdf_path.name})")
        return "dry"

    # Compress
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_pdf = Path(tmp.name)
    ok, err = compress_pdf(pdf_path, tmp_pdf)
    if not ok:
        log_fn(f"[FAIL compress] {slug}  {err}")
        try: tmp_pdf.unlink()
        except: pass
        return "fail"

    orig_kb = pdf_path.stat().st_size // 1024
    new_kb = tmp_pdf.stat().st_size // 1024
    ratio = (1 - new_kb / orig_kb) * 100 if orig_kb else 0

    # Upload PDF
    pdf_filename = f"{slug}.pdf"
    cdn_pdf, err = bunny_upload(sb_url, sb_key, tmp_pdf, remote_path, pdf_filename, "application/pdf")
    try: tmp_pdf.unlink()
    except: pass
    if not cdn_pdf:
        log_fn(f"[FAIL upload pdf] {slug}  {err}")
        return "fail"

    # Cover JPG (same basename, different extension)
    jpg_local = pdf_path.with_suffix(".jpg")
    cdn_jpg = None
    page_count = None
    if jpg_local.exists():
        jpg_filename = f"{slug}.jpg"
        cdn_jpg, jerr = bunny_upload(sb_url, sb_key, jpg_local, remote_path, jpg_filename, "image/jpeg")
        if not cdn_jpg:
            log_fn(f"[WARN no cover upload] {slug}  {jerr}")

    # Insert editions row
    row = {
        "publication_id": pub_id,
        "slug": slug,
        "title": title,
        "publish_date": date.isoformat(),
        "pdf_url": cdn_pdf,
        "cover_image_url": cdn_jpg,
        "is_published": True,
        "is_featured": False,
        "status": "published",
    }
    ok, code, body = insert_edition(sb_url, sb_key, row)
    if not ok:
        log_fn(f"[FAIL insert] {slug}  code={code} body={body[:200]!r}")
        return "fail"

    log_fn(f"[OK] {slug}  ({orig_kb}KB → {new_kb}KB, {ratio:.0f}% smaller)")
    return "ok"

# ── Main ──────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="Process at most N items")
    ap.add_argument("--dry-run", action="store_true", help="Plan only, no compress/upload/insert")
    ap.add_argument("--pub", help="Restrict to one publication_id")
    ap.add_argument("--workers", type=int, default=3, help="Parallel workers")
    args = ap.parse_args()

    sb_url, sb_key = load_env()
    log_file = open(LOG_PATH, "a")
    def log(msg):
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"{ts}  {msg}"
        print(line, flush=True)
        log_file.write(line + "\n"); log_file.flush()

    log(f"=== run start: archive={ARCHIVE_ROOT} dry={args.dry_run} ===")
    found = walk_pdfs()
    log(f"discovered {len(found)} web PDFs")

    if args.pub:
        found = [t for t in found if t[1] == args.pub]
        log(f"filtered to {len(found)} for {args.pub}")

    # Idempotency: load existing slugs per pub once
    by_pub = {}
    for _, pub_id, _, _ in found:
        by_pub.setdefault(pub_id, set())
    for pub_id in by_pub:
        by_pub[pub_id] = existing_slugs(sb_url, sb_key, pub_id)
        log(f"existing in {pub_id}: {len(by_pub[pub_id])}")

    # Filter to-do
    todo = []
    for pdf, pub_id, date, title in found:
        slug = f"{PUB_SLUG[pub_id]}-{date.isoformat()}"
        if slug in by_pub[pub_id]:
            continue
        todo.append((pdf, pub_id, date, title))
    log(f"to import: {len(todo)} (skipping {len(found) - len(todo)} already in editions)")

    if args.limit:
        todo = todo[: args.limit]
        log(f"--limit {args.limit} → processing {len(todo)}")

    if not todo:
        log("nothing to do")
        return

    counts = {"ok": 0, "fail": 0, "dry": 0}
    start = time.time()

    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {
            ex.submit(process_one, pdf, pub_id, date, title, sb_url, sb_key, args.dry_run, log): pdf
            for pdf, pub_id, date, title in todo
        }
        for i, fut in enumerate(cf.as_completed(futures), 1):
            try:
                r = fut.result()
                counts[r] = counts.get(r, 0) + 1
            except Exception as e:
                log(f"[FAIL exception] {futures[fut].name}  {e}")
                counts["fail"] += 1
            if i % 10 == 0 or i == len(todo):
                elapsed = time.time() - start
                rate = i / elapsed if elapsed else 0
                eta = (len(todo) - i) / rate if rate else 0
                log(f"progress {i}/{len(todo)}  ok={counts['ok']} fail={counts['fail']}  rate={rate:.2f}/s  eta={eta/60:.1f}m")

    elapsed = time.time() - start
    log(f"=== done in {elapsed/60:.1f}m  ok={counts['ok']} fail={counts['fail']} dry={counts['dry']} ===")
    log_file.close()

if __name__ == "__main__":
    main()
