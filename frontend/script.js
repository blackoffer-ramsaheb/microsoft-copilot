/* ============================================================
   COPILOT AI WORKSPACE ASSISTANT — Frontend Script
   Redesigned UI | Vanilla JS | Fully connected to backend
   ============================================================ */

"use strict";

// When served by Flask at http://localhost:5000, use same-origin (empty string).
// When opened as a file:// or from another host, fall back to localhost:5000.
const API_BASE = (() => {
  if (window.COPILOT_API_BASE) return window.COPILOT_API_BASE;
  // Same-origin: the page IS the backend
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return window.location.origin === "null" ? "http://localhost:5000" : "";
  }
  // file:// — must hit the backend explicitly
  return "http://localhost:5000";
})();

/* ============================================================
   STATE
   ============================================================ */
const state = {
  theme:           localStorage.getItem("copilot-theme") || "light",
  sidebarOpen:     true,
  mobileSidebarOpen: false,
  backendConnected: false,
  busy:            false,
  uploading:       false,
  searchQuery:     "",
  conversations:   [],
  selectedConvId:  null,
  documents:       [],
  currentDocument: null,
  lastAssistantText: "",
};

/* ============================================================
   DOM ELEMENT CACHE
   ============================================================ */
const el = {};

/* ============================================================
   ICONS (inline SVG helpers)
   ============================================================ */
const icons = {
  logo: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 12c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08C16.71 16.72 14.5 18 12 18z" fill="currentColor"/>
  </svg>`,

  logoMark: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="8" fill="none"/>
    <path d="M8 8h6.4L16 11.2 17.6 8H24v6.4L20.8 16 24 17.6V24h-6.4L16 20.8 14.4 24H8v-6.4L11.2 16 8 14.4V8z" fill="white" opacity="0.9"/>
    <circle cx="16" cy="16" r="3.5" fill="white"/>
  </svg>`,

  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>`,

  menuClose: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,

  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`,

  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>`,

  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`,

  pdf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="9" y1="13" x2="15" y2="13"/>
    <line x1="9" y1="17" x2="15" y2="17"/>
  </svg>`,

  doc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>`,

  txt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="12" y1="12" x2="8" y2="12"/><line x1="12" y1="16" x2="8" y2="16"/>
  </svg>`,

  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>`,

  summarize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/>
    <line x1="21" y1="14" x2="3" y2="14"/><line x1="12" y1="18" x2="3" y2="18"/>
  </svg>`,

  email: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22 6 12 13 2 6"/>
  </svg>`,

  rewrite: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`,

  tasks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <polyline points="9 11 12 14 22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>`,

  translate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/>
    <path d="M2 5h12"/><path d="M7 2h1"/>
    <path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/>
  </svg>`,

  clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
    <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
  </svg>`,

  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>`,

  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`,

  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>`,

  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>`,

  attach: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </svg>`,

  mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>`,

  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>`,

  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`,

  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,

  bot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <rect x="3" y="11" width="18" height="10" rx="2"/>
    <circle cx="12" cy="5" r="2"/>
    <line x1="12" y1="7" x2="12" y2="11"/>
    <line x1="8" y1="15" x2="8" y2="17"/>
    <line x1="16" y1="15" x2="16" y2="17"/>
  </svg>`,

  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`,

  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>`,

  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>`,

  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
  </svg>`,

  sparkle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
  </svg>`,

  report: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>`,

  bulb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/>
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
  </svg>`,
};

/* ============================================================
   BUILD HTML SHELL
   ============================================================ */
