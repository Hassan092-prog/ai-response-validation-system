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
        # 1. Semantic Caching
        cached_record = db.query(models.EvaluationRecord).filter(
            models.EvaluationRecord.question == eval_input.question,
            models.EvaluationRecord.ai_response == eval_input.ai_response,
            models.EvaluationRecord.reference_answer == eval_input.reference_answer,
            models.EvaluationRecord.source_document == eval_input.source_document,
            models.EvaluationRecord.status == "completed"
        ).first()
        
        if cached_record:
            logger.info("Semantic Cache HIT! Returning instant cached result.")
            db_record = models.EvaluationRecord(
                question=eval_input.question,
                ai_response=eval_input.ai_response,
                reference_answer=eval_input.reference_answer,
                source_document=eval_input.source_document,
                status="completed",
                result_json=cached_record.result_json
            )
            db.add(db_record)
            db.commit()
            db.refresh(db_record)
            return {"id": db_record.id, "message": "Evaluation returned instantly from cache."}

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
    total_count = db.query(models.EvaluationRecord).count()
    total_pages = (total_count + limit - 1) // limit
    
    # Query only specific columns for memory efficiency
    records = db.query(
        models.EvaluationRecord.id,
        models.EvaluationRecord.question,
        models.EvaluationRecord.status,
        models.EvaluationRecord.final_score,
        models.EvaluationRecord.created_at
    ).order_by(models.EvaluationRecord.created_at.desc()).offset(offset).limit(limit).all()
    
    history = []
    for r in records:
        history.append({
            "id": r.id,
            "question": r.question,
            "status": r.status,
            "score": r.final_score,
            "created_at": r.created_at
        })
    return {
        "history": history,
        "total_pages": total_pages,
        "current_page": page,
        "total_records": total_count
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
