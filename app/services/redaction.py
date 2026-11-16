
from functools import lru_cache

from app.config import get_settings
from app.errors import AppError


@lru_cache(maxsize=1)
def get_presidio_engines():
    """Create and cache Presidio engines using the installed spaCy model."""
    from presidio_analyzer import AnalyzerEngine
    from presidio_analyzer.nlp_engine import SpacyNlpEngine
    from presidio_anonymizer import AnonymizerEngine

    nlp_engine = SpacyNlpEngine(
        models=[
            {
                "lang_code": "en",
                "model_name": "en_core_web_sm"
            }
        ]
    )

    analyzer = AnalyzerEngine(
        nlp_engine=nlp_engine,
        supported_languages=["en"]
    )

    anonymizer = AnonymizerEngine()

    return analyzer, anonymizer


def redact_text(text: str) -> str:
    """Redact detected PII before sending document text to the LLM."""

    if not get_settings().pii_redaction:
        return text

    try:
        analyzer, anonymizer = get_presidio_engines()

        results = analyzer.analyze(
            text=text,
            language="en"
        )

        return anonymizer.anonymize(
            text=text,
            analyzer_results=results
        ).text

    except ImportError:
        raise AppError(
            "PII_REDACTION_UNAVAILABLE",
            "PII redaction is enabled but Presidio or its dependencies are unavailable.",
            503
        ) from None

    except Exception:
        raise AppError(
            "PII_REDACTION_FAILED",
            "PII redaction failed. No document text was sent.",
            503
        ) from None
