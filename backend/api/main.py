from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import time

from backend.api import models, schemas, database
from backend.core.config import logger

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
def submit_evaluation(eval_input: schemas.EvaluationInput, db: Session = Depends(database.get_db)):
    logger.info(f"Received evaluation submission: question='{eval_input.question[:30]}...'")
    try:
        db_record = models.EvaluationRecord(
            question=eval_input.question,
            ai_response=eval_input.ai_response,
            reference_answer=eval_input.reference_answer,
            source_document=eval_input.source_document
        )
        
        db.add(db_record)
        db.commit()
        db.refresh(db_record)
        
        logger.info(f"Successfully saved evaluation with ID {db_record.id}")
        return {"id": db_record.id, "message": "Evaluation successfully recorded in database!"}
    except Exception as e:
        logger.error(f"Error saving evaluation: {e}")
        db.rollback()
        raise
