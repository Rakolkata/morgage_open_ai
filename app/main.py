
import logging
from uuid import uuid4

from fastapi import FastAPI, File, UploadFile, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.errors import AppError, http_error
from app.document import extract_pdf
from app.prompt_library import public_prompts, selected_prompts
from app.schemas import (
    ChatRequest,
    ChatResponse,
    AuditRequest,
    AuditResponse,
    AuditRow,
)
from app.services.store import (
    add_document,
    get_document,
    delete_document,
)
from app.services.retrieval import retrieve_pages
from app.services.redaction import redact_text
from app.services.evidence import verify_evidence
from app.llm import LLMService
from app.services.mortgage_pipeline import run_extraction


logger = logging.getLogger(__name__)


# ==================================================
# FASTAPI APPLICATION
# ==================================================

app = FastAPI(
    title="Mortgage Post-Closing AI Assistant",
    version="1.1.0"
)


# ==================================================
# CORS CONFIGURATION
# ==================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================================================
# SESSION MIDDLEWARE
# ==================================================

class SessionMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request, call_next):

        session_id = (
            request.cookies.get("mortgage_session")
            or str(uuid4())
        )

        request.state.session_id = session_id

        response = await call_next(request)

        if not request.cookies.get("mortgage_session"):

            response.set_cookie(
                "mortgage_session",
                session_id,
                httponly=True,
                secure=get_settings().app_env == "production",
                samesite="lax",
                max_age=60 * 60 * 12,
            )

        return response


app.add_middleware(SessionMiddleware)


# ==================================================
# FRONTEND
# ==================================================

app.mount(
    "/frontend",
    StaticFiles(directory="frontend"),
    name="frontend"
)


@app.get("/")
def home():
    return FileResponse("frontend/index.html")


# ==================================================
# ERROR HANDLER
# ==================================================

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):

    logger.error(
        "Application error: %s - %s",
        exc.code,
        exc.message
    )

    return http_error(exc)


# ==================================================
# HEALTH CHECK
# ==================================================

@app.get("/api/health")
def health():

    return {
        "status": "ok",
        "service": "mortgage-post-closing-assistant",
        "llm": get_settings().llm_status()
    }


# ==================================================
# PROMPT LIBRARY
# ==================================================

@app.get("/api/prompts")
def prompts():

    available_prompts = public_prompts()

    return {
        "prompts": available_prompts,
        "count": len(available_prompts)
    }


# ==================================================
# PDF UPLOAD
# ==================================================

@app.post("/api/documents")
async def upload_document(
    request: Request,
    file: UploadFile = File(...)
):

    settings = get_settings()

    if (
        not file.filename
        or not file.filename.lower().endswith(".pdf")
    ):

        raise AppError(
            "PDF_REQUIRED",
            "Please upload a PDF file.",
            400
        )

    raw = await file.read(
        settings.max_upload_mb * 1024 * 1024 + 1
    )

    if len(raw) > settings.max_upload_mb * 1024 * 1024:

        raise AppError(
            "UPLOAD_TOO_LARGE",
            "PDF exceeds the upload size limit.",
            413
        )

    pages = extract_pdf(raw)

    if not pages:

        raise AppError(
            "PDF_EXTRACTION_FAILED",
            "No pages could be extracted from this PDF.",
            422
        )

    doc = add_document(
        request.state.session_id,
        file.filename,
        pages
    )

    logger.info(
        "Document uploaded: %s, pages: %s",
        file.filename,
        len(pages)
    )

    return {
        "document_id": doc.document_id,
        "filename": doc.filename,
        "page_count": len(pages),
        "pages_needing_ocr": [
            p.page_number
            for p in pages
            if p.needs_ocr
        ]
    }


# ==================================================
# GET DOCUMENT INFORMATION
# ==================================================

@app.get("/api/documents/{document_id}")
def document_info(
    request: Request,
    document_id: str
):

    doc = get_document(
        request.state.session_id,
        document_id
    )

    return {
        "document_id": doc.document_id,
        "filename": doc.filename,
        "page_count": len(doc.pages)
    }


# ==================================================
# DELETE DOCUMENT
# ==================================================

