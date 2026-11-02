from fastapi import FastAPI, Depends, Request, BackgroundTasks, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, JSONResponse
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
import os
import time
import json
import io
import csv

try:
    import pypdf
except ImportError:
    pypdf = None

try:
    import docx
except ImportError:
    docx = None

from backend.api import models, schemas, database, kb_schemas
from backend.core import config
from backend.core.config import logger
from backend.core.orchestrator import process_evaluation_task
from backend.core.batch_orchestrator import evaluate_batch_row
from backend.core.config_weights import get_global_weights, set_global_weights
from backend.core.cache import compute_input_hash, lookup_cache, clone_cached_record
import uuid

logger.info("Starting AI Response Validation API...")

models.Base.metadata.create_all(bind=database.engine)
logger.info("Database tables verified/created.")

app = FastAPI(
    title="AI Response Validation API",
    description="Backend API for AI Response Validation System"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    formatted_process_time = '{0:.2f}'.format(process_time)
    logger.info(f"path={request.url.path} method={request.method} status_code={response.status_code} process_time={formatted_process_time}ms")
    return response

@app.get("/api/health")
def health_check():
    logger.info("Health check endpoint called.")
    from backend.core.providers import get_active_provider
    provider = get_active_provider()
    return {
        "status": "healthy",
        "version": "1.0.0",
        "llm_provider": provider.provider_name,
        "llm_model": provider.model_name,
    }

@app.get("/api/config/weights")
def api_get_weights():
    return get_global_weights()

@app.post("/api/config/weights")
def api_set_weights(weights: dict):
    set_global_weights(weights)
    return {"status": "success", "weights": weights}

def extract_text_from_bytes(filename: str, content: bytes) -> str:
    """Helper to extract text from raw file bytes (PDF, DOCX, TXT, MD)."""
    fn = filename.lower()
    extracted_text = ""
    if fn.endswith(".pdf"):
        if pypdf is None:
            raise HTTPException(status_code=500, detail="pypdf library is not installed on the server.")
        pdf_reader = pypdf.PdfReader(io.BytesIO(content))
        for page in pdf_reader.pages:
            text = page.extract_text()
            if text:
                extracted_text += text + "\n"
    elif fn.endswith(".docx"):
        if docx is None:
            raise HTTPException(status_code=500, detail="python-docx library is not installed on the server.")
        doc = docx.Document(io.BytesIO(content))
        for para in doc.paragraphs:
            extracted_text += para.text + "\n"
    elif fn.endswith(".txt") or fn.endswith(".md"):
        extracted_text = content.decode("utf-8", errors="replace")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF, DOCX, TXT, or MD.")
    return extracted_text.strip()

@app.post("/api/extract-text")
async def extract_text(file: UploadFile = File(...)):
    """Extracts text from uploaded PDF, DOCX, or TXT files."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    content = await file.read()
    try:
        text = extract_text_from_bytes(file.filename, content)
        return {"extracted_text": text}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error extracting text from {file.filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

@app.post("/api/evaluate", response_model=schemas.EvaluationResponse)
def submit_evaluation(eval_input: schemas.EvaluationInput, background_tasks: BackgroundTasks, db: Session = Depends(database.get_db)):
    logger.info(f"Received evaluation submission: question='{eval_input.question[:30]}...'")
    try:
        # 1. Exact-Match Smart Caching via canonical SHA-256 hash
        input_hash = compute_input_hash(
            eval_input.question,
            eval_input.ai_response,
            eval_input.reference_answer,
            eval_input.source_document
        )
        cached = lookup_cache(db, input_hash)
        if cached:
            logger.info(f"Cache HIT for hash {input_hash[:12]}...! Returning instant evaluation.")
            cached_record = clone_cached_record(cached)
            db.add(cached_record)
            db.commit()
            db.refresh(cached_record)
            return {
                "id": cached_record.id,
                "message": "Evaluation returned instantly from cache.",
                "cached": True
            }

        # 2. Save New Pending Record
        db_record = models.EvaluationRecord(
            question=eval_input.question,
            ai_response=eval_input.ai_response,
            reference_answer=eval_input.reference_answer,
            source_document=eval_input.source_document,
            input_hash=input_hash,
            is_cached=False,
            status="pending"
        )
        
        db.add(db_record)
        db.commit()
        db.refresh(db_record)
        
        # 3. Trigger background processing
        background_tasks.add_task(process_evaluation_task, db_record.id)
        
        logger.info(f"Successfully saved and queued evaluation ID {db_record.id}")
        return {"id": db_record.id, "message": "Evaluation queued for processing.", "cached": False}
    except Exception as e:
        logger.error(f"Error saving evaluation: {e}")
        db.rollback()
        raise

def process_batch_background(batch_id: str):
    """Background task to process a batch using the consolidated orchestrator to save API quota."""
    from backend.api.database import SessionLocal
    db = SessionLocal()
    try:
        records = db.query(models.EvaluationRecord).filter(models.EvaluationRecord.batch_id == batch_id).all()
        for record in records:
            try:
                # 1. Update status
                record.status = "processing"
                db.commit()
                
                # 2. Check Cache
                if not record.input_hash:
                    record.input_hash = compute_input_hash(
                        record.question,
                        record.ai_response,
                        record.reference_answer,
                        record.source_document
                    )
                
                cached = lookup_cache(db, record.input_hash, exclude_id=record.id)
                if cached:
                    logger.info(f"Batch row {record.id}: Cache HIT! Skipping LLM inference.")
                    record.status = "completed"
                    record.is_cached = True
                    record.result_json = cached.result_json
                    record.final_score = cached.final_score
                    record.score_relevance = cached.score_relevance
                    record.score_accuracy = cached.score_accuracy
                    record.score_completeness = cached.score_completeness
                    record.score_hallucination = cached.score_hallucination
                    db.commit()
                    continue
                
                # 3. Process using Consolidated Batch Orchestrator
                result = evaluate_batch_row(
                    record_id=record.id,
                    question=record.question,
                    ai_response=record.ai_response,
                    reference_answer=record.reference_answer,
                    source_document=record.source_document
                )
                
                # 4. Save result
                record.status = "completed"
                record.is_cached = False
                record.result_json = json.dumps(result)
                record.final_score = result.get("final_score")
                
                breakdown = result.get("breakdown", {})
                record.score_relevance = breakdown.get("relevance", {}).get("score")
                record.score_accuracy = breakdown.get("accuracy", {}).get("score")
                record.score_completeness = breakdown.get("completeness", {}).get("score")
                record.score_hallucination = breakdown.get("hallucination", {}).get("score")
                
                db.commit()
                
                # 5. Optimized 5 second delay to utilize the 15 RPM Free Tier Limit safely
                time.sleep(5)
                
            except Exception as e:
                logger.error(f"Error processing batch row {record.id}: {e}")
                record.status = "failed"
                record.result_json = json.dumps({"error": str(e)})
                db.commit()
    finally:
        db.close()

@app.post("/api/evaluate/batch")
async def submit_batch(file: UploadFile = File(...), background_tasks: BackgroundTasks = BackgroundTasks(), db: Session = Depends(database.get_db)):
    """Accepts a CSV file of evaluations and processes them in the background."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Must upload a CSV file.")
        
    content = await file.read()
    csv_text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(csv_text))
    
    batch_id = str(uuid.uuid4())
    records_to_process = []
    
    for row in reader:
        question = row.get("question")
        ai_response = row.get("ai_response")
        
        if not question or not ai_response:
            continue # Skip invalid rows
            
        input_hash = compute_input_hash(
            question,
            ai_response,
            row.get("reference_answer"),
            row.get("source_document")
        )

        db_record = models.EvaluationRecord(
            question=question,
            ai_response=ai_response,
            reference_answer=row.get("reference_answer"),
            source_document=row.get("source_document"),
            status="pending",
            input_hash=input_hash,
            is_cached=False,
            batch_id=batch_id
        )
        db.add(db_record)
        records_to_process.append(db_record)
        
    db.commit()
        
    background_tasks.add_task(process_batch_background, batch_id)
    
    return {
        "batch_id": batch_id, 
        "message": f"Successfully queued {len(records_to_process)} records for processing. This will take approx {len(records_to_process) * 20} seconds due to rate limits."
    }

