"""
app.py — Enhanced Copilot AI Workspace Assistant Backend.

Supports:
  1. Groq Cloud API (openai/gpt-oss-120b) for ultra-fast intelligence
  2. Local Ollama fallback & Dynamic Model Switching
  3. Multi-document library store with RAG semantic chunk retrieval
  4. Real-time streaming (SSE) and synchronous endpoints
  5. Built-in Offline Intelligence fallback
  6. Tone presets: Creative, Balanced, Precise
  7. Thread-safe operations and global JSON error handlers
"""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from uuid import uuid4

from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

# ---------------------------------------------------------------------------
# Load Environment Variables (.env)
# ---------------------------------------------------------------------------
try:
    from dotenv import load_dotenv
    env_file = Path(__file__).resolve().parent / ".env"
    if not env_file.exists():
        env_file = Path(__file__).resolve().parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Local Imports
# ---------------------------------------------------------------------------
try:
    from document import allowed_file, extract_text
    from llm_client import (
        DEFAULT_MODEL,
        GROQ_API_KEY,
        GROQ_MODEL,
        OLLAMA_MODEL,
        ask_llm,
        get_active_provider,
        get_available_models,
        ping_llm,
        ping_ollama,
        stream_llm,
    )
    from rag_engine import DocumentLibrary, OfflineIntelligence
except ImportError:
    from .document import allowed_file, extract_text
    from .llm_client import (
        DEFAULT_MODEL,
        GROQ_API_KEY,
        GROQ_MODEL,
        OLLAMA_MODEL,
        ask_llm,
        get_active_provider,
        get_available_models,
        ping_llm,
        ping_ollama,
        stream_llm,
    )
    from .rag_engine import DocumentLibrary, OfflineIntelligence

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
# Flask App Setup
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

app = Flask(__name__)

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
    allow_headers=["Content-Type", "Authorization", "Accept"],
    expose_headers=["Content-Type"],
)

# ---------------------------------------------------------------------------
# Configuration & State
# ---------------------------------------------------------------------------
UPLOAD_FOLDER = BASE_DIR / "uploads"
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))
MAX_UPLOAD_SIZE = MAX_UPLOAD_MB * 1024 * 1024
MAX_USER_INPUT_CHARS = int(os.getenv("MAX_USER_INPUT_CHARS", "12000"))

app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE
app.config["UPLOAD_FOLDER"] = str(UPLOAD_FOLDER)
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

# State management
_lock = threading.Lock()
doc_library = DocumentLibrary()
current_active_model = DEFAULT_MODEL


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def make_error(message: str, status_code: int = 400, **extra) -> tuple:
    payload = {"success": False, "message": message}
    payload.update(extra)
    logger.warning("Error %d: %s", status_code, message)
    return jsonify(payload), status_code


def get_json_body() -> dict:
    if not request.is_json:
        return {}
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def get_clean_text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


# ---------------------------------------------------------------------------
# Global Error Handlers (Always JSON)
# ---------------------------------------------------------------------------

@app.errorhandler(400)
def handle_400(exc):
    return make_error(str(exc) or "Bad request.", 400)


@app.errorhandler(404)
def handle_404(exc):
    return make_error(f"Endpoint not found: {request.path}", 404)


@app.errorhandler(405)
def handle_405(exc):
    return make_error(f"Method {request.method} is not allowed on {request.path}.", 405)


@app.errorhandler(RequestEntityTooLarge)
def handle_413(exc):
    return make_error(f"File too large. Maximum allowed size is {MAX_UPLOAD_MB} MB.", 413)


@app.errorhandler(500)
def handle_500(exc):
    logger.exception("Unhandled 500 error")
    return make_error("An internal server error occurred.", 500)


# ---------------------------------------------------------------------------
# Frontend Static Routes
# ---------------------------------------------------------------------------

@app.route("/", methods=["GET"])
def home():
    accept = request.headers.get("Accept", "")
    if "text/html" in accept and FRONTEND_DIR.exists():
        return send_from_directory(str(FRONTEND_DIR), "index.html")
    return jsonify({
        "service": "Copilot AI Workspace Assistant",
        "status": "running",
        "version": "3.0",
        "provider": get_active_provider(),
        "model": current_active_model,
        "frontend": f"Open http://localhost:{os.getenv('PORT', '5000')} in your browser",
    })


