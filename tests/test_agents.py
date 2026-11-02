from unittest.mock import patch
from backend.core.agents.relevance import evaluate_relevance
from backend.core.agents.accuracy import evaluate_accuracy
from backend.core.agents.completeness import evaluate_completeness
from backend.core.agents.hallucination import detect_hallucination
from backend.core.agents.verdict import generate_verdict
from backend.core.batch_orchestrator import evaluate_batch_row
from backend.core.agents import utils

def test_evaluate_relevance():
    """Test Relevance Agent parsing and delegation."""
    with patch("backend.core.agents.relevance._call_llm_json") as mock_llm:
        mock_llm.return_value = {"score": 5, "reasoning": "Fully relevant."}
        
        result = evaluate_relevance("What is Python?", "Python is a programming language.")
        assert result["score"] == 5
        assert result["reasoning"] == "Fully relevant."
        mock_llm.assert_called_once()

def test_evaluate_accuracy():
    """Test Accuracy Agent passing verified context and extracting evidence."""
    with patch("backend.core.agents.accuracy._call_llm_json") as mock_llm:
        mock_llm.return_value = {
            "score": 5,
            "reasoning": "Factually accurate.",
            "supporting_evidence": "Python is a programming language created by Guido van Rossum."
        }
        
        result = evaluate_accuracy(
            "Who created Python?",
            "Guido van Rossum created Python.",
            "Python was conceived in the late 1980s by Guido van Rossum."
        )
        assert result["score"] == 5
        assert "Guido van Rossum" in result["supporting_evidence"]
        mock_llm.assert_called_once()

def test_evaluate_completeness():
    """Test Completeness Agent returns addressed and missing aspects."""
    with patch("backend.core.agents.completeness._call_llm_json") as mock_llm:
        mock_llm.return_value = {
            "score": 3,
            "addressed_aspects": ["Primary colors red and blue"],
            "missing_aspects": ["Yellow"],
            "reasoning": "Missed yellow."
        }
        
        result = evaluate_completeness(
            "Name 3 primary colors.",
            "Red and blue.",
            reference_answer="Red, yellow, and blue."
        )
        assert result["score"] == 3
        assert len(result["addressed_aspects"]) == 1
        assert "Yellow" in result["missing_aspects"]
        mock_llm.assert_called_once()

def test_detect_hallucination():
    """Test Hallucination Detection Agent extracts flagged claims."""
    with patch("backend.core.agents.hallucination._call_llm_json") as mock_llm:
        mock_llm.return_value = {
            "score": 1,
            "reasoning": "Severe hallucination detected.",
            "flagged_claims": [
                {
                    "statement": "Cracking knuckles causes arthritis.",
                    "status": "contradicted",
                    "explanation": "No medical link found.",
                    "context_quote": "Studies show no correlation with arthritis."
                }
            ]
        }
        
        result = detect_hallucination(
            "Cracking knuckles causes arthritis.",
            "Studies show no correlation between knuckle cracking and arthritis."
        )
        assert result["score"] == 1
        assert len(result["flagged_claims"]) == 1
        assert result["flagged_claims"][0]["status"] == "contradicted"
        mock_llm.assert_called_once()

def test_generate_verdict_scoring():
    """Test Verdict calculation math with default weights (40% Acc, 20% Rel, 20% Comp, 20% Hal)."""
    with patch("backend.core.agents.verdict._call_llm_json") as mock_summary:
        mock_summary.return_value = {
            "major_issues": [],
            "consolidated_reasoning": "Exceptional factual alignment."
        }
        
        # Perfect scores (5/5 on all dimensions)
        # Expected: (5/5)*20 + (5/5)*40 + (5/5)*20 + (5/5)*20 = 100.0
        rel = {"score": 5, "reasoning": "Relevant"}
        acc = {"score": 5, "reasoning": "Accurate", "supporting_evidence": "Quote"}
        comp = {"score": 5, "reasoning": "Complete", "missing_aspects": []}
        hal = {"score": 5, "reasoning": "No hallucination", "flagged_claims": []}
        
        verdict = generate_verdict("Question", "Response", rel, acc, comp, hal)
        assert verdict["final_score"] == 100.0
        assert verdict["verdict"] == "Pass"
        assert "**Supporting Evidence:**" in verdict["breakdown"]["accuracy"]["reasoning"]

def test_generate_verdict_automatic_fail_on_hallucination():
    """Test automatic Fail verdict when Hallucination score <= 2."""
    with patch("backend.core.agents.verdict._call_llm_json") as mock_summary:
        mock_summary.return_value = {
            "major_issues": ["Severe hallucination"],
            "consolidated_reasoning": "Failed due to fabrication."
        }
        
        # Rel: 5 (20 pts), Acc: 5 (40 pts), Comp: 5 (20 pts), Hal: 2 (8 pts) = Total 88 pts
        # Despite score 88, Hallucination <= 2 must trigger automatic "Fail"
        rel = {"score": 5, "reasoning": "Relevant"}
        acc = {"score": 5, "reasoning": "Accurate"}
        comp = {"score": 5, "reasoning": "Complete"}
        hal = {"score": 2, "reasoning": "Fabricated facts"}
        
        verdict = generate_verdict("Question", "Response", rel, acc, comp, hal)
        assert verdict["verdict"] == "Fail"

