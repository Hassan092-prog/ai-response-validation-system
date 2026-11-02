import os
from typing import Any, Dict, Optional
from backend.core.config import logger
from .base import BaseLLMProvider, extract_json

DEFAULT_OPENAI_MODEL = "gpt-4o-mini"


class OpenAIProvider(BaseLLMProvider):
    """
    OpenAI Provider executing inference against OpenAI or OpenAI-compatible endpoints
    (e.g., Azure OpenAI, Together AI, vLLM, DeepSeek, LocalAI).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        client: Optional[Any] = None,
    ):
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")
        self._model = model or os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)
        self._base_url = base_url or os.getenv("OPENAI_BASE_URL")
        self._client = client

    @property
    def client(self) -> Any:
        if self._client is None:
            from openai import OpenAI
            api_key = self._api_key or os.getenv("OPENAI_API_KEY") or "placeholder-openai-key"
            kwargs = {"api_key": api_key}
            if self._base_url:
                kwargs["base_url"] = self._base_url
            self._client = OpenAI(**kwargs)
        return self._client

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return self._model

    def complete_json(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        if not self._api_key and not os.getenv("OPENAI_API_KEY") and not self._base_url:
            raise ValueError(
                "OPENAI_API_KEY is not set. Please set the OPENAI_API_KEY environment variable "
                "or configure a custom OPENAI_BASE_URL."
            )
        logger.debug(f"[OpenAIProvider] Invoking model '{self._model}'")
        client = self.client
        response = client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        content = (response.choices[0].message.content or "").strip()
        return extract_json(content)
