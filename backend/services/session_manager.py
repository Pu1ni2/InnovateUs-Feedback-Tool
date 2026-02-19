"""Session manager: LangChain + ChromaDB for context-aware conversation."""
import json
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Any

import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from config import settings
from prompts import (
    CONTEXT_ANALYSIS_SYSTEM,
    CONTEXT_ANALYSIS_USER,
    MAIN_QUESTIONS,
)

logger = logging.getLogger(__name__)

_sessions: dict[str, dict[str, Any]] = {}

CHROMA_DIR = Path(__file__).resolve().parent.parent / "chroma_data"
_chroma_client = None
_collection = None


def _get_collection():
    global _chroma_client, _collection
    if _collection is not None:
        return _collection
    try:
        key = settings.openai_api_key.strip().strip('"').strip("'")
        embed_fn = OpenAIEmbeddingFunction(
            api_key=key,
            model_name="text-embedding-3-small",
        )
        _chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        _collection = _chroma_client.get_or_create_collection(
            name="session_responses",
            embedding_function=embed_fn,
        )
        logger.info("ChromaDB ready at %s", CHROMA_DIR)
    except Exception as e:
        logger.warning("ChromaDB init failed (non-critical): %s", e)
    return _collection


def create_session() -> str:
    sid = uuid.uuid4().hex[:12]
    _sessions[sid] = {
        "created_at": time.time(),
        "entries": [],
        "completed_qs": set(),
        "covered_ahead": set(),
    }
    logger.info("Session created: %s", sid)
    return sid


def get_session(sid: str) -> dict | None:
    return _sessions.get(sid)


def add_response(sid: str, q_idx: int, response: str, analysis: dict | None = None):
    session = _sessions.get(sid)
    if not session:
        return

    entry = {
        "question_idx": q_idx,
        "question": MAIN_QUESTIONS[q_idx] if q_idx < len(MAIN_QUESTIONS) else "",
        "response": response,
        "analysis": analysis,
        "ts": time.time(),
    }
    session["entries"].append(entry)

    coll = _get_collection()
    if coll:
        try:
            doc_id = f"{sid}_{q_idx}_{len(session['entries'])}"
            coll.add(
                documents=[response],
                metadatas=[{
                    "session_id": sid,
                    "question_idx": q_idx,
                    "question": entry["question"],
                }],
                ids=[doc_id],
            )
        except Exception as e:
            logger.warning("ChromaDB store failed: %s", e)


def build_context_text(sid: str) -> str:
    session = _sessions.get(sid)
    if not session:
        return "(no prior conversation)"
    parts = []
    for e in session["entries"]:
        parts.append(f"[Question {e['question_idx']+1}] {e['question']}\nParticipant: {e['response']}")
    return "\n\n".join(parts) if parts else "(no prior conversation)"


def check_already_covered(sid: str, q_idx: int) -> list[str]:
    """Use ChromaDB similarity search to find if this question was already addressed."""
    coll = _get_collection()
    if not coll:
        return []
    try:
        q_text = MAIN_QUESTIONS[q_idx] if q_idx < len(MAIN_QUESTIONS) else ""
        results = coll.query(
            query_texts=[q_text],
            n_results=5,
            where={"session_id": sid},
        )
        if results and results["documents"] and results["documents"][0]:
            return results["documents"][0]
    except Exception as e:
        logger.warning("ChromaDB query failed: %s", e)
    return []


def _clean_json(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def analyze_response(
    sid: str,
    q_idx: int,
    response: str,
    follow_up_count: int,
) -> dict[str, Any]:
    """Context-aware analysis using LangChain with full session memory."""
    full_context = build_context_text(sid)
    current_q = MAIN_QUESTIONS[q_idx] if q_idx < len(MAIN_QUESTIONS) else ""
    remaining = MAIN_QUESTIONS[q_idx + 1:] if q_idx + 1 < len(MAIN_QUESTIONS) else []

    similar = check_already_covered(sid, q_idx)

    key = settings.openai_api_key.strip().strip('"').strip("'")
    llm = ChatOpenAI(
        model=settings.openai_vagueness_model,
        api_key=key,
        temperature=0.3,
        max_tokens=600,
    )

    user_content = CONTEXT_ANALYSIS_USER.format(
        full_conversation=full_context,
        current_question=current_q,
        current_response=response,
        follow_up_count=follow_up_count,
        max_follow_ups=2,
        remaining_questions=json.dumps(remaining) if remaining else "(none)",
        similar_past=json.dumps(similar[:3]) if similar else "(none)",
    )

    messages = [
        SystemMessage(content=CONTEXT_ANALYSIS_SYSTEM),
        HumanMessage(content=user_content),
    ]

    try:
        result = llm.invoke(messages)
        parsed = json.loads(_clean_json(result.content))
        logger.info("Analysis for Q%d: status=%s, reason=%s",
                     q_idx + 1, parsed.get("status"), parsed.get("reason", "")[:60])

        add_response(sid, q_idx, response, parsed)

        covered = parsed.get("covered_future_indices", [])
        if covered:
            session = _sessions.get(sid)
            if session:
                session["covered_ahead"].update(covered)

        return parsed

    except Exception as e:
        logger.exception("LangChain analysis failed, falling back")
        add_response(sid, q_idx, response, None)
        return {
            "status": "done",
            "reason": f"Analysis error: {e}",
            "follow_up": "",
            "covered_future_indices": [],
            "summary": response[:150],
        }


def is_question_covered(sid: str, q_idx: int) -> bool:
    session = _sessions.get(sid)
    if not session:
        return False
    return q_idx in session.get("covered_ahead", set())
