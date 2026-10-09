"""
document.py — Text extraction for PDF, DOCX, TXT, MD, and CSV files.

Improvements:
- Supports PDF, DOCX, TXT, MD, and CSV files
- DOCX tables + headers/footers extracted
- Flexible encoding detection (utf-8-sig, utf-8, latin-1, cp1252)
- Resilient magic-byte validation (tolerant of ZIP headers for OOXML)
- Returns clean formatted text capped at MAX_CHARS
"""

from __future__ import annotations

import csv
import io
import os
from typing import List

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SUPPORTED_EXTENSIONS: frozenset[str] = frozenset({".pdf", ".docx", ".txt", ".md", ".csv"})

# Cap extracted text at ~25 000 words (≈ 150 000 chars)
MAX_CHARS: int = 150_000


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def allowed_file(filename: str) -> bool:
    """Return True if *filename* has a supported extension."""
    ext = _get_extension(filename)
    return ext in SUPPORTED_EXTENSIONS


def extract_text(file_path: str) -> str:
    """
    Extract plain text from *file_path*.
    Returns at most MAX_CHARS characters of text.
    Raises FileNotFoundError or ValueError on failure.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = _get_extension(file_path)
    _validate_magic_bytes(file_path, ext)

    if ext == ".pdf":
        raw = _read_pdf(file_path)
    elif ext == ".docx":
        raw = _read_docx(file_path)
    elif ext in (".txt", ".md"):
        raw = _read_txt(file_path)
    elif ext == ".csv":
        raw = _read_csv(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    return raw[:MAX_CHARS]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_extension(path: str) -> str:
    return os.path.splitext(path)[1].lower()


def _validate_magic_bytes(file_path: str, ext: str) -> None:
    """
    Check header bytes to prevent mismatched or disguised executable files.
    """
    if ext in (".txt", ".md", ".csv"):
        return

    try:
        with open(file_path, "rb") as fh:
            header = fh.read(8)
    except OSError as exc:
        raise ValueError(f"Could not read file header: {exc}") from exc

    if ext == ".pdf":
        if not header.startswith(b"%PDF"):
            raise ValueError("File does not have a valid PDF header (%PDF).")
    elif ext == ".docx":
        if not header.startswith(b"PK"):
            raise ValueError("File does not appear to be a valid DOCX document (missing PK zip header).")


def _read_pdf(file_path: str) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ValueError("pypdf is not installed — cannot read PDF.") from exc

    try:
        reader = PdfReader(file_path)
    except Exception as exc:
        raise ValueError(f"Unable to open PDF: {exc}") from exc

    chunks: List[str] = []
    for page_num, page in enumerate(reader.pages, start=1):
        try:
            page_text = page.extract_text() or ""
        except Exception:
            continue
        if page_text.strip():
            chunks.append(page_text.strip())

    if not chunks:
        raise ValueError(
            "No readable text found in the PDF. It may be scanned or image-based."
        )

    return "\n\n".join(chunks).strip()


def _read_docx(file_path: str) -> str:
    try:
        from docx import Document
    except ImportError as exc:
        raise ValueError("python-docx is not installed — cannot read DOCX.") from exc

    try:
        doc = Document(file_path)
    except Exception as exc:
        raise ValueError(f"Unable to open DOCX file: {exc}") from exc

    chunks: List[str] = []

    # Paragraphs
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            chunks.append(text)

    # Tables
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                chunks.append(" | ".join(cells))

    # Headers & Footers
    for section in doc.sections:
        for hdr_ftr in (section.header, section.footer):
            if hdr_ftr is not None:
                for para in hdr_ftr.paragraphs:
                    text = para.text.strip()
                    if text and text not in chunks:
                        chunks.append(text)

    if not chunks:
        raise ValueError("No readable text found in the DOCX file.")

    return "\n\n".join(chunks).strip()


def _read_txt(file_path: str) -> str:
    """Try utf-8-sig -> utf-8 -> latin-1 -> cp1252."""
    for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            with open(file_path, "r", encoding=encoding) as fh:
                content = fh.read().strip()
            if content:
                return content
        except (UnicodeDecodeError, LookupError):
            continue

    raise ValueError("Could not decode file with supported text encodings.")


def _read_csv(file_path: str) -> str:
    """Read CSV file and format as markdown-style table or rows."""
    text = _read_txt(file_path)
    reader = csv.reader(io.StringIO(text))
    lines: List[str] = []
    for row in reader:
        if row:
            lines.append(" | ".join(cell.strip() for cell in row))
    return "\n".join(lines).strip()