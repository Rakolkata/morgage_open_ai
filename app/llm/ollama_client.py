from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, TypeVar
from urllib.parse import urlparse

import httpx
from ollama import AsyncClient
from pydantic import BaseModel

from app.config import get_settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def clean_json_text(text: str) -> str:
    """Strip thought tags and markdown code fences so Pydantic can parse pure JSON."""
    if not text:
        return ""
    # Strip <think>...</think> reasoning tags
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()
    if not cleaned:
        cleaned = re.sub(r"</?think>", "", text, flags=re.IGNORECASE).strip()

    # Strip markdown code blocks like ```json ... ```
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def normalize_ollama_host(host_or_url: str) -> str:
    """
    Ensure host passed to ollama.AsyncClient is the origin (e.g. 'http://localhost:11434'),
    stripping endpoint paths like '/api/generate' or '/api/chat' found in .env.
    """
    if not host_or_url:
        return "http://localhost:11434"

    raw = host_or_url.strip()
    parsed = urlparse(raw)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return raw.rstrip("/")


class OllamaService:

    def __init__(
        self,
        model: str | None = None,
        host: str | None = None
    ):
        settings = get_settings()

        # Resolve model from parameter or .env
        self.model = (model or settings.ollama_model or "qwen2.5:1.5b").strip()

        # Resolve host from parameter or .env, normalizing to origin (http://localhost:11434)
        raw_host = host or settings.ollama_base_url or "http://localhost:11434"
        self.host = normalize_ollama_host(raw_host)

        # One shared Ollama async client
        self.client = AsyncClient(host=self.host)

        # Initially allow one LLM request at a time
        self.semaphore = asyncio.Semaphore(1)

        logger.info(
            "Initialized OllamaService with model '%s' at host '%s'",
            self.model,
            self.host
        )

    async def generate(
        self,
        agent_name: str,
        system_prompt: str,
        input_data: dict | str | BaseModel,
        output_schema: type[T]
    ) -> T:
        # Normalize input_data to a clean JSON string
        if isinstance(input_data, str):
            user_content = input_data
        elif isinstance(input_data, BaseModel):
            user_content = input_data.model_dump_json()
        elif isinstance(input_data, dict):
            user_content = json.dumps(input_data, ensure_ascii=False, default=str)
        else:
            user_content = str(input_data)

        messages = [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": user_content
            }
        ]

        logger.info(
            "Running agent '%s' with schema '%s'",
            agent_name,
            output_schema.__name__
        )

        async with self.semaphore:
            try:
                response = await self.client.chat(
                    model=self.model,
                    messages=messages,
                    # Force structured JSON output matching schema
                    format=output_schema.model_json_schema(),
                    options={
                        "temperature": 0
                    },
                    # Keep the model loaded in memory between requests
                    keep_alive="30m"
                )
            except httpx.ConnectError as exc:
                logger.error("Could not connect to Ollama at %s: %s", self.host, exc)
                raise ConnectionError(
                    f"Could not connect to Ollama at {self.host}. "
                    f"Please ensure Ollama is running and accessible."
                ) from exc

        # Extract content
        raw_message = (
            response.message.content
            if hasattr(response, "message") and hasattr(response.message, "content")
            else response.get("message", {}).get("content", "")
        )

        cleaned_json = clean_json_text(raw_message)

        # Validate the returned JSON using Pydantic schema
        result = output_schema.model_validate_json(cleaned_json)

        logger.info("%s execution completed successfully", agent_name)
        return result
