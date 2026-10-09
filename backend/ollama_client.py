"""
ollama_client.py — Backwards-compatible proxy forwarding to llm_client.py.
"""

from llm_client import (
    DEFAULT_MODEL,
    OLLAMA_MODEL,
    GROQ_MODEL,
    ask_llm,
    ask_ollama,
    build_system_and_prompt,
    get_available_models,
    ping_llm,
    ping_ollama,
    stream_llm,
    stream_ollama,
)

__all__ = [
    "DEFAULT_MODEL",
    "OLLAMA_MODEL",
    "GROQ_MODEL",
    "ask_llm",
    "ask_ollama",
    "build_system_and_prompt",
    "get_available_models",
    "ping_llm",
    "ping_ollama",
    "stream_llm",
    "stream_ollama",
]