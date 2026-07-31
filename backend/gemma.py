"""Client for the locally running Ollama server.

This module is the ONLY model access in My-Graine. It talks exclusively to
Ollama on localhost and must never fall back to any remote service.
"""

from typing import Optional

import httpx

OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
DEFAULT_MODEL = "gemma4"
DEFAULT_TIMEOUT = 120.0


class OllamaError(RuntimeError):
    """Raised when the local Ollama server is unreachable or returns a bad response.

    Catch this at call sites and degrade gracefully (e.g. show "model
    offline" in the UI). Never handle it by calling a remote service.
    """


def chat(
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    format: Optional[str] = None,
    temperature: Optional[float] = None,
    num_ctx: Optional[int] = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> str:
    """Send a chat request to local Ollama and return the assistant's content.

    messages: list of {"role": ..., "content": ...} dicts.
    format: pass "json" to ask the model for strict JSON output.
    temperature: optional sampling temperature.
    num_ctx: optional context-window override — needed when sending the full
        diary timeline, which can exceed Ollama's default context size.
    """
    payload: dict = {"model": model, "messages": messages, "stream": False}
    if format is not None:
        payload["format"] = format
    options: dict = {}
    if temperature is not None:
        options["temperature"] = temperature
    if num_ctx is not None:
        options["num_ctx"] = num_ctx
    if options:
        payload["options"] = options

    try:
        response = httpx.post(OLLAMA_CHAT_URL, json=payload, timeout=timeout)
        response.raise_for_status()
    except httpx.ConnectError as exc:
        raise OllamaError(
            f"Cannot reach Ollama at {OLLAMA_CHAT_URL}. "
            "Is Ollama installed and running? Try: ollama serve"
        ) from exc
    except httpx.TimeoutException as exc:
        raise OllamaError(
            f"Ollama request timed out after {timeout}s (model: {model})."
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise OllamaError(
            f"Ollama returned HTTP {exc.response.status_code}: "
            f"{exc.response.text[:500]}. "
            f"Is the model pulled? Try: ollama pull {model}"
        ) from exc

    try:
        data = response.json()
        return data["message"]["content"]
    except (ValueError, KeyError, TypeError) as exc:
        raise OllamaError(
            f"Unexpected response from Ollama: {response.text[:500]}"
        ) from exc


def ping_model(model: str = DEFAULT_MODEL) -> str:
    """Send a trivial prompt to verify the model responds; return the raw text."""
    return chat(
        [{"role": "user", "content": "Reply with the single word: pong"}],
        model=model,
        timeout=30.0,
    )
