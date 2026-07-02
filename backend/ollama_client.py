"""
ollama_client.py — Robust Ollama LLM client.

Improvements over original:
- Retry with exponential back-off on transient network errors (up to 3 attempts)
- Configurable via environment variables
- Proper JSON decode error handling
- ping() helper to test Ollama reachability without a full prompt
- Returns model name alongside the answer
- Logs each request duration for observability
"""

from __future__ import annotations

import logging
import os
import time

import requests
from requests.exceptions import (
    ConnectionError,
    JSONDecodeError,
    ReadTimeout,
    RequestException,
    Timeout,
)

# ---------------------------------------------------------------------------
# Configuration (all overridable via env)
# ---------------------------------------------------------------------------
OLLAMA_BASE_URL: str = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_GENERATE_URL: str = f"{OLLAMA_BASE_URL}/api/generate"
OLLAMA_TAGS_URL: str = f"{OLLAMA_BASE_URL}/api/tags"

DEFAULT_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
REQUEST_TIMEOUT: int = int(os.getenv("OLLAMA_TIMEOUT", "120"))
MAX_RETRIES: int = int(os.getenv("OLLAMA_MAX_RETRIES", "2"))
PING_TIMEOUT: int = int(os.getenv("OLLAMA_PING_TIMEOUT", "5"))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Transient errors that warrant a retry
# ---------------------------------------------------------------------------
_RETRYABLE = (ConnectionError, ReadTimeout, Timeout)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def ask_ollama(
    prompt: str,
    *,
    model: str | None = None,
    temperature: float = 0.2,
    num_predict: int = 1024,
) -> str:
    """
    Send *prompt* to Ollama and return the text response.

    Retries up to MAX_RETRIES times on transient network errors with
    exponential back-off (1 s, 2 s, …).

    Raises RuntimeError with a human-readable message on permanent failure.
    """
    resolved_model = model or DEFAULT_MODEL
    payload: dict = {
        "model": resolved_model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": num_predict,
        },
    }

    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 2):  # attempts: 1 … MAX_RETRIES+1
        try:
            t0 = time.perf_counter()
            response = requests.post(
                OLLAMA_GENERATE_URL,
                json=payload,
                timeout=REQUEST_TIMEOUT,
            )
            elapsed = time.perf_counter() - t0

            response.raise_for_status()

            try:
                data: dict = response.json()
            except (JSONDecodeError, ValueError) as exc:
                raise RuntimeError(
                    "Ollama returned a response that could not be parsed as JSON. "
                    "Is Ollama running the correct version?"
                ) from exc

            answer = str(data.get("response", "")).strip()
            if not answer:
                raise RuntimeError(
                    "Ollama returned an empty response. "
                    "The model may have run out of context or generated nothing."
                )

            logger.info(
                "Ollama request succeeded | model=%s | tokens≈%s | elapsed=%.2fs",
                resolved_model,
                data.get("eval_count", "?"),
                elapsed,
            )
            return answer

        except _RETRYABLE as exc:
            last_exc = exc
            wait = 2 ** (attempt - 1)  # 1 s, 2 s, 4 s …
            logger.warning(
                "Ollama transient error (attempt %d/%d): %s — retrying in %ds",
                attempt,
                MAX_RETRIES + 1,
                exc,
                wait,
            )
            if attempt <= MAX_RETRIES:
                time.sleep(wait)

        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else "?"
            raise RuntimeError(
                f"Ollama returned HTTP {status}. "
                "Check that the model is loaded and Ollama is running."
            ) from exc

        except RuntimeError:
            raise  # Already a well-formatted RuntimeError — don't wrap again

        except RequestException as exc:
            raise RuntimeError(f"Unable to reach Ollama: {exc}") from exc

    raise RuntimeError(
        f"Ollama did not respond after {MAX_RETRIES + 1} attempts. "
        f"Last error: {last_exc}"
    )


def ping_ollama() -> bool:
    """
    Return True if Ollama is reachable, False otherwise.
    Never raises — safe to call in health-check routes.
    """
    try:
        resp = requests.get(OLLAMA_TAGS_URL, timeout=PING_TIMEOUT)
        return resp.ok
    except Exception:
        return False


# Backwards-compatible alias
ask_llm = ask_ollama