"""OpenAI service: Whisper STT, TTS, and structured extraction."""
import base64
import io
import json
import logging
import re
from typing import Any

from openai import OpenAI

from config import settings
from prompts import (
    STRUCTURED_EXTRACTION_SYSTEM,
    STRUCTURED_EXTRACTION_USER_TEMPLATE,
)

logger = logging.getLogger(__name__)

_client = None


def get_client() -> OpenAI:
    global _client
    if _client is not None:
        return _client
    key = settings.openai_api_key.strip().strip('"').strip("'")
    if not key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. "
            "Please add it to backend/.env — see backend/.env.example"
        )
    _client = OpenAI(api_key=key)
    logger.info("OpenAI client initialized (key ending …%s)", key[-4:])
    return _client


def _clean_json(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    client = get_client()
    buf = io.BytesIO(audio_bytes)
    buf.name = filename
    logger.info("Sending %d bytes to Whisper (%s)", len(audio_bytes), filename)
    resp = client.audio.transcriptions.create(
        model=settings.openai_whisper_model,
        file=buf,
    )
    transcript = (resp.text or "").strip()
    logger.info("Whisper transcript (%d chars): %s", len(transcript), transcript[:80])
    return transcript


def text_to_speech(text: str) -> str:
    client = get_client()
    if not text:
        return ""
    logger.info("Generating TTS for: %s", text[:60])
    resp = client.audio.speech.create(
        model=settings.openai_tts_model,
        voice=settings.openai_tts_voice,
        input=text,
        response_format="mp3",
    )
    audio_bytes = resp.content
    logger.info("TTS generated %d bytes of audio", len(audio_bytes))
    return base64.b64encode(audio_bytes).decode("utf-8")


def extract_structured(main_question: str, full_response: str) -> dict[str, Any]:
    client = get_client()
    user_msg = STRUCTURED_EXTRACTION_USER_TEMPLATE.format(
        main_question=main_question,
        full_response=full_response or "(no response)",
    )
    logger.info("Extracting structured data for Q: %s", main_question[:40])
    resp = client.chat.completions.create(
        model=settings.openai_extraction_model,
        messages=[
            {"role": "system", "content": STRUCTURED_EXTRACTION_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        response_format={"type": "json_object"},
        max_tokens=512,
        temperature=0.2,
    )
    text = _clean_json(resp.choices[0].message.content or "{}")
    return json.loads(text)