function buildShell() {
  document.getElementById("app").innerHTML = `
    <!-- Drawer Backdrop -->
    <div class="drawer-backdrop" id="drawerBackdrop"></div>

    <div class="app-root" id="appRoot">
      <!-- ======================== SIDEBAR ======================== -->
      <aside class="sidebar" id="sidebar">

        <!-- Sidebar Header -->
        <div class="sidebar-header">
          <div class="brand">
            <div class="brand-logo" aria-hidden="true">${icons.logoMark}</div>
            <div class="brand-text">
              <div class="brand-name">AI Workspace</div>
              <div class="brand-tagline">Powered by Ollama</div>
            </div>
          </div>
          <button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="Toggle sidebar" title="Toggle sidebar">
            ${icons.menu}
          </button>
        </div>

        <!-- Sidebar Body -->
        <div class="sidebar-body">

          <!-- New Chat -->
          <div class="sidebar-section" style="padding-bottom: 8px;">
            <button class="new-chat-btn" id="newChatBtn" type="button" aria-label="Start new chat">
              ${icons.plus}
              <span class="new-chat-label">New Chat</span>
            </button>
          </div>

          <!-- Search -->
          <div class="sidebar-section" style="padding-top: 4px; padding-bottom: 8px;">
            <div class="search-wrap">
              <span class="search-icon" aria-hidden="true">${icons.search}</span>
              <input
                id="searchInput"
                class="search-input"
                type="search"
                placeholder="Search conversations…"
                autocomplete="off"
                aria-label="Search conversations"
              />
            </div>
          </div>

          <div class="sidebar-section-divider"></div>

          <!-- Chat History -->
          <div class="sidebar-section">
            <div class="section-label">Chat History</div>
            <div class="conversation-list" id="conversationList" role="list" aria-label="Conversations"></div>
          </div>

          <div class="sidebar-section-divider"></div>

          <!-- Uploaded Documents -->
          <div class="sidebar-section">
            <div class="section-label">Uploaded Documents</div>
            <div class="document-list" id="documentList" aria-label="Uploaded documents"></div>
          </div>

          <div class="sidebar-section-divider"></div>

          <!-- Quick Actions -->
          <div class="sidebar-section">
            <div class="section-label">Quick Actions</div>
            <div class="quick-actions" id="quickActions">
              <button class="quick-action-btn" data-action="summarize" type="button" title="Summarize the uploaded document">
                ${icons.summarize}<span class="qa-label">Summarize Document</span>
              </button>
              <button class="quick-action-btn" data-action="email" type="button" title="Generate email from document">
                ${icons.email}<span class="qa-label">Generate Email</span>
              </button>
              <button class="quick-action-btn" data-action="rewrite" type="button" title="Rewrite text professionally">
                ${icons.rewrite}<span class="qa-label">Rewrite Text</span>
              </button>
              <button class="quick-action-btn" data-action="tasks" type="button" title="Extract action items">
                ${icons.tasks}<span class="qa-label">Extract Action Items</span>
              </button>
              <button class="quick-action-btn" data-action="translate" type="button" title="Translate text">
                ${icons.translate}<span class="qa-label">Translate</span>
              </button>
              <button class="quick-action-btn danger" data-action="clear" type="button" title="Clear current chat">
                ${icons.clear}<span class="qa-label">Clear Chat</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Sidebar Footer -->
        <div class="sidebar-footer">
          <div class="sidebar-footer-content">
            <div class="footer-row">
              <button class="theme-toggle-btn" id="themeToggleBtn" type="button" aria-label="Toggle dark mode">
                ${icons.moon}<span id="themeLabel">Dark Mode</span>
              </button>
              <span class="version-badge">v1.0</span>
            </div>
            <div class="footer-links">
              <span tabindex="0" role="button" aria-label="About">About</span>
              <span tabindex="0" role="button" aria-label="Settings">${icons.settings} Settings</span>
            </div>
          </div>
        </div>
      </aside>

      <!-- ======================== MAIN AREA ======================== -->
      <div class="main-area" id="mainArea">

        <!-- Mobile Header (visible on tablet/mobile) -->
        <header class="mobile-header" id="mobileHeader">
          <button class="icon-btn" id="mobileMenuBtn" type="button" aria-label="Open sidebar">
            ${icons.menu}
          </button>
          <div>
            <div class="mobile-title">AI Workspace</div>
            <div class="mobile-subtitle">Powered by Ollama</div>
          </div>
          <button class="icon-btn" id="mobileUploadBtn" type="button" aria-label="Upload file">
            ${icons.upload}
          </button>
        </header>

        <!-- Desktop Header -->
        <header class="main-header" id="mainHeader">
          <div class="header-left">
            <div class="header-title">AI Workspace Assistant</div>
            <div class="header-subtitle">Your intelligent document & conversation companion</div>
          </div>

          <div class="header-center">
            <span class="status-chip" id="connectionStatus">
              <span class="status-dot" id="statusDot"></span>
              <span id="statusText">Connecting…</span>
            </span>
            <span class="status-chip model-chip">
              <span>Llama3.1:8B</span>
            </span>
          </div>

          <div class="header-right">
            <button class="upload-btn" id="uploadBtn" type="button" aria-label="Upload document">
              ${icons.upload}
              <span>Upload</span>
            </button>
          </div>
        </header>

        <!-- Conversation Panel -->
        <main class="conv-panel" id="convPanel">

          <!-- Welcome Screen -->
          <section class="welcome-screen" id="welcomeScreen" aria-label="Welcome">
            <div class="welcome-icon-wrap" aria-hidden="true">
              ${icons.sparkle}
            </div>
            <h1 class="welcome-heading">How can I help you today?</h1>
            <p class="welcome-sub">Upload a document or start a conversation. I can summarize, write, translate, and more.</p>
            <div class="suggestion-grid" id="suggestionGrid" role="list">
              <button class="suggestion-card" data-prompt="Summarize my report" type="button" role="listitem">
                ${icons.report}
                <span class="sg-title">Summarize my report</span>
                <span class="sg-hint">Get a concise summary of your document</span>
              </button>
              <button class="suggestion-card" data-prompt="Write a professional email" type="button" role="listitem">
                ${icons.email}
                <span class="sg-title">Write a professional email</span>
                <span class="sg-hint">Draft a polished, ready-to-send message</span>
              </button>
              <button class="suggestion-card" data-prompt="Explain this document" type="button" role="listitem">
                ${icons.bulb}
                <span class="sg-title">Explain this document</span>
                <span class="sg-hint">Get a clear breakdown of the content</span>
              </button>
              <button class="suggestion-card" data-prompt="Extract action items" type="button" role="listitem">
                ${icons.tasks}
                <span class="sg-title">Extract action items</span>
                <span class="sg-hint">Pull out tasks and next steps</span>
              </button>
              <button class="suggestion-card" data-prompt="Translate text to Hindi" type="button" role="listitem">
                ${icons.translate}
                <span class="sg-title">Translate text</span>
                <span class="sg-hint">Convert content to any language</span>
              </button>
            </div>
          </section>

          <!-- Message Stream -->
          <div class="message-stream hidden" id="messageStream" aria-live="polite" aria-label="Conversation messages"></div>
        </main>

        <!-- Composer Panel -->
        <div class="composer-panel" id="composerPanel">
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
              placeholder="Message Copilot…"
              aria-label="Message input"
              autocomplete="off"
              spellcheck="true"
            ></textarea>
            <div class="composer-toolbar">
              <div class="composer-tools">
                <button class="composer-tool-btn" id="attachBtn" type="button" aria-label="Attach file" title="Attach file">
                  ${icons.attach}
                </button>
                <button class="composer-tool-btn" id="micBtn" type="button" aria-label="Voice input" title="Voice input (UI placeholder)">
                  ${icons.mic}
                </button>
              </div>
              <div class="composer-right">
                <span class="char-count" id="charCount" aria-live="polite">0</span>
                <button class="send-btn" id="sendBtn" type="button" disabled aria-label="Send message">
                  ${icons.send}
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
          <div class="composer-hint">
            <span><kbd>Enter</kbd> to send</span>
            <span><kbd>Shift</kbd> + <kbd>Enter</kbd> for new line</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Hidden File Input -->
    <input id="fileInput" type="file" accept=".pdf,.docx,.txt" hidden aria-hidden="true" />

    <!-- Toast Stack -->
    <div class="toast-stack" id="toastStack" aria-live="assertive" aria-atomic="true"></div>

    <!-- Translate Modal -->
    <div class="modal-overlay" id="translateModal" role="dialog" aria-modal="true" aria-label="Translate text">
      <div class="modal-card">
        <div class="modal-title">Translate Text</div>
        <div class="modal-sub">Enter the target language to translate your text.</div>
        <input id="translateLangInput" class="modal-input" type="text" placeholder="e.g. Hindi, French, Spanish…" autocomplete="off" />
        <div class="modal-btns">
          <button class="btn-secondary" id="translateCancelBtn" type="button">Cancel</button>
          <button class="btn-primary" id="translateConfirmBtn" type="button">Translate</button>
        </div>
      </div>
    </div>

    <!-- Rewrite Modal -->
    <div class="modal-overlay" id="rewriteModal" role="dialog" aria-modal="true" aria-label="Rewrite text">
      <div class="modal-card">
        <div class="modal-title">Rewrite Text</div>
        <div class="modal-sub">Enter the text you'd like to professionally rewrite.</div>
        <textarea id="rewriteTextInput" class="modal-textarea" rows="4" placeholder="Paste or type your text here…"></textarea>
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
  [
    "appRoot","sidebar","drawerBackdrop","sidebarToggle",
    "mobileMenuBtn","mobileUploadBtn","mobileHeader",
    "newChatBtn","searchInput","conversationList","documentList",
    "uploadBtn","attachBtn","micBtn",
    "connectionStatus","statusDot","statusText",
    "welcomeScreen","suggestionGrid","messageStream",
    "composerTextarea","sendBtn","charCount","fileInput","toastStack",
    "themeToggleBtn","themeLabel",
    "uploadProgress","upName","upStatus","upBar",
    "translateModal","translateLangInput","translateCancelBtn","translateConfirmBtn",
    "rewriteModal","rewriteTextInput","rewriteCancelBtn","rewriteConfirmBtn",
  ].forEach(id => { el[id] = document.getElementById(id); });

  el.quickActionBtns = document.querySelectorAll(".quick-action-btn");
}

/* ============================================================
   INIT
   ============================================================ */
window.addEventListener("DOMContentLoaded", () => {
  buildShell();
  cacheElements();
  applyTheme(state.theme);
  seedInitialConversation();
  bindEvents();
  autoResizeTextarea();
  updateSendBtn();
  renderAll();
  checkBackend();
});

/* ============================================================
   EVENT BINDING
   ============================================================ */
function bindEvents() {
  el.sidebarToggle.addEventListener("click", toggleSidebar);
  el.mobileMenuBtn.addEventListener("click", openMobileSidebar);
  el.drawerBackdrop.addEventListener("click", closeMobileSidebar);
  el.mobileUploadBtn.addEventListener("click", openFilePicker);
  el.newChatBtn.addEventListener("click", createNewChat);
  el.searchInput.addEventListener("input", onSearch);
  el.uploadBtn.addEventListener("click", openFilePicker);
  el.attachBtn.addEventListener("click", openFilePicker);
  el.micBtn.addEventListener("click", () => showToast("Voice Input", "Voice input is a UI placeholder.", "info"));
  el.themeToggleBtn.addEventListener("click", toggleTheme);
  el.fileInput.addEventListener("change", handleUpload);
  el.composerTextarea.addEventListener("input", onComposerInput);
  el.composerTextarea.addEventListener("keydown", onComposerKeydown);
  el.sendBtn.addEventListener("click", sendMessage);
  el.suggestionGrid.addEventListener("click", onSuggestionClick);
  el.conversationList.addEventListener("click", onConvListClick);
  el.documentList.addEventListener("click", onDocListClick);
  el.quickActionBtns.forEach(btn => btn.addEventListener("click", onQuickAction));
  el.messageStream.addEventListener("click", onMessageStreamClick);

  // Translate modal
  el.translateCancelBtn.addEventListener("click", closeModal("translateModal"));
  el.translateConfirmBtn.addEventListener("click", confirmTranslate);
  el.translateModal.addEventListener("click", e => { if (e.target === el.translateModal) closeModal("translateModal")(); });
  el.translateLangInput.addEventListener("keydown", e => { if (e.key === "Enter") confirmTranslate(); });

  // Rewrite modal
  el.rewriteCancelBtn.addEventListener("click", closeModal("rewriteModal"));
  el.rewriteConfirmBtn.addEventListener("click", confirmRewrite);
  el.rewriteModal.addEventListener("click", e => { if (e.target === el.rewriteModal) closeModal("rewriteModal")(); });

  window.addEventListener("resize", onResize);

  // Keyboard: Escape closes modals
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeModal("translateModal")();
      closeModal("rewriteModal")();
      closeMobileSidebar();
    }
  });
}

/* ============================================================
   THEME
   ============================================================ */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("copilot-theme", theme);
  if (el.themeLabel) {
    el.themeLabel.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  }
  if (el.themeToggleBtn) {
    el.themeToggleBtn.querySelector("svg")?.remove();
    el.themeToggleBtn.insertAdjacentHTML("afterbegin", theme === "dark" ? icons.sun : icons.moon);
  }
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme(state.theme);
  showToast("Theme", state.theme === "dark" ? "Dark mode enabled." : "Light mode enabled.", "info");
}

/* ============================================================
   SIDEBAR
   ============================================================ */
function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  el.sidebar.classList.toggle("collapsed", !state.sidebarOpen);
  // Update the main area margin via a class
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
  if (window.innerWidth > 860) {
    closeMobileSidebar();
  }
}

/* ============================================================
   CONVERSATION MANAGEMENT
   ============================================================ */
function seedInitialConversation() {
  const conv = makeConversation("New chat");
  state.conversations = [conv];
  state.selectedConvId = conv.id;
}

function makeConversation(title = "New chat") {
  return {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    title,
    updatedAt: new Date(),
    messages: [],
  };
}

function currentConv() {
  return state.conversations.find(c => c.id === state.selectedConvId) || state.conversations[0];
}

function createNewChat() {
  const conv = makeConversation("New chat");
  state.conversations.unshift(conv);
  state.selectedConvId = conv.id;
  state.lastAssistantText = "";
  state.searchQuery = "";
  el.searchInput.value = "";
  el.composerTextarea.value = "";
  autoResizeTextarea();
  updateSendBtn();
  renderAll();
  if (window.innerWidth <= 860) closeMobileSidebar();
  showToast("New Chat", "Fresh conversation started.", "success");
}

function selectConversation(id) {
  state.selectedConvId = id;
  renderAll();
  if (window.innerWidth <= 860) closeMobileSidebar();
}

/* ============================================================
   SEARCH
   ============================================================ */
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
    <button
      class="conv-item ${c.id === state.selectedConvId ? "active" : ""}"
      data-conv-id="${escHtml(c.id)}"
      type="button"
      role="listitem"
      aria-pressed="${c.id === state.selectedConvId}"
      aria-label="Conversation: ${escHtml(c.title)}"
    >
      <span class="conv-title">${escHtml(c.title)}</span>
      <span class="conv-ts">${formatTime(c.updatedAt)}</span>
    </button>
  `).join("");
}

