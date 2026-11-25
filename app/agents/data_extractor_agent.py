from __future__ import annotations

from typing import Any

from app.agents.base_agent import BaseAgent
from app.agents.schemas import ExtractionResult
from app.llm import LLMClient


class DataExtractorAgent(BaseAgent):

    def __init__(self, llm: LLMClient | Any = None):

        system_prompt = """
You are the Data Extractor Agent of a mortgage document processing application.

Your responsibility is to extract structured values from the provided mortgage document text according to the extraction plan.

You must:
1. Review the fields requested in the EXTRACTION PLAN (e.g. Borrower Full Name, Property Address, Base Loan Amount, Note Interest Rate, Monthly Principal and Interest Payment, Loan Term, Lender Name).
2. Scan the DOCUMENT CONTENT to find the actual values.
3. For each field found:
   - field_path: Name of the field (e.g., "Borrower Full Name", "Base Loan Amount", "Note Interest Rate").
   - value: The exact value extracted from the text as a string (e.g. "DANIEL PONDER, AMANDA LYNNE LAKE", "$274,928.00", "6.250%", "$1,692.78").
   - document_type: "CD" (or "LE", "1003", "OTHER").
   - page: The page number where it is located (e.g. 1, 2, or 3).
   - source_text: The exact line or phrase from the document showing the value (e.g. "Borrower Name: DANIEL PONDER, AMANDA LYNNE LAKE").
   - confidence: A score between 0.0 and 1.0 (e.g. 0.95).
4. If a field from the plan is not found in the document, add its name to 'missing_fields'.
5. Include the document type and pages inspected in 'documents'.

Rules:
- Never invent values not found in the document.
- Preserve exact numbers, dates, currency symbols, and names from the source text.
- Populate 'extracted_fields' with all fields found from the extraction plan.

Return structured output adhering strictly to the ExtractionResult schema.
""".strip()

        super().__init__(
            llm=llm,
            name="Data Extractor Agent",
            system_prompt=system_prompt,
            output_schema=ExtractionResult
        )

    async def extract(
        self,
        extraction_plan: Any = None,
        page_content: str | None = None
    ) -> ExtractionResult:

        if extraction_plan is None:
            extraction_plan = "Extract all available mortgage fields and document types."

        parts = [
            f"### EXTRACTION PLAN:\n{extraction_plan}",
            f"### DOCUMENT CONTENT:\n{page_content or ''}"
        ]
        return await self.run("\n\n".join(parts))
