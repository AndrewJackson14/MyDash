"""
MyHelper — internal help bot on Wednesday Agent Station.

Polls Supabase team_notes for bot_query entries, RAG-answers from a local
Markdown corpus, writes the response back as a team_note. Escalates low-
confidence answers to MySupport permission-holders (excluding the asker).

Design notes:
  * Uses pure-Python cosine similarity over numpy vectors. No sqlite-vss
    or sqlite-vec. Corpus is ~30 chunks — a nested loop is fine.
  * Confidence is gated primarily on retrieval distance. The model's self-
    reported score is logged but not used as the escalation gate; LLMs
    over-report confidence.
  * Stateless — no conversation memory. Prompts commit to one-shot
    actions ("I'll ping MySupport now") rather than asking follow-up
    questions the bot can't remember across turns.
  * Excludes the asker from escalation targets so a MySupport holder
    can't ping themself.
"""
import os
import time
import json
import re
import pathlib
from datetime import datetime, timezone

import numpy as np
import requests
from dotenv import load_dotenv
from supabase import create_client

# Load .env from the script's own directory so LaunchAgent + manual runs
# both pick it up regardless of CWD. override=True so editing .env always
# wins over a stale value left in the shell environment.
load_dotenv(pathlib.Path(__file__).parent / ".env", override=True)

# ─── Config ────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
MYHELPER_ID = os.environ["MYHELPER_ID"]
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text")
# Chat uses Gemini API (fast, near-free tier). Embeddings stay local via
# Ollama — they're cheap, private, and nomic-embed-text is already pulled.
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
DOCS_DIR = pathlib.Path(os.environ.get("DOCS_DIR",
    "/Users/nicholasmattson/Documents/Dev/MyDash/_docs"))
POLL_INTERVAL = 5
CORPUS_RECHECK = 300          # seconds between re-indexing
RETRIEVE_K = 3
DISTANCE_ESCALATE_THRESHOLD = 0.55  # cosine distance; 0 = identical, 2 = opposite
TOP_CHUNK_HARD_FLOOR = 0.70        # if best chunk distance > this, escalate without calling LLM
MODEL_LOG_CONFIDENCE = True         # store the LLM's self-report for telemetry only

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ─── Corpus: embed + cache in-process ──────────────────
class Corpus:
    def __init__(self):
        self.chunks: list[dict] = []   # [{path, chunk, vec (np.ndarray)}]
        self.last_built = 0.0
        self.file_mtimes: dict[str, float] = {}

    def build_or_update(self):
        seen = set()
        changed = False
        for md_path in sorted(DOCS_DIR.glob("*.md")):
            if md_path.name.startswith("_"):
                continue
            seen.add(str(md_path))
            mtime = md_path.stat().st_mtime
            if self.file_mtimes.get(str(md_path)) == mtime:
                continue
            changed = True
            raw = md_path.read_text()
            body = re.sub(r"^---[\s\S]*?---\n", "", raw, count=1)
            new_chunks = [c.strip() for c in re.split(r"\n(?=##? )", body) if c.strip()]
            # Purge existing chunks for this file, then insert fresh.
            self.chunks = [c for c in self.chunks if c["path"] != str(md_path)]
            for ch in new_chunks:
                vec = np.array(embed(ch), dtype=np.float32)
                self.chunks.append({"path": str(md_path), "chunk": ch, "vec": vec})
            self.file_mtimes[str(md_path)] = mtime
            print(f"[corpus] indexed {md_path.name} ({len(new_chunks)} chunks)")

        removed = [p for p in self.file_mtimes if p not in seen]
        for p in removed:
            changed = True
            self.chunks = [c for c in self.chunks if c["path"] != p]
            del self.file_mtimes[p]
            print(f"[corpus] removed {pathlib.Path(p).name}")

        self.last_built = time.time()
        if changed:
            print(f"[corpus] total chunks: {len(self.chunks)}")

    def search(self, query: str, k: int = RETRIEVE_K):
        if not self.chunks:
            return []
        qv = np.array(embed(query), dtype=np.float32)
        qn = np.linalg.norm(qv)
        if qn == 0:
            return []
        results = []
        for c in self.chunks:
            cn = np.linalg.norm(c["vec"])
            if cn == 0:
                continue
            cosine_sim = float(np.dot(qv, c["vec"]) / (qn * cn))
            # Convert to distance (0 = identical, 2 = opposite) for
            # consistency with the threshold names.
            distance = 1.0 - cosine_sim
            results.append((distance, c["path"], c["chunk"]))
        results.sort(key=lambda x: x[0])
        return results[:k]


