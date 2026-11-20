from __future__ import annotations

from typing import Any

from app.agents.base_agent import BaseAgent
from app.agents.schemas import AuditResult
from app.llm.ollama_client import OllamaService


class AuditorAgent(BaseAgent):

    def __init__(self, llm: OllamaService | None = None):

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
        document_content: str | None = None
    ) -> AuditResult:

        parts = [
            f"### EXTRACTED DATA TO AUDIT:\n{extracted_data}",
            f"### SOURCE DOCUMENT EVIDENCE:\n{document_content if document_content is not None else extracted_data}"
        ]
        return await self.run("\n\n".join(parts))
