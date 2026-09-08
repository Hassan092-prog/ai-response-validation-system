from .utils import _call_llm_json

def evaluate_accuracy(question: str, ai_response: str, context: str) -> dict:
    """Evaluates factual correctness heavily weighting the retrieved context."""
    system_prompt = (
        "You are an expert Accuracy Judge. Evaluate the factual correctness of the AI response based primarily on the provided Verified Context.\n"
        "Output JSON exactly in this format: {\"score\": <int 1-5>, \"reasoning\": \"<explanation>\", \"supporting_evidence\": \"<exact quote from context>\"}\n"
        "Use the following strict scale:\n"
        "1 = Contradictory (completely false based on context).\n"
        "2 = Incorrect (mostly false claims).\n"
        "3 = Partially correct.\n"
        "4 = Mostly correct.\n"
        "5 = Correct (completely accurate based on context).\n"
        "You MUST extract direct quotes from the Verified Context into the `supporting_evidence` field to justify your score."
    )
    user_prompt = f"Question: {question}\n\nVerified Context: {context}\n\nAI Response: {ai_response}"
    return _call_llm_json(system_prompt, user_prompt)