def test_generate_verdict_needs_improvement():
    """Test 'Needs Improvement' verdict for intermediate scores (50-79)."""
    with patch("backend.core.agents.verdict._call_llm_json") as mock_summary:
        mock_summary.return_value = {
            "major_issues": ["Partial completeness"],
            "consolidated_reasoning": "Partially addresses the prompt."
        }
        
        # Rel: 3 (12 pts), Acc: 3 (24 pts), Comp: 3 (12 pts), Hal: 4 (16 pts) = Total 64 pts
        rel = {"score": 3, "reasoning": "Somewhat relevant"}
        acc = {"score": 3, "reasoning": "Partially accurate"}
        comp = {"score": 3, "reasoning": "Missing some aspects", "missing_aspects": ["Part 2"]}
        hal = {"score": 4, "reasoning": "Minor unverified statement"}
        
        verdict = generate_verdict("Question", "Response", rel, acc, comp, hal)
        assert verdict["final_score"] == 64.0
        assert verdict["verdict"] == "Needs Improvement"
        assert "**Missing Aspects:**" in verdict["breakdown"]["completeness"]["reasoning"]

def test_evaluate_batch_row_consolidated():
    """Test high-speed consolidated batch orchestrator."""
    with patch("backend.core.batch_orchestrator._call_llm_json") as mock_batch:
        mock_batch.return_value = {
            "relevance": {"score": 5, "reasoning": "Fully relevant"},
            "accuracy": {"score": 5, "reasoning": "Accurate", "supporting_evidence": "Evidence"},
            "completeness": {"score": 5, "reasoning": "Complete", "addressed_aspects": ["All"], "missing_aspects": []},
            "hallucination": {"score": 5, "reasoning": "Grounded", "flagged_claims": []},
            "major_issues": [],
            "consolidated_reasoning": "Batch row verified successfully."
        }
        
        result = evaluate_batch_row(
            record_id=1,
            question="What is the capital of France?",
            ai_response="Paris",
            reference_answer="Paris is the capital of France."
        )
        assert result["final_score"] == 100.0
        assert result["verdict"] == "Pass"
        assert "breakdown" in result
        mock_batch.assert_called_once()

def test_call_llm_json_fallback_on_error():
    """Test _call_llm_json graceful fallback when Groq client fails all retries."""
    with patch.object(utils.client.chat.completions, "create", side_effect=Exception("API Error")):
        res = utils._call_llm_json("System prompt", "User prompt", default_score=0, retries=1)
        assert res["score"] == 0
        assert "API Connection Error" in res["major_issues"]
        assert "API Error" in res["reasoning"]

def test_process_evaluation_task(db_session):
    """Test orchestrator pipeline end-to-end with mocked micro-agents."""
    from backend.core.orchestrator import process_evaluation_task
    from backend.api import models
    from tests.conftest import TestingSessionLocal

    record = models.EvaluationRecord(
        question="What is the speed of light?",
        ai_response="About 300,000 km/s.",
        source_document="The speed of light in vacuum is approx 299,792 km/s.",
        status="pending"
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)

    with patch("backend.api.database.SessionLocal", side_effect=lambda: TestingSessionLocal(bind=db_session.connection())), \
         patch("backend.core.agents.evaluate_relevance", return_value={"score": 5, "reasoning": "Direct"}), \
         patch("backend.core.agents.evaluate_accuracy", return_value={"score": 5, "reasoning": "Accurate", "supporting_evidence": "Quote"}), \
         patch("backend.core.agents.evaluate_completeness", return_value={"score": 5, "reasoning": "Complete", "missing_aspects": []}), \
         patch("backend.core.agents.detect_hallucination", return_value={"score": 5, "reasoning": "Grounded", "flagged_claims": []}), \
         patch("backend.core.agents.generate_verdict", return_value={
             "final_score": 100.0,
             "verdict": "Pass",
             "major_issues": [],
             "consolidated_reasoning": "All verified.",
             "breakdown": {
                 "relevance": {"score": 5},
                 "accuracy": {"score": 5},
                 "completeness": {"score": 5},
                 "hallucination": {"score": 5}
             }
         }):
        
        process_evaluation_task(record.id)

    verify_session = TestingSessionLocal(bind=db_session.connection())
    saved_record = verify_session.query(models.EvaluationRecord).filter_by(id=record.id).first()

    assert saved_record.status == "completed"
    assert saved_record.final_score == 100.0
    assert saved_record.score_accuracy == 5.0