def embed(text: str) -> list[float]:
    r = requests.post(
        f"{OLLAMA_URL}/api/embeddings",
        json={"model": EMBED_MODEL, "prompt": text},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["embedding"]


# ─── LLM ───────────────────────────────────────────────
SYS_PROMPT = """You are MyHelper, an internal assistant for the 13 Stars Media team.
You help team members navigate MyDash, a publishing management system.

RULES (these are absolute):
- Answer ONLY from the provided context chunks. If the context doesn't contain the answer, say so plainly and offer to escalate: "I don't have documentation on that yet. I'll ping MySupport so someone on the team can answer directly."
- Never invent features, buttons, menu items, or workflows. Never guess a path name or field name.
- Never give financial, legal, or personnel judgment — questions in those areas always go to MySupport.
- If the question is about specific live data (a client's spend, an invoice total, a salesperson's numbers), say: "That needs a human — I don't have access to live data. I'll ping MySupport."
- If you're going to escalate, actually commit to it in your response. Do not ask "would you like me to?" — you are stateless and cannot handle follow-up.
- Keep answers tight. Three sentences or fewer for simple questions; numbered list for multi-step workflows.
- Address the user by first name if provided.
- If page context is provided, tailor the answer to that page when relevant.
- End every response with a confidence line on its own line:
  CONFIDENCE: 0.85
  (a decimal between 0.0 and 1.0 — how confident the context directly answers this question)
"""


def ask_model(question: str, asker_name: str, page_context: str, context_chunks: list):
    ctx = "\n\n---\n\n".join(
        f"[from {pathlib.Path(p).name}]\n{chunk}"
        for dist, p, chunk in context_chunks
    )
    page_note = f"\nThey are currently on page: {page_context}" if page_context else ""
    prompt = f"""Team member asking: {asker_name}{page_note}

Question: {question}

Context from MyDash docs:
{ctx}

Answer using only this context. End with a CONFIDENCE line."""

    r = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
        params={"key": GEMINI_API_KEY},
        json={
            "systemInstruction": {"parts": [{"text": SYS_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2},
        },
        timeout=60,
    )
    r.raise_for_status()
    text = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()

    m = re.search(r"CONFIDENCE:\s*([0-9.]+)", text)
    model_conf = float(m.group(1)) if m else 0.0
    body = re.sub(r"\n?CONFIDENCE:\s*[0-9.]+\s*$", "", text).strip()
    return body, model_conf


# ─── Supabase I/O ──────────────────────────────────────
def get_unanswered():
    res = (
        sb.table("team_notes")
        .select("*")
        .eq("to_user", MYHELPER_ID)
        .eq("is_read", False)
        .eq("context_type", "bot_query")
        .order("created_at")
        .limit(10)
        .execute()
    )
    return res.data or []


def get_member(user_id: str):
    # people-unification (mig 179/180): team_members → people, name → display_name.
    res = sb.table("people").select("display_name,role").eq("id", user_id).single().execute()
    if not res.data:
        return {"name": "there", "role": None}
    return {"name": res.data.get("display_name"), "role": res.data.get("role")}


def get_mysupport_ids(exclude: str | None = None) -> list[str]:
    """Return people.id list of active MySupport holders, optionally
    excluding a specific id (used to prevent self-escalation ping-back)."""
    res = sb.table("people").select("id,permissions,status").eq("status", "active").execute()
    out = []
    for m in res.data or []:
        perms = m.get("permissions") or []
        if "mysupport" in perms and m["id"] != exclude:
            out.append(m["id"])
    return out


def write_reply(to_user: str, body: str):
    return sb.table("team_notes").insert({
        "from_user": MYHELPER_ID,
        "to_user": to_user,
        "message": body,
        "context_type": "bot_reply",
        "is_read": False,
    }).execute()


def mark_read(note_id: str):
    sb.table("team_notes").update({
        "is_read": True,
        "read_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", note_id).execute()


def log_exchange(asker_id, question, answer, confidence, escalated, chunks_used, page_context):
    try:
        sb.table("bot_query_log").insert({
            "asker_id": asker_id,
            "question": question,
            "answer": answer,
            "confidence": confidence,
            "escalated": escalated,
            "chunks_used": chunks_used,
            "page_context": page_context,
        }).execute()
    except Exception as e:
        print(f"[bot] log write failed (non-fatal): {e}")


def escalate(note, asker_name, conf):
    support_ids = get_mysupport_ids(exclude=note["from_user"])
    if not support_ids:
        print(f"[bot] WARN: no MySupport holders available (asker={note['from_user']}); escalation dropped")
        return
    msg = (
        f"🤖 {asker_name} asked something I couldn't answer confidently "
        f"(conf={conf:.2f}):\n\n"
        f"> {note['message']}\n\n"
        f"Could you reply to them directly?"
    )
    for sid in support_ids:
        sb.table("team_notes").insert({
            "from_user": MYHELPER_ID,
            "to_user": sid,
            "message": msg,
            "context_type": "bot_escalation",
            "is_read": False,
        }).execute()


# ─── Main loop ─────────────────────────────────────────
def handle_note(note, corpus: Corpus):
    q = (note.get("message") or "").strip()
    if not q:
        mark_read(note["id"])
        return

    asker = get_member(note["from_user"])
    first_name = (asker.get("name") or "there").split()[0]
    page_context = note.get("context_page") or ""
    print(f"[bot] {first_name} ({page_context or 'messages'}): {q[:80]}")

    chunks = corpus.search(q, k=RETRIEVE_K)

    # Zero-retrieval → immediate escalate
    if not chunks:
        body = (
            f"I don't have documentation that covers this yet, {first_name}. "
            f"I've pinged MySupport so someone can answer you directly."
        )
        write_reply(note["from_user"], body)
        mark_read(note["id"])
        log_exchange(note["from_user"], q, body, 0.0, True, [], page_context)
        escalate(note, first_name, 0.0)
        return

    best_distance = chunks[0][0]

    # Retrieval floor: if the best match is far away, don't burn a 20s LLM call
    if best_distance > TOP_CHUNK_HARD_FLOOR:
        body = (
            f"I don't have docs that closely match your question, {first_name}. "
            f"I've pinged MySupport so someone can help directly."
        )
        write_reply(note["from_user"], body)
        mark_read(note["id"])
        log_exchange(
            note["from_user"], q, body, 0.0, True,
            [pathlib.Path(p).name for _, p, _ in chunks], page_context,
        )
        escalate(note, first_name, 0.0)
        return

    # Good enough retrieval — ask the model
    body, model_conf = ask_model(q, first_name, page_context, chunks)
    # Escalation gate uses retrieval distance primarily, not the model's claim.
    should_escalate = best_distance > DISTANCE_ESCALATE_THRESHOLD
    if should_escalate:
        body += "\n\n_(I'm not fully confident on this — I've also pinged MySupport to double-check.)_"

    write_reply(note["from_user"], body)
    mark_read(note["id"])
    log_exchange(
        note["from_user"], q, body,
        model_conf if MODEL_LOG_CONFIDENCE else round(1 - best_distance, 2),
        should_escalate,
        [pathlib.Path(p).name for _, p, _ in chunks],
        page_context,
    )
    if should_escalate:
        escalate(note, first_name, round(1 - best_distance, 2))


def main():
    corpus = Corpus()
    corpus.build_or_update()
    print(f"[bot] MyHelper ready ({len(corpus.chunks)} chunks). Polling every {POLL_INTERVAL}s.")

    while True:
        try:
            if time.time() - corpus.last_built > CORPUS_RECHECK:
                corpus.build_or_update()

            notes = get_unanswered()
            for note in notes:
                handle_note(note, corpus)
        except KeyboardInterrupt:
            print("[bot] shutting down")
            break
        except Exception as e:
            print(f"[bot] ERROR: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
