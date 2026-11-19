from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


# --------------------------------
# 1. Orchestrator Output
# --------------------------------

class ExtractionPlan(BaseModel):

    task: str

    document_types: list[
        Literal["LE", "CD", "1003", "OTHER"]
    ] = Field(default_factory=list)

    schema_name: str = ""

    fields_to_extract: list[str] = Field(default_factory=list)

    instructions: list[str] = Field(default_factory=list)


# --------------------------------
# 2. Data Extractor Output
# --------------------------------

class DocumentInfo(BaseModel):

    document_type: Literal[
        "LE", "CD", "1003", "OTHER", "UNKNOWN"
    ] = "UNKNOWN"

    pages: list[int] = Field(default_factory=list)


class ExtractedField(BaseModel):

    field_path: str

    value: str | int | float | bool | None = None

    document_type: str = "UNKNOWN"

    page: int | None = None

    source_text: str | None = None

    confidence: float | None = Field(
        default=None,
        ge=0,
        le=1
    )


class ExtractionResult(BaseModel):

    documents: list[DocumentInfo] = Field(default_factory=list)

    extracted_fields: list[ExtractedField] = Field(default_factory=list)

    missing_fields: list[str] = Field(default_factory=list)

    warnings: list[str] = Field(default_factory=list)


# --------------------------------
# 3. Auditor Output
# --------------------------------

class AuditFinding(BaseModel):

    field_path: str

    status: Literal[
        "MATCH",
        "MISMATCH",
        "MISSING_IN_DOCUMENT",
        "MISSING_IN_EXTRACTION",
        "REVIEW_REQUIRED"
    ]

    extracted_value: str | None = None

    document_value: str | None = None

    document_type: str | None = None

    page: int | None = None

    explanation: str = ""


class AuditResult(BaseModel):

    total_checks: int = 0

    passed: int = 0

    exceptions: int = 0

    missing_evidence: int = 0

    findings: list[AuditFinding] = Field(default_factory=list)
