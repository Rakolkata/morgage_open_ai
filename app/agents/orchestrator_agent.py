from __future__ import annotations

from typing import Any

from app.agents.base_agent import BaseAgent
from app.agents.schemas import ExtractionPlan
from app.llm import LLMClient


class OrchestratorAgent(BaseAgent):

    def __init__(self, llm: LLMClient | Any = None):

        system_prompt = """
You are the Orchestrator Agent of an intelligent mortgage document processing system.

Your responsibility is to analyze mortgage documents and user guidelines, classify the document, and prepare a concrete, structured ExtractionPlan.

You MUST follow these rules:
1. 'document_types': Identify one or more document types from ['LE', 'CD', '1003', 'OTHER'].
   - If the document is a Closing Disclosure, Closing Package, Settlement Statement, or Loan Detail Report with closing terms, classify as ['CD'].
   - If it is a Loan Estimate, classify as ['LE'].
   - If it is a 1003 Uniform Residential Loan Application, classify as ['1003'].
   - For other mortgage documents, classify as ['OTHER'].
   Must contain at least 1 document type.
2. 'schema_name': Choose the primary matching schema name from the provided available_schemas (e.g. 'CD', 'LE', '1003', or 'OTHER').
3. 'fields_to_extract': List the key financial and borrower fields that must be extracted from the document.
   Typical fields for mortgage documents include:
   - "Borrower Full Name"
   - "Property Address"
   - "Base Loan Amount"
   - "Note Interest Rate"
   - "Monthly Principal and Interest Payment"
   - "Loan Term / Amortization"
   - "Lender Name"
   Must contain at least 4 to 6 relevant field names. NEVER return an empty list.
4. 'instructions': Provide clear, step-by-step instructions for the data extractor agent on how to locate each field in the document:
   - Where to find borrower name and property address (e.g. Header / Loan Details on Page 1 or 2).
   - Where to find loan amount, interest rate, and term (e.g. Loan Terms / Details section).
   - Where to find monthly principal & interest payment and lender information.
   Must contain at least 3 actionable instructions. NEVER return an empty list.
5. 'task': Provide a clear, professional summary of the extraction plan.

Return structured output adhering strictly to the ExtractionPlan schema.
""".strip()

        super().__init__(
            llm=llm,
            name="Orchestrator Agent",
            system_prompt=system_prompt,
            output_schema=ExtractionPlan
        )

    async def prepare_extraction(
        self,
        guideline: str,
        schemas: list[str] | None = None,
        document_content: str | None = None,
        filename: str | None = None,
    ) -> ExtractionPlan:

        if schemas is None:
            schemas = ["LE", "CD", "1003", "OTHER"]

        parts: list[str] = [
            f"### USER GUIDELINE:\n{guideline.strip()}",
            f"### AVAILABLE SCHEMAS:\n{schemas}"
        ]

        if filename:
            parts.append(f"### FILENAME:\n{filename}")

        if document_content and document_content.strip():
            # Preview first 5,000 characters (sufficient for classification and field planning)
            doc_sample = document_content.strip()
            if len(doc_sample) > 5000:
                doc_sample = doc_sample[:5000] + "\n\n[... document preview truncated for orchestrator planning ...]"
            parts.append(f"### DOCUMENT CONTENT PREVIEW:\n{doc_sample}")

        user_prompt = "\n\n".join(parts)
        return await self.run(user_prompt)
