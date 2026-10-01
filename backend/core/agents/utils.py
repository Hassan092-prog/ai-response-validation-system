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

