"""
llm_client.py — High-Performance Unified LLM Client for AI Workspace Assistant.

Supports:
  1. Groq Cloud API (Ultra-fast inference with openai/gpt-oss-120b)
  2. Local Ollama Fallback (llama3.1:8b, mistral, etc.)
  3. Real-time Token Streaming (Server-Sent Events)
  4. Multi-turn chat message formatting
  5. Tone temperature presets (Creative, Balanced, Precise)
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

import requests
from requests.exceptions import RequestException

# ---------------------------------------------------------------------------
# Load .env if present
# ---------------------------------------------------------------------------
try:
    from dotenv import load_dotenv
    # Search for .env in current dir or parent dir
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b").strip()
GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
GROQ_CHAT_URL: str = f"{GROQ_BASE_URL}/chat/completions"
GROQ_MODELS_URL: str = f"{GROQ_BASE_URL}/models"

OLLAMA_BASE_URL: str = os.getenv("OLLAMA_URL", "http://localhost:11434").strip()
OLLAMA_GENERATE_URL: str = f"{OLLAMA_BASE_URL}/api/generate"
OLLAMA_TAGS_URL: str = f"{OLLAMA_BASE_URL}/api/tags"
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.1:8b").strip()

LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "groq" if GROQ_API_KEY else "ollama").lower()
DEFAULT_MODEL: str = GROQ_MODEL if (LLM_PROVIDER == "groq" and GROQ_API_KEY) else OLLAMA_MODEL

REQUEST_TIMEOUT: int = int(os.getenv("LLM_TIMEOUT", "60"))

# Temperature presets
TONE_TEMPERATURES = {
    "creative": 0.7,
    "balanced": 0.25,
    "precise": 0.05,
}

# Fast ping cache with TTL
_ping_cache = {"last_check": 0.0, "provider": "", "result": False}


# ---------------------------------------------------------------------------
# Health & Model Discovery
# ---------------------------------------------------------------------------

def get_active_provider() -> str:
    """Return active provider ('groq', 'ollama', or 'offline')."""
    if GROQ_API_KEY:
        return "groq"
    if ping_ollama():
        return "ollama"
    return "offline"


def ping_llm(force: bool = False) -> bool:
    """Fast probe with 5s TTL cache checking active provider reachability."""
    now = time.time()
    provider = "groq" if GROQ_API_KEY else "ollama"

    if not force and _ping_cache["provider"] == provider and (now - _ping_cache["last_check"] < 5.0):
        return _ping_cache["result"]

    res = False
    if provider == "groq":
        try:
            headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
            resp = requests.get(GROQ_MODELS_URL, headers=headers, timeout=2.5)
            res = (resp.status_code == 200)
        except Exception:
            res = False
    else:
        try:
            resp = requests.get(OLLAMA_TAGS_URL, timeout=1.5)
            res = (resp.status_code == 200)
        except Exception:
            res = False

    _ping_cache["last_check"] = now
    _ping_cache["provider"] = provider
    _ping_cache["result"] = res
    return res


def ping_ollama(force: bool = False) -> bool:
    """Dedicated probe for Ollama."""
    try:
        resp = requests.get(OLLAMA_TAGS_URL, timeout=1.0)
        return resp.status_code == 200
    except Exception:
        return False


def get_available_models() -> List[str]:
    """Return list of models available from the active provider."""
    if GROQ_API_KEY:
        try:
            headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
            resp = requests.get(GROQ_MODELS_URL, headers=headers, timeout=3.0)
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("id") for m in data.get("data", []) if m.get("id")]
                # Prioritize user's model and major chat models
                sorted_models = []
                if GROQ_MODEL in models:
                    sorted_models.append(GROQ_MODEL)
                for m in models:
                    if m not in sorted_models and ("gpt" in m or "llama" in m or "mixtral" in m or "qwen" in m):
                        sorted_models.append(m)
                return sorted_models or models[:15]
        except Exception as exc:
            logger.debug("Groq models query failed: %s", exc)

    # Fallback to Ollama tags
    try:
        resp = requests.get(OLLAMA_TAGS_URL, timeout=1.5)
        if resp.status_code == 200:
            data = resp.json()
            return [m.get("name") for m in data.get("models", []) if m.get("name")]
    except Exception:
        pass

    return [GROQ_MODEL, OLLAMA_MODEL]


# ---------------------------------------------------------------------------
# Message & Prompt Formatting
# ---------------------------------------------------------------------------

def is_stale_assistant_message(text: str) -> bool:
    """Return True if message was a previous offline/missing-doc warning."""
    low = text.lower()
    return any(p in low for p in [
        "no document detected",
        "i don't see any document",
        "i don’t see any document",
        "i don't see any file",
        "i don’t see any file",
        "currently ollama is not connected",
        "offline mode",
        "please upload a document",
    ])


def format_openai_messages(
    task: str,
    user_input: Optional[str] = None,
    document_context: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    tone: str = "balanced",
    doc_name: Optional[str] = None,
) -> List[Dict[str, str]]:
    """Format structured messages list for OpenAI-compatible chat APIs (Groq)."""
    tone_instruction = {
        "creative": "Adopt an inspiring, engaging, and creative professional style.",
        "balanced": "Adopt a balanced, clear, and efficient professional style.",
        "precise": "Adopt a concise, rigorous, factual, and strictly objective style.",
    }.get(tone.lower(), "Be concise, accurate, and professional.")

    system_content = (
        f"You are the Microsoft Copilot AI Workspace Assistant.\n"
        f"{tone_instruction}\n\n"
        f"Core Directive:\n{task.strip()}\n\n"
        "Guidelines:\n"
        "- Format answers in clean, well-structured Markdown.\n"
        "- Use bullet points, bold headers, and markdown tables where appropriate.\n"
        "- When document context is provided in the user prompt, prioritize facts, findings, and details from that document.\n"
        "- Never claim no document is attached if document context is provided in the user turn."
    )

    messages = [{"role": "system", "content": system_content}]

    # Conversation history (last 6 turns, filtering stale offline warnings)
    if history:
        for turn in history[-6:]:
            role = turn.get("role")
            content = turn.get("content", "").strip()
            if not content or role not in ("user", "assistant"):
                continue
            if role == "assistant" and is_stale_assistant_message(content):
                continue
            messages.append({"role": role, "content": content})

    # User Turn with Attached Document Context
    if user_input and user_input.strip():
        if document_context and document_context.strip():
            user_content = (
                f"[ATTACHED DOCUMENT: {doc_name or 'Uploaded Document'}]\n"
                f"\"\"\"\n{document_context.strip()}\n\"\"\"\n\n"
                f"User Request / Question:\n{user_input.strip()}"
            )
        else:
            user_content = user_input.strip()
        messages.append({"role": "user", "content": user_content})

    return messages


def build_system_and_prompt(
    task: str,
    user_input: Optional[str] = None,
    document_context: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    tone: str = "balanced",
    doc_name: Optional[str] = None,
) -> str:
    """Format single string prompt (for Ollama generate endpoint)."""
    messages = format_openai_messages(task, user_input, document_context, history, tone, doc_name)
    parts = []
    for m in messages:
        role = m["role"].capitalize()
        parts.append(f"[{role}]\n{m['content']}")
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Synchronous Non-Streaming Request
# ---------------------------------------------------------------------------

def ask_llm(
    task: str,
    user_input: Optional[str] = None,
    document_context: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    *,
    model: Optional[str] = None,
    tone: str = "balanced",
    doc_name: Optional[str] = None,
    max_tokens: int = 2048,
) -> str:
    """Send request to active LLM provider (Groq or Ollama) and return response."""
    resolved_model = model or DEFAULT_MODEL
    temperature = TONE_TEMPERATURES.get(tone.lower(), 0.25)

    # 1. Try Groq if API key is configured
    if GROQ_API_KEY:
        try:
            t0 = time.perf_counter()
            messages = format_openai_messages(task, user_input, document_context, history, tone, doc_name)
            payload = {
                "model": resolved_model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False,
            }
            headers = {
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            }
            resp = requests.post(GROQ_CHAT_URL, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            answer = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            if answer:
                elapsed = time.perf_counter() - t0
                logger.info("Groq OK | model=%s | elapsed=%.2fs", resolved_model, elapsed)
                return answer
        except Exception as exc:
            logger.warning("Groq request failed: %s; checking Ollama fallback...", exc)

    # 2. Try Ollama fallback
    prompt = build_system_and_prompt(task, user_input, document_context, history, tone, doc_name)
    return ask_ollama_raw(prompt, model=OLLAMA_MODEL, temperature=temperature, num_predict=max_tokens)


def ask_ollama_raw(prompt: str, model: str, temperature: float = 0.2, num_predict: int = 1536) -> str:
    """Internal helper to invoke Ollama directly."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": temperature, "num_predict": num_predict},
    }
    resp = requests.post(OLLAMA_GENERATE_URL, json=payload, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    answer = str(data.get("response", "")).strip()
    if not answer:
        raise RuntimeError("Ollama returned an empty response.")
    return answer


# ---------------------------------------------------------------------------
# Streaming Token Generator (Server-Sent Events)
# ---------------------------------------------------------------------------

def stream_llm(
    task: str,
    user_input: Optional[str] = None,
    document_context: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    *,
    model: Optional[str] = None,
    tone: str = "balanced",
    doc_name: Optional[str] = None,
    max_tokens: int = 2500,
) -> Generator[str, None, None]:
    """Stream tokens in real-time from Groq or Ollama."""
    resolved_model = model or DEFAULT_MODEL
    temperature = TONE_TEMPERATURES.get(tone.lower(), 0.25)

    # 1. Stream from Groq if API key is present
    if GROQ_API_KEY:
        try:
            messages = format_openai_messages(task, user_input, document_context, history, tone, doc_name)
            payload = {
                "model": resolved_model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": True,
            }
            headers = {
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            }
            resp = requests.post(GROQ_CHAT_URL, headers=headers, json=payload, timeout=REQUEST_TIMEOUT, stream=True)
            resp.raise_for_status()

            for line in resp.iter_lines(decode_unicode=True):
                if not line:
                    continue
                trimmed = line.strip()
                if trimmed == "data: [DONE]":
                    break
                if trimmed.startswith("data: "):
                    try:
                        chunk_json = json.loads(trimmed[6:])
                        choices = chunk_json.get("choices", [])
                        if choices:
                            delta = choices[0].get("delta", {})
                            token = delta.get("content", "")
                            if token:
                                yield token
                    except Exception:
                        continue
            return
        except Exception as exc:
            logger.warning("Groq stream error: %s; falling back to Ollama...", exc)

    # 2. Stream from Ollama fallback
    prompt = build_system_and_prompt(task, user_input, document_context, history, tone)
    for token in stream_ollama_raw(prompt, model=OLLAMA_MODEL, temperature=temperature):
        yield token


def stream_ollama_raw(prompt: str, model: str, temperature: float = 0.2) -> Generator[str, None, None]:
    """Stream directly from Ollama."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": True,
        "options": {"temperature": temperature},
    }
    resp = requests.post(OLLAMA_GENERATE_URL, json=payload, timeout=REQUEST_TIMEOUT, stream=True)
    resp.raise_for_status()

    for line in resp.iter_lines(decode_unicode=True):
        if not line:
            continue
        try:
            chunk_data = json.loads(line)
            token = chunk_data.get("response", "")
            if token:
                yield token
            if chunk_data.get("done", False):
                break
        except Exception:
            continue


# Backwards-compatible aliases
ask_ollama = ask_llm
stream_ollama = stream_llm
