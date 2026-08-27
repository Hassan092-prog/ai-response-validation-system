import sys
from pathlib import Path

# Add project root to path so we can import from backend
sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.core import config
from backend.kb.vector_store import get_chroma_client, get_embedding_model

def test_retrieval(query, top_k=3):
    print(f"\n--- Testing Retrieval ---")
    print(f"Query: '{query}'")
    
    # Initialize DB and Model using our new modular functions
    client = get_chroma_client()
    try:
        collection = client.get_collection("knowledge_base")
    except ValueError:
        print("Error: knowledge_base collection not found. Did you run setup_kb.py?")
        return

    model = get_embedding_model()
    
    # Generate embedding for query
    query_embedding = model.encode([query]).tolist()
    
    # Query ChromaDB
    results = collection.query(
        query_embeddings=query_embedding,
        n_results=top_k
    )
    
    print(f"\nTop {top_k} Results:")
    for i in range(len(results['ids'][0])):
        doc_id = results['ids'][0][i]
        distance = results['distances'][0][i]
        document = results['documents'][0][i]
        metadata = results['metadatas'][0][i]
        
        print(f"\nResult {i+1} (ID: {doc_id}, Distance: {distance:.4f})")
        print(f"Dataset: {metadata.get('dataset')}")
        print(f"Content:\n{document}")

if __name__ == "__main__":
    sample_queries = [
        "What is the capital of France?", # Might not be in the 100 sample chunks, let's see
        "To whom did the Virgin Mary allegedly appear in 1858 in Lourdes France?", # A SQuAD question
        "What happens if you crack your knuckles a lot?" # A TruthfulQA question
    ]
    
    for q in sample_queries:
        test_retrieval(q)
