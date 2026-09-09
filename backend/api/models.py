from sqlalchemy import Column, Integer, String, Text, DateTime, Float
from sqlalchemy.sql import func
from backend.api.database import Base

class EvaluationRecord(Base):
    """
    SQLAlchemy Model representing the 'evaluations' table in our SQLite database.
    """
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, index=True)
    
    # Required inputs
    question = Column(Text, nullable=False)
    ai_response = Column(Text, nullable=False)
    
    # Optional inputs
    reference_answer = Column(Text, nullable=True)
    source_document = Column(Text, nullable=True)
    
    # State and Results
    status = Column(String, default="pending", index=True)
    result_json = Column(Text, nullable=True)
    
    # Aggregation Columns
    final_score = Column(Float, nullable=True)
    score_relevance = Column(Float, nullable=True)
    score_accuracy = Column(Float, nullable=True)
    score_completeness = Column(Float, nullable=True)
    score_hallucination = Column(Float, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
