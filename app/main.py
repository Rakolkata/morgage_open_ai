import json
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.agents import (
    AuditorAgent,
    DataExtractorAgent,
    OrchestratorAgent,
)
from app.database import init_db, save_chat_log
from app.errors import AppError, http_error
from app.llm import LLMService, OllamaService
from app.schemas import ChatResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# ==================================================
# SERVER LIFESPAN (DATABASE & TABLE INITIALIZATION)
# ==================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    On server startup:
    Checks if PostgreSQL database exists; creates it if not.
    Checks if table exists; creates it if not.
    Skips creation if both already exist.
    """
    logger.info("Server starting up: running PostgreSQL database check...")
    try:
        init_db()
    except Exception as exc:
        logger.warning("Database check encountered an error: %s", exc)
    yield
    logger.info("Server shutting down.")


# ==================================================
# FASTAPI APPLICATION
# ==================================================

app = FastAPI(
    title="Ollama Chat & Agent API",
    version="1.3.0",
    description="Backend API providing /api/v1/chat with multi-agent orchestration, Ollama, and PostgreSQL logging.",
    lifespan=lifespan
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
    summary="Chat with local Ollama or run specific Agent",
    description=(
        "Hit this endpoint with form-data (key: msg). "
        "Pass key: agent ('orchestrator', 'data_extractor', 'auditor') from Postman to execute specific agents. "
        "Requests are automatically stored in PostgreSQL with timestamp."
    )
)
async def chat(
    request: Request,
    msg: Optional[str] = Form(None, description="Input message or document text"),
    agent: Optional[str] = Form(None, description="Agent to execute: 'orchestrator', 'data_extractor', 'auditor', or 'chat'")
):
    user_msg = msg
    agent_mode = agent
    extra_form: dict = {}

    # Extract form-data if not mapped by parameter
    try:
        form_data = await request.form()
        extra_form = dict(form_data)
        if not user_msg:
            user_msg = form_data.get("msg") or form_data.get("message")
        if not agent_mode:
            agent_mode = form_data.get("agent")
    except Exception:
        pass

    # Extract JSON body fallback
    if not user_msg or not agent_mode:
        try:
            json_data = await request.json()
            if isinstance(json_data, dict):
                if not user_msg:
                    user_msg = json_data.get("msg") or json_data.get("message")
                if not agent_mode:
                    agent_mode = json_data.get("agent")
                extra_form.update(json_data)
        except Exception:
            pass

    # Extract query params fallback (?agent=...)
    if not agent_mode and request.query_params.get("agent"):
        agent_mode = request.query_params.get("agent")

    if not user_msg or not str(user_msg).strip():
        raise HTTPException(
            status_code=400,
            detail="Field 'msg' is required on form-data."
        )

    prompt = str(user_msg).strip()
    clean_agent = (
        str(agent_mode).strip().lower().replace("-", "_").replace(" ", "_")
        if agent_mode
        else ""
    )

    logger.info("Executing chat endpoint (agent='%s'): %s", clean_agent or "chat", prompt[:80])

    try:
        ollama = OllamaService()

        # --------------------------------------------------
        # 1. Orchestrator Agent
        # --------------------------------------------------
        if clean_agent in {"orchestrator", "orchestrator_agent", "plan", "planner"}:
            agent_instance = OrchestratorAgent(llm=ollama)

            # Check if custom schemas list is provided
            schemas_raw = extra_form.get("schemas") or extra_form.get("available_schemas")
            if isinstance(schemas_raw, str):
                try:
                    schemas_list = json.loads(schemas_raw)
                except Exception:
                    schemas_list = [s.strip() for s in schemas_raw.split(",") if s.strip()]
            elif isinstance(schemas_raw, list):
                schemas_list = schemas_raw
            else:
                schemas_list = ["LE", "CD", "1003", "OTHER"]

            result = await agent_instance.prepare_extraction(
                guideline=prompt,
                schemas=schemas_list
            )
            output_dict = result.model_dump()
            ans_text = json.dumps(output_dict, indent=2)

            # Store in PostgreSQL database
            save_chat_log(
                message=prompt,
                agent=agent_instance.name,
                response=ans_text
            )

            return ChatResponse(
                ans=ans_text,
                answer=ans_text,
                model=ollama.model,
                agent_name=agent_instance.name,
                agent_output=output_dict,
                status="success"
            )

        # --------------------------------------------------
        # 2. Data Extractor Agent
        # --------------------------------------------------
        if clean_agent in {"data_extractor", "data_extractor_agent", "extractor", "extract"}:
            agent_instance = DataExtractorAgent(llm=ollama)

            plan_input = extra_form.get("plan") or extra_form.get("extraction_plan")
            result = await agent_instance.extract(
                extraction_plan=plan_input,
                page_content=prompt
            )
            output_dict = result.model_dump()
            ans_text = json.dumps(output_dict, indent=2)

            # Store in PostgreSQL database
            save_chat_log(
                message=prompt,
                agent=agent_instance.name,
                response=ans_text
            )

            return ChatResponse(
                ans=ans_text,
                answer=ans_text,
                model=ollama.model,
                agent_name=agent_instance.name,
                agent_output=output_dict,
                status="success"
            )

        # --------------------------------------------------
        # 3. Auditor Agent
        # --------------------------------------------------
        if clean_agent in {"auditor", "auditor_agent", "audit"}:
            agent_instance = AuditorAgent(llm=ollama)

            extracted_data_input = extra_form.get("extracted_data") or extra_form.get("data") or prompt
            doc_content_input = extra_form.get("document_content") or extra_form.get("document") or prompt

            result = await agent_instance.audit(
                extracted_data=extracted_data_input,
                document_content=doc_content_input
            )
            output_dict = result.model_dump()
            ans_text = json.dumps(output_dict, indent=2)

            # Store in PostgreSQL database
            save_chat_log(
                message=prompt,
                agent=agent_instance.name,
                response=ans_text
            )

            return ChatResponse(
                ans=ans_text,
                answer=ans_text,
                model=ollama.model,
                agent_name=agent_instance.name,
                agent_output=output_dict,
                status="success"
            )

        # --------------------------------------------------
        # 4. Default Chat Mode (no agent or agent=chat)
        # --------------------------------------------------
        llm = LLMService()
        ans = llm.generate(prompt)

        # Store in PostgreSQL database
        save_chat_log(
            message=prompt,
            agent="Default Chat",
            response=ans
        )

        return ChatResponse(
            ans=ans,
            answer=ans,
            model=llm.model_name,
            agent_name="Default Chat",
            agent_output=None,
            status="success"
        )

    except AppError:
        raise
    except ConnectionError as exc:
        logger.error("Connection error with Ollama: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to process request: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
