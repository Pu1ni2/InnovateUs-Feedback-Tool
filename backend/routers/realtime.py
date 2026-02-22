"""Realtime API: ephemeral token creation and transcript sync."""
import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings
from prompts import MAIN_QUESTIONS, REALTIME_INSTRUCTIONS
from services.session_manager import (
    add_voice_turn,
    build_context_text,
    get_session,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/realtime", tags=["realtime"])

OPENAI_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions"


class TokenRequest(BaseModel):
    session_id: str = ""
    question_index: int = 0


class SyncRequest(BaseModel):
    session_id: str
    question_index: int
    user_text: str = ""
    ai_text: str = ""


@router.post("/token")
async def create_realtime_token(body: TokenRequest):
    key = settings.openai_api_key.strip().strip('"').strip("'")
    if not key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    context = build_context_text(body.session_id)
    session = get_session(body.session_id)
    completed = list(session.get("completed_qs", set())) if session else []

    instructions = REALTIME_INSTRUCTIONS.format(
        conversation_history=context,
        question_index=body.question_index,
        completed_questions=completed if completed else "none yet",
    )

    payload = {
        "model": settings.openai_realtime_model,
        "voice": settings.openai_realtime_voice,
        "instructions": instructions,
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.5,
            "silence_duration_ms": 800,
            "prefix_padding_ms": 300,
        },
        "input_audio_transcription": {
            "model": "whisper-1",
        },
        "modalities": ["text", "audio"],
        "tools": [
            {
                "type": "function",
                "name": "update_progress",
                "description": "Call this EVERY TIME you finish getting a satisfactory answer for a main question. This updates the progress bar.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "question_index": {
                            "type": "integer",
                            "description": "0-based index of the completed question (0, 1, or 2)",
                        },
                        "summary": {
                            "type": "string",
                            "description": "2-3 sentence summary of what the participant said",
                        },
                    },
                    "required": ["question_index", "summary"],
                },
            },
            {
                "type": "function",
                "name": "complete_checkin",
                "description": "Call this when ALL three questions have been answered and the check-in is complete.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "summaries": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Summary for each of the 3 completed questions",
                        },
                    },
                    "required": ["summaries"],
                },
            },
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                OPENAI_SESSIONS_URL,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        logger.exception("OpenAI realtime session creation failed: %s", e.response.text)
        raise HTTPException(status_code=502, detail=f"OpenAI error: {e.response.text[:200]}")
    except Exception as e:
        logger.exception("Realtime token creation failed")
        raise HTTPException(status_code=500, detail=str(e))

    secret = data.get("client_secret", {})
    logger.info("Realtime token created, expires_at=%s", secret.get("expires_at"))

    return {
        "token": secret.get("value", ""),
        "expires_at": secret.get("expires_at", 0),
        "model": data.get("model", settings.openai_realtime_model),
    }


@router.post("/sync")
async def sync_transcript(body: SyncRequest):
    """Store voice conversation transcripts in the session for cross-mode context."""
    if body.ai_text:
        add_voice_turn(body.session_id, body.question_index, "ai", body.ai_text)
    if body.user_text:
        add_voice_turn(body.session_id, body.question_index, "user", body.user_text)
    return {"ok": True}
