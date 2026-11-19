from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

# Load .env file from project root
load_dotenv(ROOT / ".env")


class ConfigError(ValueError):
    pass


def _int(name: str, default: int, minimum: int) -> int:
    raw = os.getenv(name, "").strip()
    try:
        value = int(raw) if raw else default
    except ValueError:
        raise ConfigError(f"{name} must be an integer.") from None

    if value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}.")

    return value


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    raise ConfigError(f"{name} must be true or false.")


@dataclass(frozen=True)
class Settings:
    app_env: str = "development"
    llm_mode: str = "ollama"

    # Ollama configuration
    ollama_base_url: str = "http://localhost:11434/api/generate"
    ollama_api_key: str = "ollama"
    ollama_model: str = "qwen2.5:1.5b"

    # Timeout configuration
    timeout_seconds: float = 120.0
    vllm_timeout_seconds: float = 120.0

    # Optional vLLM configuration (for backward compatibility)
    vllm_base_url: str = ""
    vllm_api_key: str = ""
    vllm_model: str = ""

    # Optional document processing configuration
    max_upload_mb: int = 25
    max_pdf_pages: int = 300
    context_char_budget: int = 12000
    document_ttl_minutes: int = 60
    pii_redaction: bool = True

    # Optional prompt configuration
    prompts_xlsx: Path = field(default_factory=lambda: ROOT / "data" / "Post Closing Prompts.xlsx")
    prompt_id_column: str = "Prompt Key (DO NOT EDIT)"
    prompt_text_column: str = "Prompt Text"

    def llm_status(self) -> dict:
        """Validate LLM configuration status."""
        if self.llm_mode == "ollama":
            base_url = self.ollama_base_url
            model = self.ollama_model
        elif self.llm_mode == "vllm":
            base_url = self.vllm_base_url
            model = self.vllm_model
        else:
            return {
                "state": "mock" if self.llm_mode == "mock" else "invalid_config",
                "ready": self.llm_mode == "mock",
                "is_mock": self.llm_mode == "mock",
                "message": f"LLM mode: {self.llm_mode}"
            }

        if not base_url or not model:
            return {
                "state": "not_configured",
                "ready": False,
                "is_mock": False,
                "message": "OLLAMA_BASE_URL or OLLAMA_MODEL is missing."
            }

        return {
            "state": "configured",
            "ready": True,
            "is_mock": False,
            "message": f"Configured for {self.llm_mode} with model {model} at {base_url}"
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    mode = os.getenv("LLM_MODE", "ollama").strip().lower()

    # Ollama settings from .env
    ollama_base_url = os.getenv(
        "OLLAMA_BASE_URL",
        "http://localhost:11434/api/generate"
    ).strip()

    ollama_model = os.getenv(
        "OLLAMA_MODEL",
        "qwen2.5:1.5b"
    ).strip()

    ollama_api_key = os.getenv(
        "OLLAMA_API_KEY",
        "ollama"
    ).strip()

    # Timeout
    timeout_raw = os.getenv("OLLAMA_TIMEOUT_SECONDS") or os.getenv("VLLM_TIMEOUT_SECONDS", "120")
    try:
        timeout = float(timeout_raw)
    except ValueError:
        timeout = 120.0

    return Settings(
        app_env=app_env,
        llm_mode=mode,
        ollama_base_url=ollama_base_url,
        ollama_api_key=ollama_api_key,
        ollama_model=ollama_model,
        timeout_seconds=timeout,
        vllm_timeout_seconds=timeout,
        vllm_base_url=os.getenv("VLLM_BASE_URL", "").strip(),
        vllm_api_key=os.getenv("VLLM_API_KEY", "").strip(),
        vllm_model=os.getenv("VLLM_MODEL", "").strip(),
        max_upload_mb=_int("MAX_UPLOAD_MB", 25, 1),
        max_pdf_pages=_int("MAX_PDF_PAGES", 300, 1),
        context_char_budget=_int("CONTEXT_CHAR_BUDGET", 12000, 2000),
        document_ttl_minutes=_int("DOCUMENT_TTL_MINUTES", 60, 1),
        pii_redaction=_bool("PII_REDACTION", True),
    )
