import json
import re
from abc import ABC, abstractmethod
from typing import Any, Dict


def extract_json(raw_text: str) -> Dict[str, Any]:
    """
    Extracts and parses a JSON object from raw LLM text output.
    Handles:
    - Pure JSON strings: '{"score": 5}'
    - Markdown code fences: '```json\n{"score": 5}\n```'
    - Conversational preambles/postambles from smaller local models:
      'Certainly! Here is the JSON:\n{"score": 5}\nDone.'
    """
    if not raw_text:
        raise ValueError("LLM returned empty or null text.")

    text = raw_text.strip()

    # 1. Strip markdown fences if wrapping the entire string
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
        text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE).strip()

    # 2. Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 3. Locate outermost curly braces {...} to extract embedded JSON object
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = text[first_brace : last_brace + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # 4. Fallback: raise JSONDecodeError with preview of received text
    raise json.JSONDecodeError(
        f"Failed to extract valid JSON from LLM response: {text[:150]}...",
        doc=raw_text,
        pos=0,
    )


class BaseLLMProvider(ABC):
    """Abstract base class for model-agnostic LLM inference providers."""

    @abstractmethod
    def complete_json(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        """
        Executes an inference call against the LLM provider, enforcing JSON output.
        Returns a parsed dictionary. Raises an Exception if the call fails.
        """
        pass

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """The canonical lowercase identifier for this provider (e.g. 'groq', 'ollama', 'openai')."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """The identifier of the model being evaluated (e.g. 'openai/gpt-oss-120b', 'gpt-4o-mini')."""
        pass


