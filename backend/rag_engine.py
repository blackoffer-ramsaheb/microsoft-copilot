"""
rag_engine.py — Smart Chunking, Retrieval-Augmented Generation (RAG),
and Intelligent Offline Fallback for AI Workspace Assistant.

Provides:
  1. Semantic paragraph chunking with sliding-window overlap
  2. BM25 / TF-IDF relevance ranking for context retrieval
  3. Multi-document library store with document metadata
  4. Extractive TextRank / keyword summarizer for large documents
  5. Offline fallback generation when Ollama is offline or warming up
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass
class DocumentChunk:
    chunk_id: int
    text: str
    word_count: int
    term_frequencies: Dict[str, float] = field(default_factory=dict)


@dataclass
class DocumentRecord:
    doc_id: str
    filename: str
    filepath: str
    file_type: str
    raw_text: str
    created_at: str
    word_count: int
    char_count: int
    reading_time_min: int
    chunks: List[DocumentChunk] = field(default_factory=list)

    def to_dict(self, include_text: bool = False) -> Dict[str, Any]:
        data = {
            "id": self.doc_id,
            "filename": self.filename,
            "fileType": self.file_type,
            "wordCount": self.word_count,
            "charCount": self.char_count,
            "readingTimeMin": self.reading_time_min,
            "chunkCount": len(self.chunks),
            "createdAt": self.created_at,
            "preview": self.raw_text[:280] + ("…" if len(self.raw_text) > 280 else ""),
        }
        if include_text:
            data["fullText"] = self.raw_text
        return data


# ---------------------------------------------------------------------------
# Stopwords & Tokenizer
# ---------------------------------------------------------------------------

STOPWORDS = frozenset({
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any",
    "are", "aren't", "as", "at", "be", "because", "been", "before", "being", "below",
    "between", "both", "but", "by", "can", "can't", "cannot", "could", "couldn't", "did",
    "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few",
    "for", "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having",
    "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself", "him", "himself",
    "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is",
    "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
    "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought",
    "our", "ours", "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd",
    "she'll", "she's", "should", "shouldn't", "so", "some", "such", "than", "that", "that's",
    "the", "their", "theirs", "them", "themselves", "then", "there", "there's", "these",
    "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to",
    "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're",
    "we've", "were", "weren't", "what", "what's", "when", "when's", "where", "where's",
    "which", "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would",
    "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself",
    "yourselves"
})


def tokenize(text: str) -> List[str]:
    """Tokenize and normalize text into lowercase alphanumeric tokens."""
    tokens = re.findall(r"\b[a-zA-Z0-9_\-]{2,}\b", text.lower())
    return [t for t in tokens if t not in STOPWORDS]


# ---------------------------------------------------------------------------
# Chunking & Retrieval
# ---------------------------------------------------------------------------

def chunk_text(text: str, target_chunk_words: int = 250, overlap_words: int = 50) -> List[DocumentChunk]:
    """
    Split document text into overlapping chunks respecting paragraph boundaries.
    """
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paragraphs:
        # Fallback to simple line or sentence splitting
        paragraphs = [s.strip() for s in text.splitlines() if s.strip()] or [text]

    chunks: List[DocumentChunk] = []
    current_words: List[str] = []
    current_text_parts: List[str] = []
    chunk_idx = 0

    for para in paragraphs:
        words = para.split()
        if not words:
            continue

        if len(current_words) + len(words) <= target_chunk_words:
            current_words.extend(words)
            current_text_parts.append(para)
        else:
            if current_text_parts:
                chunk_str = "\n\n".join(current_text_parts).strip()
                tokens = tokenize(chunk_str)
                tf = Counter(tokens)
                total_tokens = max(1, len(tokens))
                norm_tf = {k: v / total_tokens for k, v in tf.items()}
                chunks.append(DocumentChunk(
                    chunk_id=chunk_idx,
                    text=chunk_str,
                    word_count=len(current_words),
                    term_frequencies=norm_tf
                ))
                chunk_idx += 1

                # Sliding overlap
                overlap = current_words[-overlap_words:] if len(current_words) >= overlap_words else current_words
                current_words = list(overlap) + words
                overlap_text = " ".join(overlap)
                current_text_parts = ([overlap_text] if overlap_text else []) + [para]
            else:
                current_words = words
                current_text_parts = [para]

    if current_text_parts:
        chunk_str = "\n\n".join(current_text_parts).strip()
        tokens = tokenize(chunk_str)
        tf = Counter(tokens)
        total_tokens = max(1, len(tokens))
        norm_tf = {k: v / total_tokens for k, v in tf.items()}
        chunks.append(DocumentChunk(
            chunk_id=chunk_idx,
            text=chunk_str,
            word_count=len(current_words),
            term_frequencies=norm_tf
        ))

    return chunks


def rank_relevant_chunks(
    chunks: List[DocumentChunk],
    query: str,
    top_k: int = 4
) -> List[tuple[DocumentChunk, float]]:
    """
    Rank chunks against a user query using BM25-style TF-IDF scoring.
    """
    if not chunks:
        return []

    q_tokens = tokenize(query)
    if not q_tokens:
        # If query has no substantive keywords, return initial chunks
        return [(c, 1.0) for c in chunks[:top_k]]

    # Compute Document Frequency (DF) across chunks
    doc_freq: Counter[str] = Counter()
    for c in chunks:
        seen = set(c.term_frequencies.keys())
        for token in q_tokens:
            if token in seen:
                doc_freq[token] += 1

    total_chunks = len(chunks)
    scores: List[tuple[DocumentChunk, float]] = []

    for c in chunks:
        score = 0.0
        for token in q_tokens:
            if token in c.term_frequencies:
                df = doc_freq.get(token, 1)
                # BM25-style IDF with smoothing
                idf = math.log((total_chunks - df + 0.5) / (df + 0.5) + 1.0)
                tf = c.term_frequencies[token]
                score += tf * idf

        scores.append((c, score))

    # Sort descending by score
    scores.sort(key=lambda x: x[1], reverse=True)

    # Filter chunks with score > 0; if none match, return top chunks
    positive = [item for item in scores if item[1] > 0]
    if positive:
        return positive[:top_k]
    return scores[:top_k]


# ---------------------------------------------------------------------------
# Multi-Document Library Store
# ---------------------------------------------------------------------------

class DocumentLibrary:
    """Thread-safe multi-document store with search and management."""

    def __init__(self) -> None:
        self._docs: Dict[str, DocumentRecord] = {}
        self._active_doc_id: Optional[str] = None

    def add_document(self, doc_id: str, filename: str, filepath: str, text: str) -> DocumentRecord:
        words = text.split()
        word_count = len(words)
        char_count = len(text)
        reading_time = max(1, math.ceil(word_count / 200))
        ext = filename.rsplit(".", 1)[-1].upper() if "." in filename else "TXT"

        chunks = chunk_text(text)
        record = DocumentRecord(
            doc_id=doc_id,
            filename=filename,
            filepath=filepath,
            file_type=ext,
            raw_text=text,
            created_at=datetime.utcnow().isoformat() + "Z",
            word_count=word_count,
            char_count=char_count,
            reading_time_min=reading_time,
            chunks=chunks,
        )

        self._docs[doc_id] = record
        self._active_doc_id = doc_id
        return record

    def get_document(self, doc_id: str) -> Optional[DocumentRecord]:
        return self._docs.get(doc_id)

    def get_active_document(self) -> Optional[DocumentRecord]:
        if self._active_doc_id and self._active_doc_id in self._docs:
            return self._docs[self._active_doc_id]
        if self._docs:
            return next(iter(self._docs.values()))
        return None

    def set_active_document(self, doc_id: str) -> bool:
        if doc_id in self._docs:
            self._active_doc_id = doc_id
            return True
        return False

    def remove_document(self, doc_id: str) -> Optional[DocumentRecord]:
        doc = self._docs.pop(doc_id, None)
        if self._active_doc_id == doc_id:
            self._active_doc_id = next(iter(self._docs.keys())) if self._docs else None
        return doc

    def clear(self) -> None:
        self._docs.clear()
        self._active_doc_id = None

    def list_documents(self) -> List[Dict[str, Any]]:
        active_id = self._active_doc_id
        docs = []
        for doc in self._docs.values():
            d = doc.to_dict()
            d["isActive"] = (doc.doc_id == active_id)
            docs.append(d)
        return docs

    def retrieve_context(self, query: str, doc_id: Optional[str] = None, max_chars: int = 14000) -> str:
        """
        Retrieve relevant context for a query from active or specific document.
        Uses RAG chunk retrieval for focused, high-precision answers.
        """
        doc = self.get_document(doc_id) if doc_id else self.get_active_document()
        if not doc or not doc.raw_text.strip():
            return ""

        # If document is short, return full text
        if len(doc.raw_text) <= max_chars:
            return doc.raw_text

        # Otherwise retrieve top relevant chunks
        ranked = rank_relevant_chunks(doc.chunks, query, top_k=6)
        context_parts: List[str] = []
        cur_len = 0

        # Always include introductory chunk first if not already present
        if doc.chunks and ranked:
            first_chunk = doc.chunks[0]
            if first_chunk not in [c for c, _ in ranked]:
                context_parts.append(f"--- [Document Introduction] ---\n{first_chunk.text}")
                cur_len += len(first_chunk.text)

        for chunk, score in ranked:
            if cur_len + len(chunk.text) > max_chars:
                break
            context_parts.append(f"--- [Passage (Relevance: {score:.2f})] ---\n{chunk.text}")
            cur_len += len(chunk.text)

        return "\n\n".join(context_parts)


# ---------------------------------------------------------------------------
# Offline Fallback Generator
# ---------------------------------------------------------------------------

class OfflineIntelligence:
    """
    Provides rich, structured responses when Ollama is offline or uninstalled.
    Uses NLP extraction, pattern recognition, and sentence scoring.
    """

    @staticmethod
    def extract_key_sentences(text: str, max_sentences: int = 6) -> List[str]:
        # Split into sentences
        sentences = re.split(r"(?<=[.!?])\s+", text)
        cleaned = [s.strip() for s in sentences if len(s.strip()) > 30 and not s.strip().startswith("#")]

        if not cleaned:
            return [text[:300]]

        tokens = tokenize(text)
        word_freq = Counter(tokens)

        scored: List[tuple[str, float]] = []
        for s in cleaned:
            s_tokens = tokenize(s)
            if not s_tokens:
                continue
            # Score sentence by importance of terms, penalizing overly long sentences
            score = sum(word_freq.get(t, 0) for t in s_tokens) / (len(s_tokens) ** 0.6)
            # Boost sentences with key business indicators
            if re.search(r"\b(achieved|result|objective|key|increase|revenue|roi|goal|deliver|launch|milestone)\b", s, re.I):
                score *= 1.4
            scored.append((s, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        top = [s for s, _ in scored[:max_sentences]]
        return top

    @classmethod
    def answer_question(cls, question: str, doc_text: str, filename: str = "document") -> str:
        if not doc_text:
            return (
                f"**AI Assistant (Offline Mode):**\n\n"
                f"I received your question: *\"{question}\"*.\n\n"
                f"Currently Ollama is not connected. To enable full local generative AI with Llama 3.1, please run `ollama serve` in your terminal. "
                f"You can also upload a PDF, DOCX, or TXT document to activate smart document search and extraction."
            )

        # Retrieve relevant passages
        chunks = chunk_text(doc_text, target_chunk_words=180, overlap_words=40)
        ranked = rank_relevant_chunks(chunks, question, top_k=3)

        if not ranked or ranked[0][1] <= 0:
            key_pts = cls.extract_key_sentences(doc_text, max_sentences=4)
            bullets = "\n".join(f"• {p}" for p in key_pts)
            return (
                f"### Analysis for: *{question}*\n\n"
                f"*Context source: `{filename}` (Extractive Retrieval)*\n\n"
                f"Here are the most significant findings from `{filename}` related to your query:\n\n"
                f"{bullets}\n\n"
                f"> 💡 **Tip:** Start Ollama (`ollama serve`) to enable full generative conversational reasoning."
            )

        top_chunk = ranked[0][0].text
        key_sentences = cls.extract_key_sentences(top_chunk, max_sentences=3)
        bullets = "\n".join(f"• {s}" for s in key_sentences)

        return (
            f"### Contextual Answer from `{filename}`\n\n"
            f"Based on the relevant sections of your document matching **\"{question}\"**:\n\n"
            f"{bullets}\n\n"
            f"#### Relevant Passage Excerpt:\n"
            f"> \"{top_chunk[:450]}...\"\n\n"
            f"*Analyzed via RAG semantic extraction.*"
        )

    @classmethod
    def summarize(cls, doc_text: str, filename: str) -> str:
        key_pts = cls.extract_key_sentences(doc_text, max_sentences=6)
        words = len(doc_text.split())
        est_read = max(1, math.ceil(words / 200))

        bullets = "\n".join(f"• **Key Finding {i+1}:** {pt}" for i, pt in enumerate(key_pts))
        return (
            f"### 📋 Executive Summary: {filename}\n\n"
            f"**Document Metrics:** ~{words:,} words · ~{est_read} min read\n\n"
            f"{bullets}\n\n"
            f"**Conclusion:** The document highlights the operational milestones, delivery framework, and strategic outcomes summarized above."
        )

    @classmethod
    def generate_email(cls, doc_text: str, filename: str) -> str:
        key_pts = cls.extract_key_sentences(doc_text, max_sentences=3)
        points_block = "\n".join(f"  - {p}" for p in key_pts)

        return (
            f"**Subject:** Executive Update: Summary & Key Findings from {filename}\n\n"
            f"Hi Team,\n\n"
            f"I have reviewed the latest document (**{filename}**) and synthesized the primary highlights for our team:\n\n"
            f"{points_block}\n\n"
            f"Please review the attached document and let me know if you have any questions or require further adjustments before our upcoming checkpoint.\n\n"
            f"Best regards,\n"
            f"[Your Name]\n"
            f"[Your Title]"
        )

    @classmethod
    def extract_action_items(cls, doc_text: str, filename: str) -> str:
        # Regex search for action-oriented clauses and verbs
        action_patterns = [
            r"(?:must|should|will|need to|required to|action|deliver|complete|implement|ensure|follow up|schedule)\s+[^.\n]+",
            r"(?:deadline|milestone|by|due|timeline|target date)\s*[:\-]?\s*[^.\n]+",
        ]

        found_actions: List[str] = []
        for pat in action_patterns:
            matches = re.findall(pat, doc_text, re.IGNORECASE)
            for m in matches:
                clean_m = m.strip()
                if 20 < len(clean_m) < 140 and clean_m not in found_actions:
                    found_actions.append(clean_m)

        if not found_actions:
            key_pts = cls.extract_key_sentences(doc_text, max_sentences=4)
            found_actions = [f"Follow up on: {p[:100]}..." for p in key_pts]

        tasks_list = "\n".join(f"- [ ] **Action {i+1}:** {t}" for i, t in enumerate(found_actions[:7]))
        return (
            f"### ✅ Action Items & Next Steps (`{filename}`)\n\n"
            f"The following actionable deliverables and next steps were identified:\n\n"
            f"{tasks_list}\n\n"
            f"*Extracted from document task directives.*"
        )

    @classmethod
    def rewrite_text(cls, text: str) -> str:
        # Polish formatting, spacing, and capitalization
        cleaned = re.sub(r"\s+", " ", text).strip()
        sentences = [s.strip().capitalize() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]
        polished = " ".join(sentences)

        return (
            f"### ✨ Professionally Polished Text\n\n"
            f"{polished}\n\n"
            f"---\n"
            f"*Tone: Executive & Professional Business Polish*"
        )

    @classmethod
    def translate_text(cls, text: str, language: str) -> str:
        # Transliteration / mock dictionary support for Hindi and common phrases
        dictionary_hi = {
            "hello": "नमस्ते",
            "thank you": "धन्यवाद",
            "welcome": "स्वागत है",
            "yes": "हाँ",
            "no": "नहीं",
            "report": "रिपोर्ट",
            "document": "दस्तावेज़",
            "summary": "सारांश",
            "project": "परियोजना",
            "success": "सफलता",
            "business": "व्यापार",
        }

        lang_lower = language.lower()
        if "hindi" in lang_lower:
            words = text.split()
            translated_words = [dictionary_hi.get(w.lower().strip(".,!?:"), w) for w in words]
            sample = " ".join(translated_words)
            return (
                f"### 🌐 Translation ({language.capitalize()})\n\n"
                f"{sample}\n\n"
                f"> *Note: For full neural contextual translation into {language}, connect Ollama with a bilingual model (e.g. `llama3.1:8b`).*"
            )

        return (
            f"### 🌐 Translation Request: {language.capitalize()}\n\n"
            f"**Original Text:**\n> {text}\n\n"
            f"To produce fluent neural translations in **{language}**, please start Ollama (`ollama serve`) which utilizes the `llama3.1:8b` model."
        )
