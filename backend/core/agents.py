import os
import json
import google.generativeai as genai
from backend.core.config import logger
from dotenv import load_dotenv

# Load environment variables (e.g. GEMINI_API_KEY)
load_dotenv()

# Initialize Gemini client
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
MODEL_NAME = "gemini-3.6-flash"

def _call_llm_json(system_prompt: str, user_prompt: str) -> dict:
    """Helper to call Gemini and return parsed JSON."""
    try:
        model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            system_instruction=system_prompt,
            generation_config={"response_mime_type": "application/json", "temperature": 0.1}
        )
        response = model.generate_content(user_prompt)
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"LLM Call Failed: {e}")
        # Return a safe fallback so the pipeline doesn't completely crash
        return {"score": 0, "reasoning": f"Evaluation failed due to LLM error: {str(e)}"}


def evaluate_relevance(question: str, ai_response: str) -> dict:
    """Evaluates how well the AI's response addresses the specific question asked."""
    system_prompt = (
        "You are an expert Relevance Judge. Your task is to evaluate if an AI response directly answers the user's question.\n"
        "Output JSON exactly in this format: {\"score\": <int 1-5>, \"reasoning\": \"<brief explanation>\"}\n"
        "Score 1 means completely irrelevant, Score 5 means highly relevant."
    )
    user_prompt = f"Question: {question}\n\nAI Response: {ai_response}"
    return _call_llm_json(system_prompt, user_prompt)


def evaluate_accuracy(question: str, ai_response: str, context: str) -> dict:
    """Evaluates factual correctness heavily weighting the retrieved context."""
    system_prompt = (
        "You are an expert Accuracy Judge. Evaluate the factual correctness of the AI response based primarily on the provided Verified Context.\n"
        "Output JSON exactly in this format: {\"score\": <int 1-5>, \"reasoning\": \"<brief explanation>\"}\n"
        "Score 1 means completely incorrect or unsupported by context, Score 5 means completely accurate based on the context."
    )
    user_prompt = f"Question: {question}\n\nVerified Context: {context}\n\nAI Response: {ai_response}"
    return _call_llm_json(system_prompt, user_prompt)


def evaluate_completeness(question: str, ai_response: str) -> dict:
    """Assesses if the AI response covers all parts of the user prompt thoroughly."""
    system_prompt = (
        "You are an expert Completeness Judge. Determine if the AI response comprehensively addresses all facets of the question without leaving things out.\n"
        "Output JSON exactly in this format: {\"score\": <int 1-5>, \"reasoning\": \"<brief explanation>\"}\n"
        "Score 1 means completely misses the point, Score 5 means thoroughly comprehensive."
    )
    user_prompt = f"Question: {question}\n\nAI Response: {ai_response}"
    return _call_llm_json(system_prompt, user_prompt)


def detect_hallucination(ai_response: str, context: str) -> dict:
    """Analyzes response for claims not supported by or contradicting retrieved context."""
    system_prompt = (
        "You are an expert Hallucination Detector. Analyze if the AI makes claims that are NOT present in or actively contradict the Verified Context.\n"
        "Output JSON exactly in this format: {\"score\": <int 0-5>, \"reasoning\": \"<brief explanation>\"}\n"
        "Score 0 means no hallucination. Score 5 means severe hallucination (making up major false facts)."
    )
    user_prompt = f"Verified Context: {context}\n\nAI Response: {ai_response}"
    return _call_llm_json(system_prompt, user_prompt)


def compute_final_verdict(relevance: dict, accuracy: dict, completeness: dict, hallucination: dict) -> dict:
    """Aggregates scores and computes final verdict report."""
    try:
        r_score = int(relevance.get("score", 0))
        a_score = int(accuracy.get("score", 0))
        c_score = int(completeness.get("score", 0))
        h_score = int(hallucination.get("score", 5)) # Default to high hallucination if missing

        # Math formula from Architecture spec
        # ((Relevance + Accuracy + Completeness) / 15) * 100 - (Hallucination Penalty * 5)
        raw_score = ((r_score + a_score + c_score) / 15) * 100
        penalty = h_score * 5
        final_score = raw_score - penalty

        # Cap between 0 and 100
        final_score = max(0, min(100, final_score))

        return {
            "final_score": round(final_score, 1),
            "breakdown": {
                "relevance": {"score": r_score, "reasoning": relevance.get("reasoning", "")},
                "accuracy": {"score": a_score, "reasoning": accuracy.get("reasoning", "")},
                "completeness": {"score": c_score, "reasoning": completeness.get("reasoning", "")},
                "hallucination": {"score": h_score, "reasoning": hallucination.get("reasoning", "")}
            }
        }
    except Exception as e:
        logger.error(f"Error computing verdict: {e}")
        return {"final_score": 0, "error": "Failed to compute verdict."}
