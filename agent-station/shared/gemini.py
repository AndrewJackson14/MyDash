"""
Shared Gemini client for every agent on the Wednesday Agent Station.

Every agent's bot.py imports from here:

    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "shared"))
    from gemini import gemini_call, gemini_embed

Why a shared module: the Gemini API endpoint, request shape, and response
parsing change occasionally. When that happens, one file changes — not
five. Same reason MyHelper's `embed()` and `ask_model()` aren't inlined
into bot.py twice.

Environment variables (caller is responsible for loading these via dotenv):
    GEMINI_API_KEY     required
    GEMINI_MODEL       optional, defaults to gemini-2.5-flash
"""
import os
import re
import time
import requests


# ─── Config ────────────────────────────────────────────
DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
PRO_MODEL = "gemini-2.5-pro"
EMBED_MODEL = "text-embedding-004"

# Single endpoint base. If Google moves the endpoint, this is the only
# string to change.
_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


# ─── Errors ────────────────────────────────────────────
class GeminiError(Exception):
    """Raised when Gemini returns an error or unparseable response."""
    pass


# ─── Chat / generation ─────────────────────────────────
def gemini_call(
    *,
    system_prompt: str,
    user_prompt: str,
    model: str = None,
    temperature: float = 0.2,
    response_format: str = "text",   # "text" or "json"
    max_output_tokens: int = 2048,
    timeout: int = 60,
    retries: int = 1,
) -> str:
    """
    Single Gemini generateContent call. Returns the response text.

    response_format="json" sets responseMimeType to application/json so
    Gemini returns valid JSON without code fences. Caller still needs to
    json.loads() the result.

    Retries once on transient errors (5xx, timeout). For more sophisticated
    backoff, the caller can wrap this themselves — keeping the helper simple.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise GeminiError("GEMINI_API_KEY not set in environment")

    model = model or DEFAULT_MODEL

    config = {
        "temperature": temperature,
        "maxOutputTokens": max_output_tokens,
    }
    if response_format == "json":
        config["responseMimeType"] = "application/json"

    body = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": config,
    }

    last_err = None
    for attempt in range(retries + 1):
        try:
            r = requests.post(
                f"{_BASE_URL}/{model}:generateContent",
                params={"key": api_key},
                json=body,
                timeout=timeout,
            )
            if r.status_code >= 500:
                # Transient — let the retry loop handle it
                last_err = GeminiError(f"Gemini {r.status_code}: {r.text[:200]}")
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            data = r.json()

            # Defensive: extract first candidate's first text part.
            try:
                return data["candidates"][0]["content"]["parts"][0]["text"].strip()
            except (KeyError, IndexError) as e:
                # Sometimes Gemini returns no candidates if safety filters
                # tripped. Surface the finishReason if available.
                finish = (
                    data.get("candidates", [{}])[0].get("finishReason")
                    if data.get("candidates") else None
                )
                raise GeminiError(
                    f"No usable response from Gemini "
                    f"(finishReason={finish}, raw={str(data)[:300]})"
                ) from e

        except requests.exceptions.Timeout as e:
            last_err = GeminiError(f"Gemini timeout after {timeout}s")
            time.sleep(2 ** attempt)
            continue
        except requests.exceptions.RequestException as e:
            # Non-5xx HTTP errors aren't retried — they're usually 4xx
            # (bad request, auth, quota) which retry won't fix.
            raise GeminiError(f"Gemini request failed: {e}") from e

    # Exhausted retries
    raise last_err or GeminiError("Gemini call failed for unknown reason")


# ─── Embeddings ────────────────────────────────────────
def gemini_embed(
    text: str,
    *,
    model: str = EMBED_MODEL,
    task_type: str = "RETRIEVAL_DOCUMENT",
    timeout: int = 30,
) -> list[float]:
    """
    Get a 768-dim embedding from Gemini's text-embedding-004 model.

    task_type guides Gemini's embedding to optimize for the intended use:
      RETRIEVAL_DOCUMENT  — embedding a doc to be searched (default)
      RETRIEVAL_QUERY     — embedding a query searching for documents
      SEMANTIC_SIMILARITY — symmetric similarity comparison
      CLASSIFICATION      — classification task
      CLUSTERING          — clustering task

    For the Editorial Assistant's "Suggest related stories":
      - Indexing the corpus → task_type="RETRIEVAL_DOCUMENT"
      - Querying with the current article → task_type="RETRIEVAL_QUERY"
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise GeminiError("GEMINI_API_KEY not set in environment")

    body = {
        "model": f"models/{model}",
        "content": {"parts": [{"text": text}]},
        "taskType": task_type,
    }

    try:
        r = requests.post(
            f"{_BASE_URL}/{model}:embedContent",
            params={"key": api_key},
            json=body,
            timeout=timeout,
        )
        r.raise_for_status()
        return r.json()["embedding"]["values"]
    except requests.exceptions.RequestException as e:
        raise GeminiError(f"Gemini embed request failed: {e}") from e
    except (KeyError, IndexError) as e:
        raise GeminiError(f"Gemini embed response malformed: {r.text[:300]}") from e


# ─── Helpers ───────────────────────────────────────────
def extract_confidence(text: str) -> tuple[str, float]:
    """
    Extracts a `CONFIDENCE: 0.85` line from the end of a response and
    returns (cleaned_text, confidence_float).

    Mirrors the pattern MyHelper uses in its prompt. Reusable for any
    agent that asks the model to self-report confidence.
    """
    m = re.search(r"CONFIDENCE:\s*([0-9.]+)\s*$", text, re.MULTILINE)
    conf = float(m.group(1)) if m else 0.0
    cleaned = re.sub(r"\n?CONFIDENCE:\s*[0-9.]+\s*$", "", text).strip()
    return cleaned, conf
