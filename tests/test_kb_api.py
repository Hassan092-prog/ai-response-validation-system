import io
from unittest.mock import MagicMock, patch
import pytest
import numpy as np


class MockChromaCollection:
    def __init__(self):
        self.ids = ["doc_test1_c0", "doc_test1_c1", "doc_test2_c0"]
        self.documents = [
            "Photosynthesis is the process by which green plants make food.",
            "Chlorophyll absorbs light energy from the sun.",
            "Mitochondria are the powerhouse of the eukaryotic cell."
        ]
        self.metadatas = [
            {
                "doc_id": "doc_test1",
                "filename": "biology_plants.txt",
                "chunk_index": 0,
                "uploaded_at": "2026-11-02 10:00:00 UTC"
            },
            {
                "doc_id": "doc_test1",
                "filename": "biology_plants.txt",
                "chunk_index": 1,
                "uploaded_at": "2026-11-02 10:00:00 UTC"
            },
            {
                "doc_id": "doc_test2",
                "filename": "cell_biology.txt",
                "chunk_index": 0,
                "uploaded_at": "2026-11-02 10:30:00 UTC"
            }
        ]

    def count(self):
        return len(self.ids)

    def get(self, include=None, where=None):
        return {
            "ids": list(self.ids),
            "documents": list(self.documents),
            "metadatas": list(self.metadatas),
        }

    def add(self, ids, documents, metadatas, embeddings=None):
        self.ids.extend(ids)
        self.documents.extend(documents)
        self.metadatas.extend(metadatas)

    def delete(self, ids):
        keep_indices = [i for i, cid in enumerate(self.ids) if cid not in ids]
        self.ids = [self.ids[i] for i in keep_indices]
        self.documents = [self.documents[i] for i in keep_indices]
        self.metadatas = [self.metadatas[i] for i in keep_indices]

    def query(self, query_embeddings=None, query_texts=None, n_results=5, include=None):
        k = min(n_results, len(self.ids))
        return {
            "ids": [self.ids[:k]],
            "documents": [self.documents[:k]],
            "metadatas": [self.metadatas[:k]],
            "distances": [[0.15] * k],
        }


class MockSentenceTransformer:
    def encode(self, texts):
        if isinstance(texts, str):
            return np.zeros(384)
        return np.zeros((len(texts), 384))


@pytest.fixture
def mock_kb():
    col = MockChromaCollection()
    emb = MockSentenceTransformer()
    client = MagicMock()
    client.get_or_create_collection.return_value = col

    with patch("backend.kb.vector_store.get_chroma_client", return_value=client), \
         patch("backend.kb.vector_store.get_embedding_model", return_value=emb), \
         patch("backend.kb.vector_store.get_kb_collection", return_value=col):
        yield col


# ==============================================================================
# 1. GET /api/kb/status Tests
# ==============================================================================

def test_kb_status_available(client, mock_kb):
    """Returns 200 with total chunks, documents count, and model name."""
    res = client.get("/api/kb/status")
    assert res.status_code == 200
    data = res.json()
    assert data["available"] is True
    assert data["collection_name"] == "knowledge_base"
    assert data["total_chunks"] == 3
    assert data["total_documents"] == 2
    assert "embedding_model" in data


def test_kb_status_unavailable(client):
    """Returns 503 when ChromaDB or SentenceTransformers cannot initialize."""
    with patch("backend.kb.vector_store.get_chroma_client", return_value=None), \
         patch("backend.kb.vector_store.get_embedding_model", return_value=None):
        res = client.get("/api/kb/status")
        assert res.status_code == 503
        data = res.json()
        assert data["available"] is False
        assert "not available" in data["reason"].lower()


# ==============================================================================
# 2. GET /api/kb/documents Tests
# ==============================================================================

def test_kb_list_documents(client, mock_kb):
    """Aggregates chunk entries into distinct documents with sample previews."""
    res = client.get("/api/kb/documents")
    assert res.status_code == 200
    data = res.json()
    assert data["total_documents"] == 2
    assert data["total_chunks"] == 3

    docs = {d["doc_id"]: d for d in data["documents"]}
    assert "doc_test1" in docs
    assert docs["doc_test1"]["chunk_count"] == 2
    assert docs["doc_test1"]["filename"] == "biology_plants.txt"
    assert "Photosynthesis" in docs["doc_test1"]["sample_preview"]

    assert "doc_test2" in docs
    assert docs["doc_test2"]["chunk_count"] == 1
    assert docs["doc_test2"]["filename"] == "cell_biology.txt"


def test_kb_list_documents_when_unavailable(client):
    """Returns 503 when vector store client is unavailable."""
    with patch("backend.kb.vector_store.get_chroma_client", return_value=None):
        res = client.get("/api/kb/documents")
        assert res.status_code == 503


# ==============================================================================
# 3. POST /api/kb/upload Tests
# ==============================================================================

