
from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware

from app.agents import (
    AuditorAgent,
    DataExtractorAgent,
    OrchestratorAgent,
)
from app.database import init_db, save_chat_log
from app.document import extract_text_from_file_bytes
from app.errors import AppError, http_error
from app.llm import LLMService, OllamaService
from app.schemas import ChatResponse


# ==================================================
# LOGGING
# ==================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)


# ==================================================
# SERVER LIFESPAN
# ==================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initialize PostgreSQL database and tables on startup.
    """
    logger.info("Server starting: checking PostgreSQL database...")

    try:
        init_db()
    except Exception as exc:
        logger.warning("Database initialization warning: %s", exc)

    yield

    logger.info("Server shutting down.")


# ==================================================
# FASTAPI APPLICATION
# ==================================================

app = FastAPI(
    title="Mortgage Post-Closing Audit Assistant API",
    version="1.5.0",
    description=(
        "API for mortgage document processing, "
        "multi-agent extraction, auditing, and Ollama chat."
    ),
    lifespan=lifespan,
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
# EXCEPTION HANDLER
# ==================================================

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    logger.error(
        "Application error: %s - %s",
        exc.code,
        exc.message,
    )
    return http_error(exc)


# ==================================================
# HELPER: PARSE AVAILABLE SCHEMAS
# ==================================================

def parse_schemas(schemas_raw) -> list[str]:
    if isinstance(schemas_raw, str):
        try:
            parsed = json.loads(schemas_raw)

            if isinstance(parsed, list):
                return parsed

        except (json.JSONDecodeError, TypeError):
            pass

        return [
            item.strip()
            for item in schemas_raw.split(",")
            if item.strip()
        ]

    if isinstance(schemas_raw, list):
        return schemas_raw

    return ["LE", "CD", "1003", "OTHER"]


# ==================================================
# CHAT AND AGENT ENDPOINT
# ==================================================

@app.post(
    "/api/v1/chat",
    response_model=ChatResponse,
    summary="Chat, extract mortgage data, or audit documents",
    description=(
        "Send multipart form-data with msg, agent, and optional file. "
        "Supported agents: chat, orchestrator, data_extractor, "
        "auditor, and workflow."
    ),
)
async def chat(
    request: Request,
    msg: Optional[str] = Form(
        None,
        description="User message or extraction guideline",
    ),
    agent: Optional[str] = Form(
        None,
        description="Agent mode: chat, orchestrator, data_extractor, auditor, workflow",
    ),
    file: Optional[UploadFile] = File(
        None,
        description="Optional mortgage document",
    ),
):
    user_msg = msg
    agent_mode = agent
    uploaded_file = file
    extra_form: dict = {}

    # --------------------------------------------------
    # 1. READ FORM DATA
    # --------------------------------------------------

    try:
        form_data = await request.form()
        extra_form = dict(form_data)

        if not user_msg:
            user_msg = (
                form_data.get("msg")
                or form_data.get("message")
            )

        if not agent_mode:
            agent_mode = form_data.get("agent")

        if not uploaded_file:
            for key in ("file", "document", "pdf", "doc"):
                value = form_data.get(key)

                if (
                    hasattr(value, "filename")
                    and hasattr(value, "read")
                ):
                    uploaded_file = value
                    break

    except Exception as exc:
        logger.debug("Form-data parsing fallback: %s", exc)

    # --------------------------------------------------
    # 2. JSON BODY FALLBACK
    # --------------------------------------------------

    if not user_msg or not agent_mode:
        try:
            json_data = await request.json()

            if isinstance(json_data, dict):
                if not user_msg:
                    user_msg = (
                        json_data.get("msg")
                        or json_data.get("message")
                    )

                if not agent_mode:
                    agent_mode = json_data.get("agent")

                extra_form.update(json_data)

        except Exception:
            pass

    # --------------------------------------------------
    # 3. QUERY PARAMETER FALLBACK
    # --------------------------------------------------

    if not agent_mode and request.query_params.get("agent"):
        agent_mode = request.query_params.get("agent")

    # --------------------------------------------------
    # 4. PROCESS UPLOADED DOCUMENT
    # --------------------------------------------------

    extracted_doc_text = ""
    file_name: Optional[str] = None

    if (
        uploaded_file
        and hasattr(uploaded_file, "filename")
        and uploaded_file.filename
    ):
        file_name = uploaded_file.filename

        try:
            raw_bytes = await uploaded_file.read()

            extracted_doc_text = extract_text_from_file_bytes(
                raw_bytes,
                file_name,
            )

            logger.info(
                "Extracted %d characters from '%s'",
                len(extracted_doc_text),
                file_name,
            )

        except AppError:
            raise

        except Exception as exc:
            logger.exception(
                "Document extraction failed for '%s'",
                file_name,
            )
            raise HTTPException(
                status_code=422,
                detail=f"Could not extract document text: {str(exc)}",
            ) from exc

    # --------------------------------------------------
    # 5. VALIDATE USER MESSAGE
    # --------------------------------------------------

    if not user_msg or not str(user_msg).strip():
        if extracted_doc_text or file_name:
            user_msg = (
                f"Analyze the uploaded document '{file_name}' "
                "and prepare extraction instructions."
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Field 'msg' or an uploaded 'file' "
                    "is required."
                ),
            )

    prompt = str(user_msg).strip()

    clean_agent = (
        str(agent_mode).strip().lower()
        .replace("-", "_")
        .replace(" ", "_")
        if agent_mode
        else ""
    )

    logger.info(
        "Executing request: agent='%s', file='%s', message='%s'",
        clean_agent or "chat",
        file_name or "None",
        prompt[:80],
    )

    # --------------------------------------------------
    # 6. EXECUTE AGENT
    # --------------------------------------------------

    try:
        ollama = OllamaService()

        # ==================================================
        # WORKFLOW: ORCHESTRATOR -> DATA EXTRACTOR
        # ==================================================

        if clean_agent in {
            "workflow",
            "multi_agent",
            "multi_agent_workflow",
            "extract_workflow",
            "extract_data",
        }:

            if not extracted_doc_text.strip():
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "A document with extractable text is required "
                        "for the extraction workflow."
                    ),
                )

            logger.info("Starting multi-agent extraction workflow.")

            # ----------------------------------------------
            # STEP 1: ORCHESTRATOR
            # ----------------------------------------------

            logger.info("Step 1: Running Orchestrator Agent.")

            orchestrator = OrchestratorAgent(llm=ollama)

            schemas_raw = (
                extra_form.get("schemas")
                or extra_form.get("available_schemas")
            )

            schemas_list = parse_schemas(schemas_raw)

            plan_result = await orchestrator.prepare_extraction(
                guideline=prompt,
                schemas=schemas_list,
                document_content=extracted_doc_text,
                filename=file_name,
            )

            plan_dict = plan_result.model_dump()

            # Convert the plan into JSON before passing it
            # to the Data Extractor Agent.
            plan_json = plan_result.model_dump_json(indent=2)

            logger.info(
                "Orchestrator completed. Selected document types: %s",
                plan_result.document_types,
            )

            # ----------------------------------------------
            # STEP 2: DATA EXTRACTOR
            # ----------------------------------------------

            logger.info("Step 2: Running Data Extractor Agent.")

            extractor = DataExtractorAgent(llm=ollama)

            extraction_result = await extractor.extract(
                extraction_plan=plan_json,
                page_content=extracted_doc_text,
            )

            extraction_dict = extraction_result.model_dump()

            logger.info(
                "Data extraction completed. Extracted fields: %d",
                len(extraction_result.extracted_fields),
            )

            # ----------------------------------------------
            # STEP 3: COMBINE BOTH AGENT OUTPUTS
            # ----------------------------------------------

            workflow_output = {
                "workflow_steps": [
                    {
                        "step": 1,
                        "agent": "Orchestrator Agent",
                        "status": "completed",
                        "message": (
                            "Request analyzed. Extraction plan generated."
                        ),
                    },
                    {
                        "step": 2,
                        "agent": "Data Extractor Agent",
                        "status": "completed",
                        "message": (
                            "Document analyzed and extraction completed."
                        ),
                    },
                ],
                "extraction_plan": plan_dict,
                "extraction_result": extraction_dict,
            }

            answer_text = json.dumps(
                workflow_output,
                indent=2,
                ensure_ascii=False,
            )

            # ----------------------------------------------
            # STEP 4: SAVE WORKFLOW RESULT
            # ----------------------------------------------

            save_chat_log(
                message=(
                    f"[File: {file_name}] {prompt}"
                    if file_name
                    else prompt
                ),
                agent="Mortgage Extraction Workflow",
                response=answer_text,
            )

            # ----------------------------------------------
            # STEP 5: RETURN API RESPONSE
            # ----------------------------------------------

            return ChatResponse(
                answer=answer_text,
                model=ollama.model,
                agent_name="Mortgage Extraction Workflow",
                agent_output=workflow_output,
                file_name=file_name,
                status="success",
            )

        # ==================================================
        # STANDALONE: ORCHESTRATOR AGENT
        # ==================================================

        if clean_agent in {
            "orchestrator",
            "orchestrator_agent",
            "plan",
            "planner",
        }:

            agent_instance = OrchestratorAgent(llm=ollama)

            schemas_raw = (
                extra_form.get("schemas")
                or extra_form.get("available_schemas")
            )

            schemas_list = parse_schemas(schemas_raw)

            result = await agent_instance.prepare_extraction(
                guideline=prompt,
                schemas=schemas_list,
                document_content=extracted_doc_text,
                filename=file_name,
            )

            output_dict = result.model_dump()

            answer_text = json.dumps(
                output_dict,
                indent=2,
                ensure_ascii=False,
            )

            save_chat_log(
                message=(
                    f"[File: {file_name}] {prompt}"
                    if file_name
                    else prompt
                ),
                agent=agent_instance.name,
                response=answer_text,
            )

            return ChatResponse(
                answer=answer_text,
                model=ollama.model,
                agent_name=agent_instance.name,
                agent_output=output_dict,
                file_name=file_name,
                status="success",
            )

        # ==================================================
        # STANDALONE: DATA EXTRACTOR AGENT
        # ==================================================

        if clean_agent in {
            "data_extractor",
            "data_extractor_agent",
            "extractor",
            "extract",
        }:

            agent_instance = DataExtractorAgent(llm=ollama)

            content_to_extract = (
                extracted_doc_text
                if extracted_doc_text
                else prompt
            )

            plan_input = (
                extra_form.get("plan")
                or extra_form.get("extraction_plan")
            )

            if not plan_input and extracted_doc_text:
                plan_input = prompt

            result = await agent_instance.extract(
                extraction_plan=plan_input,
                page_content=content_to_extract,
            )

            output_dict = result.model_dump()

            answer_text = json.dumps(
                output_dict,
                indent=2,
                ensure_ascii=False,
            )

            save_chat_log(
                message=(
                    f"[File: {file_name}] {prompt}"
                    if file_name
                    else prompt
                ),
                agent=agent_instance.name,
                response=answer_text,
            )

            return ChatResponse(
                answer=answer_text,
                model=ollama.model,
                agent_name=agent_instance.name,
                agent_output=output_dict,
                file_name=file_name,
                status="success",
            )

        # ==================================================
        # STANDALONE: AUDITOR AGENT
        # ==================================================

        if clean_agent in {
            "auditor",
            "auditor_agent",
            "audit",
        }:

            agent_instance = AuditorAgent(llm=ollama)

            extracted_data_input = (
                extra_form.get("extracted_data")
                or extra_form.get("data")
                or prompt
            )

            document_content_input = (
                extracted_doc_text
                if extracted_doc_text
                else (
                    extra_form.get("document_content")
                    or extra_form.get("document")
                    or prompt
                )
            )

            result = await agent_instance.audit(
                extracted_data=extracted_data_input,
                document_content=document_content_input,
            )

            output_dict = result.model_dump()

            answer_text = json.dumps(
                output_dict,
                indent=2,
                ensure_ascii=False,
            )

            save_chat_log(
                message=(
                    f"[File: {file_name}] {prompt}"
                    if file_name
                    else prompt
                ),
                agent=agent_instance.name,
                response=answer_text,
            )

            return ChatResponse(
                answer=answer_text,
                model=ollama.model,
                agent_name=agent_instance.name,
                agent_output=output_dict,
                file_name=file_name,
                status="success",
            )

        # ==================================================
        # DEFAULT CHAT MODE
        # ==================================================

        full_chat_prompt = prompt

        if extracted_doc_text:
            full_chat_prompt = (
                f"Document Content ({file_name}):\n"
                f"{extracted_doc_text}\n\n"
                f"Question / Instruction:\n{prompt}"
            )

        llm = LLMService()

        answer = llm.generate(full_chat_prompt)

        save_chat_log(
            message=(
                f"[File: {file_name}] {prompt}"
                if file_name
                else prompt
            ),
            agent="Default Chat",
            response=answer,
        )

        return ChatResponse(
            answer=answer,
            model=llm.model_name,
            agent_name="Default Chat",
            agent_output=None,
            file_name=file_name,
            status="success",
        )

    # ==================================================
    # ERROR HANDLING
    # ==================================================

    except AppError:
        raise

    except HTTPException:
        raise

    except ConnectionError as exc:
        logger.error("Connection error with Ollama: %s", exc)

        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception("Failed to process request: %s", exc)

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


# ==================================================
# RUN SERVER
# ==================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
