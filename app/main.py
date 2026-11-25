from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

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
from app.services.export_service import EXPORTS_DIR

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
    version="1.4.0",
    description="Backend API providing /api/v1/chat with multi-agent orchestration, document processing, and local Ollama support.",
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
# DOWNLOAD EXPORT ENDPOINT (EXCEL, JSON, XML, CSV)
# ==================================================

@app.get(
    "/api/v1/download/{file_name}",
    summary="Download exported audit report (Excel, JSON, XML, CSV)",
    description="Browser-accessible download endpoint for audited reports. Returns attachment with proper Content-Disposition header."
)
@app.get("/downloads/{file_name}", include_in_schema=False)
async def download_audit_export(file_name: str):
    safe_name = os.path.basename(file_name)
    target = EXPORTS_DIR / safe_name
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail=f"Export file '{safe_name}' not found.")

    ext = target.suffix.lower()
    media_map = {
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".json": "application/json",
        ".xml": "application/xml",
        ".csv": "text/csv",
    }
    media_type = media_map.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(target),
        filename=safe_name,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'}
    )


# ==================================================
# CHAT & AGENT ENDPOINT WITH FILE UPLOAD
# ==================================================

@app.post(
    "/api/v1/chat",
    response_model=ChatResponse,
    summary="Chat with local Ollama or run specific Agent with optional document upload",
    description=(
        "Hit this endpoint with form-data. "
        "Pass 'msg' (guideline/text), 'agent' ('orchestrator', 'data_extractor', 'auditor'), "
        "and optional 'file' (PDF, TXT, image) to prepare extraction instructions or extract data based on that document."
    )
)
async def chat(
    request: Request,
    msg: Optional[str] = Form(None, description="Input message or guideline text"),
    agent: Optional[str] = Form(None, description="Agent to execute: 'orchestrator', 'data_extractor', 'auditor', or 'chat'"),
    file: Optional[UploadFile] = File(None, description="Optional document file (PDF, TXT, image, etc.)")
):
    user_msg = msg
    agent_mode = agent
    uploaded_file = file
    extra_form: dict = {}

    # Extract form-data and check for uploaded file in request form
    try:
        form_data = await request.form()
        extra_form = dict(form_data)
        if not user_msg:
            user_msg = form_data.get("msg") or form_data.get("message")
        if not agent_mode:
            agent_mode = form_data.get("agent")
        if not uploaded_file:
            for key in ("file", "document", "pdf", "doc"):
                val = form_data.get(key)
                if hasattr(val, "filename") and hasattr(val, "read"):
                    uploaded_file = val
                    break
    except Exception:
        pass

    # Extract JSON body fallback (if non-multipart)
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

    # Process uploaded file if present
    extracted_doc_text = ""
    file_name: Optional[str] = None

    if uploaded_file and hasattr(uploaded_file, "filename") and uploaded_file.filename:
        file_name = uploaded_file.filename
        try:
            raw_bytes = await uploaded_file.read()
            extracted_doc_text = extract_text_from_file_bytes(raw_bytes, file_name)
            logger.info(
                "Extracted %d characters from uploaded file '%s'",
                len(extracted_doc_text),
                file_name
            )
        except AppError:
            raise
        except Exception as exc:
            logger.warning("Failed to extract content from uploaded file '%s': %s", file_name, exc)

    # If file was provided but msg was empty, provide a clean default guideline
    if not user_msg or not str(user_msg).strip():
        if extracted_doc_text or file_name:
            user_msg = f"Analyze the uploaded document '{file_name}' and prepare extraction instructions."
        else:
            raise HTTPException(
                status_code=400,
                detail="Field 'msg' or an uploaded 'file' is required on form-data."
            )

    prompt = str(user_msg).strip()
    clean_agent = (
        str(agent_mode).strip().lower().replace("-", "_").replace(" ", "_")
        if agent_mode
        else ""
    )

    logger.info(
        "Executing chat endpoint (agent='%s', file='%s'): %s",
        clean_agent or "chat",
        file_name or "None",
        prompt[:80]
    )

    try:
        ollama = OllamaService()

        # --------------------------------------------------
        # 1. Orchestrator Agent (with Document Support)
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

            # Prepare extraction plan based on guideline and attached document content
            result = await agent_instance.prepare_extraction(
                guideline=prompt,
                schemas=schemas_list,
                document_content=extracted_doc_text,
                filename=file_name
            )
            output_dict = result.model_dump()
            ans_text = json.dumps(output_dict, indent=2)

            # Store in PostgreSQL database
            save_chat_log(
                message=f"[File: {file_name}] {prompt}" if file_name else prompt,
                agent=agent_instance.name,
                response=ans_text
            )

            return ChatResponse(
                answer=ans_text,
                model=ollama.model,
                agent_name=agent_instance.name,
                agent_output=output_dict,
                file_name=file_name,
                status="success"
            )

        # --------------------------------------------------
        # 2. Data Extractor Agent (with Document Support)
        # --------------------------------------------------
        if clean_agent in {"data_extractor", "data_extractor_agent", "extractor", "extract"}:
            agent_instance = DataExtractorAgent(llm=ollama)

            # If file is attached, use its content; otherwise use prompt as document content
            content_to_extract = extracted_doc_text if extracted_doc_text else prompt
            plan_input = extra_form.get("plan") or extra_form.get("extraction_plan")
            if not plan_input and extracted_doc_text:
                plan_input = prompt

            result = await agent_instance.extract(
                extraction_plan=plan_input,
                page_content=content_to_extract
            )
            output_dict = result.model_dump()
            ans_text = json.dumps(output_dict, indent=2)

            save_chat_log(
                message=f"[File: {file_name}] {prompt}" if file_name else prompt,
                agent=agent_instance.name,
                response=ans_text
            )

            return ChatResponse(
                answer=ans_text,
                model=ollama.model,
                agent_name=agent_instance.name,
                agent_output=output_dict,
                file_name=file_name,
                status="success"
            )

        # --------------------------------------------------
        # 3. Auditor Agent (with Document & Export Support)
        # --------------------------------------------------
        if clean_agent in {"auditor", "auditor_agent", "audit"}:
            agent_instance = AuditorAgent(llm=ollama)

            # Determine extracted data: parse if provided in form, or auto-extract from document
            raw_ext = extra_form.get("extracted_data") or extra_form.get("data")
            extracted_data_obj = None

            if raw_ext:
                if isinstance(raw_ext, str):
                    try:
                        extracted_data_obj = json.loads(raw_ext)
                    except Exception:
                        extracted_data_obj = raw_ext
                else:
                    extracted_data_obj = raw_ext

            # If no extracted data provided, extract data from document automatically
            if not extracted_data_obj and extracted_doc_text:
                logger.info("Auditor: Auto-extracting mortgage fields from attached document before audit...")
                extractor_instance = DataExtractorAgent(llm=ollama)
                extraction_result = await extractor_instance.extract(
                    extraction_plan="Extract all key mortgage terms: Borrower Full Name, Property Address, Base Loan Amount, Note Interest Rate, Monthly Principal and Interest Payment, Loan Term / Amortization, Lender Name.",
                    page_content=extracted_doc_text
                )
                extracted_data_obj = extraction_result.model_dump()

            if not extracted_data_obj:
                extracted_data_obj = prompt

            doc_content_input = (
                extracted_doc_text
                if extracted_doc_text
                else (extra_form.get("document_content") or extra_form.get("document") or prompt)
            )

            base_url = str(request.base_url).rstrip("/")

            result = await agent_instance.audit(
                extracted_data=extracted_data_obj,
                document_content=doc_content_input,
                prompt=prompt,
                file_name=file_name,
                base_url=base_url
            )
            output_dict = result.model_dump()

            # Format comprehensive user answer with direct download links and summary table
            findings = output_dict.get("findings") or []
            total = output_dict.get("total_checks", len(findings))
            passed = output_dict.get("passed", 0)
            exceptions = output_dict.get("exceptions", 0)
            missing = output_dict.get("missing_evidence", 0)
            fmt = (result.file_format or "excel").upper()
            dl_url = result.download_url or ""
            filename_str = result.export_filename or ""
            available_dls = result.available_downloads or {}

            ans_lines = [
                "### 🛡️ Auditor Agent Report",
                f"**Document:** {file_name or 'Uploaded Document'}",
                f"**User Prompt / Request:** {prompt}",
                "",
                "#### 📊 Verification Summary",
                f"- **Total Checks:** {total}",
                f"- **Passed (MATCH):** {passed}",
                f"- **Exceptions (MISMATCH):** {exceptions}",
                f"- **Missing / Incomplete Evidence:** {missing}",
                f"- **Overall Verdict:** {'✅ PASSED' if exceptions == 0 and passed > 0 else '⚠️ REVIEW REQUIRED'}",
                "",
                "#### 📥 Download Audited Data",
                f"- **Format:** {fmt} file",
                f"- **File Name:** `{filename_str}`",
                f"- **Download Link:** [📥 Click Here to Download {fmt} Report]({dl_url})",
                f"- **Direct Browser URL:** `{dl_url}`",
                "",
            ]

            alt_links = []
            for alt_fmt, alt_url in available_dls.items():
                alt_links.append(f"[{alt_fmt.upper()} Report]({alt_url})")
            if alt_links:
                ans_lines.append("**All Download Formats Available:** " + " | ".join(alt_links))
                ans_lines.append("")

            ans_lines.extend([
                "#### 🔍 Detailed Findings Table",
                "| Field Path | Status | Extracted Value | Document Value | Page | Explanation |",
                "| :--- | :--- | :--- | :--- | :---: | :--- |"
            ])

            for f in findings:
                status_icon = "✅" if f.get("status") == "MATCH" else ("❌" if f.get("status") == "MISMATCH" else "⚠️")
                ans_lines.append(
                    f"| **{f.get('field_path', '')}** | {status_icon} `{f.get('status', '')}` | {f.get('extracted_value') or '—'} | {f.get('document_value') or '—'} | {f.get('page') or '—'} | {f.get('explanation') or '—'} |"
                )

            ans_lines.extend([
                "",
                "```json",
                json.dumps(output_dict, indent=2),
                "```"
            ])

            ans_text = "\n".join(ans_lines)

            save_chat_log(
                message=f"[File: {file_name}] {prompt}" if file_name else prompt,
                agent=agent_instance.name,
                response=ans_text
            )

            return ChatResponse(
                answer=ans_text,
                model=ollama.model,
                agent_name=agent_instance.name,
                agent_output=output_dict,
                file_name=file_name,
                status="success",
                download_url=result.download_url,
                download_format=result.file_format,
                available_downloads=result.available_downloads
            )

        # --------------------------------------------------
        # 4. Default Chat Mode (no agent or agent=chat)
        # --------------------------------------------------
        full_chat_prompt = prompt
        if extracted_doc_text:
            full_chat_prompt = (
                f"Document Content ({file_name}):\n"
                f"{extracted_doc_text}\n\n"
                f"Question / Instruction:\n{prompt}"
            )

        llm = LLMService()
        ans = llm.generate(full_chat_prompt)

        save_chat_log(
            message=f"[File: {file_name}] {prompt}" if file_name else prompt,
            agent="Default Chat",
            response=ans
        )

        return ChatResponse(
            answer=ans,
            model=llm.model_name,
            agent_name="Default Chat",
            agent_output=None,
            file_name=file_name,
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
