import io
import json
from unittest.mock import patch
from backend.api import models

def test_health_check(client):
    """GET /api/health returns 200 with healthy status and active provider telemetry."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["version"] == "1.0.0"
    assert "llm_provider" in data
    assert "llm_model" in data

def test_weights_config_endpoints(client):
    """GET and POST /api/config/weights dynamically read and update scoring weights."""
    get_res = client.get("/api/config/weights")
    assert get_res.status_code == 200
    initial_weights = get_res.json()
    assert "accuracy" in initial_weights
    
    new_weights = {"accuracy": 50, "relevance": 20, "completeness": 15, "hallucination": 15}
    post_res = client.post("/api/config/weights", json=new_weights)
    assert post_res.status_code == 200
    assert post_res.json()["weights"]["accuracy"] == 50
    
    # Restore original weights
    client.post("/api/config/weights", json=initial_weights)

def test_submit_evaluation(client):
    """POST /api/evaluate saves a pending record and queues background task."""
    with patch("backend.api.main.process_evaluation_task"):
        payload = {
            "question": "What is machine learning?",
            "ai_response": "Machine learning is a field of artificial intelligence.",
            "reference_answer": "ML is a branch of AI focused on learning from data."
        }
        response = client.post("/api/evaluate", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "queued" in data["message"].lower()

def test_get_results_not_found(client):
    """GET /api/results/{id} returns 404 for non-existent ID."""
    response = client.get("/api/results/999999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

def test_get_results_success(client, db_session):
    """GET /api/results/{id} correctly serializes completed evaluation record."""
    dummy_result = {
        "final_score": 95.0,
        "verdict": "Pass",
        "breakdown": {
            "relevance": {"score": 5, "reasoning": "Direct answer"},
            "accuracy": {"score": 5, "reasoning": "Accurate"},
            "completeness": {"score": 5, "reasoning": "Complete"},
            "hallucination": {"score": 5, "reasoning": "None", "flagged_claims": []}
        }
    }
    
    record = models.EvaluationRecord(
        question="What is the speed of light?",
        ai_response="About 300,000 km/s.",
        status="completed",
        final_score=95.0,
        result_json=json.dumps(dummy_result)
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)
    
    response = client.get(f"/api/results/{record.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == record.id
    assert data["status"] == "completed"
    assert data["result"]["final_score"] == 95.0

def test_evaluation_history(client, db_session):
    """GET /api/evaluations/history returns paginated events and KPI statistics."""
    record1 = models.EvaluationRecord(
        question="Q1", ai_response="A1", status="completed", final_score=80.0
    )
    record2 = models.EvaluationRecord(
        question="Q2", ai_response="A2", status="completed", final_score=90.0, batch_id="batch-1"
    )
    db_session.add_all([record1, record2])
    db_session.commit()
    
    response = client.get("/api/evaluations/history?page=1&limit=10")
    assert response.status_code == 200
    data = response.json()
    assert "history" in data
    assert "kpis" in data
    assert data["kpis"]["total_evaluations"] >= 2
    assert data["kpis"]["total_batches"] >= 1

def test_evaluation_analytics(client, db_session):
    """GET /api/evaluations/analytics returns aggregated statistics and radar dimensions."""
    record = models.EvaluationRecord(
        question="Q", ai_response="A", status="completed",
        final_score=85.0, score_accuracy=4.5, score_relevance=4.0,
        score_completeness=4.0, score_hallucination=5.0
    )
    db_session.add(record)
    db_session.commit()
    
    response = client.get("/api/evaluations/analytics")
    assert response.status_code == 200
    data = response.json()
    assert data["total_evaluations"] >= 1
    assert data["average_score"] > 0
    assert len(data["radar_data"]) == 4

def test_evaluation_exports(client, db_session):
    """GET /api/evaluations/export streams valid CSV and JSON representations."""
    record = models.EvaluationRecord(
        question="Q", ai_response="A", status="completed", final_score=90.0
    )
    db_session.add(record)
    db_session.commit()
    
    # Test CSV
    csv_res = client.get("/api/evaluations/export?format=csv")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "Final Score" in csv_res.text
    
    # Test JSON
    json_res = client.get("/api/evaluations/export?format=json")
    assert json_res.status_code == 200
    assert "application/json" in json_res.headers["content-type"]
    parsed = json.loads(json_res.text)
    assert isinstance(parsed, list)
    assert "is_cached" in parsed[0]
    
    # Test Invalid Format
    invalid_res = client.get("/api/evaluations/export?format=xml")
    assert invalid_res.status_code == 400

def test_extract_text_txt(client):
    """POST /api/extract-text correctly extracts text from uploaded .txt file."""
    file_content = b"This is a test source document about artificial intelligence."
    files = {"file": ("test.txt", io.BytesIO(file_content), "text/plain")}
    
    response = client.post("/api/extract-text", files=files)
    assert response.status_code == 200
    assert response.json()["extracted_text"] == file_content.decode("utf-8")

def test_extract_text_unsupported(client):
    """POST /api/extract-text rejects unsupported file types with 400."""
    files = {"file": ("test.exe", io.BytesIO(b"binary"), "application/octet-stream")}
    response = client.post("/api/extract-text", files=files)
    assert response.status_code == 400