function renderDocuments() {
  if (!state.documents.length) {
    el.documentList.innerHTML = `<div class="empty-state">No uploaded files.</div>`;
    return;
  }
  el.documentList.innerHTML = state.documents.map(doc => {
    const ext = doc.type.toLowerCase();
    let iconHtml = icons.doc;
    if (ext === "pdf") iconHtml = icons.pdf;
    else if (ext === "txt") iconHtml = icons.txt;
    return `
      <div class="doc-item">
        <div class="doc-icon ${ext}" aria-hidden="true">${iconHtml}</div>
        <div class="doc-info">
          <div class="doc-name" title="${escHtml(doc.name)}">${escHtml(doc.name)}</div>
          <div class="doc-size">${escHtml(doc.sizeLabel)}</div>
        </div>
        <button class="doc-del" data-del-doc="${escHtml(doc.id)}" type="button" aria-label="Delete ${escHtml(doc.name)}">
          ${icons.trash}
        </button>
      </div>
    `;
  }).join("");
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
    // Scroll to bottom smoothly
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
          <span class="typing-label">Copilot is thinking…</span>
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

  // Assistant
  return `
    <div class="msg-item assistant">
      <div class="msg-avatar" aria-hidden="true">${icons.bot}</div>
      <div class="assistant-card">
        <div class="card-header">
          <span class="card-author">Copilot</span>
          <span class="card-time">${escHtml(formatTime(msg.time || new Date()))}</span>
        </div>
        <div class="card-body">${renderMarkdown(msg.content)}</div>
        <div class="card-footer">
          <button class="action-chip copy-chip" data-copy-id="${escHtml(msg.id)}" type="button" aria-label="Copy message">
            ${icons.copy} Copy
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   MARKDOWN RENDERER
   ============================================================ */
function renderMarkdown(raw) {
  const codeBlocks = [];
  let html = escHtml(raw);

  // Fenced code blocks
  html = html.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${lang || "text"}">${code}</code></pre>`);
    return `\x00CODE_${idx}\x00`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold & italics
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Split paragraphs
  const paragraphs = html.split(/\n{2,}/);
  html = paragraphs.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("\x00CODE_")) return trimmed;

    const lines = trimmed.split(/\n/);
    const isList = lines.every(l => /^[-*•] /.test(l));
    const isNumList = lines.every(l => /^\d+\. /.test(l));

    if (isList) {
      const items = lines.map(l => `<li>${l.replace(/^[-*•] /, "").replace(/\n/g, " ")}</li>`).join("");
      return `<ul>${items}</ul>`;
    }
    if (isNumList) {
      const items = lines.map(l => `<li>${l.replace(/^\d+\. /, "").replace(/\n/g, " ")}</li>`).join("");
      return `<ol>${items}</ol>`;
    }

    return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
  }).join("");

  // Restore code blocks
  html = html.replace(/\x00CODE_(\d+)\x00/g, (_, i) => codeBlocks[Number(i)] || "");

  return html;
}

