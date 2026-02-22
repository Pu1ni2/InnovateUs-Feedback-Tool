"""InnovateUS Impact Check-In — FastAPI backend."""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings, ENV_PATH
from routers import checkin, realtime

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="InnovateUS Impact Check-In API",
    description="Hybrid voice + text feedback tool for behavior change measurement.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(checkin.router)
app.include_router(realtime.router)


@app.on_event("startup")
def startup_diagnostics():
    logger.info("=" * 50)
    logger.info("InnovateUS Impact Check-In starting up")
    logger.info("Env file path: %s", ENV_PATH)
    logger.info("Env file exists: %s", ENV_PATH.exists())
    key = settings.openai_api_key.strip().strip('"').strip("'")
    if key:
        logger.info("OPENAI_API_KEY loaded: YES (…%s)", key[-4:])
    else:
        logger.warning("OPENAI_API_KEY loaded: NO — AI features will NOT work!")
        logger.warning("Set OPENAI_API_KEY in %s", ENV_PATH)
    logger.info("Models: vagueness=%s, extraction=%s, whisper=%s, tts=%s (%s)",
                settings.openai_vagueness_model, settings.openai_extraction_model,
                settings.openai_whisper_model, settings.openai_tts_model, settings.openai_tts_voice)
    logger.info("=" * 50)


@app.get("/")
def root():
    return {"app": "InnovateUS Impact Check-In", "status": "ok"}


@app.get("/api/health")
def health():
    key = settings.openai_api_key.strip().strip('"').strip("'")
    return {
        "status": "healthy",
        "api_key_configured": bool(key),
        "env_path": str(ENV_PATH),
    }
