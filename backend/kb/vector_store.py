import chromadb
from sentence_transformers import SentenceTransformer
from backend.core import config

def get_chroma_client():
    """Initializes and returns the ChromaDB persistent client."""
    return chromadb.PersistentClient(path=str(config.CHROMA_DB_DIR))

def get_embedding_model():
    """Initializes and returns the sentence-transformer model."""
    return SentenceTransformer(config.EMBEDDING_MODEL)
