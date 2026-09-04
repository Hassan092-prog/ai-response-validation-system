import chromadb
from sentence_transformers import SentenceTransformer
from backend.core import config
from functools import lru_cache

def get_chroma_client():
    """Initializes and returns the ChromaDB persistent client."""
    return chromadb.PersistentClient(path=str(config.CHROMA_DB_DIR))

@lru_cache(maxsize=1)
def get_embedding_model():
    """Initializes and returns the sentence-transformer model (cached)."""
    return SentenceTransformer(config.EMBEDDING_MODEL)
