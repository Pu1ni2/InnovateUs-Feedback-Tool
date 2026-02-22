"""Check-in API: session creation, text pipeline, and context queries."""
import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from prompts import MAIN_QUESTIONS, QUESTION_SPOKEN_INTROS
from services.openai_service import extract_structured
from services.session_manager import (
    analyze_response,
    create_session,
    is_question_covered,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/checkin", tags=["checkin"])


# ── Session creation ────────────────────────────────────────────────────

@router.post("/session")
def create_session_endpoint():
    sid = create_session()
    return {
        "session_id": sid,
        "questions": MAIN_QUESTIONS,
        "spoken_intros": QUESTION_SPOKEN_INTROS,
    }


# ── Static data ─────────────────────────────────────────────────────────

@router.get("/questions")
def get_questions() -> list[str]:
    return MAIN_QUESTIONS


@router.get("/spoken-intros")
def get_spoken_intros() -> list[str]:
    return QUESTION_SPOKEN_INTROS


# ── Check if a question was already answered ────────────────────────────

@router.get("/check-covered/{session_id}/{question_index}")
def check_covered(session_id: str, question_index: int):
    covered = is_question_covered(session_id, question_index)
    return {"covered": covered}


# ── Text submission ─────────────────────────────────────────────────────

@router.post("/text-submit")
async def text_submit(body: dict):
    session_id = body.get("session_id", "")
    question_index = body.get("question_index", 0)
    response = body.get("response", "")
    follow_up_count = body.get("follow_up_count", 0)

    if not response.strip():
        raise HTTPException(status_code=400, detail="Response cannot be empty")

    loop = asyncio.get_event_loop()

    try:
        analysis = await loop.run_in_executor(
            None, lambda: analyze_response(session_id, question_index, response, follow_up_count),
        )
    except Exception as e:
        logger.exception("Analysis error in text-submit")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {e}")

    status = analysis.get("status", "done")
    follow_up_text = analysis.get("follow_up", "")
    summary = analysis.get("summary", "")
    covered_future = analysis.get("covered_future_indices", [])

    structured = None
    if status in ("done", "move_on", "already_covered"):
        main_q = MAIN_QUESTIONS[question_index] if question_index < len(MAIN_QUESTIONS) else ""
        full_resp = summary or response
        try:
            structured = await loop.run_in_executor(
                None, lambda: extract_structured(main_q, full_resp),
            )
        except Exception as e:
            logger.warning("Extraction error: %s", e)

    return {
        "status": status,
        "follow_up": follow_up_text,
        "transition_text": analysis.get("follow_up", "") if status == "move_on" else "",
        "summary": summary,
        "covered_future_indices": covered_future,
        "structured": structured,
    }


# ── Standalone extraction ───────────────────────────────────────────────

class ExtractionRequest(BaseModel):
    main_question: str
    full_response: str


@router.post("/extract")
def extract_body(body: ExtractionRequest) -> dict[str, Any]:
    try:
        return extract_structured(body.main_question, body.full_response)
    except Exception as e:
        logger.exception("Extraction error")
        raise HTTPException(status_code=500, detail=str(e))
