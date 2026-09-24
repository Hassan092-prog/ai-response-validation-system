from fastapi import FastAPI, Depends, Request, BackgroundTasks, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
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

from backend.api import models, schemas, database
from backend.core.config import logger
from backend.core.orchestrator import process_evaluation_task
from backend.core.batch_orchestrator import evaluate_batch_row
import uuid

logger.info("Starting AI Response Validation API...")

models.Base.metadata.create_all(bind=database.engine)
logger.info("Database tables verified/created.")

app = FastAPI(
    title="AI Response Validation API",
    description="Backend API for Milestone 1.3"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://192.168.1.92:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
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
    return {"status": "healthy", "version": "1.0.0"}

@app.post("/api/extract-text")
async def extract_text(file: UploadFile = File(...)):
    """Extracts text from uploaded PDF, DOCX, or TXT files."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    filename = file.filename.lower()
    content = await file.read()
    
    extracted_text = ""
    
    try:
        if filename.endswith(".pdf"):
            if pypdf is None:
                raise HTTPException(status_code=500, detail="pypdf library is not installed on the server.")
            
            pdf_reader = pypdf.PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"
                    
        elif filename.endswith(".docx"):
            if docx is None:
                raise HTTPException(status_code=500, detail="python-docx library is not installed on the server.")
            
            doc = docx.Document(io.BytesIO(content))
            for para in doc.paragraphs:
                extracted_text += para.text + "\n"
                
        elif filename.endswith(".txt") or filename.endswith(".md"):
            extracted_text = content.decode("utf-8")
            
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF, DOCX, or TXT.")
            
        return {"extracted_text": extracted_text.strip()}
    
    except Exception as e:
        logger.error(f"Error extracting text from {filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

@app.post("/api/evaluate", response_model=schemas.EvaluationResponse)
def submit_evaluation(eval_input: schemas.EvaluationInput, background_tasks: BackgroundTasks, db: Session = Depends(database.get_db)):
    logger.info(f"Received evaluation submission: question='{eval_input.question[:30]}...'")
    try:
        # 1. Semantic Caching (TEMPORARILY DISABLED)
        # cached_record = db.query(models.EvaluationRecord).filter(
        #     models.EvaluationRecord.question == eval_input.question,
        #     models.EvaluationRecord.ai_response == eval_input.ai_response,
        #     models.EvaluationRecord.reference_answer == eval_input.reference_answer,
        #     models.EvaluationRecord.source_document == eval_input.source_document,
        #     models.EvaluationRecord.status == "completed",
        #     models.EvaluationRecord.final_score > 0
        # ).first()
        # 
        # if cached_record:
        #     logger.info("Semantic Cache HIT! Returning instant cached result.")
        #     db_record = models.EvaluationRecord(
        #         question=eval_input.question,
        #         ai_response=eval_input.ai_response,
        #         reference_answer=eval_input.reference_answer,
        #         source_document=eval_input.source_document,
        #         status="completed",
        #         result_json=cached_record.result_json
        #     )
        #     db.add(db_record)
        #     db.commit()
        #     db.refresh(db_record)
        #     return {"id": db_record.id, "message": "Evaluation returned instantly from cache."}

        # 2. Save New Pending Record
        db_record = models.EvaluationRecord(
            question=eval_input.question,
            ai_response=eval_input.ai_response,
            reference_answer=eval_input.reference_answer,
            source_document=eval_input.source_document,
            status="pending"
        )
        
        db.add(db_record)
        db.commit()
        db.refresh(db_record)
        
        # 3. Trigger background processing
        background_tasks.add_task(process_evaluation_task, db_record.id)
        
        logger.info(f"Successfully saved and queued evaluation ID {db_record.id}")
        return {"id": db_record.id, "message": "Evaluation queued for processing."}
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
                
                # 2. Process using Consolidated Batch Orchestrator
                result = evaluate_batch_row(
                    record_id=record.id,
                    question=record.question,
                    ai_response=record.ai_response,
                    reference_answer=record.reference_answer,
                    source_document=record.source_document
                )
                
                # 3. Save result
                record.status = "completed"
                record.result_json = json.dumps(result)
                record.final_score = result.get("final_score")
                
                breakdown = result.get("breakdown", {})
                record.score_relevance = breakdown.get("relevance", {}).get("score")
                record.score_accuracy = breakdown.get("accuracy", {}).get("score")
                record.score_completeness = breakdown.get("completeness", {}).get("score")
                record.score_hallucination = breakdown.get("hallucination", {}).get("score")
                
                db.commit()
                
                # 4. Optimized 5 second delay to utilize the 15 RPM Free Tier Limit safely
                # (1 request per 5 seconds = 12 RPM, leaving a buffer of 3 RPM for simultaneous UI usage)
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
            
        db_record = models.EvaluationRecord(
            question=question,
            ai_response=ai_response,
            reference_answer=row.get("reference_answer"),
            source_document=row.get("source_document"),
            status="pending",
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
        results.append({
            "id": r.id,
            "status": r.status,
            "question": r.question,
            "ai_response": r.ai_response,
            "final_score": r.final_score,
            "score_accuracy": r.score_accuracy,
            "score_relevance": r.score_relevance,
            "score_hallucination": r.score_hallucination
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
        except:
            result_data = {"error": "Failed to parse result JSON"}

    return {
        "id": record.id,
        "status": record.status,
        "question": record.question,
        "ai_response": record.ai_response,
        "reference_answer": record.reference_answer,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "result": result_data
    }

@app.get("/api/evaluations/history")
def get_evaluation_history(page: int = 1, limit: int = 10, db: Session = Depends(database.get_db)):
    offset = (page - 1) * limit
    
    # Calculate KPI Stats
    total_evals = db.query(models.EvaluationRecord).count()
    total_singles = db.query(models.EvaluationRecord).filter(models.EvaluationRecord.batch_id == None).count()
    total_batches = db.query(models.EvaluationRecord.batch_id).filter(models.EvaluationRecord.batch_id != None).distinct().count()

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
                    "question": f"Batch CSV Upload",
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
def get_analytics(db: Session = Depends(database.get_db)):
    total_evals = db.query(models.EvaluationRecord).filter(models.EvaluationRecord.status == "completed").count()
    
    if total_evals == 0:
        return {"total_evaluations": 0, "average_score": 0, "radar_data": [], "time_series": []}
        
    avg_stats = db.query(
        func.avg(models.EvaluationRecord.final_score).label("avg_final"),
        func.avg(models.EvaluationRecord.score_relevance).label("avg_rel"),
        func.avg(models.EvaluationRecord.score_accuracy).label("avg_acc"),
        func.avg(models.EvaluationRecord.score_completeness).label("avg_comp"),
        func.avg(models.EvaluationRecord.score_hallucination).label("avg_hal")
    ).filter(models.EvaluationRecord.status == "completed").first()
    
    avg_final = round(avg_stats.avg_final or 0, 1)
    
    radar_data = [
        {"metric": "Relevance", "score": round((avg_stats.avg_rel or 0) * 20, 1)},
        {"metric": "Accuracy", "score": round((avg_stats.avg_acc or 0) * 20, 1)},
        {"metric": "Completeness", "score": round((avg_stats.avg_comp or 0) * 20, 1)},
        {"metric": "Hallucination", "score": round((avg_stats.avg_hal or 0) * 20, 1)}
    ]
    
    time_series_records = db.query(
        models.EvaluationRecord.created_at,
        models.EvaluationRecord.final_score
    ).filter(models.EvaluationRecord.status == "completed").order_by(models.EvaluationRecord.created_at.asc()).all()
    
    time_series = [
        {"date": r.created_at.strftime("%b %d, %H:%M"), "score": r.final_score} 
        for r in time_series_records if r.final_score is not None
    ]
    
    return {
        "total_evaluations": total_evals,
        "average_score": avg_final,
        "radar_data": radar_data,
        "time_series": time_series
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
