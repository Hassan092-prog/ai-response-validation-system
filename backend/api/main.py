from fastapi import FastAPI, Depends, Request, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import time
import json

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

@app.post("/api/evaluate", response_model=schemas.EvaluationResponse)
def submit_evaluation(eval_input: schemas.EvaluationInput, background_tasks: BackgroundTasks, db: Session = Depends(database.get_db)):
    logger.info(f"Received evaluation submission: question='{eval_input.question[:30]}...'")
    try:
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
        
        # Trigger background processing
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
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "result": result_data
    }

@app.get("/api/evaluations/history")
def get_evaluation_history(limit: int = 10, db: Session = Depends(database.get_db)):
    records = db.query(models.EvaluationRecord).order_by(models.EvaluationRecord.created_at.desc()).limit(limit).all()
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
    return {"history": history}
