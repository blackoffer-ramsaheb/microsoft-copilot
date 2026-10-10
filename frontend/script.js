/* ============================================================
   COPILOT AI WORKSPACE ASSISTANT — Enhanced Frontend Script
   Full Features: Real-time Streaming, Tone Selector, Multi-Doc Library,
   Speech-to-Text, Model Selector, Export Chat, Markdown + Code Copy
   ============================================================ */

"use strict";

const API_BASE = (() => {
  if (window.COPILOT_API_BASE) return window.COPILOT_API_BASE;
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return window.location.origin === "null" ? "http://localhost:5000" : "";
  }
  return "http://localhost:5000";
})();

/* ============================================================
   STATE & PERSISTENCE
   ============================================================ */
const STORAGE_KEYS = {
  THEME: "copilot-theme",
  CONVERSATIONS: "copilot-conversations",
  ACTIVE_CONV: "copilot-active-conv",
  TONE: "copilot-tone",
  MODEL: "copilot-model",
};

const state = {
  theme: localStorage.getItem(STORAGE_KEYS.THEME) || "light",
  tone: localStorage.getItem(STORAGE_KEYS.TONE) || "balanced",
  sidebarOpen: true,
  mobileSidebarOpen: false,
  backendConnected: false,
  backendMode: "offline_fallback",
  currentModel: localStorage.getItem(STORAGE_KEYS.MODEL) || "llama3.1:8b",
  availableModels: [],
  busy: false,
  isStreaming: false,
  abortController: null,
  uploading: false,
  isListening: false,
  speechRecognition: null,
  searchQuery: "",
  conversations: [],
  selectedConvId: null,
  documents: [],
  activeDocId: null,
  previewDoc: null,
};

// DOM Cache
const el = {};

/* ============================================================
   ICONS
   ============================================================ */
const icons = {
  logoMark: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="8" fill="none"/>
    <path d="M8 8h6.4L16 11.2 17.6 8H24v6.4L20.8 16 24 17.6V24h-6.4L16 20.8 14.4 24H8v-6.4L11.2 16 8 14.4V8z" fill="white" opacity="0.9"/>
    <circle cx="16" cy="16" r="3.5" fill="white"/>
  </svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  pdf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>`,
  doc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  txt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="8" y2="12"/><line x1="12" y1="16" x2="8" y2="16"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  summarize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="12" y1="18" x2="3" y2="18"/></svg>`,
  email: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>`,
  rewrite: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  tasks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  translate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>`,
  clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  attach: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  bot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="11"/><line x1="8" y1="15" x2="8" y2="17"/><line x1="16" y1="15" x2="16" y2="17"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
};

/* ============================================================
   BUILD HTML SHELL
   ============================================================ */
