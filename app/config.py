
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parent.parent

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
    app_env: str
    llm_mode: str

    # vLLM configuration
    vllm_base_url: str
    vllm_api_key: str
    vllm_model: str

    # Ollama configuration
    ollama_base_url: str
    ollama_api_key: str
    ollama_model: str

    # Common LLM configuration
    vllm_timeout_seconds: float

    # Document configuration
    max_upload_mb: int
    max_pdf_pages: int
    context_char_budget: int
    document_ttl_minutes: int

    # PII configuration
    pii_redaction: bool

    # Excel prompt configuration
    prompts_xlsx: Path
    prompt_id_column: str
    prompt_text_column: str

    def llm_status(self) -> dict:
        """
        Validate the selected LLM configuration.

        Supported modes:
        - mock
        - ollama
        - vllm
        """

        # MOCK MODE
        if self.llm_mode == "mock":

            if self.app_env == "production":
                return {
                    "state": "invalid_config",
                    "ready": False,
                    "is_mock": False,
                    "message": "Mock mode is disabled in production."
                }

            return {
                "state": "mock",
                "ready": True,
                "is_mock": True,
                "message": (
                    "MOCK MODE — replies are simulated, "
                    "NOT AI-generated."
                )
            }

        # SELECT LLM CONFIGURATION
        if self.llm_mode == "ollama":

            base_url = self.ollama_base_url
            model = self.ollama_model
            url_name = "OLLAMA_BASE_URL"
            model_name = "OLLAMA_MODEL"

        elif self.llm_mode == "vllm":

            base_url = self.vllm_base_url
            model = self.vllm_model
            url_name = "VLLM_BASE_URL"
            model_name = "VLLM_MODEL"

        else:
            return {
                "state": "invalid_config",
                "ready": False,
                "is_mock": False,
                "message": (
                    "LLM_MODE must be ollama, vllm or mock."
                )
            }

        # CHECK REQUIRED SETTINGS
        missing = []

        if not base_url:
            missing.append(url_name)

        if not model:
            missing.append(model_name)

        if missing:
            return {
                "state": "not_configured",
                "ready": False,
                "is_mock": False,
                "missing": missing,
                "message": (
                    "LLM is not configured. "
                    "No AI response can be generated."
                )
            }

        # VALIDATE URL
        parsed = urlparse(base_url)

        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
        ):
            return {
                "state": "invalid_config",
                "ready": False,
                "is_mock": False,
                "message": (
                    f"{url_name} must be a valid http(s) URL."
                )
            }

        return {
            "state": "configured",
            "ready": True,
            "is_mock": False,
            "message": (
                f"{self.llm_mode.upper()} settings exist; "
                "server connectivity has not been checked."
            )
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:

    # APPLICATION ENVIRONMENT
    app_env = (
        os.getenv("APP_ENV", "development")
        .strip()
        .lower()
    )

    # LLM MODE
    mode = (
        os.getenv("LLM_MODE", "vllm")
        .strip()
        .lower()
    )

    if app_env not in {"development", "production"}:
        raise ConfigError(
            "APP_ENV must be development or production."
        )

    # EXCEL PROMPT FILE
    prompts_path = Path(
        os.getenv(
            "PROMPTS_XLSX",
            "data/Post Closing Prompts.xlsx"
        )
    )

    if not prompts_path.is_absolute():
        prompts_path = ROOT / prompts_path

    # LLM TIMEOUT
    try:
        timeout = float(
            os.getenv("VLLM_TIMEOUT_SECONDS", "600")
        )
    except ValueError:
        raise ConfigError(
            "VLLM_TIMEOUT_SECONDS must be numeric."
        ) from None

    if timeout < 1:
        raise ConfigError(
            "VLLM_TIMEOUT_SECONDS must be at least 1."
        )

    # RETURN SETTINGS
    return Settings(

        # APPLICATION
        app_env=app_env,
        llm_mode=mode,

        # vLLM
        vllm_base_url=os.getenv(
            "VLLM_BASE_URL", ""
        ).strip(),

        vllm_api_key=os.getenv(
            "VLLM_API_KEY", ""
        ).strip(),

        vllm_model=os.getenv(
            "VLLM_MODEL", ""
        ).strip(),

        # OLLAMA
        ollama_base_url=os.getenv(
            "OLLAMA_BASE_URL",
            "http://localhost:11434/v1"
        ).strip(),

        ollama_api_key=os.getenv(
            "OLLAMA_API_KEY",
            "ollama"
        ).strip(),

        ollama_model=os.getenv(
            "OLLAMA_MODEL", ""
        ).strip(),

        # COMMON LLM
        vllm_timeout_seconds=timeout,

        # DOCUMENT SETTINGS
        max_upload_mb=_int(
            "MAX_UPLOAD_MB", 25, 1
        ),

        max_pdf_pages=_int(
            "MAX_PDF_PAGES", 300, 1
        ),

        context_char_budget=_int(
            "CONTEXT_CHAR_BUDGET", 12000, 2000
        ),

        document_ttl_minutes=_int(
            "DOCUMENT_TTL_MINUTES", 60, 1
        ),

        # PII REDACTION
        pii_redaction=_bool(
            "PII_REDACTION", True
        ),

        # EXCEL PROMPTS
        prompts_xlsx=prompts_path,

        prompt_id_column=os.getenv(
            "PROMPT_ID_COLUMN",
            "Prompt Key (DO NOT EDIT)"
        ).strip(),

        prompt_text_column=os.getenv(
            "PROMPT_TEXT_COLUMN",
            "Prompt Text"
        ).strip(),
    )
