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
    clear_pending_follow_up,
    create_session,
    get_coverage_info,
    get_session,
    is_question_covered,
    set_pending_follow_up,
    add_voice_turn,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/checkin", tags=["checkin"])


def _normalize_text(text: str) -> str:
    import re
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (text or "").lower())).strip()


def _token_overlap_ratio(a: str, b: str) -> float:
    a_tokens = {t for t in _normalize_text(a).split() if len(t) > 3}
    b_tokens = {t for t in _normalize_text(b).split() if len(t) > 3}
    if not a_tokens or not b_tokens:
        return 0.0
    common = len(a_tokens & b_tokens)
    return common / max(len(a_tokens), len(b_tokens))


def _recent_ai_prompts_for_question(session_id: str, question_index: int) -> list[str]:
    session = get_session(session_id)
    if not session:
        return []
    ai_texts: list[str] = []
    for e in session.get("entries", []):
        if e.get("question_idx") != question_index:
            continue
        if e.get("role") == "ai":
            txt = e.get("text", "")
            if txt:
                ai_texts.append(txt)
    return ai_texts[-3:]


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
    info = get_coverage_info(session_id, question_index)
    return {"covered": bool(info.get("covered")), "evidence": info.get("evidence", "")}


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

    # Router-level quality gate: reject repeated/generic follow-up prompts.
    if status == "needs_follow_up" and follow_up_text:
        recent_ai_prompts = _recent_ai_prompts_for_question(session_id, question_index)
        overlaps_existing = any(
            _token_overlap_ratio(follow_up_text, prev) >= 0.65
            for prev in recent_ai_prompts
        )
        if overlaps_existing:
            status = "move_on"
            follow_up_text = ""
            analysis["status"] = "move_on"
            analysis["follow_up"] = ""
            analysis["reason"] = "Follow-up overlapped prior prompt; auto move on."

    # Keep text and voice aligned with one authoritative pending follow-up.
    if status == "needs_follow_up" and follow_up_text:
        set_pending_follow_up(session_id, question_index, follow_up_text)
        add_voice_turn(session_id, question_index, "ai", follow_up_text)
    else:
        clear_pending_follow_up(session_id, question_index)

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