function buildShell() {
  document.getElementById("app").innerHTML = `
    <div class="drawer-backdrop" id="drawerBackdrop"></div>
    <div class="drag-drop-overlay" id="dragDropOverlay">
      <div class="drag-drop-card">
        <div class="dd-icon">${icons.upload}</div>
        <div class="dd-title">Drop your document here</div>
        <div class="dd-sub">Supports PDF, DOCX, TXT, MD, CSV files up to 15 MB</div>
      </div>
    </div>

    <div class="app-root" id="appRoot">
      <!-- SIDEBAR -->
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <div class="brand">
            <div class="brand-logo" aria-hidden="true">${icons.logoMark}</div>
            <div class="brand-text">
              <div class="brand-name">Copilot</div>
              <div class="brand-tagline">AI Workspace</div>
            </div>
          </div>
          <button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="Toggle sidebar" title="Toggle sidebar">
            ${icons.menu}
          </button>
        </div>

        <div class="sidebar-body">
          <!-- Primary New Chat Action -->
          <div class="sidebar-action-bar">
            <button class="new-chat-btn" id="newChatBtn" type="button" aria-label="Start new chat">
              ${icons.plus}
              <span class="new-chat-label">New Chat</span>
            </button>
          </div>

          <!-- Clean Tab Switcher: Chats & Documents -->
          <div class="sidebar-tabs">
            <button class="sidebar-tab-btn active" id="tabChatsBtn" type="button">
              ${icons.chat}
              <span>Chats</span>
            </button>
            <button class="sidebar-tab-btn" id="tabDocsBtn" type="button">
              ${icons.doc}
              <span>Library</span>
            </button>
          </div>

          <!-- PANEL 1: Chats Panel -->
          <div class="sidebar-tab-panel active" id="chatsTabPanel">
            <div class="search-wrap">
              <span class="search-icon" aria-hidden="true">${icons.search}</span>
              <input id="searchInput" class="search-input" type="search" placeholder="Search chats…" autocomplete="off" />
            </div>
            <div class="conversation-list-wrap">
              <div class="conversation-list" id="conversationList" role="list"></div>
            </div>
            <div class="sidebar-panel-footer">
              <button class="section-action-btn" id="clearAllChatsBtn" title="Clear all chat history" type="button">
                Clear history
              </button>
            </div>
          </div>

          <!-- PANEL 2: Documents Panel -->
          <div class="sidebar-tab-panel" id="docsTabPanel">
            <div class="docs-header-row">
              <span class="docs-header-title">Indexed Documents</span>
              <button class="section-action-btn" id="sidebarUploadBtn" title="Upload document" type="button">
                + Upload
              </button>
            </div>
            <div class="document-list" id="documentList"></div>
          </div>
        </div>

        <div class="sidebar-footer">
          <div class="sidebar-footer-content">
            <div class="footer-row">
              <button class="theme-toggle-btn" id="themeToggleBtn" type="button">
                ${icons.moon}<span id="themeLabel">Dark Mode</span>
              </button>
              <span class="version-badge">v3.0 RAG</span>
            </div>
            <div class="footer-links">
              <button class="footer-link-btn" id="exportChatBtn" type="button">${icons.download} Export</button>
              <button class="footer-link-btn" id="settingsInfoBtn" type="button">${icons.settings} Info</button>
            </div>
          </div>
        </div>
      </aside>

      <!-- MAIN AREA -->
      <div class="main-area" id="mainArea">
        <!-- Mobile Header -->
        <header class="mobile-header" id="mobileHeader">
          <button class="icon-btn" id="mobileMenuBtn" type="button" aria-label="Open menu">${icons.menu}</button>
          <div>
            <div class="mobile-title">Copilot Workspace</div>
            <div class="mobile-subtitle" id="mobileSubtitle">RAG Assistant</div>
          </div>
          <button class="icon-btn" id="mobileUploadBtn" type="button" aria-label="Upload">${icons.upload}</button>
        </header>

        <!-- Desktop Header -->
        <header class="main-header" id="mainHeader">
          <div class="header-left">
            <div class="header-brand-title">
              <span class="header-brand-name">Copilot</span>
            </div>

            <!-- Model Switcher Dropdown (Pill) -->
            <div class="model-picker-wrap">
              <select id="modelSelect" class="model-select" aria-label="Select AI Model">
                <option value="llama3.1:8b">llama3.1:8b</option>
              </select>
            </div>
          </div>

          <div class="header-right">
            <!-- Connection Status Chip -->
            <button class="status-chip" id="connectionStatus" type="button" title="Click to refresh connection">
              <span class="status-dot" id="statusDot"></span>
              <span id="statusText">Connecting…</span>
              <span class="refresh-icon-inline">${icons.refresh}</span>
            </button>

            <!-- Export Button -->
            <button class="icon-btn-header" id="headerExportBtn" type="button" title="Export conversation as Markdown" aria-label="Export">
              ${icons.download}
            </button>

            <!-- Theme Toggle in Header -->
            <button class="icon-btn-header" id="themeToggleBtnHeader" type="button" title="Toggle theme" aria-label="Toggle theme">
              ${icons.moon}
            </button>

            <!-- Upload Document Button -->
            <button class="upload-btn" id="uploadBtn" type="button">
              ${icons.upload} <span>Upload Document</span>
            </button>
          </div>
        </header>

        <!-- Conversation Panel -->
        <main class="conv-panel" id="convPanel">
          <!-- Welcome Screen -->
          <section class="welcome-screen" id="welcomeScreen">
            <div class="welcome-center">
              <div class="welcome-icon-wrap" aria-hidden="true">${icons.sparkle}</div>
              <h1 class="welcome-heading">How can I help you today?</h1>
              <p class="welcome-sub">
                Upload documents or ask anything. I can synthesize reports, draft emails, and extract key insights.
              </p>

              <!-- Conversation Tone Selector (Segmented Pill) -->
              <div class="tone-segmented-wrap">
                <div class="tone-pills" id="tonePills">
                  <button class="tone-pill ${state.tone === 'creative' ? 'active' : ''}" data-tone="creative" type="button">
                    <span class="tone-emoji">🎨</span> Creative
                  </button>
                  <button class="tone-pill ${state.tone === 'balanced' ? 'active' : ''}" data-tone="balanced" type="button">
                    <span class="tone-emoji">⚖️</span> Balanced
                  </button>
                  <button class="tone-pill ${state.tone === 'precise' ? 'active' : ''}" data-tone="precise" type="button">
                    <span class="tone-emoji">🎯</span> Precise
                  </button>
                </div>
              </div>

              <!-- 4 Refined Suggestions in Clean 2x2 Grid -->
              <div class="suggestion-grid" id="suggestionGrid">
                <button class="suggestion-card" data-prompt="Summarize my uploaded document with key takeaways" type="button">
                  <div class="sg-icon-box">${icons.summarize}</div>
                  <div class="sg-content">
                    <span class="sg-title">Summarize Document</span>
                    <span class="sg-hint">Executive briefing with key takeaways</span>
                  </div>
                </button>
                <button class="suggestion-card" data-prompt="Draft a professional executive email based on the document" type="button">
                  <div class="sg-icon-box">${icons.email}</div>
                  <div class="sg-content">
                    <span class="sg-title">Draft Executive Email</span>
                    <span class="sg-hint">Polished message for team stakeholders</span>
                  </div>
                </button>
                <button class="suggestion-card" data-prompt="Extract actionable tasks, deadlines, and owners" type="button">
                  <div class="sg-icon-box">${icons.tasks}</div>
                  <div class="sg-content">
                    <span class="sg-title">Extract Action Items</span>
                    <span class="sg-hint">Task checklist with deliverables</span>
                  </div>
                </button>
                <button class="suggestion-card" data-prompt="Perform a SWOT analysis on the strategy in this document" type="button">
                  <div class="sg-icon-box">${icons.sparkle}</div>
                  <div class="sg-content">
                    <span class="sg-title">SWOT & Strategic Analysis</span>
                    <span class="sg-hint">Strengths, weaknesses, and key risks</span>
                  </div>
                </button>
              </div>
            </div>
          </section>

          <!-- Message Stream -->
          <div class="message-stream hidden" id="messageStream" aria-live="polite"></div>
        </main>

        <!-- Composer Panel (Floating Pill) -->
        <div class="composer-panel" id="composerPanel">
          <div class="composer-inner">
            <!-- Active Document Context Badge -->
            <div class="active-doc-badge hidden" id="activeDocBadge">
              <span class="adb-icon">${icons.doc}</span>
              <span class="adb-text" id="activeDocBadgeText">Active Document: none</span>
              <button class="adb-clear" id="activeDocBadgeClear" title="Clear active context" type="button">×</button>
            </div>

            <!-- Upload Progress -->
            <div class="upload-progress" id="uploadProgress">
              <div class="up-icon">${icons.upload}</div>
              <div class="up-info">
                <div class="up-name" id="upName">Uploading…</div>
                <div class="up-status" id="upStatus">Processing file</div>
                <div class="up-bar-wrap"><div class="up-bar" id="upBar" style="width:0%"></div></div>
              </div>
            </div>

            <div class="composer-box" id="composerBox">
              <textarea
                id="composerTextarea"
                class="composer-textarea"
                rows="1"
                placeholder="Ask Copilot anything, summarize documents, or explore ideas…"
                aria-label="Message input"
                autocomplete="off"
                spellcheck="true"
              ></textarea>

              <div class="composer-toolbar">
                <div class="composer-tools">
                  <button class="composer-tool-btn" id="attachBtn" type="button" title="Attach Document (PDF, DOCX, TXT, MD, CSV)">
                    ${icons.attach}
                  </button>
                  <button class="composer-tool-btn" id="micBtn" type="button" title="Voice Input (Speech-to-Text)">
                    ${icons.mic}
                  </button>

                  <!-- Quick AI Actions Menu Trigger -->
                  <div class="quick-tools-wrap">
                    <button class="composer-tool-btn" id="quickToolsTrigger" type="button" title="Quick AI Actions">
                      ${icons.sparkle}
                    </button>
                    <div class="quick-tools-menu hidden" id="quickToolsMenu">
                      <div class="qtm-title">Quick AI Actions</div>
                      <button class="quick-tool-btn" data-action="summarize" type="button">${icons.summarize}<span>Summarize Document</span></button>
                      <button class="quick-tool-btn" data-action="email" type="button">${icons.email}<span>Draft Email</span></button>
                      <button class="quick-tool-btn" data-action="tasks" type="button">${icons.tasks}<span>Extract Action Items</span></button>
                      <button class="quick-tool-btn" data-action="rewrite" type="button">${icons.rewrite}<span>Rewrite Text</span></button>
                      <button class="quick-tool-btn" data-action="translate" type="button">${icons.translate}<span>Translate</span></button>
                      <button class="quick-tool-btn danger" data-action="clear" type="button">${icons.clear}<span>Reset Current Chat</span></button>
                    </div>
                  </div>

                  <div class="composer-tone-indicator" id="composerToneIndicator" title="Current style">
                    <span class="cti-dot"></span>
                    <span id="composerToneText">Balanced</span>
                  </div>
                </div>

                <div class="composer-right">
                  <span class="char-count" id="charCount">0</span>
                  <button class="stop-btn hidden" id="stopBtn" type="button" title="Stop generation">
                    ${icons.stop} <span>Stop</span>
                  </button>
                  <button class="send-btn" id="sendBtn" type="button" disabled title="Send message">
                    ${icons.send}
                  </button>
                </div>
              </div>
            </div>

            <div class="composer-hint">
              <span>Copilot uses active documents for accurate RAG responses. Press <kbd>Enter</kbd> to send.</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Hidden File Input -->
    <input id="fileInput" type="file" accept=".pdf,.docx,.txt,.md,.csv" hidden />

    <!-- Toast Notifications -->
    <div class="toast-stack" id="toastStack"></div>

    <!-- Document Preview Modal -->
    <div class="modal-overlay" id="docPreviewModal" role="dialog" aria-modal="true">
      <div class="modal-card doc-preview-card">
        <div class="modal-header-row">
          <div class="modal-title" id="previewTitle">Document Preview</div>
          <button class="modal-close-btn" id="previewCloseBtn" type="button">×</button>
        </div>
        <div class="doc-meta-grid" id="previewMetaGrid"></div>
        <div class="preview-text-box" id="previewTextBox"></div>
        <div class="modal-btns">
          <button class="btn-secondary" id="previewDismissBtn" type="button">Close</button>
          <button class="btn-primary" id="previewSetActiveBtn" type="button">Set as Active Context</button>
        </div>
      </div>
    </div>

    <!-- Translate Modal -->
    <div class="modal-overlay" id="translateModal" role="dialog" aria-modal="true">
      <div class="modal-card">
        <div class="modal-title">Translate Text</div>
        <div class="modal-sub">Choose or enter the target language for translation:</div>
        <div class="lang-pills">
          <button class="lang-pill" data-lang="Hindi" type="button">Hindi (हिंदी)</button>
          <button class="lang-pill" data-lang="Spanish" type="button">Spanish (Español)</button>
          <button class="lang-pill" data-lang="French" type="button">French (Français)</button>
          <button class="lang-pill" data-lang="German" type="button">German (Deutsch)</button>
          <button class="lang-pill" data-lang="Japanese" type="button">Japanese (日本語)</button>
        </div>
        <input id="translateLangInput" class="modal-input" type="text" placeholder="Or type any language (e.g. Italian, Arabic, Tamil)…" />
        <div class="modal-btns">
          <button class="btn-secondary" id="translateCancelBtn" type="button">Cancel</button>
          <button class="btn-primary" id="translateConfirmBtn" type="button">Translate</button>
        </div>
      </div>
    </div>

    <!-- Rewrite Modal -->
    <div class="modal-overlay" id="rewriteModal" role="dialog" aria-modal="true">
      <div class="modal-card">
        <div class="modal-title">Rewrite Text</div>
        <div class="modal-sub">Enter text to rewrite professionally:</div>
        <textarea id="rewriteTextInput" class="modal-textarea" rows="4" placeholder="Paste or type text here…"></textarea>
        <div class="modal-btns">
          <button class="btn-secondary" id="rewriteCancelBtn" type="button">Cancel</button>
          <button class="btn-primary" id="rewriteConfirmBtn" type="button">Rewrite</button>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   CACHE DOM ELEMENTS
   ============================================================ */
function cacheElements() {
  const ids = [
    "appRoot", "sidebar", "drawerBackdrop", "sidebarToggle",
    "mobileMenuBtn", "mobileUploadBtn", "mobileHeader", "mobileSubtitle",
    "newChatBtn", "searchInput", "conversationList", "documentList",
    "clearAllChatsBtn", "sidebarUploadBtn",
    "uploadBtn", "attachBtn", "micBtn", "stopBtn",
    "connectionStatus", "statusDot", "statusText", "modelSelect",
    "welcomeScreen", "suggestionGrid", "messageStream", "tonePills",
    "composerTextarea", "sendBtn", "charCount", "fileInput", "toastStack",
    "themeToggleBtn", "themeLabel", "composerToneIndicator", "composerToneText",
    "activeDocBadge", "activeDocBadgeText", "activeDocBadgeClear",
    "uploadProgress", "upName", "upStatus", "upBar",
    "dragDropOverlay", "exportChatBtn", "headerExportBtn", "settingsInfoBtn",
    "docPreviewModal", "previewTitle", "previewMetaGrid", "previewTextBox", "previewCloseBtn", "previewDismissBtn", "previewSetActiveBtn",
    "translateModal", "translateLangInput", "translateCancelBtn", "translateConfirmBtn",
    "rewriteModal", "rewriteTextInput", "rewriteCancelBtn", "rewriteConfirmBtn",
    "tabChatsBtn", "tabDocsBtn", "chatsTabPanel", "docsTabPanel",
    "themeToggleBtnHeader", "quickToolsTrigger", "quickToolsMenu",
  ];
  ids.forEach(id => { el[id] = document.getElementById(id); });
  el.quickActionBtns = document.querySelectorAll(".quick-action-btn, .quick-tool-btn");
}

/* ============================================================
   INITIALIZATION
   ============================================================ */
window.addEventListener("DOMContentLoaded", () => {
  buildShell();
  cacheElements();
  loadPersistedState();
  applyTheme(state.theme);
  updateToneUI();
  setupSpeechRecognition();
  bindEvents();
  autoResizeTextarea();
  updateSendBtn();
  renderAll();
  checkBackend();
  fetchDocuments();
  fetchModels();
});

/* ============================================================
   PERSISTENCE & STATE LOADING
   ============================================================ */
function loadPersistedState() {
  try {
    const rawConvs = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
    if (rawConvs) {
      state.conversations = JSON.parse(rawConvs);
    }
    const savedActive = localStorage.getItem(STORAGE_KEYS.ACTIVE_CONV);
    if (savedActive && state.conversations.some(c => c.id === savedActive)) {
      state.selectedConvId = savedActive;
    }
  } catch (e) {
    console.warn("Could not load persisted conversations:", e);
  }

  if (!state.conversations || !state.conversations.length) {
    seedInitialConversation();
  } else if (!state.selectedConvId) {
    state.selectedConvId = state.conversations[0].id;
  }
}

function saveConversations() {
  try {
    localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(state.conversations));
    if (state.selectedConvId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CONV, state.selectedConvId);
    }
  } catch (e) {
    console.warn("Storage quota or error:", e);
  }
}

function seedInitialConversation() {
  const conv = makeConversation("New chat");
  state.conversations = [conv];
  state.selectedConvId = conv.id;
  saveConversations();
}

function makeConversation(title = "New chat") {
  return {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

function currentConv() {
  return state.conversations.find(c => c.id === state.selectedConvId) || state.conversations[0];
}

/* ============================================================
   EVENT BINDING
   ============================================================ */
function bindEvents() {
  // Sidebar toggles
  el.sidebarToggle.addEventListener("click", toggleSidebar);
  el.mobileMenuBtn.addEventListener("click", openMobileSidebar);
  el.drawerBackdrop.addEventListener("click", closeMobileSidebar);

  // New Chat & Search
  el.newChatBtn.addEventListener("click", createNewChat);
  el.clearAllChatsBtn.addEventListener("click", clearAllChats);
  el.searchInput.addEventListener("input", onSearch);

  // Upload buttons
  el.uploadBtn.addEventListener("click", openFilePicker);
  el.sidebarUploadBtn.addEventListener("click", openFilePicker);
  el.mobileUploadBtn.addEventListener("click", openFilePicker);
  el.attachBtn.addEventListener("click", openFilePicker);
  el.fileInput.addEventListener("change", handleUpload);

  // Voice & Tone & Theme
  el.micBtn.addEventListener("click", toggleVoiceInput);
  el.themeToggleBtn.addEventListener("click", toggleTheme);
  el.tonePills.addEventListener("click", onTonePillClick);
  el.connectionStatus.addEventListener("click", () => {
    checkBackend();
    fetchModels();
    fetchDocuments();
    showToast("Refreshing", "Checking Ollama and document library status…", "info");
  });

  // Model selector
  el.modelSelect.addEventListener("change", onModelChange);

  // Composer
  el.composerTextarea.addEventListener("input", onComposerInput);
  el.composerTextarea.addEventListener("keydown", onComposerKeydown);
  el.sendBtn.addEventListener("click", sendMessage);
  el.stopBtn.addEventListener("click", stopGeneration);
  el.activeDocBadgeClear.addEventListener("click", clearActiveDoc);

  // Lists & Actions
  el.suggestionGrid.addEventListener("click", onSuggestionClick);
  el.conversationList.addEventListener("click", onConvListClick);
  el.documentList.addEventListener("click", onDocListClick);
  el.quickActionBtns.forEach(btn => btn.addEventListener("click", onQuickAction));
  el.messageStream.addEventListener("click", onMessageStreamClick);

  // Export
  el.exportChatBtn.addEventListener("click", exportConversation);
  el.headerExportBtn.addEventListener("click", exportConversation);
  el.settingsInfoBtn.addEventListener("click", showSettingsInfo);

  // Document Preview Modal
  el.previewCloseBtn.addEventListener("click", closeModal("docPreviewModal"));
  el.previewDismissBtn.addEventListener("click", closeModal("docPreviewModal"));
  el.previewSetActiveBtn.addEventListener("click", onPreviewSetActive);
  el.docPreviewModal.addEventListener("click", e => { if (e.target === el.docPreviewModal) closeModal("docPreviewModal")(); });

  // Translate modal
  el.translateCancelBtn.addEventListener("click", closeModal("translateModal"));
  el.translateConfirmBtn.addEventListener("click", confirmTranslate);
  el.translateModal.addEventListener("click", e => {
    if (e.target.classList.contains("lang-pill")) {
      el.translateLangInput.value = e.target.dataset.lang;
    }
    if (e.target === el.translateModal) closeModal("translateModal")();
  });
  el.translateLangInput.addEventListener("keydown", e => { if (e.key === "Enter") confirmTranslate(); });

  // Rewrite modal
  el.rewriteCancelBtn.addEventListener("click", closeModal("rewriteModal"));
  el.rewriteConfirmBtn.addEventListener("click", confirmRewrite);
  el.rewriteModal.addEventListener("click", e => { if (e.target === el.rewriteModal) closeModal("rewriteModal")(); });

  // Drag and drop file handling
  setupDragAndDrop();

  // Sidebar Tab Switching
  if (el.tabChatsBtn && el.tabDocsBtn) {
    el.tabChatsBtn.addEventListener("click", () => {
      el.tabChatsBtn.classList.add("active");
      el.tabDocsBtn.classList.remove("active");
      el.chatsTabPanel?.classList.add("active");
      el.docsTabPanel?.classList.remove("active");
    });
    el.tabDocsBtn.addEventListener("click", () => {
      el.tabDocsBtn.classList.add("active");
      el.tabChatsBtn.classList.remove("active");
      el.docsTabPanel?.classList.add("active");
      el.chatsTabPanel?.classList.remove("active");
    });
  }

  // Quick Tools Menu
  if (el.quickToolsTrigger && el.quickToolsMenu) {
    el.quickToolsTrigger.addEventListener("click", e => {
      e.stopPropagation();
      el.quickToolsMenu.classList.toggle("hidden");
    });
    document.addEventListener("click", () => {
      el.quickToolsMenu.classList.add("hidden");
    });
  }

  // Header Theme Toggle
  if (el.themeToggleBtnHeader) {
    el.themeToggleBtnHeader.addEventListener("click", toggleTheme);
  }

  // Resize & Escape
  window.addEventListener("resize", onResize);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeModal("translateModal")();
      closeModal("rewriteModal")();
      closeModal("docPreviewModal")();
      closeMobileSidebar();
      el.quickToolsMenu?.classList.add("hidden");
    }
  });
}

/* ============================================================
   THEME & TONE
   ============================================================ */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
  if (el.themeLabel) {
    el.themeLabel.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  }
  const icon = theme === "dark" ? icons.sun : icons.moon;
  if (el.themeToggleBtn) {
    el.themeToggleBtn.querySelector("svg")?.remove();
    el.themeToggleBtn.insertAdjacentHTML("afterbegin", icon);
  }
  if (el.themeToggleBtnHeader) {
    el.themeToggleBtnHeader.innerHTML = icon;
  }
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme(state.theme);
  showToast("Theme", `${state.theme === "dark" ? "Dark" : "Light"} theme enabled.`, "info");
}

function onTonePillClick(e) {
  const pill = e.target.closest(".tone-pill");
  if (!pill) return;
  const tone = pill.dataset.tone;
  state.tone = tone;
  localStorage.setItem(STORAGE_KEYS.TONE, tone);
  updateToneUI();
  showToast("Conversation Tone", `Style set to: ${tone.toUpperCase()}`, "info");
}

function updateToneUI() {
  document.querySelectorAll(".tone-pill").forEach(p => {
    p.classList.toggle("active", p.dataset.tone === state.tone);
  });
  const map = {
    creative: "Creative 🎨",
    balanced: "Balanced ⚖️",
    precise: "Precise 🎯",
  };
  if (el.composerToneText) {
    el.composerToneText.textContent = map[state.tone] || "Balanced";
  }
}

/* ============================================================
   SIDEBAR & RESPONSIVENESS
   ============================================================ */
function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  el.sidebar.classList.toggle("collapsed", !state.sidebarOpen);
  const mainArea = document.querySelector(".main-area");
  if (mainArea) {
    mainArea.style.marginLeft = state.sidebarOpen
      ? "var(--sidebar-w)"
      : "var(--sidebar-collapsed-w)";
  }
}

function openMobileSidebar() {
  state.mobileSidebarOpen = true;
  el.sidebar.classList.add("mobile-open");
  el.drawerBackdrop.classList.add("visible");
  document.body.style.overflow = "hidden";
}

function closeMobileSidebar() {
  state.mobileSidebarOpen = false;
  el.sidebar.classList.remove("mobile-open");
  el.drawerBackdrop.classList.remove("visible");
  document.body.style.overflow = "";
}

function onResize() {
  if (window.innerWidth > 860) closeMobileSidebar();
}

/* ============================================================
   DRAG AND DROP FILE SUPPORT
   ============================================================ */
function setupDragAndDrop() {
  let dragCounter = 0;
  window.addEventListener("dragenter", e => {
    e.preventDefault();
    dragCounter++;
    el.dragDropOverlay.classList.add("active");
  });
  window.addEventListener("dragleave", e => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      el.dragDropOverlay.classList.remove("active");
    }
  });
  window.addEventListener("dragover", e => {
    e.preventDefault();
  });
  window.addEventListener("drop", e => {
    e.preventDefault();
    dragCounter = 0;
    el.dragDropOverlay.classList.remove("active");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      uploadFileObject(e.dataTransfer.files[0]);
    }
  });
}

/* ============================================================
   SPEECH RECOGNITION (WEB SPEECH API)
   ============================================================ */
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return;
  }
  const recog = new SpeechRecognition();
  recog.continuous = false;
  recog.interimResults = true;
  recog.lang = "en-US";

  recog.onstart = () => {
    state.isListening = true;
    el.micBtn.classList.add("listening");
    showToast("Voice Input", "Listening… speak your prompt now.", "info");
  };

  recog.onresult = event => {
    const transcript = Array.from(event.results)
      .map(r => r[0].transcript)
      .join("");
    el.composerTextarea.value = transcript;
    onComposerInput();
  };

  recog.onerror = err => {
    state.isListening = false;
    el.micBtn.classList.remove("listening");
    showToast("Voice Input", `Speech recognition notice: ${err.error}`, "info");
  };

  recog.onend = () => {
    state.isListening = false;
    el.micBtn.classList.remove("listening");
  };

  state.speechRecognition = recog;
}

function toggleVoiceInput() {
  if (!state.speechRecognition) {
    showToast("Voice Input", "Speech recognition is not supported in this browser. Type in the prompt box.", "info");
    return;
  }
  if (state.isListening) {
    state.speechRecognition.stop();
  } else {
    try {
      state.speechRecognition.start();
    } catch (e) {
      state.speechRecognition.stop();
    }
  }
}

/* ============================================================
   CHAT CREATION & SWITCHING
   ============================================================ */
function createNewChat() {
  if (state.isStreaming) stopGeneration();
  const conv = makeConversation("New chat");
  state.conversations.unshift(conv);
  state.selectedConvId = conv.id;
  state.searchQuery = "";
  el.searchInput.value = "";
  el.composerTextarea.value = "";
  autoResizeTextarea();
  updateSendBtn();
  saveConversations();
  renderAll();
  if (window.innerWidth <= 860) closeMobileSidebar();
  showToast("New Chat", "Started a new conversation.", "success");
}

function clearAllChats() {
  if (confirm("Are you sure you want to clear all conversations?")) {
    state.conversations = [];
    seedInitialConversation();
    renderAll();
    showToast("Cleared", "All conversation history cleared.", "success");
  }
}

function selectConversation(id) {
  if (state.isStreaming) stopGeneration();
  state.selectedConvId = id;
  saveConversations();
  renderAll();
  if (window.innerWidth <= 860) closeMobileSidebar();
}

function onSearch() {
  state.searchQuery = el.searchInput.value.trim().toLowerCase();
  renderConversations();
}

/* ============================================================
   RENDER FUNCTIONS
   ============================================================ */
function renderAll() {
  renderConversations();
  renderDocuments();
  renderMessages();
  updateSendBtn();
  updateActiveDocBadge();
}

function renderConversations() {
  const filtered = [...state.conversations]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .filter(c => c.title.toLowerCase().includes(state.searchQuery));

  if (!filtered.length) {
    el.conversationList.innerHTML = `<div class="empty-state">No conversations found.</div>`;
    return;
  }

  el.conversationList.innerHTML = filtered.map(c => `
    <div class="conv-item-row ${c.id === state.selectedConvId ? "active" : ""}">
      <button class="conv-item-btn" data-conv-id="${escHtml(c.id)}" type="button">
        <span class="conv-icon">${icons.chat}</span>
        <span class="conv-title">${escHtml(c.title)}</span>
        <span class="conv-ts">${formatTime(c.updatedAt)}</span>
      </button>
      <button class="conv-del-btn" data-del-conv="${escHtml(c.id)}" title="Delete chat" type="button">×</button>
    </div>
  `).join("");
}

function renderDocuments() {
  if (!state.documents.length) {
    el.documentList.innerHTML = `<div class="empty-state">No files uploaded.</div>`;
    return;
  }

  el.documentList.innerHTML = state.documents.map(doc => {
    const ext = (doc.fileType || "doc").toLowerCase();
    let iconHtml = icons.doc;
    if (ext === "pdf") iconHtml = icons.pdf;
    else if (ext === "txt" || ext === "md" || ext === "csv") iconHtml = icons.txt;

    const isActive = doc.id === state.activeDocId || doc.isActive;

    return `
      <div class="doc-item ${isActive ? "active-doc" : ""}" data-doc-id="${escHtml(doc.id)}">
        <div class="doc-icon ${ext}" aria-hidden="true">${iconHtml}</div>
        <div class="doc-info" data-preview-doc="${escHtml(doc.id)}">
          <div class="doc-name" title="${escHtml(doc.filename)}">${escHtml(doc.filename)}</div>
          <div class="doc-size">
            ${doc.wordCount ? `${doc.wordCount.toLocaleString()} words` : ""} 
            ${doc.readingTimeMin ? `· ~${doc.readingTimeMin}m read` : ""}
          </div>
        </div>
        <div class="doc-actions">
          <button class="doc-action-btn" data-preview-doc="${escHtml(doc.id)}" title="Preview & info" type="button">
            ${icons.eye}
          </button>
          <button class="doc-action-btn" data-del-doc="${escHtml(doc.id)}" title="Delete document" type="button">
            ${icons.trash}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function updateActiveDocBadge() {
  const activeDoc = state.documents.find(d => d.id === state.activeDocId || d.isActive);
  if (activeDoc) {
    el.activeDocBadge.classList.remove("hidden");
    el.activeDocBadgeText.textContent = `Active Document: ${activeDoc.filename} (${activeDoc.wordCount || 0} words)`;
  } else {
    el.activeDocBadge.classList.add("hidden");
  }
}

function clearActiveDoc() {
  state.activeDocId = null;
  state.documents.forEach(d => { d.isActive = false; });
  updateActiveDocBadge();
  renderDocuments();
  showToast("Context Cleared", "Querying general AI knowledge without document constraint.", "info");
}

function renderMessages() {
  const conv = currentConv();
  if (!conv) {
    el.welcomeScreen.classList.remove("hidden");
    el.messageStream.classList.add("hidden");
    return;
  }
  const msgs = conv.messages || [];
  const showWelcome = msgs.length === 0;

  el.welcomeScreen.classList.toggle("hidden", !showWelcome);
  el.messageStream.classList.toggle("hidden", showWelcome);

  if (!showWelcome) {
    el.messageStream.innerHTML = msgs.map(renderMessage).join("");
    requestAnimationFrame(() => {
      el.messageStream.scrollTo({ top: el.messageStream.scrollHeight, behavior: "smooth" });
    });
  }
}

function renderMessage(msg) {
  if (msg.role === "typing") {
    return `
      <div class="typing-row" id="typing-indicator">
        <div class="msg-avatar" aria-hidden="true">${icons.bot}</div>
        <div class="typing-card">
          <span class="typing-label">Copilot is synthesizing insights…</span>
          <div class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></div>
        </div>
      </div>
    `;
  }

  if (msg.role === "user") {
    return `
      <div class="msg-item user">
        <div class="user-bubble">
          <div class="plain-text">${escHtml(msg.content).replace(/\n/g, "<br>")}</div>
        </div>
        <div class="msg-avatar" aria-hidden="true">${icons.user}</div>
      </div>
    `;
  }

  // Assistant Message
  const isFallback = msg.mode === "offline" || msg.mode === "offline_fallback";
  const badgeLabel = isFallback ? "RAG Offline Intelligence" : (msg.model || state.currentModel);

  return `
    <div class="msg-item assistant" id="${escHtml(msg.id)}">
      <div class="msg-avatar" aria-hidden="true">${icons.bot}</div>
      <div class="assistant-card">
        <div class="card-header">
          <div class="card-author-group">
            <span class="card-author">Copilot</span>
            <span class="card-badge ${isFallback ? 'offline-badge' : 'model-badge'}">${escHtml(badgeLabel)}</span>
          </div>
          <span class="card-time">${escHtml(formatTime(msg.time || new Date()))}</span>
        </div>
        <div class="card-body">${renderMarkdown(msg.content)}</div>
        <div class="card-footer">
          <button class="action-chip copy-chip" data-copy-id="${escHtml(msg.id)}" type="button">
            ${icons.copy} <span>Copy</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   ENCODING & MOJIBAKE REPAIR
   ============================================================ */
function cleanMojibake(str) {
  if (!str) return "";
  return String(str)
    .replace(/\u00e2\u0080\u0093|â€“|â/g, "–")
    .replace(/\u00e2\u0080\u0094|â€”|â/g, "—")
    .replace(/\u00e2\u0080\u009c|â€œ|â/g, "“")
    .replace(/\u00e2\u0080\u009d|â€\u009d|â/g, "”")
    .replace(/\u00e2\u0080\u0098|â€˜|â/g, "‘")
    .replace(/\u00e2\u0080\u0099|â€™|â/g, "’")
    .replace(/\u00e2\u0080\u00a2|â€¢|â¢/g, "•")
    .replace(/\u00e2\u0080\u00a6|â€¦|â¦/g, "…")
    .replace(/\u00c2\u00a0|Â /g, " ")
    .replace(/Â/g, "");
}

/* ============================================================
   ADVANCED MARKDOWN RENDERER WITH RICH TABLES & CODE COPY
   ============================================================ */
function renderMarkdown(raw) {
  if (!raw) return "";
  raw = cleanMojibake(raw);

  const codeBlocks = [];
  const tableBlocks = [];

  // 1. Fenced Code Blocks (preserved first before HTML escaping)
  let html = raw.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const language = lang || "code";
    const blockHtml = `
      <div class="code-block-container">
        <div class="code-block-header">
          <span class="code-block-lang">${escHtml(language)}</span>
          <button class="code-copy-btn" onclick="copyCodeBlock(this)" type="button">
            ${icons.copy} <span>Copy</span>
          </button>
        </div>
        <pre><code class="lang-${escHtml(language)}">${escHtml(code)}</code></pre>
      </div>
    `;
    codeBlocks.push(blockHtml);
    return `\x00CODE_${idx}\x00`;
  });

  // 2. Markdown Tables: match any table block with headers and separator
  const tableRegex = /(?:^|\n)([ \t]*\|[^\n]+\|[ \t]*\n[ \t]*\|(?:[ \t]*:?-+:?[ \t]*\|)+[ \t]*(?:\n[ \t]*\|[^\n]+\|[ \t]*)*)/g;

  html = html.replace(tableRegex, (match, tableText) => {
    const idx = tableBlocks.length;
    const lines = tableText.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return match;

    const parseCells = row => {
      let inner = row;
      if (inner.startsWith("|")) inner = inner.slice(1);
      if (inner.endsWith("|")) inner = inner.slice(0, -1);
      return inner.split("|").map(c => c.trim());
    };

    const headerCells = parseCells(lines[0]);
    const sepCells = parseCells(lines[1]);
    const alignments = sepCells.map(s => {
      const left = s.startsWith(":");
      const right = s.endsWith(":");
      if (left && right) return "center";
      if (right) return "right";
      return "left";
    });

    const thead = `<thead><tr>${headerCells.map((h, i) => {
      const align = alignments[i] || "left";
      const isFirst = i === 0 ? ' class="col-category"' : "";
      return `<th style="text-align:${align}"${isFirst}>${formatCellContent(h)}</th>`;
    }).join("")}</tr></thead>`;

    const bodyRows = lines.slice(2).map(row => {
      const cells = parseCells(row);
      const tds = cells.map((cell, i) => {
        const align = alignments[i] || "left";
        const isFirst = i === 0 ? ' class="col-category"' : "";
        return `<td style="text-align:${align}"${isFirst}>${formatCellContent(cell)}</td>`;
      }).join("");
      return `<tr>${tds}</tr>`;
    }).join("");

    const renderedTable = `
      <div class="md-table-wrap">
        <table class="md-table">
          ${thead}
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;
    tableBlocks.push(renderedTable);
    return `\n\n\x00TABLE_${idx}\x00\n\n`;
  });

  function formatCellContent(cellText) {
    let formatted = escHtml(cellText);
    // Decode intentional <br> or <br/> tags
    formatted = formatted.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
    // Bold, Italics, Code
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/\*(.+?)\*/g, "<em>$1</em>");
    formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Format list items inside cells (e.g. `<br>- item` or `- item`)
    const parts = formatted.split(/<br\s*\/?>/gi);
    if (parts.length > 1) {
      formatted = parts.map((part, pIdx) => {
        const pt = part.trim();
        if (/^[-*•]\s+/.test(pt)) {
          return `<div class="table-bullet-item"><span class="table-bullet">•</span><span>${pt.replace(/^[-*•]\s+/, "")}</span></div>`;
        }
        return pIdx === 0 ? pt : `<div style="margin-top:6px;">${pt}</div>`;
      }).join("");
    } else if (/^[-*•]\s+/.test(formatted.trim())) {
      formatted = `<div class="table-bullet-item"><span class="table-bullet">•</span><span>${formatted.trim().replace(/^[-*•]\s+/, "")}</span></div>`;
    }
    return formatted;
  }

  // 3. Escape general HTML outside code blocks and tables
  html = escHtml(html);

  // 4. Markdown syntax rules
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="md-h1">$1</h1>');
  // Horizontal rule
  html = html.replace(/^---$/gim, '<hr class="md-hr" />');
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold & Italics
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Links
  html = html.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // Blockquotes
  html = html.replace(/^>\s*(.+)$/gm, "<blockquote>$1</blockquote>");
  // Checkbox list items
  html = html.replace(/^- \[ \] (.+)$/gm, '<li class="task-item"><input type="checkbox" disabled /> <span>$1</span></li>');
  html = html.replace(/^- \[x\] (.+)$/gm, '<li class="task-item"><input type="checkbox" checked disabled /> <span>$1</span></li>');
  // Decode <br> tags
  html = html.replace(/&lt;br\s*\/?&gt;/gi, "<br>");

  // 5. Paragraphs & List handling
  const paragraphs = html.split(/\n{2,}/);
  html = paragraphs.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (trimmed.includes("\x00CODE_") || trimmed.includes("\x00TABLE_")) return trimmed;
    if (trimmed.startsWith("<h") || trimmed.startsWith("<hr") || trimmed.startsWith("<blockquote>")) return trimmed;

    const lines = trimmed.split(/\n/);
    const isBulletList = lines.every(l => /^[-*•] /.test(l) || l.includes('class="task-item"'));
    const isNumList = lines.every(l => /^\d+\. /.test(l));

    if (isBulletList) {
      const items = lines.map(l => {
        if (l.includes('class="task-item"')) return l;
        return `<li>${l.replace(/^[-*•] /, "").replace(/\n/g, " ")}</li>`;
      }).join("");
      return `<ul class="md-ul">${items}</ul>`;
    }

    if (isNumList) {
      const items = lines.map(l => `<li>${l.replace(/^\d+\. /, "").replace(/\n/g, " ")}</li>`).join("");
      return `<ol class="md-ol">${items}</ol>`;
    }

    return `<p class="md-p">${trimmed.replace(/\n/g, "<br>")}</p>`;
  }).join("");

  // 6. Restore code blocks & tables
  html = html.replace(/\x00CODE_(\d+)\x00/g, (_, i) => codeBlocks[Number(i)] || "");
  html = html.replace(/\x00TABLE_(\d+)\x00/g, (_, i) => tableBlocks[Number(i)] || "");

  return html;
}

