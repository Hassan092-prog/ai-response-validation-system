from fastapi import FastAPI, Depends, Request, BackgroundTasks, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
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
    
    records = db.query(models.EvaluationRecord).order_by(models.EvaluationRecord.created_at.desc()).offset(offset).limit(limit).all()
    history = []
    for r in records:
        score = None
        if r.result_json and r.status == "completed":
            try:
                res_data = json.loads(r.result_json)
                score = res_data.get("final_score")
            except:
                pass
        
        history.append({
            "id": r.id,
            "question": r.question,
            "status": r.status,
            "score": score,
            "created_at": r.created_at
        })
    return {
        "history": history,
        "total_pages": total_pages,
        "current_page": page,
        "total_records": total_count
    }

@app.get("/api/evaluations/export")
def export_evaluations(format: str = "csv", db: Session = Depends(database.get_db)):
    records = db.query(models.EvaluationRecord).order_by(models.EvaluationRecord.created_at.desc()).all()
    
    if format.lower() == "json":
        export_data = []
        for r in records:
            export_data.append({
                "id": r.id,
                "created_at": r.created_at.isoformat(),
                "question": r.question,
                "ai_response": r.ai_response,
                "reference_answer": r.reference_answer,
                "status": r.status,
                "result_json": json.loads(r.result_json) if r.result_json else None
            })
        return JSONResponse(
            content=export_data,
            headers={"Content-Disposition": "attachment; filename=evaluations_history.json"}
        )
        
    elif format.lower() == "csv":
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["ID", "Date", "Status", "Question", "AI Response", "Reference Answer", "Final Score"])
        
        for r in records:
            score = "N/A"
            if r.result_json and r.status == "completed":
                try:
                    score = json.loads(r.result_json).get("final_score", "N/A")
                except:
                    pass
            writer.writerow([r.id, r.created_at.isoformat(), r.status, r.question, r.ai_response, r.reference_answer, score])
            
        stream.seek(0)
        return StreamingResponse(
            stream, 
            media_type="text/csv", 
            headers={"Content-Disposition": "attachment; filename=evaluations_history.csv"}
        )
    
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use 'csv' or 'json'.")
