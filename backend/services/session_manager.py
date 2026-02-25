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

_TERMINAL_REPLIES = {
    "nothing",
    "no",
    "none",
    "thats it",
    "that's it",
    "no more",
    "nothing else",
    "na",
    "n/a",
}


def _infer_future_coverage_from_text(q_idx: int, full_context: str, latest_response: str) -> list[int]:
    """
    Heuristic coverage detection to complement LLM output.
    Helps skip later questions when earlier answers already include those details.
    """
    text = _normalize_text(f"{full_context}\n{latest_response}")
    covered: set[int] = set()

    outcome_markers = [
        "outcome", "result", "impact", "changed", "improved",
        "save time", "saved time", "faster", "quicker", "reduced time",
        "team responded", "team reaction", "they were happy",
    ]
    barrier_markers = [
        "difficult", "difficulty", "barrier", "constraint", "challenge",
        "could not", "couldnt", "can't", "cant", "need help",
        "support", "colleague", "colleagues", "competing priorities",
    ]

    # If on Q1 and the response already includes outcomes/barriers, mark Q2/Q3 covered.
    if q_idx == 0:
        if any(m in text for m in outcome_markers):
            covered.add(1)
        if any(m in text for m in barrier_markers):
            covered.add(2)

    # If on Q2 and barriers are already present, mark Q3 covered.
    if q_idx == 1:
        if any(m in text for m in barrier_markers):
            covered.add(2)

    return sorted(list(covered))


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
        "covered_evidence": {},
        "pending_follow_up": None,
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


def add_voice_turn(sid: str, q_idx: int, role: str, text: str):
    """Append a voice conversation turn (user or ai) to the session history."""
    session = _sessions.get(sid)
    if not session or not text:
        return

    entry = {
        "question_idx": q_idx,
        "role": role,
        "text": text,
        "ts": time.time(),
    }
    session["entries"].append(entry)

    if role == "user":
        coll = _get_collection()
        if coll:
            try:
                doc_id = f"{sid}_v_{q_idx}_{len(session['entries'])}"
                coll.add(
                    documents=[text],
                    metadatas=[{
                        "session_id": sid,
                        "question_idx": q_idx,
                        "question": MAIN_QUESTIONS[q_idx] if q_idx < len(MAIN_QUESTIONS) else "",
                    }],
                    ids=[doc_id],
                )
            except Exception as e:
                logger.warning("ChromaDB voice store failed: %s", e)


def set_pending_follow_up(sid: str, q_idx: int, follow_up_text: str):
    session = _sessions.get(sid)
    if not session:
        return
    cleaned = (follow_up_text or "").strip()
    if not cleaned:
        session["pending_follow_up"] = None
        return
    session["pending_follow_up"] = {
        "question_idx": q_idx,
        "text": cleaned,
        "ts": time.time(),
    }


def clear_pending_follow_up(sid: str, q_idx: int | None = None):
    session = _sessions.get(sid)
    if not session:
        return
    pending = session.get("pending_follow_up")
    if not pending:
        return
    if q_idx is None or pending.get("question_idx") == q_idx:
        session["pending_follow_up"] = None


def get_pending_follow_up(sid: str) -> dict[str, Any] | None:
    session = _sessions.get(sid)
    if not session:
        return None
    pending = session.get("pending_follow_up")
    return pending if isinstance(pending, dict) else None


def build_context_text(sid: str) -> str:
    session = _sessions.get(sid)
    if not session:
        return "(no prior conversation)"
    parts = []
    for e in session["entries"]:
        if "role" in e:
            label = "AI" if e["role"] == "ai" else "Participant"
            parts.append(f"[Q{e['question_idx']+1}] {label}: {e['text']}")
        else:
            parts.append(f"[Q{e['question_idx']+1}] {e['question']}\nParticipant: {e['response']}")
    return "\n".join(parts) if parts else "(no prior conversation)"


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


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (text or "").lower())).strip()


def _token_overlap_ratio(a: str, b: str) -> float:
    a_tokens = {t for t in _normalize_text(a).split() if len(t) > 3}
    b_tokens = {t for t in _normalize_text(b).split() if len(t) > 3}
    if not a_tokens or not b_tokens:
        return 0.0
    common = len(a_tokens & b_tokens)
    return common / max(len(a_tokens), len(b_tokens))


