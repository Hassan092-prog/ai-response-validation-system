import os
import time
from typing import Any, Dict, Optional
from dotenv import load_dotenv
from backend.core.config import logger
from backend.core.providers import get_active_provider, get_provider

load_dotenv()

# Initialize primary Groq provider and expose client at module level for test patchability
groq_provider = get_provider("groq")
client = groq_provider.client
MODEL_NAME = groq_provider.model_name


def _call_llm_json(
    system_prompt: str,
    user_prompt: str,
    default_score: int = 0,
    retries: int = 3,
    provider_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Model-agnostic helper to call the active LLM provider and return parsed JSON
    with exponential retry and optional secondary failover support.
    """
    active_provider = get_active_provider(provider_override)

    # Sync module-level client if Groq provider is active (preserves mockability in tests)
    if active_provider.provider_name == "groq":
        active_provider._client = client

    last_error: Optional[Exception] = None

    for attempt in range(retries):
        try:
            return active_provider.complete_json(system_prompt, user_prompt)
        except Exception as e:
            last_error = e
            logger.error(
                f"[{active_provider.provider_name.upper()}] LLM Call Failed "
                f"(Attempt {attempt + 1}/{retries}): {e}"
            )

            if attempt < retries - 1:
                sleep_time = 2 ** attempt
                logger.info(f"Retrying in {sleep_time} seconds...")
                time.sleep(sleep_time)
                continue

    # All primary retries exhausted; check for secondary failover provider
    fallback_name = os.getenv("LLM_FALLBACK_PROVIDER")
    if fallback_name and fallback_name.lower().strip() != active_provider.provider_name:
        fallback_provider = get_provider(fallback_name)
        logger.warning(
            f"Primary provider '{active_provider.provider_name}' exhausted {retries} retries. "
            f"Attempting failover to '{fallback_provider.provider_name}'..."
        )
        try:
            return fallback_provider.complete_json(system_prompt, user_prompt)
        except Exception as fb_err:
            logger.error(f"Fallback provider '{fallback_provider.provider_name}' also failed: {fb_err}")
            last_error = fb_err

    error_msg = f"Evaluation failed after {retries} attempts: {str(last_error)}"
    return {
        "score": default_score,
        "reasoning": error_msg,
        "relevance": {"score": default_score, "reasoning": error_msg},
        "accuracy": {"score": default_score, "reasoning": error_msg, "supporting_evidence": ""},
        "completeness": {"score": default_score, "reasoning": error_msg, "addressed_aspects": [], "missing_aspects": []},
        "hallucination": {"score": default_score, "reasoning": error_msg, "flagged_claims": []},
        "major_issues": ["API Connection Error"],
        "consolidated_reasoning": error_msg,
    }
