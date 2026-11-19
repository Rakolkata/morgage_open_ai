import json
import logging
from typing import Optional

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.agents import (
    AuditResult,
    BaseAgent,
    ExtractionPlan,
    ExtractionResult,
)
from app.errors import AppError, http_error
from app.llm import LLMService, OllamaService
from app.schemas import ChatResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ==================================================
# FASTAPI APPLICATION
# ==================================================

app = FastAPI(
    title="Ollama Chat & Agent API",
    version="1.1.0",
    description="Backend API providing /api/v1/chat with BaseAgent and local Ollama support."
)

# ==================================================
# CORS CONFIGURATION
# ==================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================================================
# EXCEPTION HANDLERS
# ==================================================

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    logger.error("Application error: %s - %s", exc.code, exc.message)
    return http_error(exc)


# ==================================================
# CHAT & AGENT ENDPOINT
# ==================================================

@app.post(
    "/api/v1/chat",
    response_model=ChatResponse,
    summary="Chat with local Ollama or test BaseAgent",
    description=(
        "Hit this endpoint with form-data (key: msg). "
        "Optionally pass key: agent ('plan', 'extract', 'audit') to test BaseAgent."
    )
)
async def chat(
    request: Request,
    msg: Optional[str] = Form(None, description="Message to prompt the local Ollama model or agent"),
    agent: Optional[str] = Form(None, description="Optional agent mode: 'plan', 'extract', 'audit', or 'chat'")
):
    user_msg = msg
    agent_mode = agent

    # Fallback to check form-data or JSON body if not directly matched by FastAPI Form parameters
    if not user_msg or not agent_mode:
        try:
            form_data = await request.form()
            if not user_msg:
                user_msg = form_data.get("msg") or form_data.get("message")
            if not agent_mode:
                agent_mode = form_data.get("agent")
        except Exception:
            pass

    if not user_msg:
        try:
            json_data = await request.json()
            if isinstance(json_data, dict):
                user_msg = json_data.get("msg") or json_data.get("message")
                if not agent_mode:
                    agent_mode = json_data.get("agent")
        except Exception:
            pass

    if not user_msg or not str(user_msg).strip():
        raise HTTPException(
            status_code=400,
            detail="Field 'msg' is required on form-data."
        )

    prompt = str(user_msg).strip()
    agent_name = str(agent_mode).strip().lower() if agent_mode else ""
    logger.info("Received request (agent=%s): %s", agent_name or "chat", prompt[:80])

    try:
        # --------------------------------------------------
        # Agent Mode: Test BaseAgent with Schemas
        # --------------------------------------------------
        if agent_name in {"plan", "orchestrator"}:
            ollama = OllamaService()
            agent_instance = BaseAgent(
                llm=ollama,
                name="OrchestratorAgent",
                system_prompt=(
                    "You are a mortgage loan document extraction planner. "
                    "Analyze the task and generate a structured ExtractionPlan adhering to the schema."
                ),
                output_schema=ExtractionPlan
            )
            result = await agent_instance.run({"task": prompt})
            output_dict = result.model_dump()
            ans_text = json.dumps(output_dict, indent=2)

            return ChatResponse(
                ans=ans_text,
                answer=ans_text,
                model=ollama.model,
                agent_name=agent_instance.name,
                agent_output=output_dict,
                status="success"
            )

        if agent_name in {"extract", "extractor"}:
            ollama = OllamaService()
            agent_instance = BaseAgent(
                llm=ollama,
                name="ExtractorAgent",
                system_prompt=(
                    "You are a mortgage document extraction assistant. "
                    "Extract fields, document info, and missing items according to the schema."
                ),
                output_schema=ExtractionResult
            )
            result = await agent_instance.run({"document_content": prompt})
            output_dict = result.model_dump()
            ans_text = json.dumps(output_dict, indent=2)

            return ChatResponse(
                ans=ans_text,
                answer=ans_text,
                model=ollama.model,
                agent_name=agent_instance.name,
                agent_output=output_dict,
                status="success"
            )

        if agent_name in {"audit", "auditor"}:
            ollama = OllamaService()
            agent_instance = BaseAgent(
                llm=ollama,
                name="AuditorAgent",
                system_prompt=(
                    "You are a mortgage document post-closing audit assistant. "
                    "Perform checks and generate findings according to the schema."
                ),
                output_schema=AuditResult
            )
            result = await agent_instance.run({"document_content": prompt})
            output_dict = result.model_dump()
            ans_text = json.dumps(output_dict, indent=2)

            return ChatResponse(
                ans=ans_text,
                answer=ans_text,
                model=ollama.model,
                agent_name=agent_instance.name,
                agent_output=output_dict,
                status="success"
            )

        # --------------------------------------------------
        # Default Chat Mode: Direct Ollama Query
        # --------------------------------------------------
        llm = LLMService()
        ans = llm.generate(prompt)

        return ChatResponse(
            ans=ans,
            answer=ans,
            model=llm.model_name,
            status="success"
        )

    except AppError:
        raise
    except ConnectionError as exc:
        logger.error("Connection error: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to process request: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
