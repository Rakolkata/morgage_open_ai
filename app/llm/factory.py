from __future__ import annotations

import logging
from typing import Union

from app.config import get_settings
from app.llm.ollama_client import OllamaService
from app.llm.vllm_client import VLLMService

logger = logging.getLogger(__name__)

LLMClient = Union[OllamaService, VLLMService]


def get_llm_service(mode: str | None = None) -> LLMClient:
    """
    Factory function returning the configured LLM client:
    - 'ollama': Local development using Ollama (default).
    - 'vllm': Production deployment using vLLM (OpenAI-compatible).

    Can be controlled via the LLM_MODE environment variable ('ollama' or 'vllm').
    """
    settings = get_settings()
    active_mode = (mode or settings.llm_mode or "ollama").strip().lower()

    if active_mode in {"vllm", "v_llm", "openai"}:
        logger.info(
            "Using vLLM production backend (model='%s', base_url='%s')",
            settings.vllm_model or settings.ollama_model,
            settings.vllm_base_url
        )
        return VLLMService(
            model=settings.vllm_model or settings.ollama_model,
            base_url=settings.vllm_base_url,
            api_key=settings.vllm_api_key,
            timeout=settings.vllm_timeout_seconds
        )

    # Default to Ollama for local development
    logger.info(
        "Using Ollama local backend (model='%s', host='%s')",
        settings.ollama_model,
        settings.ollama_base_url
    )
    return OllamaService(
        model=settings.ollama_model,
        host=settings.ollama_base_url
    )
