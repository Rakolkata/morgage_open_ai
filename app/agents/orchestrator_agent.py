from __future__ import annotations

from typing import Any

from app.agents.base_agent import BaseAgent
from app.agents.schemas import ExtractionPlan
from app.llm.ollama_client import OllamaService


class OrchestratorAgent(BaseAgent):

    def __init__(self, llm: OllamaService | None = None):

        system_prompt = """
        You are the Orchestrator Agent of a
        mortgage document processing application.

        Your responsibility is to prepare
        extraction instructions.

        You must:

        1. Analyze the user's guidelines.
        2. Identify the required document types.
        3. Select the appropriate predefined schema.
        4. Identify the fields that need extraction.
        5. Prepare clear extraction instructions.

        Supported documents:
        - LE
        - CD
        - 1003
        - OTHER

        Do not extract document data yourself.

        Do not invent schema names.
        Use only the schema names provided
        in the input.

        Return structured output only.
        """

        super().__init__(
            llm=llm,
            name="Orchestrator Agent",
            system_prompt=system_prompt,
            output_schema=ExtractionPlan
        )

    async def prepare_extraction(
        self,
        guideline: str,
        schemas: list[str] | None = None
    ) -> ExtractionPlan:

        if schemas is None:
            schemas = ["LE", "CD", "1003", "OTHER"]

        return await self.run({
            "user_guideline": guideline,
            "available_schemas": schemas
        })