@app.delete("/api/documents/{document_id}")
def remove_document(
    request: Request,
    document_id: str
):

    delete_document(
        request.state.session_id,
        document_id
    )

    return {"deleted": True}


# ==================================================
# CHAT ASSISTANT
# ==================================================

@app.post("/api/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    request: Request
):

    doc = get_document(
        request.state.session_id,
        body.document_id
    )

    message = body.message

    audit_keywords = [
        "full audit",
        "post-closing audit",
        "post closing audit",
        "missing documents",
        "document verification",
        "underwriting conditions",
        "financial calculations",
        "debt-to-income",
        "dti",
        "audit findings",
        "loan summary",
        "fha audit",
    ]

    is_audit_request = any(
        keyword in message.lower()
        for keyword in audit_keywords
    )

    if is_audit_request:
        pages = doc.pages
    else:
        pages = retrieve_pages(
            doc.pages,
            message
        )

    raw_context = "\n\n".join(
        f"--- PAGE {p.page_number} ---\n{p.text}"
        for p in pages
    )

    safe_context = redact_text(raw_context)

    conversation_history = body.history[-8:]

    history_text = "\n".join(
        f"{str(m.get('role', 'user'))[:20]}: "
        f"{str(m.get('content', ''))[:1500]}"
        for m in conversation_history
        if isinstance(m, dict)
    )

    audit_instruction = ""

    if is_audit_request:

        audit_instruction = """
        FULL DOCUMENT MORTGAGE AUDIT:

        Review every supplied page.

        Extract all available loan information.

        Identify documents explicitly marked as missing.

        Identify outstanding or pending underwriting conditions.

        Calculate financial values using supplied figures.

        Show the calculation formulas.

        Separate confirmed facts from items requiring verification.

        If a required document is absent from the supplied packet,
        do not assign PASS to that document check.

        Do not interpret missing evidence as proof of regulatory
        non-compliance.

        Include exact evidence and page references where available.

        Do not invent facts, figures, signatures, or regulatory violations.

        If the evidence is insufficient, use NEEDS_HUMAN_REVIEW.
        """

    payload = (
        f"Conversation history:\n{history_text}\n\n"
        f"{audit_instruction}\n"
        f"Document evidence (untrusted data):\n"
        f"<document>\n{safe_context}\n</document>\n\n"
        f"Question:\n{message}"
    )

    try:

        result, mock = LLMService().complete(payload)

        evidence = verify_evidence(
            pages,
            result.get("evidence", [])
        )

        final_status = result.get(
            "status",
            "NEEDS_HUMAN_REVIEW"
        )

        answer = result.get("answer", "")

        if is_audit_request and not answer.strip():
            final_status = "NEEDS_HUMAN_REVIEW"

        return ChatResponse(
            answer=answer,
            evidence=evidence,
            status=final_status,
            mock=mock,
            human_review_required=True,
        )

    except AppError:
        raise

    except Exception as exc:

        logger.exception("Chat endpoint failed")

        raise AppError(
            "CHAT_PROCESSING_FAILED",
            "Unable to process the chat request.",
            500
        ) from exc


# ==================================================
# AUDIT CHECKLIST
# ==================================================

