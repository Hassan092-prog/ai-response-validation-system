import sys
from pathlib import Path

# Add project root to path so we can import from backend
project_root = Path(__file__).resolve().parent.parent
sys.path.append(str(project_root))

from backend.core import config
from backend.kb.vector_store import get_chroma_client, get_embedding_model
from backend.kb.ingest import process_squad, process_truthfulqa

def insert_into_chroma(collection, model, ids, docs, metadatas, dataset_name):
    print(f"Embedding and inserting {len(docs)} {dataset_name} records...")
    embeddings = model.encode(docs).tolist()
    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=docs,
        metadatas=metadatas
    )
    print(f"{dataset_name} insertion complete.")

def main():
    print("Initializing embedding model and database...")
    model = get_embedding_model()
    client = get_chroma_client()
    
    collection_name = "knowledge_base"
    try:
        client.delete_collection(name=collection_name)
    except ValueError:
        pass
        
    collection = client.create_collection(name=collection_name)
    print(f"Created clean collection: {collection_name}")
    
    # Process SQuAD
    ids, docs, metas = process_squad(limit=100)
    insert_into_chroma(collection, model, ids, docs, metas, "SQuAD")
    
    # Process TruthfulQA
    ids, docs, metas = process_truthfulqa(limit=100)
    insert_into_chroma(collection, model, ids, docs, metas, "TruthfulQA")
    
    print(f"\nKnowledge base setup complete! DB stored at: {config.CHROMA_DB_DIR}")

if __name__ == "__main__":
    main()
