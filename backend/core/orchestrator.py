import json
from sqlalchemy.orm import Session
from backend.api import models, database
from backend.core import agents
from backend.core.config import logger
from backend.kb.retrieve import retrieve_context

def process_evaluation_task(evaluation_id: int):
    """Background task to orchestrate the AI evaluation pipeline."""
    db: Session = next(database.get_db())
    try:
        # Fetch record
        record = db.query(models.EvaluationRecord).filter(models.EvaluationRecord.id == evaluation_id).first()
        if not record:
            logger.error(f"EvaluationRecord {evaluation_id} not found.")
            return

        logger.info(f"Orchestrator started for evaluation {evaluation_id}")
        
        # 1. Retrieve Context
        context = ""
        if record.source_document:
            context += f"\nUser Provided Source: {record.source_document}"
        else:
            logger.info(f"Evaluation {evaluation_id}: No source document provided. Querying ChromaDB...")
            rag_context = retrieve_context(record.question)
            context += f"\nRetrieved Knowledge Base Context:\n{rag_context}"
            
        # 2. Call Judge Agents (In sequence for simplicity, could be ThreadPoolExecutor)
        logger.info(f"Evaluation {evaluation_id}: Running Relevance Judge...")
        relevance_res = agents.evaluate_relevance(record.question, record.ai_response)
        
        logger.info(f"Evaluation {evaluation_id}: Running Accuracy Judge...")
        accuracy_res = agents.evaluate_accuracy(record.question, record.ai_response, context)
        
        logger.info(f"Evaluation {evaluation_id}: Running Completeness Judge...")
        completeness_res = agents.evaluate_completeness(record.question, record.ai_response)
        
        logger.info(f"Evaluation {evaluation_id}: Running Hallucination Detector...")
        hallucination_res = agents.detect_hallucination(record.ai_response, context)
        
        # 3. Verdict Aggregation
        logger.info(f"Evaluation {evaluation_id}: Computing Final Verdict...")
        final_verdict = agents.compute_final_verdict(
            relevance_res, accuracy_res, completeness_res, hallucination_res
        )
        
        # 4. Save to Database
        record.status = "completed"
        record.result_json = json.dumps(final_verdict)
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
