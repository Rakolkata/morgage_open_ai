import asyncio
import logging
from typing import Optional

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.errors import AppError, http_error
from app.llm import LLMService
from app.schemas import ChatResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ==================================================
# FASTAPI APPLICATION
# ==================================================

app = FastAPI(
    title="Ollama Chat API",
    version="1.0.0",
    description="Backend API providing /api/v1/chat powered by local Ollama."
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
# CHAT ENDPOINT (ONLY REST ENDPOINT)
# ==================================================

@app.post(
    "/api/v1/chat",
    response_model=ChatResponse,
    summary="Chat with local Ollama model",
    description="Hit this endpoint with form-data (key: msg) to query the local Ollama model from .env."
)
async def chat(
    request: Request,
    msg: Optional[str] = Form(None, description="Message to prompt the local Ollama model")
):
    user_msg = msg

    # Fallback to check form-data or JSON body if not directly matched by FastAPI Form parameter
    if not user_msg:
        try:
            form_data = await request.form()
            user_msg = form_data.get("msg") or form_data.get("message")
        except Exception:
            pass

    if not user_msg:
        try:
            json_data = await request.json()
            if isinstance(json_data, dict):
                user_msg = json_data.get("msg") or json_data.get("message")
        except Exception:
            pass

    if not user_msg or not str(user_msg).strip():
        raise HTTPException(
            status_code=400,
            detail="Field 'msg' is required on form-data."
        )

    prompt = str(user_msg).strip()
    logger.info("Received chat prompt: %s", prompt[:80] + ("..." if len(prompt) > 80 else ""))

    llm = LLMService()
    try:
        ans = llm.generate(prompt)
    except AppError:
        raise
    except Exception as exc:
        logger.exception("Failed to generate response: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ChatResponse(
        ans=ans,
        answer=ans,
        model=llm.model_name,
        status="success"
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