def _is_terminal_reply(text: str) -> bool:
    cleaned = _normalize_text(text)
    if not cleaned:
        return True
    if cleaned in _TERMINAL_REPLIES:
        return True
    short = cleaned.replace(" ", "")
    return short in {"nope", "nah", "ok", "okay"}


def _recent_question_entries(sid: str, q_idx: int) -> tuple[list[str], list[str]]:
    """Return (recent_user_texts, recent_ai_texts) for the same question."""
    session = _sessions.get(sid)
    if not session:
        return [], []
    user_texts: list[str] = []
    ai_texts: list[str] = []
    for e in session.get("entries", []):
        if e.get("question_idx") != q_idx:
            continue
        if "role" in e:
            if e.get("role") == "user":
                user_texts.append(e.get("text", ""))
            elif e.get("role") == "ai":
                ai_texts.append(e.get("text", ""))
        else:
            user_texts.append(e.get("response", ""))
    return user_texts[-3:], ai_texts[-3:]


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

        # Server-side guardrails: prevent repetitive/interrogative follow-up loops.
        user_recent, ai_recent = _recent_question_entries(sid, q_idx)
        latest_user_norm = _normalize_text(response)

        repeated_user = any(
            latest_user_norm and _token_overlap_ratio(response, prev) >= 0.75
            for prev in user_recent
        )
        terminal_user = _is_terminal_reply(response)

        if terminal_user:
            parsed["status"] = "done"
            parsed["follow_up"] = ""
            parsed["reason"] = "User gave a terminal/minimal close response; stop probing."
        elif repeated_user and parsed.get("status") == "needs_follow_up":
            parsed["status"] = "done"
            parsed["follow_up"] = ""
            parsed["reason"] = "Latest response repeats prior content; avoid repetitive follow-up."
        elif parsed.get("status") == "needs_follow_up":
            proposed_follow_up = parsed.get("follow_up", "")
            repeated_follow_up = any(
                _token_overlap_ratio(proposed_follow_up, prev_ai) >= 0.65
                for prev_ai in ai_recent
            )
            if repeated_follow_up:
                parsed["status"] = "move_on"
                parsed["follow_up"] = ""
                parsed["reason"] = "Proposed follow-up repeats earlier AI prompt; move on."

        # Q3 barrier rule: once a real barrier exists, allow only one clarifier.
        if q_idx == 2 and follow_up_count >= 1 and parsed.get("status") == "needs_follow_up":
            parsed["status"] = "done"
            parsed["follow_up"] = ""
            parsed["reason"] = "Barrier identified and one clarifier already asked; stop further probing."

        # Merge heuristic coverage so already-answered later questions get skipped.
        llm_covered = parsed.get("covered_future_indices", []) or []
        inferred_covered = _infer_future_coverage_from_text(q_idx, full_context, response)
        merged_covered = sorted(set(int(i) for i in llm_covered + inferred_covered if isinstance(i, int)))
        parsed["covered_future_indices"] = merged_covered

        logger.info("Analysis for Q%d: status=%s, reason=%s",
                     q_idx + 1, parsed.get("status"), parsed.get("reason", "")[:60])

        add_response(sid, q_idx, response, parsed)

        covered = parsed.get("covered_future_indices", [])
        if covered:
            session = _sessions.get(sid)
            if session:
                session["covered_ahead"].update(covered)
                evidence_map = session.get("covered_evidence")
                if isinstance(evidence_map, dict):
                    evidence_text = (parsed.get("summary") or response or "").strip()
                    for idx in covered:
                        if idx not in evidence_map and evidence_text:
                            evidence_map[idx] = evidence_text

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


def get_coverage_info(sid: str, q_idx: int) -> dict[str, Any]:
    """Return whether question is covered and best evidence text."""
    session = _sessions.get(sid)
    if not session:
        return {"covered": False, "evidence": ""}

    covered = q_idx in session.get("covered_ahead", set())
    evidence_map = session.get("covered_evidence", {})
    evidence = ""
    if isinstance(evidence_map, dict):
        evidence = (evidence_map.get(q_idx) or "").strip()

    # Fallback: try semantic memory for this question.
    if covered and not evidence:
        similar = check_already_covered(sid, q_idx)
        if similar:
            evidence = (similar[0] or "").strip()

    return {"covered": covered, "evidence": evidence}
