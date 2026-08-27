from backend.core import config

def chunk_text(text, chunk_size=config.CHUNK_SIZE, overlap=config.CHUNK_OVERLAP):
    """
    Splits a long text into smaller chunks for the vector database.
    We use a simple word-based chunker with overlap to ensure context isn't lost at the boundaries.
    """
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return chunks
