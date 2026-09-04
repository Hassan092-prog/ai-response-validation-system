import re
from backend.core import config

def chunk_text(text, chunk_size=config.CHUNK_SIZE, overlap=config.CHUNK_OVERLAP):
    """
    Splits a long text into smaller chunks for the vector database.
    This upgraded version uses a sentence-aware approach to avoid splitting sentences in half,
    which drastically improves the semantic quality of the embeddings for RAG.
    """
    # Split text into sentences based on punctuation (. ! ?)
    # The regex (?<=[.!?]) looks behind for punctuation, then \s+ matches the space following it.
    sentences = re.split(r'(?<=[.!?])\s+', text)
    
    chunks = []
    current_chunk = []
    current_length = 0
    
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
            
        sentence_words = sentence.split()
        sentence_length = len(sentence_words)
        
        # If adding this sentence exceeds chunk size (and the chunk isn't empty)
        if current_length + sentence_length > chunk_size and current_chunk:
            # Save the current chunk
            chunks.append(" ".join(current_chunk))
            
            # Build the overlap for the next chunk using whole sentences
            overlap_chunk = []
            overlap_length = 0
            for prev_sentence in reversed(current_chunk):
                prev_len = len(prev_sentence.split())
                if overlap_length + prev_len <= overlap:
                    overlap_chunk.insert(0, prev_sentence)
                    overlap_length += prev_len
                else:
                    break
                    
            current_chunk = overlap_chunk
            current_length = overlap_length
            
        current_chunk.append(sentence)
        current_length += sentence_length
        
    # Append the final chunk if anything is left over
    if current_chunk:
        chunks.append(" ".join(current_chunk))
        
    # Fallback: if a single sentence is incredibly long and we got no chunks, 
    # or the text had no punctuation, return the text directly.
    if not chunks and text:
        return [text]
        
    return chunks