/* ============================================================
   COMPOSER
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
  ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
}

function updateSendBtn() {
  const hasText = el.composerTextarea.value.trim().length > 0;
  el.sendBtn.disabled = !hasText || state.busy || state.uploading;
}

/* ============================================================
   SEND MESSAGE
   ============================================================ */
async function sendMessage() {
  const text = el.composerTextarea.value.trim();
  if (!text || state.busy || state.uploading) return;

  if (!state.selectedConvId) createNewChat();

  state.busy = true;
  updateSendBtn();
  addMessage("user", text);
  el.composerTextarea.value = "";
  el.charCount.textContent = "0";
  autoResizeTextarea();
  addTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text }),
    });
    const data = await safeJson(res);
    removeTypingIndicator();
    if (!res.ok || !data.success) throw new Error(data.message || "Chat request failed.");
    addMessage("assistant", data.answer);
    setConnected(true);
  } catch (err) {
    removeTypingIndicator();
    addMessage("assistant", `⚠️ I couldn't complete that request. ${err.message}`);
    setConnected(false);
    showToast("Error", err.message, "error");
  } finally {
    state.busy = false;
    updateSendBtn();
    renderAll();
  }
}

/* ============================================================
   MESSAGES HELPERS
   ============================================================ */
function addMessage(role, content) {
  const conv = currentConv();
  if (!conv) return;
  const msg = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    role,
    content,
    time: new Date(),
  };
  conv.messages.push(msg);
  conv.updatedAt = new Date();
  if (role === "assistant") state.lastAssistantText = content;
  if (role === "user" && conv.title === "New chat") {
    conv.title = content.slice(0, 42) || "New chat";
  }
  // Bubble this conversation to top
  state.conversations = [conv, ...state.conversations.filter(c => c.id !== conv.id)];
  renderAll();
}

