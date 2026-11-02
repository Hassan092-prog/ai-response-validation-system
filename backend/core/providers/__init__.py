import os
from typing import Dict, Optional, Type
from backend.core.config import logger
from .base import BaseLLMProvider
from .groq_provider import GroqProvider
from .ollama_provider import OllamaProvider
from .openai_provider import OpenAIProvider

_PROVIDERS: Dict[str, Type[BaseLLMProvider]] = {
    "groq": GroqProvider,
    "ollama": OllamaProvider,
    "openai": OpenAIProvider,
}

_provider_instances: Dict[str, BaseLLMProvider] = {}


def clear_provider_cache() -> None:
    """Clears cached provider instances (primarily for testing and dynamic config reload)."""
    _provider_instances.clear()


def get_provider(name: str, **kwargs) -> BaseLLMProvider:
    """Instantiates or retrieves an LLM provider by name ('groq', 'ollama', 'openai')."""
    normalized = (name or "").lower().strip()
    provider_cls = _PROVIDERS.get(normalized)

    if not provider_cls:
        logger.warning(f"Unknown LLM provider '{name}', defaulting to Groq.")
        provider_cls = GroqProvider
        normalized = "groq"

    if not kwargs and normalized in _provider_instances:
        return _provider_instances[normalized]

    instance = provider_cls(**kwargs)
    if not kwargs:
        _provider_instances[normalized] = instance
    return instance


def get_active_provider(provider_override: Optional[str] = None) -> BaseLLMProvider:
    """
    Returns the configured active LLM provider.
    Reads LLM_PROVIDER from environment, defaulting to 'groq'.
    """
    if provider_override:
        return get_provider(provider_override)

    provider_name = os.getenv("LLM_PROVIDER", "groq")
    return get_provider(provider_name)

