from functools import lru_cache
from openpyxl import load_workbook
from app.config import get_settings
from app.errors import AppError

@lru_cache(maxsize=1)
def load_prompts() -> list[dict]:
    settings = get_settings()
    path = settings.prompts_xlsx
    if not path.exists():
        raise AppError("PROMPT_LIBRARY_MISSING", "The Excel prompt library was not found.", 500)
    try:
        workbook = load_workbook(path, read_only=True, data_only=True)
        sheet = workbook.active
        rows = sheet.iter_rows(values_only=True)
        headers = [str(v).strip() if v is not None else "" for v in next(rows)]
        if settings.prompt_id_column not in headers or settings.prompt_text_column not in headers:
            raise AppError("PROMPT_HEADERS_INVALID", "Required prompt-library columns were not found.", 500)
        id_index, text_index = headers.index(settings.prompt_id_column), headers.index(settings.prompt_text_column)
        result = []
        for row in rows:
            key = row[id_index] if id_index < len(row) else None
            body = row[text_index] if text_index < len(row) else None
            if key and body:
                key = str(key).strip()
                result.append({"prompt_id": key, "title": key, "text": str(body).strip()})
        workbook.close()
        return result
    except AppError:
        raise
    except Exception:
        raise AppError("PROMPT_LIBRARY_ERROR", "The Excel prompt library could not be read.", 500) from None

def public_prompts() -> list[dict]:
    return [{"prompt_id": p["prompt_id"], "title": p["title"],
             "text_preview": p["text"][:220]} for p in load_prompts()]

def selected_prompts(ids: list[str]) -> list[dict]:
    by_id = {p["prompt_id"]: p for p in load_prompts()}
    missing = [item for item in ids if item not in by_id]
    if missing:
        raise AppError("UNKNOWN_PROMPT", "One or more selected prompt IDs are unknown.", 400)
    return [by_id[item] for item in ids]
