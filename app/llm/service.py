from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from typing import Any

from app.config import get_settings
from app.errors import AppError

logger = logging.getLogger(__name__)


def clean_think_tags(text: str) -> str:
    """Strip reasoning/thought tags produced by reasoning models."""
    if not text:
        return ""
    think_pattern = r"<think>.*?</think>"
    cleaned = re.sub(think_pattern, "", text, flags=re.DOTALL | re.IGNORECASE).strip()
    if cleaned:
        return cleaned
    return re.sub(r"</?think>", "", text, flags=re.IGNORECASE).strip()


class LLMService:
    def __init__(self):
        self.settings = get_settings()
        self.base_url = (self.settings.ollama_base_url or "http://localhost:11434/api/generate").strip()
        self.model_name = (self.settings.ollama_model or "qwen2.5:1.5b").strip()
        self.timeout = getattr(self.settings, "timeout_seconds", 120.0)

    def _prepare_request(self, prompt: str) -> tuple[str, dict[str, Any], str]:
        """
        Determine target endpoint URL, JSON payload, and API format.
        Supports /api/generate, /api/chat, /v1 (OpenAI-compatible), or base host.
        """
        raw_url = self.base_url

        if raw_url.endswith("/api/chat"):
            target_url = raw_url
            payload = {
                "model": self.model_name,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
            }
            mode = "chat"
        elif raw_url.endswith("/api/generate"):
            target_url = raw_url
            payload = {
                "model": self.model_name,
                "prompt": prompt,
                "stream": False,
            }
            mode = "generate"
        elif raw_url.endswith("/v1") or "/v1/" in raw_url or raw_url.endswith("/chat/completions"):
            target_url = (
                raw_url
                if raw_url.endswith("/chat/completions")
                else f"{raw_url.rstrip('/')}/chat/completions"
            )
            payload = {
                "model": self.model_name,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
            }
            mode = "openai"
        else:
            target_url = f"{raw_url.rstrip('/')}/api/generate"
            payload = {
                "model": self.model_name,
                "prompt": prompt,
                "stream": False,
            }
            mode = "generate"

        return target_url, payload, mode

    def _extract_response(self, data: dict[str, Any], mode: str) -> str:
        """Extract answer string from parsed JSON response."""
        if mode == "generate" and "response" in data:
            return str(data["response"])

        if mode == "chat" and "message" in data and isinstance(data["message"], dict):
            return str(data["message"].get("content", ""))

        if mode == "openai":
            choices = data.get("choices")
            if choices and isinstance(choices, list):
                msg = choices[0].get("message", {})
                if "content" in msg:
                    return str(msg.get("content", ""))

        # Fallbacks
        if "response" in data:
            return str(data["response"])
        if "message" in data and isinstance(data["message"], dict):
            return str(data["message"].get("content", ""))
        if "answer" in data:
            return str(data["answer"])

        return json.dumps(data)

    def generate(self, prompt: str) -> str:
        """Send prompt to the local Ollama model and return the generated answer."""
        if not prompt or not prompt.strip():
            raise AppError("EMPTY_PROMPT", "Prompt message cannot be empty.", 400)

        if not self.model_name:
            raise AppError(
                "MODEL_NOT_CONFIGURED",
                "OLLAMA_MODEL is not configured in .env.",
                500
            )

        target_url, payload, mode = self._prepare_request(prompt)

        logger.info(
            "Calling Ollama at %s using model '%s' (mode=%s)",
            target_url,
            self.model_name,
            mode
        )

        req_body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            target_url,
            data=req_body,
            headers={"Content-Type": "application/json"}
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw_bytes = resp.read()
                raw_text = raw_bytes.decode("utf-8")

                try:
                    data = json.loads(raw_text)
                except json.JSONDecodeError:
                    return clean_think_tags(raw_text.strip())

                ans = self._extract_response(data, mode)
                return clean_think_tags(ans.strip())

        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace")
            logger.error("Ollama HTTP Error %s: %s", exc.code, err_body)
            raise AppError(
                "OLLAMA_HTTP_ERROR",
                f"Ollama returned HTTP {exc.code}: {err_body}",
                status_code=exc.code if 400 <= exc.code <= 599 else 502
            ) from exc

        except urllib.error.URLError as exc:
            logger.error("Failed to connect to Ollama at %s: %s", target_url, exc.reason)
            raise AppError(
                "OLLAMA_UNREACHABLE",
                f"Could not connect to Ollama at {target_url} ({exc.reason}). "
                f"Please ensure Ollama is running and accessible.",
                503
            ) from exc

        except TimeoutError as exc:
            logger.error("Ollama request timed out after %s seconds", self.timeout)
            raise AppError(
                "OLLAMA_TIMEOUT",
                f"Ollama request timed out after {self.timeout} seconds.",
                504
            ) from exc

        except Exception as exc:
            logger.exception("Unexpected error while querying Ollama: %s", exc)
            raise AppError(
                "OLLAMA_GENERATION_FAILED",
                f"Ollama generation failed: {str(exc)}",
                500
            ) from exc

    def complete(self, user_content: str) -> tuple[dict, bool]:
        """Backward-compatible helper returning answer dictionary."""
        ans = self.generate(user_content)
        return {"answer": ans, "status": "PASS", "evidence": []}, False
