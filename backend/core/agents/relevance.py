from .utils import _call_llm_json

def evaluate_relevance(question: str, ai_response: str) -> dict:
    """Evaluates how well the AI's response addresses the specific question asked."""
    system_prompt = (
        "You are an expert Relevance Judge. Your task is to evaluate if an AI response directly answers the user's question.\n"
        "Output JSON exactly in this format: {\"score\": <int 1-5>, \"reasoning\": \"<brief explanation>\"}\n"
        "Use the following strict scale:\n"
        "1 = Off-topic (does not address the prompt at all).\n"
        "2 = Unrelated (tangential but misses the core question).\n"
        "3 = Partially relevant (addresses some parts of the question).\n"
        "4 = Mostly relevant.\n"
        "5 = Fully relevant (directly and appropriately answers the question)."
    )
    user_prompt = f"Question: {question}\n\nAI Response: {ai_response}"
    return _call_llm_json(system_prompt, user_prompt)
