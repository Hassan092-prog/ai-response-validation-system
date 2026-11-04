import io
import os
from unittest.mock import MagicMock, patch
import pytest

from backend.api import models
from backend.core.webhook import (
    build_batch_webhook_payload,
    deliver_batch_webhook,
    sign_payload,
    verify_signature,
)


# ==============================================================================
# 1. Webhook Signing & Dispatch Tests
# ==============================================================================

def test_sign_payload_and_verify():
    secret = "test-secret-key-12345"
    payload = b'{"event":"batch.completed","batch_id":"b-123"}'

    signature = sign_payload(secret, payload)
    header = f"sha256={signature}"

    # Valid verification
    assert verify_signature(secret, payload, header) is True

    # Tampered payload
    assert verify_signature(secret, b'{"event":"tampered"}', header) is False

    # Wrong secret
    assert verify_signature("wrong-secret", payload, header) is False

    # Invalid header format
    assert verify_signature(secret, payload, "invalid_header_without_sha256") is False
    assert verify_signature(secret, payload, "") is False


def test_build_batch_webhook_payload():
    mock_r1 = MagicMock(status="completed", final_score=90.0, score_accuracy=4.5, score_relevance=4.8, score_completeness=4.2, score_hallucination=5.0)
    mock_r2 = MagicMock(status="completed", final_score=60.0, score_accuracy=3.0, score_relevance=3.5, score_completeness=3.0, score_hallucination=2.0)
    mock_r3 = MagicMock(status="failed", final_score=None, score_accuracy=None, score_relevance=None, score_completeness=None, score_hallucination=None)

    payload = build_batch_webhook_payload("batch-xyz", [mock_r1, mock_r2, mock_r3])

    assert payload["event"] == "batch.completed"
    assert payload["batch_id"] == "batch-xyz"
    assert payload["total_records"] == 3
    assert payload["completed_records"] == 2
    assert payload["failed_records"] == 1
    assert payload["summary"]["avg_final_score"] == 75.0
    assert payload["summary"]["pass_rate_percent"] == 50.0  # 1 out of 2 >= 70%


def test_deliver_batch_webhook_success():
    records = [
        MagicMock(status="completed", final_score=85.0, score_accuracy=4.0, score_relevance=4.0, score_completeness=4.0, score_hallucination=4.5)
    ]

    with patch("httpx.Client.post") as mock_post:
        mock_response = MagicMock(status_code=200)
        mock_post.return_value = mock_response

        success = deliver_batch_webhook("batch-1", "https://ci.example.com/hook", "secret-key", records)
        assert success is True

        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        assert args[0] == "https://ci.example.com/hook"
        assert "X-ARVS-Signature" in kwargs["headers"]
        assert kwargs["headers"]["X-ARVS-Signature"].startswith("sha256=")


def test_deliver_batch_webhook_failure():
    records = [MagicMock(status="completed", final_score=85.0)]

    with patch("httpx.Client.post", side_effect=Exception("Connection refused")):
        success = deliver_batch_webhook("batch-1", "https://unreachable.example.com/hook", "secret-key", records)
        assert success is False


# ==============================================================================
# 2. API Key Authentication Dependency Tests
# ==============================================================================

def test_api_key_auth_unrestricted_by_default(client):
    """When ARVS_API_KEY is unset, endpoints are accessible without X-API-KEY header."""
    with patch.dict(os.environ, {"ARVS_API_KEY": ""}):
        res = client.get("/api/benchmarks")
        assert res.status_code == 200


def test_api_key_auth_enforced_when_set(client):
    """When ARVS_API_KEY is set, requests without valid X-API-KEY receive 403 Forbidden."""
    with patch.dict(os.environ, {"ARVS_API_KEY": "production-key-999"}):
        # 1. Missing header -> 403
        res = client.get("/api/benchmarks")
        assert res.status_code == 403
        assert "invalid or missing api key" in res.json()["detail"].lower()

        # 2. Wrong header -> 403
        res_wrong = client.get("/api/benchmarks", headers={"X-API-KEY": "wrong-key"})
        assert res_wrong.status_code == 403

        # 3. Matching header -> 200
        res_valid = client.get("/api/benchmarks", headers={"X-API-KEY": "production-key-999"})
        assert res_valid.status_code == 200


# ==============================================================================
# 3. Batch Submission with Webhook Integration Tests
# ==============================================================================

