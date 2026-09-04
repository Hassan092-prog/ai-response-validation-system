from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from backend.api import models, schemas, database

# Create database tables if they don't exist yet
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(
    title="AI Response Validation API",
    description="Backend API for Milestone 1.3"
)

# Configure CORS (Cross-Origin Resource Sharing)
# This is crucial! Without this, the browser will block our React app from 
# talking to our FastAPI app because they will be running on different ports.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://192.168.1.92:5173", "http://127.0.0.1:5173"], # Restricted to frontend domains for security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "version": "1.0.0"}

@app.post("/api/evaluate", response_model=schemas.EvaluationResponse)
def submit_evaluation(eval_input: schemas.EvaluationInput, db: Session = Depends(database.get_db)):
    """
    Endpoint to receive evaluation submissions from the frontend.
    It takes the validated 'eval_input', saves it to SQLite, and returns an ID.
    """
    # 1. Map the validated Pydantic data into our SQLAlchemy database model
    db_record = models.EvaluationRecord(
        question=eval_input.question,
        ai_response=eval_input.ai_response,
        reference_answer=eval_input.reference_answer,
        source_document=eval_input.source_document
    )
    
    # 2. Add to the session and commit (save) to the file
    db.add(db_record)
    db.commit()
    db.refresh(db_record) # This fetches the auto-generated ID from SQLite
    
    # 3. Return success
    return {"id": db_record.id, "message": "Evaluation successfully recorded in database!"}
