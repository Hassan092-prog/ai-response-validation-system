from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
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

    # Caching Layer
    input_hash = Column(String(64), index=True, nullable=True)
    is_cached = Column(Boolean, default=False, nullable=False)
    
    # Batch Processing
    batch_id = Column(String, index=True, nullable=True)
    batch_webhook_url = Column(String, nullable=True)
    batch_webhook_secret_hash = Column(String(64), nullable=True)

    # Aggregation Columns
    final_score = Column(Float, nullable=True)
    score_relevance = Column(Float, nullable=True)
    score_accuracy = Column(Float, nullable=True)
    score_completeness = Column(Float, nullable=True)
    score_hallucination = Column(Float, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GoldenBenchmark(Base):
    """
    SQLAlchemy Model representing the 'golden_benchmarks' table for regression tracking.
    """
    __tablename__ = "golden_benchmarks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    batch_id = Column(String, nullable=False, index=True)
    
    # Baseline Aggregated Metrics
    total_records = Column(Integer, default=0, nullable=False)
    avg_final_score = Column(Float, nullable=False)
    avg_accuracy = Column(Float, nullable=False)
    avg_relevance = Column(Float, nullable=False)
    avg_completeness = Column(Float, nullable=False)
    avg_hallucination = Column(Float, nullable=False)
    pass_rate = Column(Float, nullable=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

