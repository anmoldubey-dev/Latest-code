"""
pg_memory
=========
pgvector-backed conversation memory and call record store on Neon.

Replaces:
  - backend/memory/vector_store.py  (FAISS per-turn saves)
  - backend/memory/long_term_memory.py  (SQLite call records)

Tables (auto-created on first use):
  conversation_turns  — per-turn embeddings (384-dim, all-MiniLM-L6-v2)
  call_records        — one row per completed call, full turns + diarization JSON

Connection: NEON_CONNECTION_STRING env var (direct, not pooler, for reliability).
"""

import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("callcenter.pg_memory")

_DSN = os.getenv(
    "NEON_CONNECTION_STRING",
    "postgresql://neondb_owner:npg_4U3AtckjizXN@ep-shiny-glitter-a1t4vbtj.ap-southeast-1.aws.neon.tech/Srcom-soft?sslmode=require",
)


def _connect():
    import psycopg2
    conn = psycopg2.connect(_DSN)
    conn.autocommit = False
    return conn


# ── Embeddings (lazy-loaded singleton) ───────────────────────────

_embedder = None
_emb_lock = threading.Lock()


def _get_embedder():
    global _embedder
    if _embedder is None:
        with _emb_lock:
            if _embedder is None:
                from sentence_transformers import SentenceTransformer
                _proj  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                _local = os.path.join(_proj, "models", "all-MiniLM-L6-v2")
                _model = _local if os.path.isdir(_local) else "all-MiniLM-L6-v2"
                _embedder = SentenceTransformer(_model)
                logger.info("[PGMemory] embedding model loaded: %s", _model)
    return _embedder


def _embed(text: str) -> List[float]:
    return _get_embedder().encode(text, normalize_embeddings=True).tolist()


# ── Conversation turns ────────────────────────────────────────────

def save_turn(session_id: str, role: str, text: str, lang: str) -> None:
    """Embed and persist one conversation turn to pgvector."""
    try:
        vec = _embed(f"{role}: {text}")
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO conversation_turns (session_id, role, text, lang, embedding)
                       VALUES (%s, %s, %s, %s, %s::vector)""",
                    (session_id, role, text, lang, vec),
                )
            conn.commit()
    except Exception as exc:
        logger.warning("[PGMemory] save_turn failed: %s", exc)


# ── Call records ──────────────────────────────────────────────────

def save_call_record(
    session_id:   str,
    phone:        str,
    lang:         str,
    turns:        List[dict],
    diarization:  List[dict],
    sentiment:    str = "neutral",
    primary_intent: str = "",
) -> None:
    """Upsert a completed call record to Neon call_records table."""
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO call_records
                           (session_id, phone, lang, sentiment, primary_intent,
                            turns_json, diarization_json, total_turns)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (session_id) DO UPDATE SET
                           turns_json       = EXCLUDED.turns_json,
                           diarization_json = EXCLUDED.diarization_json,
                           total_turns      = EXCLUDED.total_turns,
                           sentiment        = EXCLUDED.sentiment""",
                    (
                        session_id, phone, lang, sentiment, primary_intent,
                        json.dumps(turns), json.dumps(diarization), len(turns),
                    ),
                )
            conn.commit()
        logger.info("[PGMemory] call_record saved  session=%s  turns=%d", session_id[:8], len(turns))
    except Exception as exc:
        logger.warning("[PGMemory] save_call_record failed: %s", exc)


def get_recent_sessions(limit: int = 100) -> List[dict]:
    """Fetch recent call records for admin console."""
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT session_id, phone, lang, sentiment, primary_intent,
                              turns_json, diarization_json, total_turns, created_at
                       FROM call_records ORDER BY created_at DESC LIMIT %s""",
                    (limit,),
                )
                rows = cur.fetchall()
        out = []
        for r in rows:
            turns = r[5] if isinstance(r[5], list) else (json.loads(r[5]) if r[5] else [])
            diar  = r[6] if isinstance(r[6], list) else (json.loads(r[6]) if r[6] else [])
            out.append({
                "session_id":     r[0],
                "phone":          r[1],
                "lang":           r[2],
                "sentiment":      r[3],
                "primary_intent": r[4],
                "turns":          turns,
                "diarization":    diar,
                "total_turns":    r[7],
                "created_at":     r[8].isoformat() if r[8] else None,
            })
        return out
    except Exception as exc:
        logger.warning("[PGMemory] get_recent_sessions failed: %s", exc)
        return []


def get_session_by_id(session_id: str) -> Optional[dict]:
    """Fetch a single call record by session_id."""
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT session_id, phone, lang, sentiment, primary_intent,
                              turns_json, diarization_json, total_turns, created_at
                       FROM call_records WHERE session_id = %s LIMIT 1""",
                    (session_id,),
                )
                r = cur.fetchone()
        if r is None:
            return None
        turns = r[5] if isinstance(r[5], list) else (json.loads(r[5]) if r[5] else [])
        diar  = r[6] if isinstance(r[6], list) else (json.loads(r[6]) if r[6] else [])
        return {
            "session_id":     r[0],
            "phone":          r[1],
            "lang":           r[2],
            "sentiment":      r[3],
            "primary_intent": r[4],
            "turns":          turns,
            "diarization":    diar,
            "total_turns":    r[7],
            "created_at":     r[8].isoformat() if r[8] else None,
        }
    except Exception as exc:
        logger.warning("[PGMemory] get_session_by_id failed: %s", exc)
        return None


def get_customer_context(phone: str) -> str:
    """Return compact caller history string for LLM system prompt (max ~300 chars)."""
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT turns_json, created_at FROM call_records
                       WHERE phone = %s ORDER BY created_at DESC LIMIT 3""",
                    (phone,),
                )
                rows = cur.fetchall()
        if not rows:
            return ""
        lines = [f"Returning caller ({len(rows)} prior call(s))."]
        for r in rows:
            turns = r[0] if isinstance(r[0], list) else (json.loads(r[0]) if r[0] else [])
            user_turns = [t["text"] for t in turns if t.get("role") == "user"]
            if user_turns:
                lines.append(f"  [{r[1].strftime('%b %d')}] said: {user_turns[0][:80]}")
        return "\n".join(lines)
    except Exception as exc:
        logger.debug("[PGMemory] get_customer_context failed: %s", exc)
        return ""