function addTypingIndicator() {
  const conv = currentConv();
  if (!conv) return;
  removeTypingIndicator(conv);
  conv.messages.push({ id: `typing_${Date.now()}`, role: "typing", time: new Date() });
  renderMessages();
}

function removeTypingIndicator(conv) {
  const c = conv || currentConv();
  if (!c) return;
  c.messages = c.messages.filter(m => m.role !== "typing");
}

/* ============================================================
   COPY BUTTON
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
      copyBtn.innerHTML = `${icons.check} Copied!`;
      setTimeout(() => { copyBtn.innerHTML = `${icons.copy} Copy`; }, 1800);
    })
    .catch(() => showToast("Copy Failed", "Clipboard access denied.", "error"));
}

/* ============================================================
   SUGGESTION CARDS
   ============================================================ */
function onSuggestionClick(e) {
  const card = e.target.closest(".suggestion-card");
  if (!card) return;
  const prompt = card.dataset.prompt || "";
  el.composerTextarea.value = prompt;
  onComposerInput();
  sendMessage();
}

/* ============================================================
   CONVERSATION LIST CLICK
   ============================================================ */
function onConvListClick(e) {
  const btn = e.target.closest("[data-conv-id]");
  if (!btn) return;
  selectConversation(btn.dataset.convId);
}