def test_submit_batch_with_webhook_params(client):
    """POST /api/evaluate/batch captures callback_url and hashes webhook_secret."""
    with patch("backend.api.main.process_batch_background") as mock_bg:
        csv_content = "question,ai_response\nWhat is Python?,A high-level programming language."
        files = {"file": ("test_batch.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
        data = {
            "callback_url": "https://ci.example.com/callback",
            "webhook_secret": "my-secret-pw"
        }

        res = client.post("/api/evaluate/batch", files=files, data=data)
        assert res.status_code == 200
        batch_id = res.json()["batch_id"]

        mock_bg.assert_called_once_with(batch_id, "https://ci.example.com/callback", "my-secret-pw")


# ==============================================================================
# 4. Golden Benchmark CRUD & Comparison Tests
# ==============================================================================

@pytest.fixture
def populated_batches(db_session):
    """Seeds baseline batch 'batch-baseline' and candidate batch 'batch-candidate'."""
    # Baseline batch: 2 passed (85, 95), 1 failed (40) -> pass rate 66.7%
    records_baseline = [
        models.EvaluationRecord(
            question="Q1", ai_response="A1", status="completed",
            final_score=85.0, score_accuracy=4.2, score_relevance=4.5, score_completeness=4.0, score_hallucination=4.5,
            batch_id="batch-baseline"
        ),
        models.EvaluationRecord(
            question="Q2", ai_response="A2", status="completed",
            final_score=95.0, score_accuracy=4.8, score_relevance=5.0, score_completeness=4.5, score_hallucination=5.0,
            batch_id="batch-baseline"
        ),
        models.EvaluationRecord(
            question="Q3", ai_response="A3", status="completed",
            final_score=40.0, score_accuracy=2.0, score_relevance=2.0, score_completeness=2.0, score_hallucination=2.0,
            batch_id="batch-baseline"
        ),
    ]
    for r in records_baseline:
        db_session.add(r)
    db_session.commit()
    return "batch-baseline"


def test_benchmark_lifecycle_and_regression_detection(client, populated_batches, db_session):
    """
    Full lifecycle test:
    1. Create benchmark from 'batch-baseline'
    2. List benchmarks
    3. Compare an improved batch -> overall_verdict: 'IMPROVED'
    4. Compare a degraded batch (pass rate drops >5%) -> overall_verdict: 'REGRESSION_DETECTED'
    5. Delete benchmark
    """
    # 1. Create Benchmark
    create_payload = {
        "name": "Production Baseline v1",
        "batch_id": populated_batches,
        "description": "Golden reference set"
    }
    res_create = client.post("/api/benchmarks", json=create_payload)
    assert res_create.status_code == 200
    bm = res_create.json()
    bm_id = bm["id"]
    assert bm["name"] == "Production Baseline v1"
    assert bm["total_records"] == 3
    assert bm["avg_final_score"] == 73.3
    assert bm["pass_rate"] == 66.7

    # 2. List Benchmarks
    res_list = client.get("/api/benchmarks")
    assert res_list.status_code == 200
    assert any(b["id"] == bm_id for b in res_list.json())

    # Get Single Benchmark
    res_get = client.get(f"/api/benchmarks/{bm_id}")
    assert res_get.status_code == 200
    assert res_get.json()["id"] == bm_id

    # 3. Compare with Improved Batch (100% pass rate, higher scores)
    improved_records = [
        models.EvaluationRecord(
            question="Q1", ai_response="A1+", status="completed",
            final_score=90.0, score_accuracy=4.8, score_relevance=4.8, score_completeness=4.6, score_hallucination=5.0,
            batch_id="batch-improved"
        ),
        models.EvaluationRecord(
            question="Q2", ai_response="A2+", status="completed",
            final_score=98.0, score_accuracy=5.0, score_relevance=5.0, score_completeness=4.9, score_hallucination=5.0,
            batch_id="batch-improved"
        ),
    ]
    for r in improved_records:
        db_session.add(r)
    db_session.commit()

    res_comp_improved = client.post(f"/api/benchmarks/{bm_id}/compare", json={"comparison_batch_id": "batch-improved"})
    assert res_comp_improved.status_code == 200
    data_imp = res_comp_improved.json()
    assert data_imp["overall_verdict"] == "IMPROVED"
    assert data_imp["deltas"]["pass_rate_percent"]["trend"] == "improved"

    # 4. Compare with Degraded Batch (Pass rate drops by >5 percentage points -> 0% pass rate)
    degraded_records = [
        models.EvaluationRecord(
            question="Q1", ai_response="A1-", status="completed",
            final_score=50.0, score_accuracy=2.5, score_relevance=2.5, score_completeness=2.5, score_hallucination=2.0,
            batch_id="batch-degraded"
        ),
        models.EvaluationRecord(
            question="Q2", ai_response="A2-", status="completed",
            final_score=45.0, score_accuracy=2.0, score_relevance=2.0, score_completeness=2.0, score_hallucination=1.5,
            batch_id="batch-degraded"
        ),
    ]
    for r in degraded_records:
        db_session.add(r)
    db_session.commit()

    res_comp_degraded = client.post(f"/api/benchmarks/{bm_id}/compare", json={"comparison_batch_id": "batch-degraded"})
    assert res_comp_degraded.status_code == 200
    data_deg = res_comp_degraded.json()
    assert data_deg["overall_verdict"] == "REGRESSION_DETECTED"
    assert "Pass rate dropped" in data_deg["verdict_reason"]
    assert data_deg["deltas"]["pass_rate_percent"]["trend"] == "degraded"

    # 5. Delete Benchmark
    res_del = client.delete(f"/api/benchmarks/{bm_id}")
    assert res_del.status_code == 200
    assert res_del.json()["status"] == "deleted"

    # Verify 404 after deletion
    res_404 = client.get(f"/api/benchmarks/{bm_id}")
    assert res_404.status_code == 404
