"""
test_api.py — Comprehensive automated test suite for Copilot AI Workspace Assistant.
"""

import io
import json
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import pytest
from app import app, doc_library
from document import allowed_file, extract_text
from rag_engine import DocumentLibrary, OfflineIntelligence, chunk_text, rank_relevant_chunks


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_allowed_extensions():
    assert allowed_file("report.pdf") is True
    assert allowed_file("notes.docx") is True
    assert allowed_file("data.txt") is True
    assert allowed_file("readme.md") is True
    assert allowed_file("records.csv") is True
    assert allowed_file("malicious.exe") is False
    assert allowed_file("script.py") is False


def test_chunking_and_retrieval():
    sample_text = (
        "Project Copilot is an AI Workspace Assistant designed to streamline enterprise productivity.\n\n"
        "Key Deliverables:\n"
        "1. Document Summarization via local Ollama models.\n"
        "2. Automated Email Drafting for executive briefings.\n"
        "3. Action Item Extraction from meeting notes and roadmaps.\n\n"
        "Security and Privacy:\n"
        "All data processing occurs locally on premise with zero cloud telemetry. "
        "Sensitive documents never leave the enterprise firewall."
    )
    chunks = chunk_text(sample_text, target_chunk_words=30, overlap_words=5)
    assert len(chunks) >= 1

    # Query for security
    ranked = rank_relevant_chunks(chunks, "What are the security features?", top_k=2)
    assert len(ranked) > 0
    top_chunk_text = ranked[0][0].text
    assert "Security" in top_chunk_text or "privacy" in top_chunk_text.lower()


def test_offline_intelligence():
    sample_text = (
        "The team achieved 40% increase in productivity this quarter. "
        "We must complete the security audit by October 15. "
        "Action required to deploy the new microservices architecture."
    )
    # Test answer question
    ans = OfflineIntelligence.answer_question("What was the productivity increase?", sample_text, "report.pdf")
    assert "productivity" in ans.lower()

    # Test summary
    summary = OfflineIntelligence.summarize(sample_text, "quarterly.docx")
    assert "Executive Summary" in summary

    # Test email
    email = OfflineIntelligence.generate_email(sample_text, "quarterly.docx")
    assert "Subject:" in email

    # Test action items
    tasks = OfflineIntelligence.extract_action_items(sample_text, "quarterly.docx")
    assert "- [ ]" in tasks


def test_health_and_status_endpoints(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "ollama_reachable" in data
    assert "mode" in data

    res = client.get("/status")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "documentsCount" in data


def test_upload_and_chat_flow(client):
    # Upload a text file
    file_content = (
        b"Blackcoffer Microsoft Copilot AI Workspace Assistant.\n\n"
        b"The primary objective is to empower enterprise workers with an intuitive interface "
        b"for summarizing documents, drafting emails, extracting tasks, and answering questions."
    )
    data = {
        "file": (io.BytesIO(file_content), "test_workspace.txt")
    }
    res = client.post("/upload", data=data, content_type="multipart/form-data")
    assert res.status_code == 200
    upload_data = res.get_json()
    assert upload_data["success"] is True
    assert upload_data["filename"] == "test_workspace.txt"
    assert upload_data["wordCount"] > 0

    # Test document listing
    res = client.get("/documents")
    docs = res.get_json()["documents"]
    assert len(docs) >= 1

    # Test chat with context
    res = client.post("/chat", json={
        "question": "What is the primary objective of this project?",
        "tone": "balanced"
    })
    assert res.status_code == 200
    chat_data = res.get_json()
    assert chat_data["success"] is True
    assert "answer" in chat_data
    assert len(chat_data["answer"]) > 10

    # Test summarize
    res = client.post("/summarize")
    assert res.status_code == 200
    sum_data = res.get_json()
    assert sum_data["success"] is True

    # Test email
    res = client.post("/email")
    assert res.status_code == 200
    email_data = res.get_json()
    assert email_data["success"] is True

    # Test tasks
    res = client.post("/tasks")
    assert res.status_code == 200
    tasks_data = res.get_json()
    assert tasks_data["success"] is True

    # Test clear
    res = client.post("/clear")
    assert res.status_code == 200


def test_groq_and_models(client):
    res = client.get("/models")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "models" in data
    assert "currentModel" in data
    assert "openai/gpt-oss-120b" in data["currentModel"] or "llama" in data["currentModel"]