@app.route("/<path:filename>", methods=["GET"])
def serve_frontend_static(filename):
    target = FRONTEND_DIR / filename
    if target.exists() and target.is_file():
        return send_from_directory(str(FRONTEND_DIR), filename)
    return handle_404(None)


# ---------------------------------------------------------------------------
# System, Models, and Health Endpoints
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    llm_ok = ping_llm()
    provider = get_active_provider()
    with _lock:
        active_doc = doc_library.get_active_document()
        docs_count = len(doc_library.list_documents())

    return jsonify({
        "success": True,
        "provider": provider,
        "llm_reachable": llm_ok,
        "ollama_reachable": ping_ollama(),
        "model": current_active_model,
        "documents_loaded": docs_count,
        "active_document": active_doc.filename if active_doc else None,
        "mode": provider if llm_ok else "offline_fallback",
    }), 200


@app.route("/models", methods=["GET"])
def list_models():
    """List available models from Groq or Ollama."""
    models = get_available_models()
    is_online = ping_llm()
    provider = get_active_provider()
    return jsonify({
        "success": True,
        "provider": provider,
        "models": models,
        "currentModel": current_active_model,
        "online": is_online,
    })


@app.route("/models/select", methods=["POST"])
def select_model():
    """Change the active model."""
    global current_active_model
    data = get_json_body()
    model_name = get_clean_text(data.get("model"))
    if not model_name:
        return make_error("Model name is required.")

    with _lock:
        current_active_model = model_name

    logger.info("Active model switched to: %s", current_active_model)
    return jsonify({
        "success": True,
        "message": f"Active model set to '{current_active_model}'.",
        "model": current_active_model,
    })


@app.route("/status", methods=["GET"])
def status():
    with _lock:
        active_doc = doc_library.get_active_document()
        all_docs = doc_library.list_documents()

    return jsonify({
        "success": True,
        "provider": get_active_provider(),
        "llm_ok": ping_llm(),
        "model": current_active_model,
        "activeDocument": active_doc.to_dict() if active_doc else None,
        "documentsCount": len(all_docs),
    })


# ---------------------------------------------------------------------------
# Document Management Endpoints
# ---------------------------------------------------------------------------

@app.route("/documents", methods=["GET"])
def get_documents():
    with _lock:
        docs = doc_library.list_documents()
    return jsonify({"success": True, "documents": docs})


@app.route("/documents/<doc_id>/activate", methods=["POST"])
def activate_document(doc_id):
    with _lock:
        ok = doc_library.set_active_document(doc_id)
        active_doc = doc_library.get_active_document()

    if not ok:
        return make_error("Document not found.", 404)

    return jsonify({
        "success": True,
        "message": f"'{active_doc.filename}' is now active.",
        "document": active_doc.to_dict(),
    })


@app.route("/documents/<doc_id>", methods=["DELETE"])
def delete_document(doc_id):
    with _lock:
        doc = doc_library.remove_document(doc_id)

    if not doc:
        return make_error("Document not found.", 404)

    if doc.filepath:
        try:
            Path(doc.filepath).unlink(missing_ok=True)
            logger.info("Deleted file from disk: %s", doc.filepath)
        except OSError as exc:
            logger.warning("Could not delete file %s: %s", doc.filepath, exc)

    return jsonify({"success": True, "message": f"Document '{doc.filename}' removed."})


@app.route("/documents/<doc_id>/preview", methods=["GET"])
def preview_document(doc_id):
    with _lock:
        doc = doc_library.get_document(doc_id)

    if not doc:
        return make_error("Document not found.", 404)

    return jsonify({"success": True, "document": doc.to_dict(include_text=True)})


