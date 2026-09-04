import sys
import pytest
from pathlib import Path

# Add project root to path so we can import from backend
sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.kb.vector_store import get_chroma_client, get_embedding_model

@pytest.fixture(scope="module")
def chroma_collection():
    """Fixture to provide the ChromaDB collection to tests."""
    client = get_chroma_client()
    try:
        collection = client.get_collection("knowledge_base")
        return collection
    except ValueError:
        pytest.fail("knowledge_base collection not found. Did you run setup_kb.py?")

@pytest.fixture(scope="module")
def embedding_model():
    """Fixture to provide the embedding model to tests."""
    return get_embedding_model()

def test_chroma_collection_exists(chroma_collection):
    """Test that the collection is successfully initialized and has documents."""
    assert chroma_collection is not None
    assert chroma_collection.count() > 0, "Collection is empty."

def test_retrieval_returns_results(chroma_collection, embedding_model):
    """Test that querying the DB returns results with distances."""
    query = "What happens if you crack your knuckles a lot?"
    query_embedding = embedding_model.encode([query]).tolist()
    
    results = chroma_collection.query(
        query_embeddings=query_embedding,
        n_results=3
    )
    
    assert 'ids' in results
    assert 'distances' in results
    assert 'documents' in results
    
    # Check that we got 3 results back
    assert len(results['ids'][0]) > 0
    assert len(results['distances'][0]) > 0
    
    # Check that distances are reasonable (e.g. not identical/0 if not same text, and under 1.5 distance)
    # Cosine distance for all-MiniLM typically falls under 1.5 for related semantic similarity
    distance = results['distances'][0][0]
    assert distance < 1.5, f"The match distance {distance} is too far!"
