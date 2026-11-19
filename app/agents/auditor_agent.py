from __future__ import annotations

from typing import Any

from app.agents.base_agent import BaseAgent
from app.agents.schemas import AuditResult
from app.llm.ollama_client import OllamaService


class AuditorAgent(BaseAgent):

    def __init__(self, llm: OllamaService | None = None):

        system_prompt = """
        You are the Auditor Agent of a
        mortgage document auditing application.

        Your responsibility is to compare
        extracted mortgage data against
        the original document evidence.

        You must:

        1. Compare extracted values
           with source document values.
        2. Identify mismatches.
        3. Identify missing fields.
        4. Identify missing evidence.
        5. Identify inconsistent values.
        6. Provide explanations for findings.
        7. Include source document and page references.

        Allowed statuses:

        MATCH
        MISMATCH
        MISSING_IN_DOCUMENT
        MISSING_IN_EXTRACTION
        REVIEW_REQUIRED

        Important instructions:

        - Never invent an exception.
        - Never assume missing information.
        - Do not mark unverified information as MATCH.
        - Use REVIEW_REQUIRED when evidence
          is insufficient.
        - Compare only the supplied evidence
          and extracted data.

        Return structured output only.
        """

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

        return await self.run({
            "extracted_data": extracted_data,
            "document_content": document_content if document_content is not None else extracted_data
        })
