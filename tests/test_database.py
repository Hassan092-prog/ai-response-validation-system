from backend.api import models

def test_create_evaluation_record(db_session):
    """Test model creation with default pending status and attributes."""
    record = models.EvaluationRecord(
        question="What is deep learning?",
        ai_response="Deep learning uses neural networks."
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)
    
    assert record.id is not None
    assert record.status == "pending"
    assert record.final_score is None
    assert record.created_at is not None

def test_batch_relationship_queries(db_session):
    """Test querying records grouped by batch_id."""
    batch_uuid = "test-batch-12345"
    records = [
        models.EvaluationRecord(question=f"Q{i}", ai_response=f"A{i}", batch_id=batch_uuid, status="completed", final_score=80.0 + i)
        for i in range(5)
    ]
    db_session.add_all(records)
    db_session.commit()
    
    batch_results = db_session.query(models.EvaluationRecord).filter(
        models.EvaluationRecord.batch_id == batch_uuid
    ).all()
    
    assert len(batch_results) == 5
    assert all(r.batch_id == batch_uuid for r in batch_results)

def test_score_dimension_persistence(db_session):
    """Test updating and querying decomposed dimension score columns."""
    record = models.EvaluationRecord(
        question="Q",
        ai_response="A",
        status="completed",
        final_score=92.0,
        score_accuracy=5.0,
        score_relevance=4.5,
        score_completeness=4.0,
        score_hallucination=5.0
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)
    
    fetched = db_session.query(models.EvaluationRecord).filter_by(id=record.id).first()
    assert fetched.score_accuracy == 5.0
    assert fetched.score_hallucination == 5.0
    assert fetched.final_score == 92.0
