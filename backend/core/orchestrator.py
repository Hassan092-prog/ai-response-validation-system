import json
import concurrent.futures
from sqlalchemy.orm import Session
from backend.api import models, database
from backend.core import agents
from backend.core.config import logger
from backend.kb.retrieve import retrieve_context

def process_evaluation_task(evaluation_id: int):
    """Background task to orchestrate the AI evaluation pipeline using distributed agents."""
    from backend.api.database import SessionLocal
    db = SessionLocal()
    try:
        # Fetch record
        record = db.query(models.EvaluationRecord).filter(models.EvaluationRecord.id == evaluation_id).first()
        if not record:
            logger.error(f"EvaluationRecord {evaluation_id} not found.")
            return

        logger.info(f"Orchestrator started for evaluation {evaluation_id}")
        
        # 1. Prepare Context
        context = ""
        if record.source_document:
            context += f"\nUser Provided Source: {record.source_document}"
        elif not record.reference_answer:
            rag_context = retrieve_context(record.question)
            context += f"\nRetrieved Knowledge Base Context:\n{rag_context}"
            
        full_context = record.reference_answer or context

        # 2. Execute M1-M3 Individual Agents in Parallel
        logger.info(f"Evaluation {evaluation_id}: Dispatching to Relevance, Accuracy, Completeness, and Hallucination agents...")
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            future_rel = executor.submit(agents.evaluate_relevance, record.question, record.ai_response)
            future_acc = executor.submit(agents.evaluate_accuracy, record.question, record.ai_response, full_context)
            future_com = executor.submit(agents.evaluate_completeness, record.question, record.ai_response, record.reference_answer, context)
            future_hal = executor.submit(agents.detect_hallucination, record.ai_response, full_context)
            
            rel_res = future_rel.result()
            acc_res = future_acc.result()
            com_res = future_com.result()
            hal_res = future_hal.result()

        # 3. Aggregate via Verdict Agent
        logger.info(f"Evaluation {evaluation_id}: Generating final Verdict...")
        final_verdict = agents.generate_verdict(
            record.question, 
            record.ai_response, 
            rel_res, 
            acc_res, 
            com_res, 
            hal_res
        )
        
        # 4. Save to Database
        record.status = "completed"
        record.result_json = json.dumps(final_verdict)
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