def test_kb_upload_text_success(client, mock_kb):
    """Uploads a valid text file, chunks it, and ingests into ChromaDB."""
    sample_text = (
        "Quantum computing is a multidisciplinary field comprising aspects of computer science, "
        "physics, and mathematics that utilizes quantum mechanics to solve complex problems faster "
        "than on classical computers."
    )
    files = {"file": ("quantum_intro.txt", io.BytesIO(sample_text.encode("utf-8")), "text/plain")}

    res = client.post("/api/kb/upload", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["filename"] == "quantum_intro.txt"
    assert data["chunks_added"] >= 1
    assert data["doc_id"].startswith("doc_")

    # Verify collection state grew
    assert mock_kb.count() > 3


def test_kb_upload_unsupported_format(client, mock_kb):
    """Rejects unsupported file types with HTTP 400."""
    files = {"file": ("malicious.exe", io.BytesIO(b"\x4d\x5a\x90\x00"), "application/octet-stream")}
    res = client.post("/api/kb/upload", files=files)
    assert res.status_code == 400
    assert "Unsupported file format" in res.json()["detail"]


def test_kb_upload_empty_file(client, mock_kb):
    """Rejects empty text file with HTTP 400."""
    files = {"file": ("empty.txt", io.BytesIO(b"   \n\n  "), "text/plain")}
    res = client.post("/api/kb/upload", files=files)
    assert res.status_code == 400
    assert "no extractable text" in res.json()["detail"].lower()


def test_kb_upload_when_unavailable(client):
    """Returns 503 when vector store is unavailable."""
    with patch("backend.kb.vector_store.get_chroma_client", return_value=None):
        files = {"file": ("notes.txt", io.BytesIO(b"Hello world"), "text/plain")}
        res = client.post("/api/kb/upload", files=files)
        assert res.status_code == 503


# ==============================================================================
# 4. DELETE /api/kb/documents/{doc_id} Tests
# ==============================================================================

def test_kb_delete_document_success(client, mock_kb):
    """Deletes all chunks associated with the specified doc_id."""
    initial_count = mock_kb.count()
    res = client.delete("/api/kb/documents/doc_test1")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["deleted_doc_id"] == "doc_test1"
    assert data["chunks_deleted"] == 2
    assert mock_kb.count() == initial_count - 2


def test_kb_delete_document_not_found(client, mock_kb):
    """Returns 404 when attempting to delete a nonexistent document."""
    res = client.delete("/api/kb/documents/non_existent_doc_id")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_kb_delete_when_unavailable(client):
    """Returns 503 when vector store is unavailable."""
    with patch("backend.kb.vector_store.get_chroma_client", return_value=None):
        res = client.delete("/api/kb/documents/any_doc")
        assert res.status_code == 503


# ==============================================================================
# 5. POST /api/kb/search Tests
# ==============================================================================

def test_kb_search_semantic_query(client, mock_kb):
    """Runs semantic vector search and formats similarity percentage."""
    payload = {"query": "How do plants make energy?", "top_k": 2}
    res = client.post("/api/kb/search", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["query"] == payload["query"]
    assert len(data["results"]) == 2

    first_hit = data["results"][0]
    assert "chunk_id" in first_hit
    assert "text" in first_hit
    assert "similarity_score" in first_hit
    assert first_hit["similarity_score"] == 85.0  # round(max(0, 1 - 0.15) * 100, 1) = 85.0
    assert first_hit["distance"] == 0.15


def test_kb_search_empty_query(client, mock_kb):
    """Empty query returns empty results gracefully without crashing."""
    payload = {"query": "   ", "top_k": 5}
    res = client.post("/api/kb/search", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["results"] == []
    assert data["count"] == 0


def test_kb_search_when_unavailable(client):
    """Returns 503 when embedding model or Chroma client is unavailable."""
    with patch("backend.kb.vector_store.get_chroma_client", return_value=None):
        payload = {"query": "Test query", "top_k": 3}
        res = client.post("/api/kb/search", json=payload)
        assert res.status_code == 503


# ==============================================================================
# 6. Fallback and Retrieval Defensive Edge Cases
# ==============================================================================

def test_kb_list_documents_missing_metadata(client, mock_kb):
    """Gracefully handles chunks with empty or missing metadata dictionaries."""
    mock_kb.ids.append("doc_orphan_c0")
    mock_kb.documents.append("Orphan document text without metadata")
    mock_kb.metadatas.append(None)

    res = client.get("/api/kb/documents")
    assert res.status_code == 200
    data = res.json()
    assert any(d["doc_id"] == "unnamed_document" for d in data["documents"])


def test_retrieve_context_with_safe_bounding(mock_kb):
    """retrieve_context bounds top_k by collection count without throwing."""
    from backend.kb.retrieve import retrieve_context

    # Top-K requested is 10, but mock collection only has 3 items
    ctx = retrieve_context("Explain photosynthesis", top_k=10)
    assert "--- Document 1 ---" in ctx
    assert "Photosynthesis" in ctx


def test_retrieve_context_empty_collection():
    """retrieve_context returns friendly message when collection is empty."""
    from backend.kb.retrieve import retrieve_context

    empty_col = MagicMock()
    empty_col.count.return_value = 0

    with patch("backend.kb.vector_store.get_kb_collection", return_value=empty_col):
        msg = retrieve_context("Any question")
        assert "no relevant context found" in msg.lower()


def test_retrieve_context_vector_store_unavailable():
    """retrieve_context returns cloud fallback notice when vector store is unavailable."""
    from backend.kb.retrieve import retrieve_context

    with patch("backend.kb.vector_store.get_kb_collection", return_value=None):
        msg = retrieve_context("Any question")
        assert "lightweight cloud mode" in msg.lower()


