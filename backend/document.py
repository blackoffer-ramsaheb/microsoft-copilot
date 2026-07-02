"""
document.py — Robust text extraction for PDF, DOCX, and TXT files.

Improvements over original:
- DOCX tables + headers/footers are now extracted
- TXT tries utf-8-sig (BOM), utf-8, latin-1 in order
- Magic-byte validation for PDF and DOCX (defence against renamed files)
- Extracted text is capped at MAX_CHARS to avoid LLM overload
- All exceptions translated to descriptive ValueError messages
"""

from __future__ import annotations

import os

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SUPPORTED_EXTENSIONS: frozenset[str] = frozenset({".pdf", ".docx", ".txt"})

# Cap extracted text at ~15 000 words (≈ 90 000 chars) so the LLM prompt
# stays manageable.  Increase if you run a model with a very large context.
MAX_CHARS: int = 90_000


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

    # Magic-byte check: guard against renamed executables / wrong formats
    _validate_magic_bytes(file_path, ext)

    if ext == ".pdf":
        raw = _read_pdf(file_path)
    elif ext == ".docx":
        raw = _read_docx(file_path)
    elif ext == ".txt":
        raw = _read_txt(file_path)
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
    Read the first few bytes and confirm the file matches its extension.
    Raises ValueError if the magic bytes don't match.
    """
    magic: dict[str, bytes] = {
        ".pdf":  b"%PDF",
        ".docx": b"PK\x03\x04",   # ZIP-based (OOXML)
    }
    expected = magic.get(ext)
    if expected is None:
        return  # .txt — no magic bytes to check

    try:
        with open(file_path, "rb") as fh:
            header = fh.read(len(expected))
    except OSError as exc:
        raise ValueError(f"Could not read file header: {exc}") from exc

    if header != expected:
        raise ValueError(
            f"File does not appear to be a valid {ext.upper()} file "
            f"(magic bytes mismatch). Please upload a real {ext.upper()}."
        )


def _read_pdf(file_path: str) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ValueError("pypdf is not installed — cannot read PDF.") from exc

    try:
        reader = PdfReader(file_path)
    except Exception as exc:
        raise ValueError(f"Unable to open PDF: {exc}") from exc

    chunks: list[str] = []
    for page_num, page in enumerate(reader.pages, start=1):
        try:
            page_text = page.extract_text() or ""
        except Exception:
            # Skip unreadable pages rather than crashing entirely
            continue
        if page_text.strip():
            chunks.append(page_text)

    if not chunks:
        raise ValueError(
            "No readable text was found in the PDF. "
            "It may be scanned or image-based."
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

    chunks: list[str] = []

    # Body paragraphs
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            chunks.append(text)

    # Tables (cells are often missed by paragraph-only extraction)
    for table in doc.tables:
        for row in table.rows:
            row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if row_cells:
                chunks.append(" | ".join(row_cells))

    # Headers & footers for each section
    for section in doc.sections:
        for hdr_ftr in (section.header, section.footer):
            if hdr_ftr is not None:
                for para in hdr_ftr.paragraphs:
                    text = para.text.strip()
                    if text:
                        chunks.append(text)

    if not chunks:
        raise ValueError("No readable text was found in the DOCX file.")

    return "\n".join(chunks).strip()


def _read_txt(file_path: str) -> str:
    """Try utf-8-sig → utf-8 → latin-1 encoding order."""
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            with open(file_path, "r", encoding=encoding) as fh:
                content = fh.read().strip()
            if content:
                return content
        except (UnicodeDecodeError, LookupError):
            continue

    raise ValueError(
        "Could not decode the TXT file with any supported encoding "
        "(tried utf-8-sig, utf-8, latin-1)."
    )