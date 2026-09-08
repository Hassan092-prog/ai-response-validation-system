from .utils import _call_llm_json

def evaluate_completeness(question: str, ai_response: str) -> dict:
    """Assesses if the AI response covers all parts of the user prompt thoroughly."""
    system_prompt = (
        "You are an expert Completeness Judge. Determine if the AI response comprehensively addresses all facets of the question without leaving things out.\n"
        "Output JSON exactly in this format: {\"score\": <int 1-5>, \"reasoning\": \"<brief explanation>\"}\n"
        "Score 1 means completely incomplete, Score 5 means thoroughly comprehensive."
    )
    user_prompt = f"Question: {question}\n\nAI Response: {ai_response}"
    return _call_llm_json(system_prompt, user_prompt)
