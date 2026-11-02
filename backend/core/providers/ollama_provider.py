import os
from typing import Any, Dict, Optional
import httpx
from backend.core.config import logger
from .base import BaseLLMProvider, extract_json

DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "llama3.2:3b"


class OllamaProvider(BaseLLMProvider):
    """
    Ollama LLM Provider executing local/offline inference via the Ollama REST API.
    Does not require external API keys or cloud internet connectivity.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 60.0,
    ):
        self._base_url = (base_url or os.getenv("OLLAMA_BASE_URL", DEFAULT_OLLAMA_BASE_URL)).rstrip("/")
        self._model = model or os.getenv("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL)
        self._timeout = timeout

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def base_url(self) -> str:
        return self._base_url

    def complete_json(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        logger.debug(f"[OllamaProvider] Invoking local model '{self._model}' at {self._base_url}")
        endpoint = f"{self._base_url}/api/chat"

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "format": "json",
            "stream": False,
            "options": {
                "temperature": 0.1,
            },
        }

        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.post(endpoint, json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.ConnectError as e:
            raise ConnectionError(
                f"Could not connect to Ollama service at {self._base_url}. "
                "Ensure Ollama is running ('ollama serve')."
            ) from e
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                raise RuntimeError(
                    f"Ollama model '{self._model}' not found at {self._base_url}. "
                    f"Run 'ollama pull {self._model}' to install it."
                ) from e
            raise

        content = data.get("message", {}).get("content", "").strip()
        return extract_json(content)

