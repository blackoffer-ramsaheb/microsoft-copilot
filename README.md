# AI Workspace Assistant — Microsoft Copilot–Inspired (v3.0 RAG Edition)

A high-performance, enterprise-grade AI workspace assistant built with **Flask + Ollama + RAG Engine + Vanilla JS**.  
Inspired by the Microsoft Copilot UX — featuring real-time token streaming, multi-document semantic retrieval, dynamic model switching, conversational tone controls, speech-to-text, and automated offline intelligence fallback.

---

## 🚀 Key Features

| Capability | Description |
|---|---|
| ⚡ **Real-time SSE Streaming** | Live token-by-token generation with typing animation and a user "Stop" button |
| 📚 **RAG Multi-Doc Library** | Upload multiple PDF, DOCX, TXT, MD, and CSV files; semantic chunking & BM25 retrieval |
| ⚖️ **Copilot Conversation Tones** | Switch styles anytime: **Creative** 🎨, **Balanced** ⚖️, **Precise** 🎯 |
| 🔄 **Dynamic Model Switcher** | Auto-detects installed Ollama models (`llama3.1:8b`, `mistral`, `phi3`, etc.) with a 1-click dropdown |
| 🛡️ **Offline Intelligence Fallback** | Instant local extractive answers, summaries, emails & action items even when Ollama is offline |
| 🎙️ **Voice Input (Speech-to-Text)** | Speak prompts directly into Copilot using the Web Speech API |
| 📥 **Export to Markdown** | Download your entire conversation with formatted markdown and metadata |
| 📋 **Code Blocks with 1-Click Copy** | Syntax-formatted code containers with language badges and instant clipboard copying |
| 🖱️ **Drag & Drop Upload** | Drag files anywhere onto the window with visual dropzone feedback |
| 💾 **Chat History Persistence** | Conversations safely persist across browser reloads via `localStorage` |
| 🌙 **Dark & Light Themes** | Fluent Microsoft design system with responsive layouts for desktop, tablet, and mobile |

---

## 🛠️ Tech Stack

- **Frontend:** HTML5 · Vanilla CSS3 (Custom Properties & Fluent Design tokens) · Modern Vanilla JavaScript (ES6+ & Streams API)
- **Backend:** Python 3.10+ · Flask 3.x · Flask-CORS · Server-Sent Events (SSE)
- **RAG & Search Engine:** Semantic overlapping chunker, BM25 / TF-IDF scoring, TextRank sentence extraction
- **AI Engine:** [Ollama](https://ollama.com) (local LLM — default: `llama3.1:8b`) + Native Offline Fallback
- **Document Extractors:** `pypdf`, `python-docx`, UTF-8/BOM text parsers, CSV reader

---

## ⚡ Quick Start

### 1. Environment Setup

Create a `.env` file from `.env.example`:
```bash
# Windows PowerShell
Copy-Item .env.example .env

# Linux / macOS
cp .env.example .env
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Add your Groq API credentials to `.env` (free at [console.groq.com](https://console.groq.com)):
```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b
LLM_PROVIDER=groq
```

### 2. Launch Assistant

```bash
python run.py
```
This automatically verifies dependencies, checks the Groq connection, starts Flask on `http://localhost:5000`, and opens your default browser.

### 3. (Optional) Local Ollama Fallback

If you wish to use local offline models instead of Groq:
```bash
ollama pull llama3.1:8b
ollama serve
```
*(If neither is connected, the built-in RAG Offline Intelligence provides immediate document answers, summaries, and action item extraction.)*

---

## 🧪 Automated Testing

Run the automated test suite with pytest:

```bash
python -m pytest tests/test_api.py -v
```

All 5 core test suites cover:
- Allowed file extension & magic-byte validation
- Semantic chunking & BM25 context retrieval
- Offline intelligence fallback extraction
- System health & status endpoints
- Full upload, indexing, and multi-turn chat workflow

---

## 📡 API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Web frontend / service info |
| `GET` | `/health` | Health check + Ollama probe + mode indicator |
| `GET` | `/models` | Query installed Ollama models dynamically |
| `POST` | `/models/select` | Switch active LLM model `{"model": "..."}` |
| `GET` | `/documents` | List all indexed documents with word count & reading time |
| `POST` | `/documents/<id>/activate` | Set active document for RAG context |
| `GET` | `/documents/<id>/preview` | Preview document metadata and text content |
| `DELETE` | `/documents/<id>` | Delete document from memory and disk |
| `POST` | `/upload` | Upload PDF, DOCX, TXT, MD, or CSV (multipart form) |
| `POST` | `/chat` | Chat endpoint `{"question", "history", "tone", "model", "stream"}` |
| `POST` | `/chat/stream` | Server-Sent Events (SSE) real-time streaming endpoint |
| `POST` | `/summarize` | Executive summary of active document |
| `POST` | `/email` | Draft stakeholder email from document |
| `POST` | `/tasks` | Extract action items with checkboxes |
| `POST` | `/rewrite` | Rewrite text with tone polish `{"text", "tone"}` |
| `POST` | `/translate` | Translate text `{"text", "language"}` |
| `POST` | `/clear` | Clear all documents from server |

---

## 📂 Project Structure

```
microsoft-copilot/
├── frontend/
│   ├── index.html       # App shell & DOM mounts
│   ├── style.css        # Microsoft Copilot Fluent design system (Light + Dark)
│   └── script.js        # Streaming, RAG multi-doc, Speech-to-Text, local persistence
├── backend/
│   ├── app.py           # Flask REST & SSE endpoints, error handling, static server
│   ├── rag_engine.py    # Chunking, BM25 TF-IDF retrieval, multi-doc library, offline NLP
│   ├── document.py      # Resilient PDF, DOCX, TXT, MD, CSV extraction & validation
│   ├── ollama_client.py # Streaming generator, model discovery, tone presets, TTL ping
│   └── requirements.txt # Pinned Python dependencies
├── tests/
│   └── test_api.py      # Automated test suite
├── run.py               # Launcher script with dependency checks & browser opening
└── README.md
```

---

## 🔒 Security & Robustness

- **Local Privacy:** No cloud dependencies; all processing remains on-device.
- **Thread-Safe Architecture:** `threading.Lock` protects the document library and model state.
- **Magic-Byte Verification:** Rejects disguised or malicious file extensions.
- **Context Management:** Smart RAG prevents LLM prompt overflows on massive documents.
- **Graceful Degradation:** Automatic switch between local neural LLM and offline NLP intelligence.

---

## 📄 License

MIT — Free to use and modify for any purpose.
