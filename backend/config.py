"""Application configuration from environment variables."""
import os
from pathlib import Path

from pydantic_settings import BaseSettings

BACKEND_DIR = Path(__file__).resolve().parent
ENV_PATH = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_vagueness_model: str = "gpt-4o-mini"
    openai_extraction_model: str = "gpt-4o"
    openai_whisper_model: str = "whisper-1"
    openai_tts_model: str = "tts-1"
    openai_tts_voice: str = "nova"
    openai_realtime_model: str = "gpt-4o-mini-realtime-preview"
    openai_realtime_voice: str = "alloy"

    class Config:
        env_file = str(ENV_PATH)
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
