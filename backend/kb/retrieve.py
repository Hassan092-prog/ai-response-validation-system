import logging
from backend.kb.vector_store import get_chroma_client, get_embedding_model

logger = logging.getLogger(__name__)

def retrieve_context(question: str, top_k: int = 3) -> str:
    """
    Retrieves the most relevant chunks from ChromaDB for a given question.
    """
    try:
        client = get_chroma_client()
        collection = client.get_collection("knowledge_base")
        model = get_embedding_model()
        
        # 1. Embed the query
        query_embedding = model.encode(question).tolist()
        
        # 2. Query ChromaDB
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k
        )
        
        # 3. Format the retrieved documents into a single context string
        context_chunks = []
        if results and "documents" in results and results["documents"]:
            for i, doc in enumerate(results["documents"][0]):
                context_chunks.append(f"--- Document {i+1} ---\n{doc}")
                
        if not context_chunks:
            return "No relevant context found in the knowledge base."
            
        return "\n\n".join(context_chunks)
        
    except Exception as e:
        logger.error(f"Failed to retrieve context from ChromaDB: {e}")
        return "Failed to retrieve context from the knowledge base due to an error."
