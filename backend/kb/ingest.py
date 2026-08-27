from datasets import load_dataset
from backend.kb.chunking import chunk_text

def process_squad(limit=50):
    """Loads SQuAD dataset and yields chunks ready for vector DB."""
    print("Loading SQuAD dataset...")
    dataset = load_dataset("squad", split=f"train[:{limit}]")
    
    docs = []
    metadatas = []
    ids = []
    
    for item in dataset:
        context = item["context"]
        question = item["question"]
        answer = item["answers"]["text"][0] if item["answers"]["text"] else ""
        
        chunks = chunk_text(context)
        for j, chunk in enumerate(chunks):
            doc_id = f"squad_{item['id']}_chunk_{j}"
            text_to_embed = f"Question: {question}\nAnswer: {answer}\nContext: {chunk}"
            
            docs.append(text_to_embed)
            metadatas.append({
                "dataset": "squad",
                "question": question,
                "chunk_id": j
            })
            ids.append(doc_id)
            
    return ids, docs, metadatas

def process_truthfulqa(limit=50):
    """Loads TruthfulQA dataset and yields items ready for vector DB."""
    print("Loading TruthfulQA dataset...")
    dataset = load_dataset("truthful_qa", "generation", split=f"validation[:{limit}]")
    
    docs = []
    metadatas = []
    ids = []
    
    for i, item in enumerate(dataset):
        question = item["question"]
        best_answer = item["best_answer"]
        
        doc_id = f"truthfulqa_{i}"
        text_to_embed = f"Question: {question}\nAnswer: {best_answer}"
        
        docs.append(text_to_embed)
        metadatas.append({
            "dataset": "truthful_qa",
            "question": question
        })
        ids.append(doc_id)
        
    return ids, docs, metadatas
