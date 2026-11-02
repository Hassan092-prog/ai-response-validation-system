import json
from unittest.mock import patch
from backend.api import models
from backend.core.cache import (
    compute_input_hash,
    normalize_text,
    lookup_cache,
    clone_cached_record,
)
from backend.api.main import process_batch_background


def test_normalize_text():
    assert normalize_text("  Hello   World  \n\t") == "hello world"
    assert normalize_text("") == ""
    assert normalize_text(None) == ""


def test_compute_input_hash_deterministic():
    h1 = compute_input_hash("What is Python?", "A language.", "A programming language.", "Doc text")
    h2 = compute_input_hash("What is Python?", "A language.", "A programming language.", "Doc text")
    assert h1 == h2
    assert len(h1) == 64


def test_compute_input_hash_whitespace_and_casing():
    h1 = compute_input_hash("What is Python?", "A language.")
    h2 = compute_input_hash("  what  is   python?  \n", "  a   language. \t ")
    assert h1 == h2


def test_compute_input_hash_collision_prevention():
    h1 = compute_input_hash("a", "bc")
    h2 = compute_input_hash("ab", "c")
    assert h1 != h2


def test_lookup_cache(db_session):
    input_hash = compute_input_hash("Q", "A")

    # Pending record should NOT be returned by cache
    pending = models.EvaluationRecord(
        question="Q",
        ai_response="A",
        status="pending",
        input_hash=input_hash,
        is_cached=False,
    )
    db_session.add(pending)
    db_session.commit()

    assert lookup_cache(db_session, input_hash) is None

    # Failed record should NOT be returned
    pending.status = "failed"
    db_session.commit()
    assert lookup_cache(db_session, input_hash) is None

    # Completed record with scores and result_json SHOULD be returned
    pending.status = "completed"
    pending.final_score = 90
    pending.score_accuracy = 4.5
    pending.score_relevance = 4.8
    pending.score_completeness = 4.2
    pending.score_hallucination = 5.0
    pending.result_json = json.dumps({"verdict": "Pass", "final_score": 90})
    db_session.commit()

    cached = lookup_cache(db_session, input_hash)
    assert cached is not None
    assert cached.id == pending.id
    assert cached.final_score == 90

    # Exclude id should omit it
    assert lookup_cache(db_session, input_hash, exclude_id=pending.id) is None


def test_clone_cached_record(db_session):
    original = models.EvaluationRecord(
        question="What is photosynthesis?",
        ai_response="Plants making food with light.",
        reference_answer="Biological process using sunlight.",
        source_document="Bio textbook",
        status="completed",
        input_hash="fakehash123",
        is_cached=False,
        result_json=json.dumps({"verdict": "Pass"}),
        final_score=85,
        score_relevance=4.5,
        score_accuracy=4.0,
        score_completeness=4.0,
        score_hallucination=5.0,
    )
    db_session.add(original)
    db_session.commit()

    cloned = clone_cached_record(original, batch_id="batch-xyz")
    db_session.add(cloned)
    db_session.commit()

    assert cloned.id != original.id
    assert cloned.is_cached is True
    assert cloned.status == "completed"
    assert cloned.final_score == 85
    assert cloned.score_relevance == 4.5
    assert cloned.score_accuracy == 4.0
    assert cloned.score_completeness == 4.0
    assert cloned.score_hallucination == 5.0
    assert cloned.batch_id == "batch-xyz"
    assert cloned.result_json == original.result_json


def test_api_evaluate_cache_flow(client, db_session):
    # Seed a completed record
    q = "What is the capital of France?"
    a = "Paris is the capital."
    h = compute_input_hash(q, a)

    existing = models.EvaluationRecord(
        question=q,
        ai_response=a,
        status="completed",
        input_hash=h,
        is_cached=False,
        result_json=json.dumps({"verdict": "Pass", "final_score": 95}),
        final_score=95,
        score_relevance=5.0,
        score_accuracy=5.0,
        score_completeness=5.0,
        score_hallucination=5.0,
    )
    db_session.add(existing)
    db_session.commit()

    # Submit exact same evaluation
    response = client.post("/api/evaluate", json={
        "question": q,
        "ai_response": a,
    })

    assert response.status_code == 200
    data = response.json()
    assert data["cached"] is True
    assert data["id"] != existing.id

    # Check the result endpoint for the cached record
    res_response = client.get(f"/api/results/{data['id']}")
    assert res_response.status_code == 200
    res_data = res_response.json()
    assert res_data["is_cached"] is True
    assert res_data["status"] == "completed"


def test_analytics_cache_stats(client, db_session):
    # Add one non-cached and two cached records
    r1 = models.EvaluationRecord(
        question="Q1",
        ai_response="A1",
        status="completed",
        is_cached=False,
        final_score=80,
    )
    r2 = models.EvaluationRecord(
        question="Q2",
        ai_response="A2",
        status="completed",
        is_cached=True,
        final_score=85,
    )
    r3 = models.EvaluationRecord(
        question="Q3",
        ai_response="A3",
        status="completed",
        is_cached=True,
        final_score=90,
    )
    db_session.add_all([r1, r2, r3])
    db_session.commit()

    response = client.get("/api/evaluations/analytics")
    assert response.status_code == 200
    data = response.json()
    assert "cache_stats" in data
    assert data["cache_stats"]["total_cached"] == 2
    assert data["cache_stats"]["cache_hit_rate_percent"] == 66.7


def test_batch_processing_cache_hit(db_session):
    # Pre-populate a completed evaluation to act as cache
    q = "What is gravity?"
    a = "A fundamental force attracting masses."
    h = compute_input_hash(q, a)

    seed_record = models.EvaluationRecord(
        question=q,
        ai_response=a,
        status="completed",
        input_hash=h,
        is_cached=False,
        result_json=json.dumps({"verdict": "Pass", "final_score": 92}),
        final_score=92,
        score_relevance=4.8,
        score_accuracy=4.9,
        score_completeness=4.5,
        score_hallucination=5.0,
    )
    db_session.add(seed_record)
    db_session.commit()

    # Create a batch row with identical question and answer
    batch_id = "test-batch-123"
    batch_row = models.EvaluationRecord(
        question=q,
        ai_response=a,
        status="pending",
        input_hash=h,
        is_cached=False,
        batch_id=batch_id,
    )
    db_session.add(batch_row)
    db_session.commit()

    # Mock SessionLocal in process_batch_background to use connection-bound test session
    from tests.conftest import TestingSessionLocal
    with patch("backend.api.database.SessionLocal", side_effect=lambda: TestingSessionLocal(bind=db_session.connection())):
        # We don't want evaluate_batch_row to be called
        with patch("backend.api.main.evaluate_batch_row") as mock_eval:
            process_batch_background(batch_id)
            mock_eval.assert_not_called()

    # Reload record via fresh verify session
    verify_session = TestingSessionLocal(bind=db_session.connection())
    saved_row = verify_session.query(models.EvaluationRecord).filter_by(id=batch_row.id).first()
    assert saved_row.status == "completed"
    assert saved_row.is_cached is True
    assert saved_row.final_score == 92
    assert saved_row.score_accuracy == 4.9
