import os
import json
import time
import random
from groq import Groq
from backend.core.config import logger
from dotenv import load_dotenv

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL_NAME = "openai/gpt-oss-120b"

def _call_llm_json(system_prompt: str, user_prompt: str, default_score: int = 0, retries: int = 3) -> dict:
    """Helper to call Groq and return parsed JSON with basic retry logic."""
    for attempt in range(retries):
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error(f"Groq LLM Call Failed (Attempt {attempt+1}/{retries}): {e}")
            
            if attempt < retries - 1:
                sleep_time = 2 ** attempt
                logger.info(f"Retrying in {sleep_time} seconds...")
                time.sleep(sleep_time)
                continue
            
            error_msg = f"Evaluation failed after {retries} attempts: {str(e)}"
            return {
                "relevance": {"score": default_score, "reasoning": error_msg},
                "accuracy": {"score": default_score, "reasoning": error_msg, "supporting_evidence": ""},
                "completeness": {"score": default_score, "reasoning": error_msg, "addressed_aspects": [], "missing_aspects": []},
                "hallucination": {"score": default_score, "reasoning": error_msg},
                "major_issues": ["API Connection Error"],
                "consolidated_reasoning": error_msg
            }
def compute_final_verdict(relevance: dict, accuracy: dict, completeness: dict, hallucination: dict) -> dict:
    """Aggregates scores and computes final verdict report, formatting complex json into markdown for the UI."""
    try:
        r_score = int(relevance.get("score", 0))
        a_score = int(accuracy.get("score", 0))
        c_score = int(completeness.get("score", 0))
        h_score = int(hallucination.get("score", 5))

        raw_score = ((r_score + a_score + c_score) / 15) * 100
        penalty = h_score * 5
        final_score = raw_score - penalty
        final_score = max(0, min(100, final_score))

        # Format Hallucination Reasoning
        h_reasoning = hallucination.get("reasoning", "")
        flagged_claims = hallucination.get("flagged_claims", [])
        if flagged_claims:
            h_reasoning += "\n\n**Flagged Claims:**\n"
            for claim in flagged_claims:
                status_icon = "❌" if claim.get("status") == "contradicted" else "⚠️"
                h_reasoning += f"- {status_icon} *\"{claim.get('statement')}\"* ({claim.get('status').capitalize()}): {claim.get('explanation')}\n"

        # Format Accuracy Reasoning
        a_reasoning = accuracy.get("reasoning", "")
        supporting_evidence = accuracy.get("supporting_evidence", "")
        if supporting_evidence:
            a_reasoning += f"\n\n**Supporting Evidence:**\n> {supporting_evidence}"

        # Format Completeness Reasoning
        c_reasoning = completeness.get("reasoning", "")
        missing = completeness.get("missing_aspects", [])
        if missing:
            c_reasoning += f"\n\n**Missing Aspects:**\n- " + "\n- ".join(missing)

        return {
            "final_score": round(final_score, 1),
            "breakdown": {
                "relevance": {"score": r_score, "reasoning": relevance.get("reasoning", "")},
                "accuracy": {"score": a_score, "reasoning": a_reasoning},
                "completeness": {"score": c_score, "reasoning": c_reasoning},
                "hallucination": {"score": h_score, "reasoning": h_reasoning}
            }
        }
    except Exception as e:
        logger.error(f"Error computing verdict: {e}")
        return {"final_score": 0, "error": "Failed to compute verdict."}
