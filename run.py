"""
run.py — One-click launcher for the Copilot AI Workspace Assistant.

Usage:
    python run.py

Opens http://localhost:5000 in your browser automatically.
Flask serves both the frontend and the API from the same origin.
"""

import os
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

PORT = int(os.getenv("PORT", "5000"))
BACKEND_DIR = Path(__file__).parent / "backend"
URL = f"http://localhost:{PORT}"


def _check_dependencies():
    """Verify core dependencies are installed."""
    missing = []
    for pkg in ("flask", "flask_cors", "docx", "pypdf", "requests"):
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)

    if missing:
        print(f"\n[!] Missing dependencies: {', '.join(missing)}")
        print("    Installing via pip ...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", str(BACKEND_DIR / "requirements.txt")],
            check=False,
        )


def _check_providers():
    """Inform user about Groq and Ollama status."""
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b").strip()
    if groq_key:
        print(f"  ✓  Groq Cloud API connected (Active Model: {groq_model})")
        return

    try:
        import requests
        r = requests.get("http://localhost:11434/api/tags", timeout=1.0)
        if r.status_code == 200:
            print("  ✓  Ollama local service detected & online (Port 11434)")
            return
    except Exception:
        pass
    print("  ℹ  Running in Native RAG Intelligence mode.")
    print("     Configure GROQ_API_KEY in .env or run 'ollama serve' for cloud/local LLMs.")


def _open_browser():
    """Wait a moment for Flask to boot, then open the browser."""
    time.sleep(2.0)
    print(f"\n  ✓  Opening {URL} in your browser …\n")
    try:
        webbrowser.open(URL)
    except Exception:
        pass


if __name__ == "__main__":
    print("=" * 65)
    print("  Copilot AI Workspace Assistant v3.0 (RAG & Multi-Doc Edition)")
    print(f"  Starting server on {URL}")
    print("=" * 65)

    _check_dependencies()
    _check_providers()

    # Open browser in background thread
    threading.Thread(target=_open_browser, daemon=True).start()

    # Run Flask from backend directory
    os.chdir(BACKEND_DIR)
    os.environ.setdefault("PORT", str(PORT))
    os.environ.setdefault("FLASK_DEBUG", "false")

    try:
        subprocess.run(
            [sys.executable, "app.py"],
            check=False,
        )
    except KeyboardInterrupt:
        print("\n[✓] Server stopped gracefully.")
