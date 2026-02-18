"""Check-in API: questions, voice processing, vagueness, extraction."""
import asyncio
import logging
import traceback
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from prompts import MAIN_QUESTIONS
from services.openai_service import (
    check_vagueness,
    extract_structured,
    text_to_speech,
    transcribe_audio,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/checkin", tags=["checkin"])


class VaguenessRequest(BaseModel):
    main_question: str
    response: str


class ExtractionRequest(BaseModel):
    main_question: str
    full_response: str


@router.get("/questions")
def get_questions() -> list[str]:
    return MAIN_QUESTIONS


@router.post("/vagueness")
def assess_vagueness(body: VaguenessRequest):
    try:
        result = check_vagueness(body.main_question, body.response)
    except Exception as e:
        logger.exception("Vagueness check error")
        raise HTTPException(status_code=500, detail=str(e))
    follow_up = result.get("suggested_follow_up", "")
    follow_up_audio = ""
    if result.get("is_vague") and follow_up:
        try:
            follow_up_audio = text_to_speech(follow_up)
        except Exception as e:
            logger.exception("TTS error in vagueness")
    return {
        "is_vague": result.get("is_vague", False),
        "reason": result.get("reason", ""),
        "suggested_follow_up": follow_up,
        "follow_up_audio": follow_up_audio,
    }


@router.post("/extract")
def extract_body(body: ExtractionRequest) -> dict[str, Any]:
    try:
        return extract_structured(body.main_question, body.full_response)
    except Exception as e:
        logger.exception("Extraction error")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/voice-submit")
async def voice_submit(
    audio: UploadFile = File(...),
    main_question: str = Form(...),
    full_response_so_far: str = Form(""),
    follow_up_count: int = Form(0),
):
    """Full voice-to-voice pipeline."""
    audio_bytes = await audio.read()
    logger.info("Voice-submit: received %d bytes, question='%s', follow_up_count=%d",
                len(audio_bytes), main_question[:30], follow_up_count)

    if len(audio_bytes) < 500:
        raise HTTPException(status_code=400, detail="Audio too short — please speak for at least 1 second")

    loop = asyncio.get_event_loop()

    try:
        transcript = await loop.run_in_executor(
            None,
            lambda: transcribe_audio(audio_bytes, audio.filename or "recording.webm"),
        )
    except Exception as e:
        logger.exception("Whisper transcription error")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        del audio_bytes

    if not transcript:
        raise HTTPException(
            status_code=422,
            detail="Could not transcribe audio. Please speak clearly and try again."
        )

    combined = f"{full_response_so_far} {transcript}".strip() if full_response_so_far else transcript

    try:
        vagueness = await loop.run_in_executor(
            None,
            lambda: check_vagueness(main_question, combined),
        )
    except Exception as e:
        logger.exception("Vagueness check error in voice-submit")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {e}")

    is_vague = vagueness.get("is_vague", False)
    follow_up_text = vagueness.get("suggested_follow_up", "")

    if is_vague and follow_up_text and follow_up_count < 2:
        follow_up_audio = ""
        try:
            follow_up_audio = await loop.run_in_executor(
                None,
                lambda: text_to_speech(follow_up_text),
            )
        except Exception as e:
            logger.exception("TTS error in voice-submit")

        return {
            "transcript": transcript,
            "combined_response": combined,
            "is_vague": True,
            "follow_up": follow_up_text,
            "follow_up_audio": follow_up_audio,
            "structured": None,
            "done": False,
        }

    try:
        structured = await loop.run_in_executor(
            None,
            lambda: extract_structured(main_question, combined),
        )
    except Exception as e:
        logger.exception("Extraction error in voice-submit")
        structured = None

    return {
        "transcript": transcript,
        "combined_response": combined,
        "is_vague": False,
        "follow_up": "",
        "follow_up_audio": "",
        "structured": structured,
        "done": True,
    }


@router.post("/text-submit")
async def text_submit(body: dict):
    """Text submission with vagueness check."""
    main_question = body.get("main_question", "")
    response = body.get("response", "")
    full_response_so_far = body.get("full_response_so_far", "")
    follow_up_count = body.get("follow_up_count", 0)

    if not response.strip():
        raise HTTPException(status_code=400, detail="Response cannot be empty")

    combined = f"{full_response_so_far} {response}".strip() if full_response_so_far else response

    loop = asyncio.get_event_loop()

    try:
        vagueness = await loop.run_in_executor(
            None,
            lambda: check_vagueness(main_question, combined),
        )
    except Exception as e:
        logger.exception("Vagueness check error in text-submit")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {e}")

    is_vague = vagueness.get("is_vague", False)
    follow_up_text = vagueness.get("suggested_follow_up", "")

    if is_vague and follow_up_text and follow_up_count < 2:
        return {
            "combined_response": combined,
            "is_vague": True,
            "follow_up": follow_up_text,
            "structured": None,
            "done": False,
        }

    try:
        structured = await loop.run_in_executor(
            None,
            lambda: extract_structured(main_question, combined),
        )
    except Exception as e:
        logger.exception("Extraction error in text-submit")
        structured = None

    return {
        "combined_response": combined,
        "is_vague": False,
        "follow_up": "",
        "structured": structured,
        "done": True,
    }
