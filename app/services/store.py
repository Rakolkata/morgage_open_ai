from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from app.config import get_settings
from app.errors import AppError

@dataclass
class DocumentRecord:
    document_id: str
    filename: str
    pages: list
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

# In-memory prototype store. Each record is keyed by an opaque browser session ID.
# For production, replace with authenticated ownership + encrypted persistent storage.
_SESSIONS: dict[str, dict[str, DocumentRecord]] = {}

def add_document(session_id: str, filename: str, pages: list) -> DocumentRecord:
    doc = DocumentRecord(str(uuid4()), filename, pages)
    _SESSIONS.setdefault(session_id, {})[doc.document_id] = doc
    return doc

def get_document(session_id: str, document_id: str) -> DocumentRecord:
    record = _SESSIONS.get(session_id, {}).get(document_id)
    if not record:
        raise AppError("DOCUMENT_NOT_FOUND", "Document not found in this session.", 404)
    expiry = timedelta(minutes=get_settings().document_ttl_minutes)
    if datetime.now(timezone.utc) - record.created_at > expiry:
        _SESSIONS[session_id].pop(document_id, None)
        raise AppError("DOCUMENT_EXPIRED", "This document session has expired. Upload it again.", 404)
    return record

def delete_document(session_id: str, document_id: str) -> None:
    if document_id not in _SESSIONS.get(session_id, {}):
        raise AppError("DOCUMENT_NOT_FOUND", "Document not found in this session.", 404)
    del _SESSIONS[session_id][document_id]