@app.route("/upload", methods=["POST"])
def upload():
    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        return make_error("A PDF, DOCX, TXT, MD, or CSV file is required.")

    original_name = uploaded_file.filename
    if not allowed_file(original_name):
        return make_error("Unsupported file type. Please upload a PDF, DOCX, TXT, MD, or CSV file.")

    safe_name = secure_filename(original_name) or "document.txt"
    doc_id = f"doc_{uuid4().hex[:12]}"
    stored_name = f"{doc_id}_{safe_name}"
    saved_path = UPLOAD_FOLDER / stored_name

    try:
        uploaded_file.save(saved_path)
    except OSError as exc:
        logger.error("Could not save file: %s", exc)
        return make_error("Failed to save uploaded file.", 500)

    try:
        extracted_text = extract_text(str(saved_path)).strip()
    except (FileNotFoundError, ValueError) as exc:
        saved_path.unlink(missing_ok=True)
        return make_error(str(exc))
    except Exception as exc:
        logger.exception("Unexpected error in text extraction")
        saved_path.unlink(missing_ok=True)
        return make_error(f"Error reading file: {exc}", 500)

    if not extracted_text:
        saved_path.unlink(missing_ok=True)
        return make_error("No readable text found in uploaded file.")

    with _lock:
        record = doc_library.add_document(
            doc_id=doc_id,
            filename=original_name,
            filepath=str(saved_path),
            text=extracted_text,
        )

    logger.info("Upload OK | id=%s | file=%s | chars=%d", doc_id, original_name, len(extracted_text))

    return jsonify({
        "success": True,
        "message": f"File '{original_name}' uploaded and indexed successfully.",
        "document": record.to_dict(),
        "filename": original_name,
        "textLength": len(extracted_text),
        "wordCount": record.word_count,
        "readingTime": f"~{record.reading_time_min} min",
        "chunks": len(record.chunks),
    })


# ---------------------------------------------------------------------------
# Core Chat and Streaming Endpoints
# ---------------------------------------------------------------------------

@app.route("/chat", methods=["POST"])
def chat():
    data = get_json_body()
    question = get_clean_text(data.get("question"))
    history = data.get("history") or []
    tone = get_clean_text(data.get("tone") or "balanced")
    req_model = get_clean_text(data.get("model")) or current_active_model
    doc_id = data.get("doc_id")
    should_stream = bool(data.get("stream", False))

    if not question:
        return make_error("'question' is required.")

    if len(question) > MAX_USER_INPUT_CHARS:
        return make_error(f"Question exceeds max limit ({len(question)}/{MAX_USER_INPUT_CHARS} chars).")

    with _lock:
        active_doc = doc_library.get_document(doc_id) if doc_id else doc_library.get_active_document()
        context_str = doc_library.retrieve_context(question, doc_id=doc_id) if active_doc else ""

    doc_name = active_doc.filename if active_doc else None

    # Handle streaming request if requested
    if should_stream:
        return handle_streaming_chat(question, context_str, history, tone, req_model, doc_name)

    # Standard non-streaming response
    llm_up = ping_llm()

    if llm_up:
        task = (
            "Answer the user's question accurately using the document context when provided. "
            "If the answer is in the document, quote or cite the relevant part. "
            "If the document doesn't contain the answer, state that clearly and provide helpful guidance."
        )
        try:
            answer = ask_llm(
                task=task,
                user_input=question,
                document_context=context_str,
                history=history,
                model=req_model,
                tone=tone,
                doc_name=doc_name,
            )
            provider = get_active_provider()
            return jsonify({
                "success": True,
                "answer": answer,
                "model": req_model,
                "provider": provider,
                "documentName": doc_name,
                "mode": provider,
            })
        except Exception as exc:
            logger.warning("LLM call failed, falling back to offline intelligence: %s", exc)

    # Offline Fallback Intelligence
    fallback_answer = OfflineIntelligence.answer_question(
        question=question,
        doc_text=active_doc.raw_text if active_doc else "",
        filename=doc_name or "uploaded file",
    )
    return jsonify({
        "success": True,
        "answer": fallback_answer,
        "model": "offline-intelligence",
        "provider": "offline",
        "documentName": doc_name,
        "mode": "offline_fallback",
    })


@app.route("/chat/stream", methods=["POST", "GET"])
def chat_stream():
    data = get_json_body() if request.method == "POST" else request.args
    question = get_clean_text(data.get("question"))
    history_raw = data.get("history") or []
    history = json.loads(history_raw) if isinstance(history_raw, str) else history_raw
    tone = get_clean_text(data.get("tone") or "balanced")
    req_model = get_clean_text(data.get("model")) or current_active_model
    doc_id = data.get("doc_id")

    if not question:
        return make_error("'question' is required.")

    with _lock:
        active_doc = doc_library.get_document(doc_id) if doc_id else doc_library.get_active_document()
        context_str = doc_library.retrieve_context(question, doc_id=doc_id) if active_doc else ""

    doc_name = active_doc.filename if active_doc else None
    return handle_streaming_chat(question, context_str, history, tone, req_model, doc_name)