/* ============================================================
   DOCUMENT LIST CLICK
   ============================================================ */
function onDocListClick(e) {
  const delBtn = e.target.closest("[data-del-doc]");
  if (!delBtn) return;
  const id = delBtn.dataset.delDoc;
  state.documents = state.documents.filter(d => d.id !== id);
  if (state.currentDocument && state.currentDocument.id === id) {
    state.currentDocument = state.documents[0] || null;
  }
  renderDocuments();
  showToast("Document Removed", "File removed from sidebar.", "success");
}

/* ============================================================
   QUICK ACTIONS
   ============================================================ */
function onQuickAction(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === "clear") { clearCurrentChat(); return; }
  if (action === "translate") { openTranslateModal(); return; }
  if (action === "rewrite") { openRewriteModal(); return; }
  handleAction(action, {});
}

function clearCurrentChat() {
  const conv = currentConv();
  if (!conv) return;
  conv.messages = [];
  conv.title = "New chat";
  conv.updatedAt = new Date();
  state.lastAssistantText = "";
  renderAll();
  showToast("Chat Cleared", "Conversation has been reset.", "success");
}

async function handleAction(action, payload = {}) {
  const conv = currentConv();
  if (!conv) return;

  const docRequired = ["summarize", "email", "tasks"];
  if (docRequired.includes(action) && !state.currentDocument) {
    showToast("Upload Required", "Please upload a document first.", "error");
    return;
  }

  const endpointMap = {
    summarize: "/summarize",
    email:     "/email",
    rewrite:   "/rewrite",
    tasks:     "/tasks",
    translate: "/translate",
  };

  const actionLabels = {
    summarize: "Summarize Document",
    email:     "Generate Email",
    rewrite:   "Rewrite Text",
    tasks:     "Extract Action Items",
    translate: "Translate",
  };

  state.busy = true;
  updateSendBtn();
  addMessage("user", `🔧 ${actionLabels[action] || action}`);
  addTypingIndicator();

  try {
    const hasPayload = Object.keys(payload).length > 0;
    const res = await fetch(`${API_BASE}${endpointMap[action]}`, {
      method: "POST",
      headers: hasPayload ? { "Content-Type": "application/json" } : {},
      body: hasPayload ? JSON.stringify(payload) : undefined,
    });
    const data = await safeJson(res);
    removeTypingIndicator();
    if (!res.ok || !data.success) throw new Error(data.message || `${action} failed.`);
    addMessage("assistant", data.answer);
    setConnected(true);
    showToast("Completed", `${actionLabels[action]} added to chat.`, "success");
  } catch (err) {
    removeTypingIndicator();
    addMessage("assistant", `⚠️ ${err.message}`);
    setConnected(false);
    showToast("Failed", err.message, "error");
  } finally {
    state.busy = false;
    updateSendBtn();
    renderAll();
  }
}

