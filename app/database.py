"""
Database operations are handled directly and exclusively by the frontend (Next.js / Prisma).
FastAPI backend functions as a pure, stateless agent execution service.
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def init_db() -> bool:
    """No-op: Database initialization and access is managed exclusively by the frontend."""
    return True


def save_chat_log(message: str, agent: str = "chat", response: Optional[str] = None) -> bool:
    """No-op: Chat logging is managed exclusively by the frontend."""
    return True