window.copyCodeBlock = function(btn) {
  const container = btn.closest(".code-block-container");
  if (!container) return;
  const code = container.querySelector("code")?.innerText || "";
  navigator.clipboard.writeText(code).then(() => {
    btn.innerHTML = `${icons.check} <span>Copied!</span>`;
    setTimeout(() => { btn.innerHTML = `${icons.copy} <span>Copy</span>`; }, 2000);
  });
};

/* ============================================================
   COMPOSER INPUT & AUTORESIZE
   ============================================================ */
function onComposerInput() {
  autoResizeTextarea();
  updateSendBtn();
  el.charCount.textContent = String(el.composerTextarea.value.length);
}

function onComposerKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResizeTextarea() {
  const ta = el.composerTextarea;
  ta.style.height = "auto";
  ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
}

function updateSendBtn() {
  const hasText = el.composerTextarea.value.trim().length > 0;
  el.sendBtn.disabled = !hasText || state.busy || state.uploading;
  el.stopBtn.classList.toggle("hidden", !state.isStreaming);
  el.sendBtn.classList.toggle("hidden", state.isStreaming);
}

/* ============================================================
   SEND MESSAGE (REAL-TIME STREAMING OR DIRECT)
   ============================================================ */
async function sendMessage() {
  const text = el.composerTextarea.value.trim();
  if (!text || state.busy || state.uploading) return;

  if (!state.selectedConvId) createNewChat();

  state.busy = true;
  state.isStreaming = true;
  state.abortController = new AbortController();
  updateSendBtn();

  addMessage("user", text);
  el.composerTextarea.value = "";
  el.charCount.textContent = "0";
  autoResizeTextarea();

  // Prepare Assistant message container
  const assistantMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const assistantMsg = {
    id: assistantMsgId,
    role: "assistant",
    content: "",
    time: new Date().toISOString(),
    model: state.currentModel,
    mode: state.backendMode,
  };

  const conv = currentConv();
  conv.messages.push(assistantMsg);
  renderMessages();

  // Prepare History
  const historyTurns = conv.messages
    .filter(m => m.id !== assistantMsgId && (m.role === "user" || m.role === "assistant"))
    .slice(-6)
    .map(m => ({ role: m.role, content: m.content }));

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: state.abortController.signal,
      body: JSON.stringify({
        question: text,
        history: historyTurns,
        tone: state.tone,
        model: state.currentModel,
        doc_id: state.activeDocId,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errData = await safeJson(response);
      throw new Error(errData.message || `Request failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream") && response.body) {
      // Stream Token by Token
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            try {
              const eventData = JSON.parse(trimmed.slice(5).trim());
              if (eventData.token) {
                assistantMsg.content += eventData.token;
                updateMessageLive(assistantMsgId, assistantMsg.content);
              }
              if (eventData.mode) {
                assistantMsg.mode = eventData.mode;
              }
              if (eventData.done) {
                if (eventData.model) assistantMsg.model = eventData.model;
                break;
              }
            } catch (jsonErr) {}
          }
        }
      }
    } else {
      // Non-streaming fallback
      const data = await safeJson(response);
      assistantMsg.content = data.answer || "No response received.";
      assistantMsg.model = data.model || state.currentModel;
      assistantMsg.mode = data.mode || "ollama";
    }

    setConnected(assistantMsg.mode !== "offline" && assistantMsg.mode !== "offline_fallback");
  } catch (err) {
    if (err.name === "AbortError") {
      assistantMsg.content += "\n\n*(Generation stopped by user)*";
    } else {
      assistantMsg.content = `⚠️ I encountered an issue fulfilling that request: ${err.message}`;
      showToast("Error", err.message, "error");
    }
  } finally {
    state.busy = false;
    state.isStreaming = false;
    state.abortController = null;
    updateSendBtn();
    saveConversations();
    renderMessages();
  }
}

function updateMessageLive(msgId, content) {
  const msgEl = document.getElementById(msgId);
  if (msgEl) {
    const cardBody = msgEl.querySelector(".card-body");
    if (cardBody) {
      cardBody.innerHTML = renderMarkdown(content);
      el.messageStream.scrollTop = el.messageStream.scrollHeight;
    }
  }
}

function stopGeneration() {
  if (state.abortController) {
    state.abortController.abort();
    state.isStreaming = false;
    state.busy = false;
    updateSendBtn();
    showToast("Stopped", "AI response generation halted.", "info");
  }
}

/* ============================================================
   MESSAGE HELPERS
   ============================================================ */
function addMessage(role, content, extra = {}) {
  const conv = currentConv();
  if (!conv) return;
  const msg = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    time: new Date().toISOString(),
    ...extra,
  };
  conv.messages.push(msg);
  conv.updatedAt = new Date().toISOString();

  if (role === "user" && (conv.title === "New chat" || !conv.title)) {
    conv.title = content.slice(0, 36) + (content.length > 36 ? "…" : "");
  }

  saveConversations();
  renderAll();
}

/* ============================================================
   COPY & EXPORT
   ============================================================ */
function onMessageStreamClick(e) {
  const copyBtn = e.target.closest(".copy-chip");
  if (!copyBtn) return;
  const conv = currentConv();
  if (!conv) return;
  const msg = conv.messages.find(m => m.id === copyBtn.dataset.copyId);
  if (!msg) return;

  navigator.clipboard.writeText(msg.content)
    .then(() => {
      copyBtn.innerHTML = `${icons.check} <span>Copied!</span>`;
      setTimeout(() => { copyBtn.innerHTML = `${icons.copy} <span>Copy</span>`; }, 1800);
    })
    .catch(() => showToast("Copy Failed", "Clipboard permissions denied.", "error"));
}

function exportConversation() {
  const conv = currentConv();
  if (!conv || !conv.messages.length) {
    showToast("Export", "No messages in this chat to export.", "info");
    return;
  }

  let mdContent = `# ${conv.title || "AI Workspace Conversation"}\n`;
  mdContent += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;

  conv.messages.forEach(msg => {
    const author = msg.role === "user" ? "### 👤 User" : `### 🤖 Copilot (${msg.model || "Assistant"})`;
    mdContent += `${author}\n\n${msg.content}\n\n---\n\n`;
  });

  const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(conv.title || "conversation").replace(/[^a-z0-9_-]/gi, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Exported", "Conversation downloaded as Markdown.", "success");
}

/* ============================================================
   SUGGESTION CARDS & QUICK ACTIONS
   ============================================================ */
function onSuggestionClick(e) {
  const card = e.target.closest(".suggestion-card");
  if (!card) return;
  const prompt = card.dataset.prompt || "";
  el.composerTextarea.value = prompt;
  onComposerInput();
  sendMessage();
}

function onQuickAction(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  el.quickToolsMenu?.classList.add("hidden");
  const action = btn.dataset.action;
  if (action === "clear") { clearCurrentChat(); return; }
  if (action === "translate") { openTranslateModal(); return; }
  if (action === "rewrite") { openRewriteModal(); return; }
  handleQuickActionApi(action, {});
}

function clearCurrentChat() {
  const conv = currentConv();
  if (!conv) return;
  conv.messages = [];
  conv.title = "New chat";
  conv.updatedAt = new Date().toISOString();
  saveConversations();
  renderAll();
  showToast("Chat Cleared", "Current conversation reset.", "success");
}

async function handleQuickActionApi(action, payload = {}) {
  const conv = currentConv();
  if (!conv) return;

  const docRequired = ["summarize", "email", "tasks"];
  if (docRequired.includes(action) && !state.documents.length) {
    showToast("Document Required", "Please upload a document to use this action.", "error");
    return;
  }

  const endpointMap = {
    summarize: "/summarize",
    email: "/email",
    tasks: "/tasks",
    rewrite: "/rewrite",
    translate: "/translate",
  };

  const actionLabels = {
    summarize: "Summarize Document",
    email: "Draft Executive Email",
    tasks: "Extract Action Items",
    rewrite: "Rewrite Text",
    translate: "Translate",
  };

  state.busy = true;
  updateSendBtn();
  addMessage("user", `⚡ Request: ${actionLabels[action] || action}`);

  const assistantMsgId = `msg_${Date.now()}`;
  const assistantMsg = {
    id: assistantMsgId,
    role: "assistant",
    content: "Synthesizing…",
    time: new Date().toISOString(),
    model: state.currentModel,
  };
  conv.messages.push(assistantMsg);
  renderMessages();

  try {
    const hasPayload = Object.keys(payload).length > 0;
    const res = await fetch(`${API_BASE}${endpointMap[action]}`, {
      method: "POST",
      headers: hasPayload ? { "Content-Type": "application/json" } : {},
      body: hasPayload ? JSON.stringify(payload) : undefined,
    });
    const data = await safeJson(res);
    if (!res.ok || !data.success) throw new Error(data.message || `${action} failed.`);

    assistantMsg.content = data.answer;
    assistantMsg.model = data.model;
    assistantMsg.mode = data.mode;
    setConnected(data.mode !== "offline" && data.mode !== "offline_fallback");
    showToast("Completed", `${actionLabels[action]} generated.`, "success");
  } catch (err) {
    assistantMsg.content = `⚠️ Could not complete ${actionLabels[action]}: ${err.message}`;
    showToast("Failed", err.message, "error");
  } finally {
    state.busy = false;
    updateSendBtn();
    saveConversations();
    renderMessages();
  }
}

/* ============================================================
   MODALS: TRANSLATE & REWRITE
   ============================================================ */
function openTranslateModal() {
  el.translateLangInput.value = "";
  el.translateModal.classList.add("open");
  setTimeout(() => el.translateLangInput.focus(), 100);
}

function confirmTranslate() {
  const lang = el.translateLangInput.value.trim();
  if (!lang) {
    el.translateLangInput.focus();
    return;
  }
  const conv = currentConv();
  const lastAssistant = conv ? [...conv.messages].reverse().find(m => m.role === "assistant") : null;
  const text = el.composerTextarea.value.trim() || (lastAssistant ? lastAssistant.content : "");

  if (!text) {
    showToast("No Text", "Please type or paste text to translate.", "error");
    closeModal("translateModal")();
    return;
  }
  closeModal("translateModal")();
  handleQuickActionApi("translate", { text, language: lang });
}

function openRewriteModal() {
  el.rewriteTextInput.value = el.composerTextarea.value.trim() || "";
  el.rewriteModal.classList.add("open");
  setTimeout(() => el.rewriteTextInput.focus(), 100);
}

function confirmRewrite() {
  const text = el.rewriteTextInput.value.trim();
  if (!text) {
    el.rewriteTextInput.focus();
    return;
  }
  closeModal("rewriteModal")();
  handleQuickActionApi("rewrite", { text, tone: state.tone });
}

function closeModal(modalId) {
  return () => {
    const modal = el[modalId] || document.getElementById(modalId);
    if (modal) modal.classList.remove("open");
  };
}

/* ============================================================
   FILE UPLOAD & DOCUMENT MANAGEMENT
   ============================================================ */
function openFilePicker() {
  el.fileInput.value = "";
  el.fileInput.click();
}

function handleUpload(e) {
  const file = e.target.files?.[0];
  if (file) uploadFileObject(file);
}

async function uploadFileObject(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["pdf", "docx", "txt", "md", "csv"].includes(ext)) {
    showToast("Unsupported File", "Please upload PDF, DOCX, TXT, MD, or CSV.", "error");
    return;
  }

  state.uploading = true;
  updateSendBtn();
  showUploadProgress(file.name);
  animateUploadBar();

  try {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
    const data = await safeJson(res);
    if (!res.ok || !data.success) throw new Error(data.message || "Upload failed.");

    state.activeDocId = data.document?.id || data.filename;
    await fetchDocuments();

    addMessage("assistant", `✅ Document **${data.filename}** indexed into RAG workspace (${data.wordCount ? data.wordCount.toLocaleString() : 0} words, ${data.chunks || 1} chunks). Ask questions about it or use Quick Actions.`);
    showToast("Upload Successful", data.filename, "success");
  } catch (err) {
    showToast("Upload Failed", err.message, "error");
  } finally {
    state.uploading = false;
    hideUploadProgress();
    updateSendBtn();
  }
}

function showUploadProgress(name) {
  el.upName.textContent = name;
  el.upStatus.textContent = "Extracting & indexing document…";
  el.upBar.style.width = "0%";
  el.uploadProgress.classList.add("visible");
}

function animateUploadBar() {
  let pct = 0;
  const iv = setInterval(() => {
    pct = Math.min(pct + Math.random() * 18 + 8, 90);
    el.upBar.style.width = `${pct}%`;
    if (pct >= 90 || !state.uploading) clearInterval(iv);
  }, 180);
}

function hideUploadProgress() {
  el.upBar.style.width = "100%";
  el.upStatus.textContent = "Indexed!";
  setTimeout(() => { el.uploadProgress.classList.remove("visible"); }, 800);
}

async function fetchDocuments() {
  try {
    const res = await fetch(`${API_BASE}/documents`);
    const data = await safeJson(res);
    if (data.success && Array.isArray(data.documents)) {
      state.documents = data.documents;
      const active = state.documents.find(d => d.isActive);
      if (active) state.activeDocId = active.id;
      else if (state.documents.length && !state.activeDocId) state.activeDocId = state.documents[0].id;
      renderDocuments();
      updateActiveDocBadge();
    }
  } catch (e) {}
}

function onDocListClick(e) {
  // Delete document
  const delBtn = e.target.closest("[data-del-doc]");
  if (delBtn) {
    e.stopPropagation();
    deleteDocument(delBtn.dataset.delDoc);
    return;
  }

  // Preview document
  const previewTrigger = e.target.closest("[data-preview-doc]");
  if (previewTrigger) {
    e.stopPropagation();
    openDocPreview(previewTrigger.dataset.previewDoc);
    return;
  }

  // Select document as active
  const item = e.target.closest("[data-doc-id]");
  if (item) {
    activateDocument(item.dataset.docId);
  }
}

async function activateDocument(docId) {
  try {
    const res = await fetch(`${API_BASE}/documents/${docId}/activate`, { method: "POST" });
    const data = await safeJson(res);
    if (data.success) {
      state.activeDocId = docId;
      await fetchDocuments();
      showToast("Active Document", `'${data.document?.filename || 'Document'}' is now primary context.`, "success");
    }
  } catch (e) {
    showToast("Error", "Could not activate document.", "error");
  }
}

async function deleteDocument(docId) {
  if (!confirm("Remove this document from the library?")) return;
  try {
    const res = await fetch(`${API_BASE}/documents/${docId}`, { method: "DELETE" });
    const data = await safeJson(res);
    if (data.success) {
      if (state.activeDocId === docId) state.activeDocId = null;
      await fetchDocuments();
      showToast("Document Removed", "File removed from workspace.", "success");
    }
  } catch (e) {
    showToast("Error", "Could not remove document.", "error");
  }
}

/* ============================================================
   DOCUMENT PREVIEW MODAL
   ============================================================ */
async function openDocPreview(docId) {
  try {
    const res = await fetch(`${API_BASE}/documents/${docId}/preview`);
    const data = await safeJson(res);
    if (!data.success || !data.document) throw new Error("Could not retrieve document preview.");

    const doc = data.document;
    state.previewDoc = doc;
    el.previewTitle.textContent = doc.filename;
    el.previewMetaGrid.innerHTML = `
      <div class="meta-item"><span class="meta-label">Type:</span> <strong>${doc.fileType}</strong></div>
      <div class="meta-item"><span class="meta-label">Words:</span> <strong>${(doc.wordCount || 0).toLocaleString()}</strong></div>
      <div class="meta-item"><span class="meta-label">Est. Read:</span> <strong>~${doc.readingTimeMin || 1} min</strong></div>
      <div class="meta-item"><span class="meta-label">Chunks:</span> <strong>${doc.chunkCount || 1}</strong></div>
    `;
    el.previewTextBox.textContent = doc.fullText || doc.preview || "No preview text available.";
    el.docPreviewModal.classList.add("open");
  } catch (err) {
    showToast("Preview Error", err.message, "error");
  }
}

function onPreviewSetActive() {
  if (state.previewDoc) {
    activateDocument(state.previewDoc.id);
    closeModal("docPreviewModal")();
  }
}

/* ============================================================
   CONVERSATION LIST INTERACTION
   ============================================================ */
function onConvListClick(e) {
  const delBtn = e.target.closest("[data-del-conv]");
  if (delBtn) {
    e.stopPropagation();
    deleteConversation(delBtn.dataset.delConv);
    return;
  }
  const item = e.target.closest("[data-conv-id]");
  if (item) {
    selectConversation(item.dataset.convId);
  }
}

function deleteConversation(id) {
  state.conversations = state.conversations.filter(c => c.id !== id);
  if (state.selectedConvId === id) {
    state.selectedConvId = state.conversations[0]?.id || null;
    if (!state.selectedConvId) seedInitialConversation();
  }
  saveConversations();
  renderAll();
  showToast("Chat Deleted", "Conversation removed.", "info");
}

/* ============================================================
   BACKEND & MODELS STATUS
   ============================================================ */
async function checkBackend() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await safeJson(res);
    state.backendMode = data.mode || "offline_fallback";
    state.provider = data.provider || (data.groq_connected ? "groq" : "ollama");
    const isOnline = Boolean(data.llm_reachable || data.ollama_reachable);
    setConnected(isOnline, state.provider);
    if (data.model) {
      state.currentModel = data.model;
    }
  } catch {
    setConnected(false);
  }
}

function setConnected(online, provider = state.provider) {
  state.backendConnected = online;
  const chip = el.connectionStatus;
  if (online) {
    chip.className = "status-chip connected";
    const label = provider === "groq" ? "Groq Online (GPT-120B)" : "Ollama Active";
    el.statusText.textContent = label;
    if (el.mobileSubtitle) el.mobileSubtitle.textContent = label;
  } else {
    chip.className = "status-chip offline";
    el.statusText.textContent = "RAG Intelligence (Offline)";
    if (el.mobileSubtitle) el.mobileSubtitle.textContent = "Offline Mode";
  }
}

async function fetchModels() {
  try {
    const res = await fetch(`${API_BASE}/models`);
    const data = await safeJson(res);
    if (data.success && Array.isArray(data.models)) {
      state.availableModels = data.models;
      updateModelDropdown();
    }
  } catch (e) {}
}

function updateModelDropdown() {
  const models = state.availableModels.length ? state.availableModels : [state.currentModel, "llama3.1:8b"];
  const unique = [...new Set(models)];
  el.modelSelect.innerHTML = unique.map(m => `
    <option value="${escHtml(m)}" ${m === state.currentModel ? "selected" : ""}>
      ${escHtml(m)}
    </option>
  `).join("");
}

async function onModelChange() {
  const model = el.modelSelect.value;
  state.currentModel = model;
  localStorage.setItem(STORAGE_KEYS.MODEL, model);
  try {
    await fetch(`${API_BASE}/models/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    showToast("Model Selected", `Active model set to ${model}`, "success");
  } catch (e) {}
}

function showSettingsInfo() {
  showToast("Workspace Assistant", "Connected to Flask RAG Engine with Ollama local LLM integration and semantic context retrieval.", "info");
}

/* ============================================================
   TOAST NOTIFICATIONS & UTILS
   ============================================================ */
function showToast(title, message, tone = "info") {
  const iconMap = { success: icons.success, error: icons.error, info: icons.info };
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.innerHTML = `
    <div class="toast-icon">${iconMap[tone] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${escHtml(title)}</div>
      <div class="toast-msg">${escHtml(message)}</div>
    </div>
  `;
  el.toastStack.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("exit");
    setTimeout(() => toast.remove(), 350);
  }, 3200);
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(dateVal) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(dateVal));
  } catch {
    return "";
  }
}

async function safeJson(res) {
  try { return await res.json(); }
  catch { return {}; }
}
