"""
app.py — Copilot AI Workspace Assistant backend (robust edition).

Key improvements over original:
  1.  Thread-safe DOCUMENT_STATE using threading.Lock
  2.  Global JSON error handlers for 400, 404, 405, 413, 500, 502
  3.  Old uploaded file cleaned up when a new one replaces it
  4.  secure_filename empty-string guard
  5.  Broad exception catch in /upload (not just FileNotFoundError / ValueError)
  6.  User-input length capped in build_prompt (prevents LLM context overflow)
  7.  /health endpoint (JSON) with Ollama reachability probe
  8.  Request logging via Python logging module
  9.  CORS allows all origins including null (file://) for local dev
  10. Max text length enforced on /rewrite and /translate payloads
  11. Content-Type validation on JSON endpoints
  12. /status endpoint exposes current document info and Ollama reachability
  13. Flask serves the frontend folder directly — open http://localhost:5000
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from uuid import uuid4

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

# ---------------------------------------------------------------------------
# Local imports (support both direct-run and package-run)
# ---------------------------------------------------------------------------
try:
    from document import allowed_file, extract_text
    from ollama_client import ask_ollama, ping_ollama, DEFAULT_MODEL
except ImportError:
    from .document import allowed_file, extract_text
    from .ollama_client import ask_ollama, ping_ollama, DEFAULT_MODEL

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
BASE_DIR      = Path(__file__).resolve().parent
FRONTEND_DIR  = BASE_DIR.parent / "frontend"

app = Flask(__name__)

# CORS — allow all origins including "null" (file:// local dev).
# In production restrict via: export CORS_ORIGINS="https://yourdomain.com"
_cors_origins_raw = os.getenv("CORS_ORIGINS", "*")
_cors_origins = (
    [o.strip() for o in _cors_origins_raw.split(",")]
    if _cors_origins_raw != "*"
    else "*"
)
CORS(
    app,
    origins=_cors_origins,
    supports_credentials=False,
    # Explicitly allow the "null" origin browsers send for file:// pages
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Content-Type"],
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
UPLOAD_FOLDER  = BASE_DIR / "uploads"
MAX_UPLOAD_MB  = int(os.getenv("MAX_UPLOAD_MB", "10"))
MAX_UPLOAD_SIZE = MAX_UPLOAD_MB * 1024 * 1024

# Maximum characters a user's free-text input may contain (prevents prompt bloat)
MAX_USER_INPUT_CHARS = int(os.getenv("MAX_USER_INPUT_CHARS", "8000"))

app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE
app.config["UPLOAD_FOLDER"]      = str(UPLOAD_FOLDER)

UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Document state (thread-safe)
# ---------------------------------------------------------------------------
_doc_lock = threading.Lock()

DOCUMENT_STATE: dict[str, str] = {
    "filename": "",
    "text":     "",
    "path":     "",
}


def _get_doc_state() -> dict[str, str]:
    with _doc_lock:
        return dict(DOCUMENT_STATE)


def _set_doc_state(filename: str, text: str, path: str) -> None:
    with _doc_lock:
        # Clean up old file from disk before replacing state
        old_path = DOCUMENT_STATE.get("path", "")
        if old_path and old_path != path:
            try:
                Path(old_path).unlink(missing_ok=True)
                logger.info("Deleted old upload: %s", old_path)
            except OSError as exc:
                logger.warning("Could not delete old upload %s: %s", old_path, exc)

        DOCUMENT_STATE["filename"] = filename
        DOCUMENT_STATE["text"]     = text
        DOCUMENT_STATE["path"]     = path


def _clear_doc_state() -> None:
    _set_doc_state("", "", "")


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def make_error(message: str, status_code: int = 400, **extra) -> tuple:
    payload = {"success": False, "message": message}
    payload.update(extra)
    logger.warning("Error %d: %s", status_code, message)
    return jsonify(payload), status_code


def get_json_body() -> dict:
    """Parse JSON body; return {} on any failure."""
    if not request.is_json:
        return {}
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def get_clean_text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def has_document() -> bool:
    with _doc_lock:
        return bool(DOCUMENT_STATE["text"].strip())


def get_document_context(limit: int = 12_000) -> str:
    with _doc_lock:
        text = DOCUMENT_STATE["text"].strip()
    return text[:limit] if text else ""


def build_prompt(task: str, user_input: str | None = None, include_document: bool = True) -> str:
    parts = [
        "You are an AI Workspace Assistant powered by Ollama.",
        "Be concise, accurate, and professional.",
        task.strip(),
    ]

    if include_document and has_document():
        with _doc_lock:
            doc_name = DOCUMENT_STATE["filename"]
        parts.append(f'Document context (from "{doc_name}"):')
        parts.append(get_document_context())

    if user_input:
        # Cap user input to avoid prompt overflow
        capped = user_input.strip()[:MAX_USER_INPUT_CHARS]
        parts.append("User input:")
        parts.append(capped)

    parts.append("Return only the answer. Use clear, concise bullet points where appropriate.")
    return "\n\n".join(parts)


def handle_llm_request(task: str, user_input: str | None = None, include_document: bool = True):
    """Call the LLM and return a standardised JSON response."""
    try:
        prompt = build_prompt(task, user_input, include_document=include_document)
        answer = ask_ollama(prompt)
    except RuntimeError as exc:
        logger.error("LLM error: %s", exc)
        return make_error(str(exc), 502)
    except Exception as exc:
        logger.exception("Unexpected LLM error")
        return make_error("An unexpected error occurred while contacting the AI model.", 500)

    doc = _get_doc_state()
    response: dict = {"success": True, "answer": answer, "model": DEFAULT_MODEL}
    if doc["filename"]:
        response["documentName"] = doc["filename"]
    return jsonify(response)


def require_json(fn):
    """Decorator: return 415 if the request Content-Type is not application/json."""
    from functools import wraps

    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not request.is_json:
            return make_error(
                "Content-Type must be application/json.",
                415,
            )
        return fn(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# Global error handlers (always return JSON)
# ---------------------------------------------------------------------------

@app.errorhandler(400)
def handle_400(exc):
    return make_error(str(exc) or "Bad request.", 400)


@app.errorhandler(404)
def handle_404(exc):
    return make_error(f"Endpoint not found: {request.path}", 404)


@app.errorhandler(405)
def handle_405(exc):
    return make_error(
        f"Method {request.method} is not allowed on {request.path}.", 405
    )


@app.errorhandler(RequestEntityTooLarge)
def handle_413(exc):
    return make_error(
        f"File too large. Maximum allowed size is {MAX_UPLOAD_MB} MB.", 413
    )


@app.errorhandler(500)
def handle_500(exc):
    logger.exception("Unhandled 500 error")
    return make_error("An internal server error occurred.", 500)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/", methods=["GET"])
def home():
    """Serve the frontend index.html (or return JSON for API clients)."""
    # If a browser requests HTML, serve the frontend
    accept = request.headers.get("Accept", "")
    if "text/html" in accept and FRONTEND_DIR.exists():
        return send_from_directory(str(FRONTEND_DIR), "index.html")
    # API / health-check clients get JSON
    return jsonify({
        "service": "Copilot AI Workspace Assistant",
        "status":  "running",
        "version": "2.0",
        "frontend": f"Open http://localhost:{os.getenv('PORT', '5000')} in your browser",
    })


@app.route("/<path:filename>", methods=["GET"])
def serve_frontend_static(filename):
    """Serve any frontend static file (style.css, script.js, etc.)."""
    # Only serve files that actually exist in the frontend folder
    target = FRONTEND_DIR / filename
    if target.exists() and target.is_file():
        return send_from_directory(str(FRONTEND_DIR), filename)
    # Fall through to 404 handler
    return handle_404(None)


@app.route("/health", methods=["GET"])
def health():
    """Lightweight health check — also probes Ollama."""
    ollama_ok = ping_ollama()
    doc = _get_doc_state()
    return jsonify({
        "success":         True,
        "ollama_reachable": ollama_ok,
        "model":           DEFAULT_MODEL,
        "document_loaded": bool(doc["filename"]),
        "document_name":   doc["filename"] or None,
    }), 200 if ollama_ok else 503


@app.route("/status", methods=["GET"])
def status():
    """Detailed status including document state."""
    doc = _get_doc_state()
    return jsonify({
        "success":       True,
        "ollama_ok":     ping_ollama(),
        "model":         DEFAULT_MODEL,
        "document": {
            "loaded":   bool(doc["filename"]),
            "filename": doc["filename"] or None,
            "chars":    len(doc["text"]) if doc["text"] else 0,
        },
    })


@app.route("/chat", methods=["POST"])
@require_json
def chat():
    data     = get_json_body()
    question = get_clean_text(data.get("question"))

    if not question:
        return make_error("'question' field is required and must not be empty.")

    if len(question) > MAX_USER_INPUT_CHARS:
        return make_error(
            f"Question is too long ({len(question)} chars). "
            f"Maximum is {MAX_USER_INPUT_CHARS} characters."
        )

    if has_document():
        task = (
            "Answer the user's question using the uploaded document as the primary context. "
            "If the document does not contain the answer, say so clearly and then provide "
            "the best general guidance you can."
        )
    else:
        task = (
            "Answer the user's question as a helpful AI assistant. "
            "Provide accurate, practical, and direct guidance."
        )

    logger.info("Chat | question_len=%d | has_doc=%s", len(question), has_document())
    return handle_llm_request(task, question)


@app.route("/upload", methods=["POST"])
def upload():
    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        return make_error("A PDF, DOCX, or TXT file is required.")

    original_name = uploaded_file.filename

    if not allowed_file(original_name):
        return make_error(
            "Unsupported file type. Please upload a PDF, DOCX, or TXT file."
        )

    safe_name = secure_filename(original_name)
    if not safe_name:
        return make_error(
            "The filename contains only special characters and cannot be stored safely. "
            "Please rename the file and try again."
        )

    stored_name = f"{uuid4().hex}_{safe_name}"
    saved_path  = UPLOAD_FOLDER / stored_name

    try:
        uploaded_file.save(saved_path)
    except OSError as exc:
        logger.error("Could not save uploaded file: %s", exc)
        return make_error("Failed to save the uploaded file. Please try again.", 500)

    try:
        extracted_text = extract_text(str(saved_path)).strip()
    except (FileNotFoundError, ValueError) as exc:
        _safe_delete(saved_path)
        return make_error(str(exc))
    except Exception as exc:
        logger.exception("Unexpected error during text extraction")
        _safe_delete(saved_path)
        return make_error(
            f"An unexpected error occurred while reading the file: {exc}", 500
        )

    if not extracted_text:
        _safe_delete(saved_path)
        return make_error(
            "No readable text was found in the uploaded file. "
            "If this is a scanned PDF, the text may be image-based and unsupported."
        )

    _set_doc_state(original_name, extracted_text, str(saved_path))
    logger.info(
        "Upload OK | file=%s | chars=%d", original_name, len(extracted_text)
    )

    return jsonify({
        "success":    True,
        "message":    "File uploaded and processed successfully.",
        "filename":   original_name,
        "textLength": len(extracted_text),
        "textPreview": extracted_text[:200] + ("…" if len(extracted_text) > 200 else ""),
    })


@app.route("/summarize", methods=["POST"])
def summarize():
    if not has_document():
        return make_error("Please upload a document before requesting a summary.")

    task = (
        "Summarize the uploaded document in 5 to 7 concise bullet points. "
        "Highlight the main themes, key decisions, and the most important facts."
    )
    logger.info("Summarize | doc=%s", _get_doc_state()["filename"])
    return handle_llm_request(task)


@app.route("/rewrite", methods=["POST"])
@require_json
def rewrite():
    data = get_json_body()
    text = get_clean_text(data.get("text"))

    if not text:
        return make_error("'text' field is required for rewriting.")

    if len(text) > MAX_USER_INPUT_CHARS:
        return make_error(
            f"Text is too long ({len(text)} chars). "
            f"Maximum is {MAX_USER_INPUT_CHARS} characters."
        )

    task = (
        "Rewrite the provided text professionally. "
        "Preserve the original meaning while improving clarity, structure, "
        "and using a polished business tone."
    )
    logger.info("Rewrite | text_len=%d", len(text))
    return handle_llm_request(task, text, include_document=False)


@app.route("/email", methods=["POST"])
def email():
    if not has_document():
        return make_error("Please upload a document before generating an email.")

    task = (
        "Draft a professional email based on the uploaded document. "
        "Include a clear Subject line on the first line, "
        "then a concise and ready-to-send email body."
    )
    logger.info("Email | doc=%s", _get_doc_state()["filename"])
    return handle_llm_request(task)


@app.route("/tasks", methods=["POST"])
def tasks():
    if not has_document():
        return make_error("Please upload a document before extracting action items.")

    task = (
        "Extract all action items from the uploaded document. "
        "Return clean bullet points only — each item must be specific and actionable."
    )
    logger.info("Tasks | doc=%s", _get_doc_state()["filename"])
    return handle_llm_request(task)


@app.route("/translate", methods=["POST"])
@require_json
def translate():
    data     = get_json_body()
    text     = get_clean_text(data.get("text"))
    language = get_clean_text(data.get("language"))

    if not text:
        return make_error("'text' field is required for translation.")

    if len(text) > MAX_USER_INPUT_CHARS:
        return make_error(
            f"Text is too long ({len(text)} chars). "
            f"Maximum is {MAX_USER_INPUT_CHARS} characters."
        )

    if not language:
        return make_error("'language' field is required. Example: 'Hindi', 'French'.")

    # Basic sanity check on language value
    if len(language) > 64:
        return make_error("Language value is too long. Please provide a valid language name.")

    task = (
        f"Translate the provided text into {language}. "
        "Preserve the original meaning, tone, and formatting as closely as possible."
    )
    logger.info("Translate | lang=%s | text_len=%d", language, len(text))
    return handle_llm_request(task, text, include_document=False)


@app.route("/clear", methods=["POST"])
def clear_document():
    """Remove the currently loaded document from server state."""
    doc = _get_doc_state()
    if not doc["filename"]:
        return jsonify({"success": True, "message": "No document was loaded."})
    _clear_doc_state()
    logger.info("Document state cleared.")
    return jsonify({"success": True, "message": "Document cleared successfully."})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_delete(path) -> None:
    """Delete a file without raising."""
    try:
        Path(path).unlink(missing_ok=True)
    except OSError as exc:
        logger.warning("Could not delete temp file %s: %s", path, exc)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    logger.info("Starting Copilot backend on port %d (debug=%s)", port, debug)
    app.run(host="0.0.0.0", port=port, debug=debug)