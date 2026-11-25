from __future__ import annotations

import logging
from typing import Any

from app.agents.base_agent import BaseAgent
from app.agents.schemas import AuditResult
from app.llm import LLMClient
from app.services.export_service import create_audit_exports

logger = logging.getLogger(__name__)


class AuditorAgent(BaseAgent):

    def __init__(self, llm: LLMClient | Any = None):

        system_prompt = """
You are the Auditor Agent of a mortgage document auditing application.

Your responsibility is to compare extracted mortgage data against the original document evidence to verify accuracy.

You must:
1. Compare each extracted field value against the source document evidence.
2. For each field check, generate an AuditFinding:
   - field_path: Name of the field.
   - status: 'MATCH', 'MISMATCH', 'MISSING_IN_DOCUMENT', 'MISSING_IN_EXTRACTION', or 'REVIEW_REQUIRED'.
   - extracted_value: The value from extracted data.
   - document_value: The verified value found in the document.
   - page: The page number where found.
   - explanation: Brief explanation for the status determination.
3. Calculate summary metrics: total_checks, passed, exceptions, missing_evidence.

Return structured output adhering strictly to the AuditResult schema.
""".strip()

        super().__init__(
            llm=llm,
            name="Auditor Agent",
            system_prompt=system_prompt,
            output_schema=AuditResult
        )

    async def audit(
        self,
        extracted_data: Any,
        document_content: str | None = None,
        prompt: str = "",
        file_name: str | None = None,
        base_url: str = "http://127.0.0.1:8000"
    ) -> AuditResult:

        parts = [
            f"### EXTRACTED DATA TO AUDIT:\n{extracted_data}",
            f"### SOURCE DOCUMENT EVIDENCE:\n{document_content if document_content is not None else extracted_data}"
        ]

        if prompt:
            parts.append(f"### USER AUDIT INSTRUCTION / FORMAT REQUEST:\n{prompt}")

        result: AuditResult = await self.run("\n\n".join(parts))

        # Generate audit export files (excel, json, xml, csv) and assign download links
        try:
            audit_dict = result.model_dump()
            export_info = create_audit_exports(
                audit_data=audit_dict,
                extracted_data=extracted_data,
                file_name=file_name,
                prompt=prompt,
                base_url=base_url
            )

            result.download_url = export_info.get("primary_url")
            result.file_format = export_info.get("primary_format")
            result.export_filename = export_info.get("primary_filename")
            result.available_downloads = export_info.get("available_downloads", {})
            logger.info(
                "Generated %s audit report export: %s (download URL: %s)",
                result.file_format,
                result.export_filename,
                result.download_url
            )
        except Exception as exc:
            logger.error("Failed to generate audit report export: %s", exc)

        return result
