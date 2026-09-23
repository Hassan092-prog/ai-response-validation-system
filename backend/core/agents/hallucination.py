from .utils import _call_llm_json

def detect_hallucination(ai_response: str, context: str) -> dict:
    """Analyzes response for claims not supported by or contradicting retrieved context."""
    system_prompt = (
        "You are an expert Hallucination Detector. Analyze the AI response for claims that are unsupported by or actively contradict the Verified Context.\n"
        "You MUST break the AI response into individual factual claims and cross-reference each against the context.\n"
        "Output JSON exactly in this format:\n"
        "{\n"
        "  \"score\": <int 1-5>,\n"
        "  \"reasoning\": \"<overall explanation>\",\n"
        "  \"flagged_claims\": [\n"
        "    {\n"
        "      \"statement\": \"<exact claim from response>\",\n"
        "      \"status\": \"<unsupported OR contradicted>\",\n"
        "      \"explanation\": \"<why it is flagged>\"\n"
        "    }\n"
        "  ]\n"
        "}\n"
        "Score 5 means absolutely no hallucination (perfectly supported). Score 1 means severe hallucination (completely fabricated). Only include unsupported or contradicted claims in the `flagged_claims` list."
    )
    user_prompt = f"Verified Context: {context}\n\nAI Response: {ai_response}"
    return _call_llm_json(system_prompt, user_prompt, default_score=5)
