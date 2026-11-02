import json
from unittest.mock import MagicMock, patch
import httpx
import pytest
from backend.core.providers.base import BaseLLMProvider, extract_json
from backend.core.providers.groq_provider import GroqProvider
from backend.core.providers.ollama_provider import OllamaProvider
from backend.core.providers.openai_provider import OpenAIProvider
from backend.core.providers import get_provider, get_active_provider, clear_provider_cache
from backend.core.agents.utils import _call_llm_json


def test_base_provider_cannot_instantiate():
    with pytest.raises(TypeError):
        BaseLLMProvider()


def test_extract_json_variants():
    # Pure JSON
    assert extract_json('{"score": 5, "reasoning": "Perfect"}') == {"score": 5, "reasoning": "Perfect"}

    # Markdown fenced JSON
    fenced = '```json\n{"score": 4, "reasoning": "Good"}\n```'
    assert extract_json(fenced) == {"score": 4, "reasoning": "Good"}

    # Conversational preamble & postamble (common with smaller local models)
    conversational = (
        'Here is the evaluation result you requested:\n\n'
        '{"score": 3, "reasoning": "Average answer"}\n\n'
        'Hope this helps!'
    )
    assert extract_json(conversational) == {"score": 3, "reasoning": "Average answer"}

    # Empty text
    with pytest.raises(ValueError):
        extract_json("")

    # Invalid syntax
    with pytest.raises(json.JSONDecodeError):
        extract_json("Not a json at all")


def test_groq_provider_metadata_and_execution():
    mock_client = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = json.dumps({"score": 5, "reasoning": "Valid"})
    mock_response = MagicMock(choices=[mock_choice])
    mock_client.chat.completions.create.return_value = mock_response

    provider = GroqProvider(api_key="fake-key", model="test-model", client=mock_client)
    assert provider.provider_name == "groq"
    assert provider.model_name == "test-model"

    result = provider.complete_json("Sys", "User")
    assert result == {"score": 5, "reasoning": "Valid"}
    mock_client.chat.completions.create.assert_called_once()


def test_ollama_provider_execution():
    with patch("httpx.Client") as mock_client_cls:
        mock_http = MagicMock()
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "message": {"content": "```json\n{\"score\": 4, \"reasoning\": \"Good\"}\n```"}
        }
        mock_resp.raise_for_status.return_value = None
        mock_http.post.return_value = mock_resp
        mock_client_cls.return_value.__enter__.return_value = mock_http

        provider = OllamaProvider(base_url="http://localhost:11434", model="llama3.2:3b")
        assert provider.provider_name == "ollama"
        assert provider.model_name == "llama3.2:3b"

        result = provider.complete_json("Sys", "User")
        assert result == {"score": 4, "reasoning": "Good"}
        mock_http.post.assert_called_once()
        assert "http://localhost:11434/api/chat" in mock_http.post.call_args[0][0]


def test_ollama_provider_connection_error():
    with patch("httpx.Client") as mock_client_cls:
        mock_http = MagicMock()
        mock_http.post.side_effect = httpx.ConnectError("Connection refused")
        mock_client_cls.return_value.__enter__.return_value = mock_http

        provider = OllamaProvider(base_url="http://localhost:11434", model="llama3.2:3b")
        with pytest.raises(ConnectionError, match="Ensure Ollama is running"):
            provider.complete_json("Sys", "User")


def test_ollama_provider_missing_model_error():
    with patch("httpx.Client") as mock_client_cls:
        mock_http = MagicMock()
        req = httpx.Request("POST", "http://localhost:11434/api/chat")
        resp = httpx.Response(status_code=404, request=req)
        mock_http.post.side_effect = httpx.HTTPStatusError("Not Found", request=req, response=resp)
        mock_client_cls.return_value.__enter__.return_value = mock_http

        provider = OllamaProvider(base_url="http://localhost:11434", model="missing-model")
        with pytest.raises(RuntimeError, match="ollama pull missing-model"):
            provider.complete_json("Sys", "User")


def test_openai_provider_execution():
    mock_client = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = "```json\n{\"score\": 5, \"reasoning\": \"Clean\"}\n```"
    mock_response = MagicMock(choices=[mock_choice])
    mock_client.chat.completions.create.return_value = mock_response

    provider = OpenAIProvider(api_key="sk-test", model="gpt-4o-mini", client=mock_client)
    assert provider.provider_name == "openai"
    assert provider.model_name == "gpt-4o-mini"

    result = provider.complete_json("Sys", "User")
    assert result == {"score": 5, "reasoning": "Clean"}
    mock_client.chat.completions.create.assert_called_once()


def test_openai_provider_missing_key_error(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    provider = OpenAIProvider(api_key=None, base_url=None)
    with pytest.raises(ValueError, match="OPENAI_API_KEY is not set"):
        provider.complete_json("Sys", "User")


def test_provider_factory():
    clear_provider_cache()
    groq = get_provider("groq")
    assert isinstance(groq, GroqProvider)

    ollama = get_provider("ollama")
    assert isinstance(ollama, OllamaProvider)

    openai = get_provider("openai")
    assert isinstance(openai, OpenAIProvider)

    # Unknown fallback to Groq
    unknown = get_provider("nonexistent")
    assert isinstance(unknown, GroqProvider)


def test_get_active_provider_env(monkeypatch):
    clear_provider_cache()
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    active = get_active_provider()
    assert isinstance(active, OllamaProvider)
    assert active.provider_name == "ollama"

    monkeypatch.setenv("LLM_PROVIDER", "openai")
    active2 = get_active_provider()
    assert isinstance(active2, OpenAIProvider)
    assert active2.provider_name == "openai"


def test_call_llm_json_fallback_provider_success(monkeypatch):
    """When primary provider fails, secondary failover provider succeeds."""
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("LLM_FALLBACK_PROVIDER", "ollama")

    mock_failing_primary = MagicMock()
    mock_failing_primary.provider_name = "groq"
    mock_failing_primary.complete_json.side_effect = Exception("Groq Rate Limit")

    mock_fallback = MagicMock()
    mock_fallback.provider_name = "ollama"
    mock_fallback.complete_json.return_value = {"score": 5, "reasoning": "Fallback OK"}

    def fake_get_provider(name, **kwargs):
        if name == "groq":
            return mock_failing_primary
        return mock_fallback

    with patch("backend.core.agents.utils.get_active_provider", return_value=mock_failing_primary), \
         patch("backend.core.agents.utils.get_provider", side_effect=fake_get_provider):

        res = _call_llm_json("Sys", "User", retries=1)
        assert res["score"] == 5
        assert res["reasoning"] == "Fallback OK"
        mock_fallback.complete_json.assert_called_once_with("Sys", "User")
