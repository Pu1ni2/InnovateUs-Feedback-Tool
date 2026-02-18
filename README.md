# InnovateUS Impact Check-In

AI-powered **voice-to-voice** and text feedback tool that measures behavior change after government training. No login required — participants use a check-in link, consent, then answer three guided questions with AI follow-ups.

## Key Features

- **Voice-to-voice mode** — Speak your answer, AI detects vagueness, speaks follow-up questions back via OpenAI TTS
- **Text mode** — Type answers with AI follow-up questions inline
- **AI vagueness detection** — GPT-4o-mini evaluates if answers are specific enough (max 2 follow-ups per question)
- **Structured extraction** — GPT-4o extracts structured impact data from each response
- **Whisper transcription** — Real-time speech-to-text for voice submissions
- **OpenAI TTS** — Follow-up questions are spoken back to participants in voice mode
- **No login required** — Just share the link
- **Premium enterprise UI** — Glass-morphism design with animated backgrounds

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React + Vite | Premium glass-card UI |
| Backend | FastAPI | REST API with voice pipeline |
| STT | OpenAI Whisper | Voice → text transcription |
| Vagueness | GPT-4o-mini | Detects vague responses |
| Extraction | GPT-4o | Structured data from answers |
| TTS | OpenAI TTS (Nova) | Text → speech for follow-ups |

## Run Locally

### 1. Backend

**Requires Python 3.11 or 3.12.** (Python 3.14 is not yet supported by pydantic-core wheels and will fail to install.)

```bash
cd backend
# Use Python 3.11 or 3.12 for the venv (e.g. on Windows with the py launcher):
py -3.12 -m venv .venv
# Or, if your default python is already 3.11/3.12:
# python -m venv .venv

# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Edit .env → set OPENAI_API_KEY

cd ..
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

### 3. Environment Variables (backend/.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | (required) | Your OpenAI API key |
| `OPENAI_VAGUENESS_MODEL` | `gpt-4o-mini` | Model for vagueness detection |
| `OPENAI_EXTRACTION_MODEL` | `gpt-4o` | Model for structured extraction |
| `OPENAI_WHISPER_MODEL` | `whisper-1` | Speech-to-text model |
| `OPENAI_TTS_MODEL` | `tts-1` | Text-to-speech model |
| `OPENAI_TTS_VOICE` | `nova` | TTS voice (alloy, echo, fable, onyx, nova, shimmer) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/checkin/questions` | Returns 3 guided questions |
| POST | `/api/checkin/voice-submit` | Full voice pipeline: audio → Whisper → vagueness → TTS follow-up |
| POST | `/api/checkin/text-submit` | Text pipeline: text → vagueness → follow-up |
| POST | `/api/checkin/vagueness` | Standalone vagueness check |
| POST | `/api/checkin/extract` | Standalone structured extraction |

## Flow

1. **Consent** → 2. **Choose Voice or Text** → 3. **Answer 3 questions** (with AI follow-ups) → 4. **Thank you + summary**

In voice mode: you speak → backend transcribes with Whisper → AI checks if vague → if vague, generates follow-up + speaks it back with TTS → you respond again → up to 2 follow-ups per question.
