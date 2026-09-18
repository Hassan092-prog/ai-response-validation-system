from .utils import _call_llm_json

def evaluate_completeness(question: str, ai_response: str, reference_answer: str = None, context: str = "") -> dict:
    """Assesses if the AI response covers all parts of the user prompt thoroughly."""
    
    ref_text = ""
    if reference_answer:
        ref_text = f"\n\nReference Answer (Expected Information):\n{reference_answer}"
    elif context:
        ref_text = f"\n\nRetrieved Context (Expected Information):\n{context}"

    system_prompt = (
        "You are an expert Completeness Judge. Determine if the AI response comprehensively addresses all facets of the question without leaving things out.\n"
        "Identify the individual requirements, sub-questions, or expected information contained within the submitted question and the expected information.\n"
        "Output JSON exactly in this format:\n"
        "{\n"
        "  \"score\": <int 1-5>,\n"
        "  \"addressed_aspects\": [\"aspect 1\", \"aspect 2\"],\n"
        "  \"missing_aspects\": [\"aspect 1\"],\n"
        "  \"reasoning\": \"<brief explanation for the score>\"\n"
        "}\n"
        "Score 1 means completely incomplete, Score 5 means thoroughly comprehensive."
    )
    user_prompt = f"Question: {question}\n\nAI Response: {ai_response}{ref_text}"
    return _call_llm_json(system_prompt, user_prompt)
