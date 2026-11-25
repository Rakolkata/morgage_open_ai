from __future__ import annotations

from typing import Any
from pydantic import BaseModel

from app.llm import LLMClient, get_llm_service


class BaseAgent:

    def __init__(
        self,
        llm: LLMClient | Any = None,
        name: str = "BaseAgent",
        system_prompt: str = "You are a helpful structured extraction agent.",
        output_schema: type[BaseModel] | None = None
    ):
        if llm is not None:
            self.llm = llm
        else:
            self.llm = get_llm_service()

        self.name = name
        self.system_prompt = system_prompt
        self.output_schema = output_schema or BaseModel

    async def run(self, input_data: dict | str | BaseModel | None = None) -> BaseModel:
        if input_data is None:
            input_data = {}

        result = await self.llm.generate(
            agent_name=self.name,
            system_prompt=self.system_prompt,
            input_data=input_data,
            output_schema=self.output_schema
        )

        return result
