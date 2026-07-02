"""
run.py — One-click launcher for the Copilot AI Workspace Assistant.

Usage:
    python run.py

Opens http://localhost:5000 in your browser automatically.
Flask serves both the frontend and the API from the same origin,
so there are no CORS issues.
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


def _open_browser():
    """Wait a moment for Flask to boot, then open the browser."""
    time.sleep(2.2)
    print(f"\n  ✓  Opening {URL} in your browser …\n")
    webbrowser.open(URL)


if __name__ == "__main__":
    print("=" * 55)
    print("  Copilot AI Workspace Assistant")
    print(f"  Starting on {URL}")
    print("=" * 55)

    # Open browser in background thread
    threading.Thread(target=_open_browser, daemon=True).start()

    # Run Flask from the backend directory
    os.chdir(BACKEND_DIR)
    os.environ.setdefault("PORT", str(PORT))
    os.environ.setdefault("FLASK_DEBUG", "false")

    subprocess.run(
        [sys.executable, "app.py"],
        check=False,
    )
