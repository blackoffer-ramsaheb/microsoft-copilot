# AI Workspace Assistant — Microsoft Copilot–Inspired

A polished, production-ready AI workspace assistant built with **Flask + Ollama + Vanilla JS**.  
Inspired by the Microsoft Copilot UX — clean, modern, and fully functional.

![UI Preview](docs/preview.png)

---

## Features

| Capability | Description |
|---|---|
| 💬 **Chat** | Converse with the AI; uses uploaded document as context when available |
| 📄 **Document Upload** | Upload PDF, DOCX, or TXT files (up to 10 MB) |
| 📝 **Summarize** | Get a concise bullet-point summary of your document |
| ✉️ **Generate Email** | Draft a professional email from document content |
| ✍️ **Rewrite Text** | Rewrite any text in a polished business tone |
| ✅ **Extract Action Items** | Pull out tasks and next steps from a document |
| 🌐 **Translate** | Translate text into any language |
| 🌙 **Dark Mode** | Full light/dark theme toggle |
| 📱 **Responsive** | Desktop, tablet, and mobile layouts |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 · Vanilla CSS · Vanilla JavaScript |
| Backend | Python 3.10+ · Flask 3.x · Flask-CORS |
| AI | [Ollama](https://ollama.com) (local LLM — default: `llama3.1:8b`) |
| Document parsing | pypdf · python-docx |

---

## Quick Start

### 1. Install Ollama and pull the model

```bash
# Install Ollama from https://ollama.com
ollama pull llama3.1:8b
```

### 2. Set up the Python backend

```bash
cd backend
pip install -r requirements.txt
python app.py
# Server starts on http://localhost:5000
```

### 3. Open the frontend

Open `frontend/index.html` directly in your browser — no build step needed.

---

## Environment Variables

All are optional; defaults work out of the box.

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama base URL |
| `OLLAMA_MODEL` | `llama3.1:8b` | Model to use |
| `OLLAMA_TIMEOUT` | `120` | Request timeout in seconds |
| `OLLAMA_MAX_RETRIES` | `2` | Retries on transient errors |
| `MAX_UPLOAD_MB` | `10` | Max upload size in MB |
| `MAX_USER_INPUT_CHARS` | `8000` | Max characters in user prompts |
| `CORS_ORIGINS` | `*` | Allowed CORS origins (comma-separated) |
| `PORT` | `5000` | Backend port |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Service info |
| GET | `/health` | Health check + Ollama reachability (JSON) |
| GET | `/status` | Document state + Ollama status |
| POST | `/chat` | Send a message `{"question": "..."}` |
| POST | `/upload` | Upload a file (multipart form) |
| POST | `/summarize` | Summarize the loaded document |
| POST | `/email` | Generate email from document |
| POST | `/rewrite` | Rewrite text `{"text": "..."}` |
| POST | `/tasks` | Extract action items from document |
| POST | `/translate` | Translate `{"text": "...", "language": "Hindi"}` |
| POST | `/clear` | Clear the loaded document from server |

---

## Project Structure

```
microsoft-copilot/
├── frontend/
│   ├── index.html       # App shell (Google Fonts, meta tags)
│   ├── style.css        # Full design system (light + dark themes)
│   └── script.js        # All UI logic + backend API calls
├── backend/
│   ├── app.py           # Flask routes, thread-safe state, error handlers
│   ├── document.py      # PDF/DOCX/TXT extraction with magic-byte validation
│   ├── ollama_client.py # Ollama client with retry + logging
│   └── requirements.txt # Pinned Python dependencies
└── README.md
```

---

## Robustness Highlights

- **Thread-safe document state** via `threading.Lock`
- **Global JSON error handlers** (400, 404, 405, 413, 500 all return structured JSON)
- **Automatic retry** on transient Ollama network errors (exponential back-off)
- **Magic-byte file validation** — rejects files that only pretend to be PDFs/DOCX
- **DOCX tables + headers/footers** extracted (not just body paragraphs)
- **Input length caps** to prevent LLM context overflow
- **Old uploaded files deleted** from disk when a new one replaces them
- **Pinned dependency versions** in `requirements.txt`

---

## License

MIT — free to use and modify for any purpose.
