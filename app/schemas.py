from enum import Enum
from pydantic import BaseModel, Field

class AuditStatus(str, Enum):
    PASS = "PASS"
    EXCEPTION = "EXCEPTION"
    NOT_FOUND = "NOT_FOUND"
    NEEDS_HUMAN_REVIEW = "NEEDS_HUMAN_REVIEW"

class ChatRequest(BaseModel):
    document_id: str
    message: str = Field(min_length=1, max_length=5000)
    history: list[dict] = Field(default_factory=list, max_length=12)

class Evidence(BaseModel):
    page: int
    quote: str
    verified: bool

class ChatResponse(BaseModel):
    answer: str
    evidence: list[Evidence] = Field(default_factory=list)
    status: str
    mock: bool = False
    human_review_required: bool = True
    notice: str = "Draft assistance only. A qualified human reviewer must verify all findings."

class AuditRequest(BaseModel):
    document_id: str
    prompt_ids: list[str] = Field(min_length=1, max_length=58)

class AuditRow(BaseModel):
    audit_area: str = ""
    document_checked: str = ""
    issue_found: str = ""
    guideline_referenced: str = ""
    exact_quote_or_data_point: str = ""
    status: AuditStatus = AuditStatus.NEEDS_HUMAN_REVIEW
    page: int | None = None
    verified: bool = False

class AuditResponse(BaseModel):
    document_id: str
    rows: list[AuditRow]
    mock: bool
    human_review_required: bool = True
    notice: str = "AI-generated draft only. Not a final underwriting or compliance decision."