def handle_streaming_chat(question, context_str, history, tone, req_model, doc_name):
    """Generate Server-Sent Events stream for chat."""
    llm_up = ping_llm()
    provider = get_active_provider()

    def generate_events():
        if llm_up:
            task = (
                "Answer the user's question accurately using the document context when provided. "
                "Be structured, concise, and helpful."
            )
            try:
                for token in stream_llm(
                    task=task,
                    user_input=question,
                    document_context=context_str,
                    history=history,
                    model=req_model,
                    tone=tone,
                    doc_name=doc_name,
                ):
                    event_payload = json.dumps({"token": token, "done": False, "mode": provider}, ensure_ascii=False)
                    yield f"data: {event_payload}\n\n"

                yield f"data: {json.dumps({'done': True, 'model': req_model, 'provider': provider, 'documentName': doc_name}, ensure_ascii=False)}\n\n"
                return
            except Exception as exc:
                logger.warning("Streaming LLM failed, sending offline response: %s", exc)

        # Fallback stream: stream offline answer word-by-word
        fallback = OfflineIntelligence.answer_question(
            question=question,
            doc_text=context_str,
            filename=doc_name or "document",
        )
        for part in fallback.split(" "):
            yield f"data: {json.dumps({'token': part + ' ', 'done': False, 'mode': 'offline'}, ensure_ascii=False)}\n\n"

        yield f"data: {json.dumps({'done': True, 'model': 'offline-intelligence', 'provider': 'offline', 'documentName': doc_name}, ensure_ascii=False)}\n\n"

    return Response(
        stream_with_context(generate_events()),
        mimetype="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream; charset=utf-8",
        },
    )


# ---------------------------------------------------------------------------
# Specialized Quick Actions Endpoints
# ---------------------------------------------------------------------------

@app.route("/summarize", methods=["POST"])
def summarize():
    with _lock:
        active_doc = doc_library.get_active_document()

    if not active_doc:
        return make_error("Please upload a document before requesting a summary.")

    llm_up = ping_llm()
    if llm_up:
        task = (
            "Summarize the uploaded document into an executive summary. "
            "Include: 1) Overview, 2) 5 Key Findings / Themes with bullet points, and 3) Strategic Takeaways."
        )
        context = doc_library.retrieve_context("overview summary key takeaways findings", max_chars=14000)
        try:
            answer = ask_llm(
                task=task,
                document_context=context,
                model=current_active_model,
                tone="balanced",
                doc_name=active_doc.filename,
            )
            provider = get_active_provider()
            return jsonify({
                "success": True,
                "answer": answer,
                "model": current_active_model,
                "provider": provider,
                "documentName": active_doc.filename,
                "mode": provider,
            })
        except Exception as exc:
            logger.warning("Summarize LLM call failed: %s", exc)

    summary = OfflineIntelligence.summarize(active_doc.raw_text, active_doc.filename)
    return jsonify({
        "success": True,
        "answer": summary,
        "model": "offline-intelligence",
        "provider": "offline",
        "documentName": active_doc.filename,
        "mode": "offline_fallback",
    })


@app.route("/email", methods=["POST"])
def email():
    with _lock:
        active_doc = doc_library.get_active_document()

    if not active_doc:
        return make_error("Please upload a document before generating an email.")

    llm_up = ping_llm()
    if llm_up:
        task = (
            "Draft a concise, professional executive email summarizing the key points of the uploaded document. "
            "Format with a clear 'Subject:' on the first line, followed by greeting, structured body bullets, and sign-off."
        )
        context = doc_library.retrieve_context("key findings actions decisions deliverables", max_chars=12000)
        try:
            answer = ask_llm(
                task=task,
                document_context=context,
                model=current_active_model,
                tone="balanced",
                doc_name=active_doc.filename,
            )
            provider = get_active_provider()
            return jsonify({
                "success": True,
                "answer": answer,
                "model": current_active_model,
                "provider": provider,
                "documentName": active_doc.filename,
                "mode": provider,
            })
        except Exception as exc:
            logger.warning("Email LLM call failed: %s", exc)

    draft = OfflineIntelligence.generate_email(active_doc.raw_text, active_doc.filename)
    return jsonify({
        "success": True,
        "answer": draft,
        "model": "offline-intelligence",
        "provider": "offline",
        "documentName": active_doc.filename,
        "mode": "offline_fallback",
    })


