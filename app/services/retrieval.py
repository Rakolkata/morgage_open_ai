import re
from collections import Counter
from app.config import get_settings

SYNONYMS = {
    "loan amount": ["principal", "note amount", "original balance"],
    "income": ["gross monthly income", "wages", "salary"],
    "property value": ["appraised value", "market value"],
    "dti": ["debt to income", "debt-to-income"],
    "ltv": ["loan to value", "loan-to-value"],
}

def retrieve_pages(pages, question: str) -> list:
    q = question.lower()
    terms = set(re.findall(r"[a-z0-9$%.-]+", q))
    for phrase, additions in SYNONYMS.items():
        if phrase in q:
            for addition in additions:
                terms.update(addition.split())
    scored = []
    for page in pages:
        words = re.findall(r"[a-z0-9$%.-]+", page.text.lower())
        counts = Counter(words)
        score = sum(min(counts[t], 4) for t in terms)
        if score:
            scored.append((score, page))
    scored.sort(key=lambda item: item[0], reverse=True)
    budget = get_settings().context_char_budget
    chosen, used = [], 0
    for _, page in scored:
        block = f"--- PAGE {page.page_number} ---\n{page.text}"
        if used + len(block) > budget and chosen:
            continue
        chosen.append(page)
        used += len(block)
        if used >= budget:
            break
    return chosen or pages[:1]