/* ============================================================
   TRANSLATE MODAL
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
  const text = el.composerTextarea.value.trim() || state.lastAssistantText;
  if (!text) {
    showToast("No Text", "Type text in the message box first.", "error");
    closeModal("translateModal")();
    return;
  }
  closeModal("translateModal")();
  handleAction("translate", { text, language: lang });
}

/* ============================================================
   REWRITE MODAL
   ============================================================ */
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
  handleAction("rewrite", { text });
}

function closeModal(modalId) {
  return () => {
    const modal = el[modalId] || document.getElementById(modalId);
    if (modal) modal.classList.remove("open");
  };
}

/* ============================================================
   FILE UPLOAD
   ============================================================ */
function openFilePicker() {
  el.fileInput.value = "";
  el.fileInput.click();
}

async function handleUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const ext = file.name.split(".").pop().toLowerCase();
  if (!["pdf", "docx", "txt"].includes(ext)) {
    showToast("Unsupported File", "Upload PDF, DOCX, or TXT.", "error");
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

    const doc = {
      id:        `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name:      data.filename || file.name,
      type:      ext.toUpperCase(),
      sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
    };
    state.currentDocument = doc;
    state.documents = [doc, ...state.documents.filter(d => d.id !== doc.id)];
    setConnected(true);
    addMessage("assistant", `✅ Document **${doc.name}** uploaded successfully! You can now ask questions or use Quick Actions.`);
    renderDocuments();
    showToast("Upload Complete", doc.name, "success");
  } catch (err) {
    setConnected(false);
    showToast("Upload Failed", err.message, "error");
  } finally {
    state.uploading = false;
    hideUploadProgress();
    updateSendBtn();
  }
}

function showUploadProgress(name) {
  el.upName.textContent = name;
  el.upStatus.textContent = "Uploading…";
  el.upBar.style.width = "0%";
  el.uploadProgress.classList.add("visible");
}

function animateUploadBar() {
  let pct = 0;
  const iv = setInterval(() => {
    pct = Math.min(pct + Math.random() * 12 + 4, 88);
    el.upBar.style.width = `${pct}%`;
    if (pct >= 88) clearInterval(iv);
  }, 200);
}

function hideUploadProgress() {
  el.upBar.style.width = "100%";
  el.upStatus.textContent = "Done!";
  setTimeout(() => {
    el.uploadProgress.classList.remove("visible");
  }, 800);
}

/* ============================================================
   BACKEND STATUS
   ============================================================ */
async function checkBackend() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await safeJson(res);
    if (data.ollama_reachable === false) {
      setConnected(false);
      return;
    }
    setConnected(true);
    // Update model chip if model info is returned
    if (data.model) {
      const modelChip = document.querySelector(".status-chip.model-chip span");
      if (modelChip) modelChip.textContent = data.model;
    }
  } catch {
    setConnected(false);
  }
}

function setConnected(online) {
  state.backendConnected = online;
  const chip = el.connectionStatus;
  if (online) {
    chip.className = "status-chip connected";
    el.statusText.textContent = "Ollama Connected";
  } else {
    chip.className = "status-chip disconnected";
    el.statusText.textContent = "Ollama Offline";
  }
}

/* ============================================================
   TOAST NOTIFICATIONS
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
  }, 3000);
}

/* ============================================================
   UTILITIES
   ============================================================ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(dateVal) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(dateVal));
}

async function safeJson(res) {
  try { return await res.json(); }
  catch { return {}; }
}
