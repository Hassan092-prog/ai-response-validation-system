from backend.core import config
from functools import lru_cache

def get_chroma_client():
    """Initializes and returns the ChromaDB persistent client."""
    try:
        import chromadb
        return chromadb.PersistentClient(path=str(config.CHROMA_DB_DIR))
    except (ImportError, Exception):
        return None

@lru_cache(maxsize=1)
def get_embedding_model():
    """Initializes and returns the sentence-transformer model (cached)."""
    try:
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer(config.EMBEDDING_MODEL)
    except (ImportError, Exception):
        return None

def get_kb_collection(collection_name: str = "knowledge_base"):
    """Initializes and returns the ChromaDB collection."""
    client = get_chroma_client()
    if not client:
        return None
    try:
        return client.get_or_create_collection(name=collection_name)
    except Exception:
        return None
