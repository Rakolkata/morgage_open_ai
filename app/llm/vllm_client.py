from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, TypeVar
from urllib.parse import urlparse

import httpx
from openai import AsyncOpenAI, APIConnectionError, APIError
from pydantic import BaseModel

from app.config import get_settings
from app.llm.ollama_client import clean_json_text

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def normalize_vllm_url(raw_url: str | None) -> str:
    """
    Ensure base URL for OpenAI-compatible vLLM endpoints ends with '/v1',
    e.g. 'http://localhost:8000/v1'.
    """
    if not raw_url:
        return "http://localhost:8000/v1"

    url = raw_url.strip().rstrip("/")
    if url.endswith("/chat/completions"):
        url = url[: -len("/chat/completions")].rstrip("/")

    if not url.endswith("/v1"):
        url = f"{url}/v1"

    return url


def clean_think_tags(text: str) -> str:
    """Strip <think>...</think> reasoning tags produced by reasoning/deepseek/qwen models."""
    if not text:
        return ""
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()
    if not cleaned:
        cleaned = re.sub(r"</?think>", "", text, flags=re.IGNORECASE).strip()
    return cleaned.strip()


class VLLMService:
    """
    LLM client for vLLM servers providing an OpenAI-compatible API.
    Designed for high-throughput production environments with support for
    structured JSON Schema output (guided decoding, json_schema, or json_object).
    """

    def __init__(
        self,
        model: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float | None = None
    ):
        settings = get_settings()

        # Resolve model from parameter or .env (fallback to ollama model name if vllm_model not set)
        self.model = (
            model
            or settings.vllm_model
            or settings.ollama_model
            or "qwen2.5:1.5b"
        ).strip()

        # Resolve base URL (e.g. http://localhost:8000/v1 or production endpoint)
        raw_url = base_url or settings.vllm_base_url or "http://localhost:8000/v1"
        self.base_url = normalize_vllm_url(raw_url)
        self.host = self.base_url

        # API key (vLLM usually accepts any string or 'EMPTY' unless protected by reverse proxy/gateway)
        self.api_key = (api_key or settings.vllm_api_key or "EMPTY").strip() or "EMPTY"

        # Timeout
        self.timeout = (
            timeout
            if timeout is not None
            else getattr(settings, "vllm_timeout_seconds", 120.0)
        )

        self.provider = "vllm"

        # Initialize AsyncOpenAI client configured for the vLLM server
        self.client = AsyncOpenAI(
            base_url=self.base_url,
            api_key=self.api_key,
            timeout=self.timeout
        )

        # Allow concurrent requests in production (vLLM has internal batching)
        self.semaphore = asyncio.Semaphore(16)

        logger.info(
            "Initialized VLLMService with model '%s' at host '%s'",
            self.model,
            self.base_url
        )

    async def generate(
        self,
        agent_name: str,
        system_prompt: str,
        input_data: dict | str | BaseModel,
        output_schema: type[T]
    ) -> T:
        """
        Generate structured output conforming to the Pydantic schema using vLLM.
        Supports guided_json (Outlines/XGrammar), OpenAI json_schema, or json_object.
        """
        if isinstance(input_data, str):
            user_content = input_data
        elif isinstance(input_data, BaseModel):
            user_content = input_data.model_dump_json()
        elif isinstance(input_data, dict):
            user_content = json.dumps(input_data, ensure_ascii=False, default=str)
        else:
            user_content = str(input_data)

        schema_json = output_schema.model_json_schema()
        schema_str = json.dumps(schema_json, indent=2)

        # Enforce JSON instructions in system prompt
        enhanced_system_prompt = (
            f"{system_prompt}\n\n"
            f"CRITICAL OUTPUT INSTRUCTIONS:\n"
            f"1. You must respond with ONLY a valid, raw JSON object matching the JSON schema below.\n"
            f"2. Do NOT wrap output in markdown code blocks or backticks (no ```json).\n"
            f"3. Do NOT include any commentary, thought tags, or text outside the JSON.\n\n"
            f"REQUIRED JSON SCHEMA:\n"
            f"{schema_str}"
        )

        messages = [
            {"role": "system", "content": enhanced_system_prompt},
            {"role": "user", "content": user_content}
        ]

        logger.info(
            "Running agent '%s' on vLLM (model='%s', host='%s') with schema '%s'",
            agent_name,
            self.model,
            self.base_url,
            output_schema.__name__
        )

        async with self.semaphore:
            response = None
            last_err = None

            # Attempt 1: vLLM guided_json (Outlines grammar-guided decoding)
            try:
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=0.0,
                    extra_body={"guided_json": schema_json},
                    response_format={"type": "json_object"}
                )
            except Exception as err1:
                last_err = err1
                logger.debug(
                    "vLLM extra_body guided_json not accepted (%s); trying OpenAI json_schema",
                    err1
                )

            # Attempt 2: OpenAI structured json_schema
            if response is None:
                try:
                    response = await self.client.chat.completions.create(
                        model=self.model,
                        messages=messages,
                        temperature=0.0,
                        response_format={
                            "type": "json_schema",
                            "json_schema": {
                                "name": output_schema.__name__,
                                "schema": schema_json,
                                "strict": True
                            }
                        }
                    )
                except Exception as err2:
                    last_err = err2
                    logger.debug(
                        "vLLM json_schema format not accepted (%s); trying json_object",
                        err2
                    )

            # Attempt 3: Standard json_object fallback
            if response is None:
                try:
                    response = await self.client.chat.completions.create(
                        model=self.model,
                        messages=messages,
                        temperature=0.0,
                        response_format={"type": "json_object"}
                    )
                except (APIConnectionError, httpx.ConnectError) as exc:
                    logger.error("Could not connect to vLLM server at %s: %s", self.base_url, exc)
                    raise ConnectionError(
                        f"Could not connect to vLLM server at {self.base_url}. "
                        f"Please ensure the vLLM server is running and accessible."
                    ) from exc
                except Exception as err3:
                    logger.error("vLLM chat completion failed: %s", err3)
                    raise ConnectionError(
                        f"vLLM request failed at {self.base_url}: {err3}"
                    ) from (last_err or err3)

        raw_content = ""
        if response and response.choices:
            raw_content = response.choices[0].message.content or ""

        # Clean reasoning thoughts and markdown code blocks
        cleaned_json = clean_json_text(clean_think_tags(raw_content))

        # Validate with Pydantic
        try:
            result = output_schema.model_validate_json(cleaned_json)
        except Exception as val_err:
            logger.warning(
                "Direct Pydantic validation failed for %s: %s. Attempting regex extract...",
                agent_name,
                val_err
            )
            # Find the largest outer JSON object { ... }
            match = re.search(r"(\{.*\})", cleaned_json, re.DOTALL)
            if match:
                result = output_schema.model_validate_json(match.group(1))
            else:
                raise val_err

        logger.info("%s execution on vLLM completed successfully", agent_name)
        return result

    async def generate_text(
        self,
        prompt: str,
        system_prompt: str = ""
    ) -> str:
        """Standard text generation without schema enforcement."""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        async with self.semaphore:
            try:
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=0.1
                )
            except (APIConnectionError, httpx.ConnectError) as exc:
                logger.error("Could not connect to vLLM server at %s: %s", self.base_url, exc)
                raise ConnectionError(
                    f"Could not connect to vLLM server at {self.base_url}. "
                    f"Please ensure the vLLM server is running."
                ) from exc

        content = ""
        if response and response.choices:
            content = response.choices[0].message.content or ""

        return clean_think_tags(content)