@app.get("/api/batch/{batch_id}")
def get_batch_status(batch_id: str, db: Session = Depends(database.get_db)):
    """Returns the progress and results of a specific batch."""
    records = db.query(models.EvaluationRecord).filter(models.EvaluationRecord.batch_id == batch_id).all()
    if not records:
        raise HTTPException(status_code=404, detail="Batch not found")
        
    total = len(records)
    completed = sum(1 for r in records if r.status in ["completed", "failed"])
    
    results = []
    for r in records:
        result_data = None
        if r.result_json:
            try:
                result_data = json.loads(r.result_json)
            except Exception:
                pass
                
        results.append({
            "id": r.id,
            "status": r.status,
            "is_cached": bool(r.is_cached),
            "question": r.question,
            "ai_response": r.ai_response,
            "reference_answer": r.reference_answer,
            "final_score": r.final_score,
            "score_accuracy": r.score_accuracy,
            "score_relevance": r.score_relevance,
            "score_completeness": r.score_completeness,
            "score_hallucination": r.score_hallucination,
            "result": result_data
        })
        
    return {
        "batch_id": batch_id,
        "progress": {
            "total": total,
            "completed": completed,
            "percent": round((completed / total) * 100) if total > 0 else 0
        },
        "records": results
    }

@app.get("/api/results/{eval_id}")
def get_evaluation_result(eval_id: int, db: Session = Depends(database.get_db)):
    record = db.query(models.EvaluationRecord).filter(models.EvaluationRecord.id == eval_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Evaluation not found")
        
    result_data = None
    if record.result_json:
        try:
            result_data = json.loads(record.result_json)
        except (json.JSONDecodeError, TypeError):
            result_data = {"error": "Failed to parse result JSON"}

    return {
        "id": record.id,
        "status": record.status,
        "is_cached": bool(record.is_cached),
        "question": record.question,
        "ai_response": record.ai_response,
        "reference_answer": record.reference_answer,
        "source_document": record.source_document,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "result": result_data
    }

@app.get("/api/evaluations/history")
def get_evaluation_history(page: int = 1, limit: int = 10, db: Session = Depends(database.get_db)):
    offset = (page - 1) * limit
    
    # Calculate KPI Stats
    total_evals = db.query(models.EvaluationRecord).count()
    total_singles = db.query(models.EvaluationRecord).filter(models.EvaluationRecord.batch_id.is_(None)).count()
    total_batches = db.query(models.EvaluationRecord.batch_id).filter(models.EvaluationRecord.batch_id.isnot(None)).distinct().count()

    # Fetch all to group in memory
    all_records = db.query(models.EvaluationRecord).order_by(models.EvaluationRecord.created_at.desc()).all()
    
    events = []
    seen_batches = set()
    
    for r in all_records:
        if r.batch_id:
            if r.batch_id not in seen_batches:
                seen_batches.add(r.batch_id)
                batch_records = [br for br in all_records if br.batch_id == r.batch_id]
                completed_count = sum(1 for br in batch_records if br.status in ["completed", "failed"])
                total_count = len(batch_records)
                
                events.append({
                    "id": r.batch_id,
                    "is_batch": True,
                    "question": "Batch CSV Upload",
                    "ai_response": f"Processed {completed_count} out of {total_count} responses",
                    "status": "completed" if completed_count == total_count else "processing",
                    "score": round(sum(br.final_score or 0 for br in batch_records) / completed_count) if completed_count > 0 else 0,
                    "accuracy": round(sum(br.score_accuracy or 0 for br in batch_records) / completed_count, 1) if completed_count > 0 else 0,
                    "relevance": round(sum(br.score_relevance or 0 for br in batch_records) / completed_count, 1) if completed_count > 0 else 0,
                    "hallucination": round(sum(br.score_hallucination or 0 for br in batch_records) / completed_count, 1) if completed_count > 0 else 0,
                    "created_at": r.created_at
                })
        else:
            events.append({
                "id": r.id,
                "is_batch": False,
                "is_cached": bool(r.is_cached),
                "question": r.question,
                "ai_response": r.ai_response,
                "status": r.status,
                "score": r.final_score,
                "accuracy": r.score_accuracy,
                "relevance": r.score_relevance,
                "hallucination": r.score_hallucination,
                "created_at": r.created_at
            })
            
    total_pages = (len(events) + limit - 1) // limit
    paginated_events = events[offset : offset + limit]
    
    return {
        "history": paginated_events,
        "total_pages": total_pages,
        "current_page": page,
        "total_records": len(events),
        "kpis": {
            "total_evaluations": total_evals,
            "total_singles": total_singles,
            "total_batches": total_batches
        }
    }

@app.get("/api/evaluations/analytics")
def get_analytics(
    batch_id: Optional[str] = None,
    min_score: Optional[int] = None,
    max_score: Optional[int] = None,
    db: Session = Depends(database.get_db)
):
    base_query = db.query(models.EvaluationRecord).filter(models.EvaluationRecord.status == "completed")
    
    if batch_id:
        base_query = base_query.filter(models.EvaluationRecord.batch_id == batch_id)
    if min_score is not None:
        base_query = base_query.filter(models.EvaluationRecord.final_score >= min_score)
    if max_score is not None:
        base_query = base_query.filter(models.EvaluationRecord.final_score <= max_score)

    total_evals = base_query.count()
    
    if total_evals == 0:
        return {
            "total_evaluations": 0,
            "average_score": 0,
            "radar_data": [],
            "time_series": [],
            "heatmap_data": [],
            "cache_stats": {
                "total_cached": 0,
                "cache_hit_rate_percent": 0.0
            }
        }
        
    avg_stats_query = db.query(
        func.avg(models.EvaluationRecord.final_score).label("avg_final"),
        func.avg(models.EvaluationRecord.score_relevance).label("avg_rel"),
        func.avg(models.EvaluationRecord.score_accuracy).label("avg_acc"),
        func.avg(models.EvaluationRecord.score_completeness).label("avg_comp"),
        func.avg(models.EvaluationRecord.score_hallucination).label("avg_hal")
    ).filter(models.EvaluationRecord.status == "completed")
    
    if batch_id:
        avg_stats_query = avg_stats_query.filter(models.EvaluationRecord.batch_id == batch_id)
    if min_score is not None:
        avg_stats_query = avg_stats_query.filter(models.EvaluationRecord.final_score >= min_score)
    if max_score is not None:
        avg_stats_query = avg_stats_query.filter(models.EvaluationRecord.final_score <= max_score)

    avg_stats = avg_stats_query.first()
    
    avg_final = round(avg_stats.avg_final or 0, 1)
    
    radar_data = [
        {"metric": "Relevance", "score": round((avg_stats.avg_rel or 0) * 20, 1)},
        {"metric": "Accuracy", "score": round((avg_stats.avg_acc or 0) * 20, 1)},
        {"metric": "Completeness", "score": round((avg_stats.avg_comp or 0) * 20, 1)},
        {"metric": "Hallucination", "score": round((avg_stats.avg_hal or 0) * 20, 1)}
    ]
    
    time_series_records = base_query.order_by(models.EvaluationRecord.created_at.asc()).all()
    
    time_series = [
        {"date": r.created_at.strftime("%b %d, %H:%M"), "score": r.final_score} 
        for r in time_series_records if r.final_score is not None
    ]
    
    from collections import defaultdict
    heatmap_counts = defaultdict(int)
    for r in time_series_records:
        day_str = r.created_at.strftime("%Y-%m-%d")
        heatmap_counts[day_str] += 1
        
    heatmap_data = [{"date": k, "count": v} for k, v in heatmap_counts.items()]
    
    total_cached = base_query.filter(models.EvaluationRecord.is_cached.is_(True)).count()
    cache_hit_rate = round((total_cached / total_evals) * 100, 1) if total_evals > 0 else 0.0

    return {
        "total_evaluations": total_evals,
        "average_score": avg_final,
        "radar_data": radar_data,
        "time_series": time_series,
        "heatmap_data": heatmap_data,
        "cache_stats": {
            "total_cached": total_cached,
            "cache_hit_rate_percent": cache_hit_rate
        }
    }

@app.get("/api/evaluations/export")
def export_evaluations(format: str = "csv", db: Session = Depends(database.get_db)):
    if format.lower() == "json":
        def json_generator():
            yield "["
            first = True
            for r in db.query(models.EvaluationRecord).order_by(models.EvaluationRecord.created_at.desc()).yield_per(100):
                if not first:
                    yield ","
                first = False
                yield json.dumps({
                    "id": r.id,
                    "created_at": r.created_at.isoformat(),
                    "question": r.question,
                    "ai_response": r.ai_response,
                    "reference_answer": r.reference_answer,
                    "status": r.status,
                    "is_cached": bool(r.is_cached),
                    "result_json": json.loads(r.result_json) if r.result_json else None
                })
            yield "]"
            
        return StreamingResponse(
            json_generator(),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=evaluations_history.json"}
        )
        
    elif format.lower() == "csv":
        def csv_generator():
            stream = io.StringIO()
            writer = csv.writer(stream)
            writer.writerow(["ID", "Date", "Status", "Question", "AI Response", "Reference Answer", "Final Score"])
            yield stream.getvalue()
            stream.seek(0)
            stream.truncate(0)
            
            for r in db.query(models.EvaluationRecord).order_by(models.EvaluationRecord.created_at.desc()).yield_per(100):
                score = r.final_score if r.final_score is not None else "N/A"
                writer.writerow([r.id, r.created_at.isoformat(), r.status, r.question, r.ai_response, r.reference_answer, score])
                yield stream.getvalue()
                stream.seek(0)
                stream.truncate(0)
                
        return StreamingResponse(
            csv_generator(), 
            media_type="text/csv", 
            headers={"Content-Disposition": "attachment; filename=evaluations_history.csv"}
        )
    
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use 'csv' or 'json'.")

# ==============================================================================
# Knowledge Base Management API Endpoints (Phase 4)
# ==============================================================================

@app.get("/api/kb/status", response_model=kb_schemas.KBStatusResponse)
def get_kb_status():
    from backend.kb.vector_store import get_chroma_client, get_embedding_model, get_kb_collection
    client = get_chroma_client()
    model = get_embedding_model()
    if not client or not model:
        return JSONResponse(
            status_code=503,
            content={
                "available": False,
                "reason": "ChromaDB or SentenceTransformers is not available on this deployment tier."
            }
        )
    collection = get_kb_collection()
    if collection is None:
        return JSONResponse(
            status_code=503,
            content={
                "available": False,
                "reason": "Failed to access ChromaDB knowledge_base collection."
            }
        )

    total_chunks = collection.count()
    data = collection.get(include=["metadatas"])
    unique_docs = set()
    for m in (data.get("metadatas") or []):
        if m:
            doc_key = m.get("doc_id") or m.get("dataset") or m.get("filename")
            if doc_key:
                unique_docs.add(doc_key)

    return {
        "available": True,
        "collection_name": "knowledge_base",
        "total_chunks": total_chunks,
        "total_documents": len(unique_docs),
        "embedding_model": getattr(config, "EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    }

@app.get("/api/kb/documents", response_model=kb_schemas.KBDocumentsResponse)
def list_kb_documents():
    from backend.kb.vector_store import get_chroma_client, get_kb_collection
    from collections import defaultdict

    client = get_chroma_client()
    if not client:
        raise HTTPException(status_code=503, detail="ChromaDB vector store is not available on this tier.")
    collection = get_kb_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Knowledge base collection unavailable.")

    data = collection.get(include=["metadatas", "documents"])
    metas = data.get("metadatas") or []
    docs = data.get("documents") or []

    grouped = defaultdict(lambda: {"chunks": 0, "filename": "", "uploaded_at": None, "sample": ""})

    for i, meta in enumerate(metas):
        if not meta:
            continue
        doc_key = meta.get("doc_id") or meta.get("dataset") or meta.get("filename") or f"doc_{i}"
        filename = meta.get("filename") or meta.get("dataset") or doc_key
        grouped[doc_key]["chunks"] += 1
        grouped[doc_key]["filename"] = filename
        if meta.get("uploaded_at"):
            grouped[doc_key]["uploaded_at"] = meta.get("uploaded_at")
        if not grouped[doc_key]["sample"] and i < len(docs) and docs[i]:
            sample_str = str(docs[i]).strip()
            grouped[doc_key]["sample"] = sample_str[:150] + ("..." if len(sample_str) > 150 else "")

    doc_items = [
        kb_schemas.KBDocumentItem(
            doc_id=k,
            filename=v["filename"],
            chunk_count=v["chunks"],
            uploaded_at=v["uploaded_at"],
            sample_preview=v["sample"]
        )
        for k, v in grouped.items()
    ]
    doc_items.sort(key=lambda x: (x.uploaded_at or "", x.chunk_count), reverse=True)

    return {
        "documents": doc_items,
        "total_documents": len(doc_items),
        "total_chunks": len(docs)
    }

@app.post("/api/kb/upload", response_model=kb_schemas.KBUploadResponse)
async def upload_kb_document(file: UploadFile = File(...)):
    from backend.kb.vector_store import get_chroma_client, get_embedding_model, get_kb_collection
    from backend.kb.chunking import chunk_text
    from datetime import datetime, timezone

    client = get_chroma_client()
    model = get_embedding_model()
    if not client or not model:
        raise HTTPException(status_code=503, detail="ChromaDB or embedding model is not initialized on this tier.")

    collection = get_kb_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Knowledge base collection unavailable.")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    content = await file.read()
    raw_text = extract_text_from_bytes(file.filename, content)
    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="Uploaded file contained no extractable text.")

    chunks = chunk_text(raw_text)
    if not chunks:
        raise HTTPException(status_code=400, detail="No text chunks generated.")

    embeddings = model.encode(chunks).tolist()

    doc_id = f"doc_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    chunk_ids = [f"{doc_id}_c{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "doc_id": doc_id,
            "filename": file.filename,
            "chunk_index": i,
            "uploaded_at": now_iso
        }
        for i in range(len(chunks))
    ]

    collection.add(
        ids=chunk_ids,
        embeddings=embeddings,
        documents=chunks,
        metadatas=metadatas
    )

    logger.info(f"Ingested KB document '{file.filename}' ({doc_id}) with {len(chunks)} chunks.")
    return {
        "success": True,
        "doc_id": doc_id,
        "filename": file.filename,
        "chunks_added": len(chunks),
        "message": f"Successfully ingested {file.filename} ({len(chunks)} chunks)."
    }

@app.delete("/api/kb/documents/{doc_id}")
def delete_kb_document(doc_id: str):
    from backend.kb.vector_store import get_chroma_client, get_kb_collection
    client = get_chroma_client()
    if not client:
        raise HTTPException(status_code=503, detail="ChromaDB vector store is not available on this tier.")
    collection = get_kb_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Knowledge base collection unavailable.")

    try:
        data = collection.get(include=["metadatas"])
        ids_to_delete = []
        for chunk_id, meta in zip(data.get("ids") or [], data.get("metadatas") or []):
            if meta and (meta.get("doc_id") == doc_id or meta.get("dataset") == doc_id or meta.get("filename") == doc_id):
                ids_to_delete.append(chunk_id)

        if not ids_to_delete:
            raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found in knowledge base.")

        collection.delete(ids=ids_to_delete)
        logger.info(f"Deleted {len(ids_to_delete)} chunks for doc_id '{doc_id}'.")
        return {
            "success": True,
            "deleted_doc_id": doc_id,
            "chunks_deleted": len(ids_to_delete),
            "message": f"Successfully deleted document '{doc_id}' ({len(ids_to_delete)} chunks removed)."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document {doc_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/kb/search", response_model=kb_schemas.KBSearchResponse)
def search_kb(req: kb_schemas.KBSearchRequest):
    from backend.kb.vector_store import get_chroma_client, get_embedding_model, get_kb_collection
    client = get_chroma_client()
    model = get_embedding_model()
    if not client or not model:
        raise HTTPException(status_code=503, detail="ChromaDB or embedding model is not initialized on this tier.")

    collection = get_kb_collection()
    if collection is None or collection.count() == 0 or not (req.query and req.query.strip()):
        return {
            "query": req.query,
            "results": [],
            "count": 0
        }

    query_emb = model.encode(req.query).tolist()
    k = min(req.top_k, collection.count())
    raw_results = collection.query(
        query_embeddings=[query_emb],
        n_results=k,
        include=["documents", "metadatas", "distances"]
    )

    items = []
    if raw_results and raw_results.get("documents"):
        docs = raw_results["documents"][0]
        metas = raw_results["metadatas"][0] if raw_results.get("metadatas") else [{}] * len(docs)
        dists = raw_results["distances"][0] if raw_results.get("distances") else [0.0] * len(docs)
        ids = raw_results["ids"][0] if raw_results.get("ids") else [f"c_{i}" for i in range(len(docs))]

        for doc, meta, dist, chunk_id in zip(docs, metas, dists, ids):
            dist_val = float(dist)
            sim = round(max(0.0, 1.0 - dist_val) * 100, 1)
            items.append(
                kb_schemas.KBSearchResultItem(
                    chunk_id=chunk_id,
                    text=doc,
                    distance=round(dist_val, 4),
                    similarity_score=sim,
                    metadata=meta or {}
                )
            )

    return {
        "query": req.query,
        "results": items,
        "count": len(items)
    }

# Mount static frontend
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
else:
    logger.warning(f"Frontend dist directory not found at {frontend_dist}. Please build the React app to serve it from FastAPI.")
