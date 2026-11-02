import os
from typing import Any, Dict, Optional
from groq import Groq
from backend.core.config import logger
from .base import BaseLLMProvider, extract_json

DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"


class GroqProvider(BaseLLMProvider):
    """Groq LLM Provider executing ultra-fast inference via the Groq Cloud API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        client: Optional[Groq] = None,
    ):
        self._api_key = api_key or os.getenv("GROQ_API_KEY")
        self._model = model or os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL)
        self._client = client

    @property
    def client(self) -> Groq:
        """Exposes the underlying client for backward-compatibility with tests."""
        if self._client is None:
            self._client = Groq(api_key=self._api_key or os.getenv("GROQ_API_KEY") or "placeholder-groq-key")
        return self._client

    @property
    def provider_name(self) -> str:
        return "groq"

    @property
    def model_name(self) -> str:
        return self._model

    def complete_json(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        logger.debug(f"[GroqProvider] Invoking model '{self._model}'")
        response = self.client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        content = response.choices[0].message.content or ""
        return extract_json(content)
