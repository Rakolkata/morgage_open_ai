from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


# --------------------------------
# 1. Orchestrator Output
# --------------------------------

class ExtractionPlan(BaseModel):

    task: str = Field(
        ...,
        min_length=5,
        description="Concise summary of the extraction plan for the document"
    )

    document_types: list[
        Literal["LE", "CD", "1003", "OTHER"]
    ] = Field(
        ...,
        min_length=1,
        description="At least one detected document type from ['LE', 'CD', '1003', 'OTHER']"
    )

    schema_name: str = Field(
        ...,
        min_length=2,
        description="Selected schema name, e.g. 'CD', 'LE', '1003', or 'OTHER'"
    )

    fields_to_extract: list[str] = Field(
        ...,
        min_length=1,
        description="List of fields to extract (e.g. Borrower Name, Loan Amount, Interest Rate, Monthly Payment, Property Address)"
    )

    instructions: list[str] = Field(
        ...,
        min_length=1,
        description="Step-by-step actionable instructions for the data extractor agent"
    )


# --------------------------------
# 2. Data Extractor Output
# --------------------------------

class DocumentInfo(BaseModel):

    document_type: Literal[
        "LE", "CD", "1003", "OTHER", "UNKNOWN"
    ] = "CD"

    pages: list[int] = Field(default_factory=list)


class ExtractedField(BaseModel):

    field_path: str = Field(..., min_length=1, description="Field name as defined in extraction plan")

    value: str | None = Field(default=None, description="Extracted field value as string from document")

    document_type: str = "CD"

    page: int | None = Field(default=None, description="Page number where the field was found")

    source_text: str | None = Field(default=None, description="Original source text snippet or line from the document")

    confidence: float | None = Field(
        default=None,
        ge=0,
        le=1,
        description="Confidence score between 0.0 and 1.0"
    )


class ExtractionResult(BaseModel):

    documents: list[DocumentInfo] = Field(default_factory=list)

    extracted_fields: list[ExtractedField] = Field(
        ...,
        min_length=1,
        description="List of extracted fields with their values, pages, and source text"
    )

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