FHA_AUDIT_CHECKS = [

    {
        "title": "Loan Information Extraction",
        "instruction": """
        Extract the borrower, co-borrower, loan ID, property address,
        loan type, loan purpose, occupancy, base loan amount,
        total loan amount, sales price, appraised value,
        interest rate, loan term, monthly income, PITI,
        and other monthly debts.

        Identify unavailable fields as NOT FOUND.
        Provide the source page for extracted information.
        """
    },

    {
        "title": "Document Register Verification",
        "instruction": """
        Review the document register.

        Identify each document as:
        SUPPLIED, SUMMARY ONLY, MISSING FROM SAMPLE PACKET,
        or VERIFICATION PENDING.

        Do not treat summary information as a complete source document.
        """
    },

    {
        "title": "Missing Document Detection",
        "instruction": """
        Check whether the supplied packet includes:
        URLA / Form 1003,
        Credit Report,
        Appraisal Report,
        Income Verification,
        Asset Verification,
        Closing Disclosure,
        Promissory Note,
        and Mortgage / Security Instrument.

        Identify only documents explicitly absent from this packet.
        Do not claim they are missing from an entire loan file
        when only a sample packet is available.
        """
    },

    {
        "title": "Underwriting Conditions",
        "instruction": """
        Review all underwriting conditions.

        Check:
        Final signed Closing Disclosure.
        Hazard insurance evidence.
        Final title and lien position.
        Appraisal and property eligibility.
        Income and asset reconciliation.

        Identify OPEN, PENDING, COMPLETED, or NEEDS HUMAN REVIEW.
        Explain the evidence supporting each status.
        """
    },

    {
        "title": "Financial Calculation and DTI",
        "instruction": """
        Extract monthly gross income, monthly housing payment (PITI),
        and other monthly debts.

        Calculate:

        Total Monthly Debt =
        Monthly Housing Payment + Other Monthly Debts

        DTI =
        (Total Monthly Debt / Monthly Gross Income) * 100

        Show the figures and formula.

        If any input is missing, state that the calculation
        cannot be completed reliably.

        Do not make an FHA eligibility decision based only on DTI.
        """
    },

    {
        "title": "Loan Amount and Property Review",
        "instruction": """
        Review base loan amount, total loan amount, sales price,
        appraised value, property address, occupancy, loan purpose,
        interest rate, and loan term.

        Identify inconsistencies only when supported by evidence.
        Do not assume that different loan amount fields are
        inconsistent without considering their definitions.
        """
    },

    {
        "title": "Supporting Document Verification",
        "instruction": """
        Review appraisal, credit, income, and asset information.

        Determine whether complete source documents or only
        summary information are supplied.

        Identify information that cannot be independently verified.
        """
    },

    {
        "title": "Final Risk and Corrective Action Assessment",
        "instruction": """
        Summarize confirmed findings, missing documents,
        open conditions, and items requiring human review.

        Provide practical next actions.

        Do not claim regulatory non-compliance without the
        applicable requirement and supporting evidence.
        """
    },
]


# ==================================================
# AUDIT STATUS NORMALIZATION
# ==================================================

VALID_AUDIT_STATUSES = {
    "PASS",
    "EXCEPTION",
    "NOT_FOUND",
    "NEEDS_HUMAN_REVIEW",
}


def normalize_audit_status(value, evidence_verified):
    """
    Normalize LLM audit status.

    PASS and EXCEPTION require verified supporting evidence.
    NOT_FOUND may be used when the complete supplied packet
    was checked and the requested document or field is absent.
    """

    status = str(
        value or "NEEDS_HUMAN_REVIEW"
    ).strip().upper().replace(" ", "_")

    if status in {"REVIEW", "PENDING", "UNKNOWN"}:
        status = "NEEDS_HUMAN_REVIEW"

    if status not in VALID_AUDIT_STATUSES:
        status = "NEEDS_HUMAN_REVIEW"

    if status in {"PASS", "EXCEPTION"} and not evidence_verified:
        status = "NEEDS_HUMAN_REVIEW"

    return status


# ==================================================
# STRUCTURED MORTGAGE AUDIT
# ==================================================

