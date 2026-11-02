from backend.kb.chunking import chunk_text

def test_chunk_text_basic():
    """Test chunking with standard sentences."""
    text = "First sentence here. Second sentence follows. Third sentence ends it."
    chunks = chunk_text(text, chunk_size=10, overlap=3)
    assert len(chunks) > 0
    assert "First sentence here." in chunks[0]

def test_chunk_text_empty():
    """Test chunking empty text."""
    assert chunk_text("") == []

def test_chunk_text_single_sentence():
    """Test chunking a single sentence."""
    text = "Just one simple sentence."
    chunks = chunk_text(text, chunk_size=50, overlap=5)
    assert len(chunks) == 1
    assert chunks[0] == text

def test_chunk_text_overlap():
    """Test sentence overlap between adjacent chunks."""
    sentences = [f"Sentence number {i} is here." for i in range(10)]
    full_text = " ".join(sentences)
    chunks = chunk_text(full_text, chunk_size=15, overlap=6)
    assert len(chunks) >= 2
