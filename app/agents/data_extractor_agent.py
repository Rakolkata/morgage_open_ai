
from __future__ import annotations

import json
import re
from typing import Any

from app.agents.base_agent import BaseAgent
from app.agents.schemas import ExtractionResult
from app.llm.ollama_client import OllamaService


class DataExtractorAgent(BaseAgent):

    UNAVAILABLE_VALUES = {
        "",
        "not supplied",
        "not provided",
        "not found",
        "not available",
        "n/a",
        "na",
        "none",
        "null",
        "unknown",
        "unavailable",
        "not mentioned",
    }

    def __init__(self, llm: OllamaService | None = None):

        system_prompt = """
You are a mortgage document data extraction agent.

Extract only the fields requested in the EXTRACTION PLAN.

Rules:
1. Use only values explicitly present in DOCUMENT CONTENT.
2. Never invent, assume, or calculate missing values.
3. Copy exact names, amounts, rates, dates and terms.
4. Every extracted field must include:
   field_path, value, document_type, page,
   source_text and confidence.
5. source_text must contain the exact evidence supporting value.
6. If a requested value is unavailable, do not create an
   extracted field. Add its name to missing_fields.
7. Never create a field named "Missing Fields".
8. Never use "Not supplied", "N/A", "Unknown" or similar
   placeholders as extracted values.
9. IMPORTANT:
   PITI means Principal, Interest, Taxes and Insurance.
   PITI is NOT the same as Principal and Interest.
   Never use a total PITI or monthly housing payment as
   the Monthly Principal and Interest Payment.
   Extract that field only when a separate principal and
   interest amount is explicitly identified.
10. Do not infer lender information or document types.
11. Include the document type and pages inspected.

Return valid structured output matching ExtractionResult.
""".strip()

        super().__init__(
            llm=llm,
            name="Data Extractor Agent",
            system_prompt=system_prompt,
            output_schema=ExtractionResult,
        )

    @staticmethod
    def _normalize(value: Any) -> str:
        """Normalize whitespace and case for evidence comparison."""
        if value is None:
            return ""

        return re.sub(
            r"\s+",
            " ",
            str(value)
        ).strip().casefold()

    @staticmethod
    def _parse_plan(plan: Any) -> dict:
        """Convert a plan into a dictionary."""

        if isinstance(plan, dict):
            return plan

        if hasattr(plan, "model_dump"):
            return plan.model_dump()

        if isinstance(plan, str):
            try:
                parsed = json.loads(plan)

                if isinstance(parsed, dict):
                    return parsed

            except (json.JSONDecodeError, TypeError):
                pass

        return {}

    @classmethod
    def _get_requested_fields(
        cls,
        extraction_plan: Any
    ) -> list[str]:

        plan = cls._parse_plan(extraction_plan)

        fields = plan.get("fields_to_extract", [])

        if not isinstance(fields, list):
            return []

        return [
            str(field).strip()
            for field in fields
            if str(field).strip()
            and cls._normalize(field) != "missing fields"
        ]

    @classmethod
    def _is_unavailable(cls, value: Any) -> bool:

        normalized = cls._normalize(value)

        return (
            normalized in cls.UNAVAILABLE_VALUES
            or normalized.startswith("not supplied")
            or normalized.startswith("not provided")
            or normalized.startswith("not found")
        )

    @classmethod
    def _is_piti_mismatch(
        cls,
        field_path: str,
        source_text: str
    ) -> bool:
        """
        Reject PITI or total housing payment as
        Principal and Interest.
        """

        field_name = cls._normalize(field_path)
        source = cls._normalize(source_text)

        is_principal_interest_field = (
            "principal and interest" in field_name
            or field_name in {
                "monthly p&i payment",
                "monthly pi payment",
                "monthly principal interest payment",
            }
        )

        if not is_principal_interest_field:
            return False

        # An explicit P&I amount is acceptable.
        explicit_pi = (
            "principal and interest" in source
            or re.search(r"\bp\s*&\s*i\b", source)
            or re.search(r"\bp\s*/\s*i\b", source)
        )

        if explicit_pi:
            return False

        # These indicate a total housing payment, not P&I.
        return (
            "piti" in source
            or "housing payment" in source
            or "total monthly payment" in source
        )

    @classmethod
    def _validate_field(
        cls,
        field: Any,
        document_content: str
    ) -> tuple[bool, str]:

        field_path = str(
            getattr(field, "field_path", "")
        ).strip()

        value = getattr(field, "value", None)

        source_text = str(
            getattr(field, "source_text", "") or ""
        ).strip()

        if not field_path:
            return False, "Field name is missing."

        if cls._normalize(field_path) == "missing fields":
            return False, "Invalid synthetic field."

        if cls._is_unavailable(value):
            return False, f"{field_path}: value is unavailable."

        if not source_text:
            return False, f"{field_path}: source text is missing."

        # The extracted value must appear in its evidence.
        if cls._normalize(value) not in cls._normalize(source_text):
            return False, (
                f"{field_path}: extracted value does not "
                "appear in source_text."
            )

        # The evidence must appear in the actual PDF text.
        if cls._normalize(source_text) not in cls._normalize(
            document_content
        ):
            return False, (
                f"{field_path}: source_text could not be "
                "verified in the document."
            )

        # Special protection for PITI vs. P&I.
        if cls._is_piti_mismatch(field_path, source_text):
            return False, (
                f"{field_path}: PITI or housing payment "
                "cannot be used as principal and interest."
            )

        return True, ""

    async def extract(
        self,
        extraction_plan: Any = None,
        page_content: str | None = None
    ) -> ExtractionResult:

        if extraction_plan is None:
            extraction_plan = (
                "Extract all available mortgage fields "
                "and document types."
            )

        document_content = page_content or ""

        if not document_content.strip():
            return ExtractionResult(
                documents=[],
                extracted_fields=[],
                missing_fields=self._get_requested_fields(
                    extraction_plan
                ),
                warnings=["No document text was provided."],
            )

        requested_fields = self._get_requested_fields(
            extraction_plan
        )

        parts = [
            f"### EXTRACTION PLAN:\n{extraction_plan}",
            f"### DOCUMENT CONTENT:\n{document_content}",
        ]

        # Run the LLM once.
        result: ExtractionResult = await self.run(
            "\n\n".join(parts)
        )

        valid_fields = []
        warnings = list(result.warnings or [])

        found_field_names = set()

        # Validate every extracted field against its evidence.
        for field in result.extracted_fields or []:

            field_path = str(
                getattr(field, "field_path", "")
            ).strip()

            is_valid, reason = self._validate_field(
                field,
                document_content
            )

            if not is_valid:
                warnings.append(reason)
                continue

            normalized_name = self._normalize(field_path)

            if normalized_name in found_field_names:
                warnings.append(
                    f"Duplicate extracted field ignored: {field_path}"
                )
                continue

            found_field_names.add(normalized_name)

            # Keep confidence below 1.0 because an LLM
            # confidence score is not a calibrated probability.
            confidence = getattr(field, "confidence", 0.0)

            try:
                confidence = float(confidence)
            except (TypeError, ValueError):
                confidence = 0.0

            confidence = max(
                0.0,
                min(confidence, 0.95)
            )

            valid_fields.append(
                field.model_copy(
                    update={"confidence": confidence}
                )
            )

        # Add every unavailable requested field to missing_fields.
        missing_fields = list(result.missing_fields or [])

        missing_names = {
            self._normalize(name)
            for name in missing_fields
        }

        for requested_field in requested_fields:

            normalized_name = self._normalize(requested_field)

            if normalized_name not in found_field_names:
                if normalized_name not in missing_names:
                    missing_fields.append(requested_field)
                    missing_names.add(normalized_name)

        # Remove any accidental "Missing Fields" entry.
        missing_fields = [
            name
            for name in missing_fields
            if self._normalize(name) != "missing fields"
        ]

        return ExtractionResult(
            documents=result.documents or [],
            extracted_fields=valid_fields,
            missing_fields=missing_fields,
            warnings=warnings,
        )
