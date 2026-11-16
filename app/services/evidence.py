from app.schemas import Evidence
from app.services.redaction import redact_text

def verify_evidence(pages, candidates: list[dict]) -> list[Evidence]:
    """Verify candidate quotes only against the same sanitized page text sent to the model."""
    verified = []
    by_number = {p.page_number: redact_text(p.text) for p in pages}
    for item in candidates:
        try:
            page = int(item.get("page"))
            quote = str(item.get("quote", "")).strip()
        except (TypeError, ValueError, AttributeError):
            continue
        if not quote or page not in by_number:
            continue
        safe_text = by_number[page]
        exact = quote in safe_text
        verified.append(Evidence(page=page, quote=quote if exact else "",
                                 verified=exact))
    return verified
