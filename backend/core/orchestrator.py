import json
import concurrent.futures
from sqlalchemy.orm import Session
from backend.api import models, database
from backend.core import agents
from backend.core.config import logger
from backend.kb.retrieve import retrieve_context

def process_evaluation_task(evaluation_id: int):
    """Background task to orchestrate the AI evaluation pipeline."""
    from backend.api.database import SessionLocal
    db = SessionLocal()
    try:
        # Fetch record
        record = db.query(models.EvaluationRecord).filter(models.EvaluationRecord.id == evaluation_id).first()
        if not record:
            logger.error(f"EvaluationRecord {evaluation_id} not found.")
            return

        logger.info(f"Orchestrator started for evaluation {evaluation_id}")
        
        # 1. Use the Consolidated Batch Orchestrator to save API quota
        # We switched to this to prevent 429 Quota Exceeded errors on restricted free-tier API keys.
        from backend.core.batch_orchestrator import evaluate_batch_row
        
        logger.info(f"Evaluation {evaluation_id}: Running Consolidated Master Prompt (1 API Request)...")
        final_verdict = evaluate_batch_row(
            record_id=record.id,
            question=record.question,
            ai_response=record.ai_response,
            reference_answer=record.reference_answer,
            source_document=record.source_document
        )
        
        # 2. Save to Database
        record.status = "completed"
        record.result_json = json.dumps(final_verdict)
        
        # Save individual numeric scores to the new columns for faster queries
        record.final_score = final_verdict.get("final_score")
        
        breakdown = final_verdict.get("breakdown", {})
        record.score_relevance = breakdown.get("relevance", {}).get("score")
        record.score_accuracy = breakdown.get("accuracy", {}).get("score")
        record.score_completeness = breakdown.get("completeness", {}).get("score")
        record.score_hallucination = breakdown.get("hallucination", {}).get("score")
        
        db.commit()
        
        logger.info(f"Evaluation {evaluation_id} completed successfully. Score: {final_verdict.get('final_score')}")

    except Exception as e:
        logger.error(f"Error processing evaluation {evaluation_id}: {e}")
        # Make sure to mark as failed
        record = db.query(models.EvaluationRecord).filter(models.EvaluationRecord.id == evaluation_id).first()
        if record:
            record.status = "failed"
            record.result_json = json.dumps({"error": str(e)})
            db.commit()
    finally:
        db.close()
