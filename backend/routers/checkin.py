"""Check-in API: session-based, context-aware voice + text pipeline."""
import asyncio
import logging
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from prompts import MAIN_QUESTIONS, QUESTION_SPOKEN_INTROS
from services.openai_service import (
    extract_structured,
    text_to_speech,
    transcribe_audio,
)
from services.session_manager import (
    analyze_response,
    create_session,
    get_session,
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


# ── TTS ─────────────────────────────────────────────────────────────────

@router.post("/speak")
async def speak(body: dict):
    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")
    loop = asyncio.get_event_loop()
    try:
        audio_b64 = await loop.run_in_executor(None, lambda: text_to_speech(text))
    except Exception as e:
        logger.exception("TTS error in /speak")
        raise HTTPException(status_code=500, detail=f"TTS failed: {e}")
    return {"audio": audio_b64}


# ── Check if a question was already answered ────────────────────────────

@router.get("/check-covered/{session_id}/{question_index}")
def check_covered(session_id: str, question_index: int):
    covered = is_question_covered(session_id, question_index)
    return {"covered": covered}


# ── Voice submission (full pipeline) ────────────────────────────────────

@router.post("/voice-submit")
async def voice_submit(
    audio: UploadFile = File(...),
    session_id: str = Form(""),
    question_index: int = Form(0),
    follow_up_count: int = Form(0),
):
    audio_bytes = await audio.read()
    logger.info("Voice-submit: %d bytes, session=%s, q=%d, fu=%d",
                len(audio_bytes), session_id, question_index, follow_up_count)

    if len(audio_bytes) < 500:
        raise HTTPException(status_code=400, detail="Audio too short — please speak for at least 1 second")

    loop = asyncio.get_event_loop()

    # Step 1: Transcribe
    try:
        transcript = await loop.run_in_executor(
            None, lambda: transcribe_audio(audio_bytes, audio.filename or "recording.webm"),
        )
    except Exception as e:
        logger.exception("Whisper transcription error")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        del audio_bytes

    if not transcript:
        raise HTTPException(status_code=422, detail="Could not transcribe audio. Please speak clearly and try again.")

    # Step 2: Context-aware analysis via LangChain + ChromaDB
    try:
        analysis = await loop.run_in_executor(
            None, lambda: analyze_response(session_id, question_index, transcript, follow_up_count),
        )
    except Exception as e:
        logger.exception("Analysis error in voice-submit")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {e}")

    status = analysis.get("status", "done")
    follow_up_text = analysis.get("follow_up", "")
    summary = analysis.get("summary", "")
    covered_future = analysis.get("covered_future_indices", [])

    # Step 3: Generate TTS for follow-up (if needed)
    follow_up_audio = ""
    transition_text = ""
    transition_audio = ""

    if status == "needs_follow_up" and follow_up_text:
        try:
            follow_up_audio = await loop.run_in_executor(
                None, lambda: text_to_speech(follow_up_text),
            )
        except Exception as e:
            logger.warning("TTS error for follow-up: %s", e)

    elif status == "move_on":
        transition_text = analysis.get("follow_up", "") or "That's helpful, thank you. Let me move on to the next question."
        try:
            transition_audio = await loop.run_in_executor(
                None, lambda: text_to_speech(transition_text),
            )
        except Exception as e:
            logger.warning("TTS error for transition: %s", e)

    elif status == "already_covered":
        transition_text = "It sounds like you've already touched on this. Let me move forward."
        try:
            transition_audio = await loop.run_in_executor(
                None, lambda: text_to_speech(transition_text),
            )
        except Exception as e:
            logger.warning("TTS error for skip: %s", e)

    # Step 4: Extract structured data if done
    structured = None
    if status in ("done", "move_on", "already_covered"):
        main_q = MAIN_QUESTIONS[question_index] if question_index < len(MAIN_QUESTIONS) else ""
        full_resp = summary or transcript
        try:
            structured = await loop.run_in_executor(
                None, lambda: extract_structured(main_q, full_resp),
            )
        except Exception as e:
            logger.warning("Extraction error: %s", e)

    return {
        "transcript": transcript,
        "status": status,
        "follow_up": follow_up_text,
        "follow_up_audio": follow_up_audio,
        "transition_text": transition_text,
        "transition_audio": transition_audio,
        "summary": summary,
        "covered_future_indices": covered_future,
        "structured": structured,
    }


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