@app.route("/tasks", methods=["POST"])
def tasks():
    with _lock:
        active_doc = doc_library.get_active_document()

    if not active_doc:
        return make_error("Please upload a document before extracting action items.")

    llm_up = ping_llm()
    if llm_up:
        task = (
            "Extract all action items, tasks, next steps, and deadlines from the uploaded document. "
            "Format as clear markdown checkboxes '- [ ]' with specific owners or deadlines where available."
        )
        context = doc_library.retrieve_context("action items tasks next steps deliverables timeline deadline", max_chars=12000)
        try:
            answer = ask_llm(
                task=task,
                document_context=context,
                model=current_active_model,
                tone="precise",
                doc_name=active_doc.filename,
            )
            provider = get_active_provider()
            return jsonify({
                "success": True,
                "answer": answer,
                "model": current_active_model,
                "provider": provider,
                "documentName": active_doc.filename,
                "mode": provider,
            })
        except Exception as exc:
            logger.warning("Tasks LLM call failed: %s", exc)

    action_items = OfflineIntelligence.extract_action_items(active_doc.raw_text, active_doc.filename)
    return jsonify({
        "success": True,
        "answer": action_items,
        "model": "offline-intelligence",
        "provider": "offline",
        "documentName": active_doc.filename,
        "mode": "offline_fallback",
    })


@app.route("/rewrite", methods=["POST"])
def rewrite():
    data = get_json_body()
    text = get_clean_text(data.get("text"))
    tone = get_clean_text(data.get("tone") or "balanced")

    if not text:
        return make_error("'text' is required.")

    if len(text) > MAX_USER_INPUT_CHARS:
        return make_error(f"Text too long ({len(text)} chars).")

    llm_up = ping_llm()
    if llm_up:
        task = (
            f"Rewrite the following text professionally with a {tone} business tone. "
            "Improve clarity, conciseness, and elegance while preserving the original intent."
        )
        try:
            answer = ask_llm(task=task, user_input=text, model=current_active_model, tone=tone)
            provider = get_active_provider()
            return jsonify({
                "success": True,
                "answer": answer,
                "model": current_active_model,
                "provider": provider,
                "mode": provider,
            })
        except Exception as exc:
            logger.warning("Rewrite LLM call failed: %s", exc)

    rewritten = OfflineIntelligence.rewrite_text(text)
    return jsonify({
        "success": True,
        "answer": rewritten,
        "model": "offline-intelligence",
        "provider": "offline",
        "mode": "offline_fallback",
    })


@app.route("/translate", methods=["POST"])
def translate():
    data = get_json_body()
    text = get_clean_text(data.get("text"))
    language = get_clean_text(data.get("language"))

    if not text:
        return make_error("'text' is required.")
    if not language:
        return make_error("'language' is required (e.g. Hindi, Spanish, French).")

    llm_up = ping_llm()
    if llm_up:
        task = (
            f"Translate the following text accurately into {language}. "
            "Preserve tone, formatting, and technical meaning."
        )
        try:
            answer = ask_llm(task=task, user_input=text, model=current_active_model, tone="precise")
            provider = get_active_provider()
            return jsonify({
                "success": True,
                "answer": answer,
                "model": current_active_model,
                "provider": provider,
                "mode": provider,
            })
        except Exception as exc:
            logger.warning("Translate LLM call failed: %s", exc)

    translated = OfflineIntelligence.translate_text(text, language)
    return jsonify({
        "success": True,
        "answer": translated,
        "model": "offline-intelligence",
        "provider": "offline",
        "mode": "offline_fallback",
    })


@app.route("/clear", methods=["POST"])
def clear_documents():
    with _lock:
        docs = doc_library.list_documents()
        doc_library.clear()

    # Clean disk files
    for d in docs:
        if d.get("id"):
            for f in UPLOAD_FOLDER.glob(f"{d['id']}*"):
                try:
                    f.unlink(missing_ok=True)
                except OSError:
                    pass

    logger.info("All documents cleared from library.")
    return jsonify({"success": True, "message": "Document library cleared successfully."})


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    logger.info("Starting Copilot AI Workspace Assistant backend on port %d (debug=%s)", port, debug)
    app.run(host="0.0.0.0", port=port, debug=debug)