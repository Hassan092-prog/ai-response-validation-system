import json
import time
from backend.core.agents.utils import _call_llm_json, logger
from backend.kb.retrieve import retrieve_context

def evaluate_batch_row(record_id: int, question: str, ai_response: str, reference_answer: str = None, source_document: str = None) -> dict:
    """Evaluates a single row using a Consolidated Master Prompt to save API quota."""
    logger.info(f"Batch Orchestrator evaluating row {record_id}...")
    
    context = ""
    rag_context = None
    if source_document:
        context += f"\nUser Provided Source: {source_document}"
    elif not reference_answer:
        rag_context = retrieve_context(question)
        context += f"\nRetrieved Knowledge Base Context:\n{rag_context}"

    system_prompt = (
        "You are a Master AI Evaluation Judge. You must evaluate the AI response across 4 dimensions: "
        "Relevance, Accuracy, Completeness, and Hallucination. "
        "You must output ONLY valid JSON matching this exact structure:\n"
        "{\n"
        "  \"relevance\": {\"score\": <1-5>, \"reasoning\": \"<str>\"},\n"
        "  \"accuracy\": {\"score\": <1-5>, \"reasoning\": \"<str>\", \"supporting_evidence\": \"<str>\"},\n"
        "  \"completeness\": {\"score\": <1-5>, \"reasoning\": \"<str>\", \"addressed_aspects\": [\"<str>\"], \"missing_aspects\": [\"<str>\"]},\n"
        "  \"hallucination\": {\"score\": <1-5>, \"reasoning\": \"<str>\"},\n"
        "  \"major_issues\": [\"<str>\"],\n"
        "  \"consolidated_reasoning\": \"<2-3 sentence executive summary>\"\n"
        "}\n"
    )
    
    user_prompt = f"Question: {question}\n\nAI Response: {ai_response}\n\nReference/Context: {reference_answer or context}"
    
    try:
        res = _call_llm_json(system_prompt, user_prompt)
        
        # Calculate Weighted Final Score
        r_score = res.get("relevance", {}).get("score", 0)
        a_score = res.get("accuracy", {}).get("score", 0)
        c_score = res.get("completeness", {}).get("score", 0)
        h_score = res.get("hallucination", {}).get("score", 0)
        
        final_score = round(((r_score/5)*20) + ((a_score/5)*40) + ((c_score/5)*20) + ((h_score/5)*20), 1)
        
        verdict = "Pass"
        if final_score < 50 or h_score <= 2 or a_score <= 1:
            verdict = "Fail"
        elif final_score < 80:
            verdict = "Needs Improvement"
            
        final_res = {
            "final_score": final_score,
            "verdict": verdict,
            "major_issues": res.get("major_issues", []),
            "consolidated_reasoning": res.get("consolidated_reasoning", ""),
            "breakdown": res
        }
        if rag_context:
            final_res["rag_context"] = rag_context
            
        return final_res
    except Exception as e:
        logger.error(f"Batch evaluation failed for record {record_id}: {e}")
        return {"final_score": 0, "verdict": "Fail", "error": str(e)}