@app.post(
    "/api/audit",
    response_model=AuditResponse
)
def audit(
    body: AuditRequest,
    request: Request
):

    doc = get_document(
        request.state.session_id,
        body.document_id
    )

    if not doc.pages:
        raise AppError(
            "EMPTY_DOCUMENT",
            "The uploaded document contains no readable pages.",
            422
        )

    raw_context = "\n\n".join(
        f"--- PAGE {p.page_number} ---\n{p.text}"
        for p in doc.pages
    )

    safe_context = redact_text(raw_context)

    rows = []
    mock = False

    # Run the built-in FHA audit checks.
    checks_to_run = list(FHA_AUDIT_CHECKS)

    # Preserve selected Excel prompt checks as additional checks.
    if body.prompt_ids:
        prompts_selected = selected_prompts(body.prompt_ids)

        for prompt in prompts_selected:
            checks_to_run.append({
                "title": prompt["title"],
                "instruction": prompt["text"]
            })

    llm_service = LLMService()

    for check in checks_to_run:

        prompt_payload = f"""
You are a mortgage post-closing audit assistant.

Perform ONLY the audit area specified below.

AUDIT AREA:
{check["title"]}

AUDIT INSTRUCTIONS:
{check["instruction"]}

DOCUMENT RULES:

1. Review the complete supplied document text.
2. Use only facts supported by the supplied pages.
3. Do not invent values, dates, signatures, or documents.
4. Distinguish missing documents from incomplete summaries.
5. A document absent from this sample packet is not automatically
   proof of non-compliance in the actual loan file.
6. Provide exact supporting quotations and page numbers.
7. If the information is insufficient, use NEEDS_HUMAN_REVIEW.
8. If the complete supplied packet was checked and an item is
   explicitly absent, use NOT_FOUND where appropriate.
9. Do not assign PASS without supporting evidence.
10. Do not claim regulatory violations without the applicable
    official requirement and evidence.

RETURN FORMAT:

Return JSON containing:

{{
  "answer": "Detailed finding for this audit area",
  "status": "PASS, EXCEPTION, NOT_FOUND, or NEEDS_HUMAN_REVIEW",
  "evidence": [
    {{
      "quote": "Exact quotation copied from the document",
      "page": 1
    }}
  ]
}}

If no exact quotation is available, return an empty evidence array.

DOCUMENT TEXT (UNTRUSTED DATA):
<document>
{safe_context}
</document>
"""

        try:

            result, is_mock = llm_service.complete(
                prompt_payload
            )

            mock = mock or is_mock

            if not isinstance(result, dict):
                raise ValueError(
                    "LLM returned an invalid audit response."
                )

            answer = str(
                result.get("answer", "")
            ).strip()

            evidence_items = result.get("evidence", [])

            if not isinstance(evidence_items, list):
                evidence_items = []

            evidence = verify_evidence(
                doc.pages,
                evidence_items
            )

            verified = next(
                (
                    item for item in evidence
                    if item.verified
                ),
                None
            )

            status = normalize_audit_status(
                result.get("status"),
                bool(verified)
            )

            if not answer:
                answer = (
                    "The model did not return a detailed finding. "
                    "Manual verification is required."
                )
                status = "NEEDS_HUMAN_REVIEW"

            rows.append(
                AuditRow(
                    audit_area=check["title"],
                    document_checked=doc.filename,
                    issue_found=answer,
                    guideline_referenced=(
                        "Training audit checklist. "
                        "Verify applicable requirements against "
                        "current official FHA guidance."
                    ),
                    exact_quote_or_data_point=(
                        verified.quote if verified else ""
                    ),
                    status=status,
                    page=verified.page if verified else None,
                    verified=bool(verified),
                )
            )

        except Exception as exc:

            logger.exception(
                "Audit check failed: %s",
                check["title"]
            )

            # Preserve the other audit findings if one check fails.
            rows.append(
                AuditRow(
                    audit_area=check["title"],
                    document_checked=doc.filename,
                    issue_found=(
                        "This audit check could not be completed. "
                        "Reason: " + str(exc)
                    ),
                    guideline_referenced=(
                        "Manual verification required against "
                        "applicable official guidance."
                    ),
                    exact_quote_or_data_point="",
                    status="NEEDS_HUMAN_REVIEW",
                    page=None,
                    verified=False,
                )
            )

    logger.info(
        "Audit completed: document=%s, findings=%s, mock=%s",
        doc.document_id,
        len(rows),
        mock
    )

    return AuditResponse(
        document_id=doc.document_id,
        rows=rows,
        mock=mock,
        human_review_required=True,
    )


# ==================================================
# STRUCTURED MORTGAGE DATA EXTRACTION
# ==================================================

@app.post(
    "/api/documents/{document_id}/extract"
)
def extract_mortgage_data(
    request: Request,
    document_id: str
):

    doc = get_document(
        request.state.session_id,
        document_id
    )

    return run_extraction(
        doc,
        doc.filename
    )
