# =============================================================================
# FILE: pg_memory.py
# DESC: pgvector-backed conversation memory and call record store on Neon.
# =============================================================================
#
# EXECUTION FLOW
# =============================================================================
#
#  +--------------------------------+
#  | _connect()                     |
#  | * open psycopg2 connection     |
#  +--------------------------------+
#           |
#           v
#  +--------------------------------+
#  | _get_embedder()                |
#  | * lazy-load SentenceTransformer|
#  +--------------------------------+
#           |
#           v
#  +--------------------------------+
#  | _embed()                       |
#  | * encode text to vector        |
#  +--------------------------------+
#           |
#           |----> <SentenceTransformer> -> encode()
#           |
#           v
#  +--------------------------------+
#  | save_turn()                    |
#  | * embed + insert turn row      |
#  +--------------------------------+
#           |
#           |----> _embed()
#           |----> _connect()
#           |
#           v
#  +--------------------------------+
#  | init_avatar_table()            |
#  | * create avatar_configs table  |
#  +--------------------------------+
#           |
#           |----> _connect()
#           |
#           v
#  +--------------------------------+
#  | save_avatar_config()           |
#  | * upsert avatar persona row    |
#  +--------------------------------+
#           |
#           |----> _connect()
#           |
#           v
#  +--------------------------------+
#  | get_avatar_config()            |
#  | * fetch avatar config by stem  |
#  +--------------------------------+
#           |
#           |----> _connect()
#           |
#           v
#  +--------------------------------+
#  | save_call_record()             |
#  | * upsert completed call row    |
#  +--------------------------------+
#           |
#           |----> _connect()
#           |
#           v
#  +--------------------------------+
#  | get_recent_sessions()          |
#  | * fetch last N call records    |
#  +--------------------------------+
#           |
#           |----> _connect()
#           |
#           v
#  +--------------------------------+
#  | get_session_by_id()            |
#  | * fetch single call record     |
#  +--------------------------------+
#           |
#           |----> _connect()
#           |
#           v
#  +--------------------------------+
#  | get_customer_context()         |
#  | * build caller history string  |
#  +--------------------------------+
#           |
#           |----> _connect()
#
# =============================================================================
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
  ai_routing_rules    — routing rules for future call routing logic

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


# ── Avatar Configs ────────────────────────────────────────────────

def init_call_records_table() -> None:
    """Create/migrate call_records table with AI-call analytics columns."""
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """CREATE TABLE IF NOT EXISTS call_records (
                        session_id       TEXT PRIMARY KEY,
                        phone            TEXT,
                        lang             TEXT,
                        sentiment        TEXT DEFAULT 'neutral',
                        primary_intent   TEXT DEFAULT '',
                        turns_json       JSONB,
                        diarization_json JSONB,
                        total_turns      INT DEFAULT 0,
                        duration_secs    FLOAT DEFAULT 0,
                        voice_stem       TEXT DEFAULT '',
                        llm_used         TEXT DEFAULT '',
                        avg_response_ms  FLOAT DEFAULT 0,
                        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )"""
                )
                # Migrate existing tables (idempotent)
                for col, dtype in [
                    ("duration_secs",   "FLOAT DEFAULT 0"),
                    ("voice_stem",      "TEXT DEFAULT ''"),
                    ("llm_used",        "TEXT DEFAULT ''"),
                    ("avg_response_ms", "FLOAT DEFAULT 0"),
                ]:
                    cur.execute(
                        f"ALTER TABLE call_records ADD COLUMN IF NOT EXISTS {col} {dtype}"
                    )
            conn.commit()
        logger.info("[PGMemory] call_records table ready.")
    except Exception as exc:
        logger.warning("[PGMemory] init_call_records_table failed: %s", exc)


def init_routing_rules_table() -> None:
    """Create ai_routing_rules table for future call routing logic."""
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """CREATE TABLE IF NOT EXISTS ai_routing_rules (
                        id           SERIAL PRIMARY KEY,
                        rule_name    TEXT NOT NULL,
                        conditions   JSONB DEFAULT '{}',
                        target_voice TEXT DEFAULT '',
                        target_llm   TEXT DEFAULT 'ollama',
                        priority     INT  DEFAULT 0,
                        active       BOOLEAN DEFAULT TRUE,
                        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )"""
                )
            conn.commit()
        logger.info("[PGMemory] ai_routing_rules table ready.")
    except Exception as exc:
        logger.warning("[PGMemory] init_routing_rules_table failed: %s", exc)


def init_avatar_table():
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """CREATE TABLE IF NOT EXISTS avatar_configs (
                        voice_stem TEXT PRIMARY KEY,
                        company_name TEXT,
                        agent_name TEXT,
                        language TEXT,
                        gender TEXT,
                        original_context TEXT,
                        generated_role TEXT,
                        generated_prompt TEXT,
                        generated_greeting TEXT,
                        custom_style TEXT,
                        custom_speed TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )"""
                )
            conn.commit()
        logger.info("[PGMemory] avatar_configs table initialized.")
    except Exception as exc:
        logger.warning("[PGMemory] init_avatar_table failed: %s", exc)

def save_avatar_config(
    voice_stem: str, company_name: str, agent_name: str,
    language: str, gender: str, original_context: str,
    generated_role: str, generated_prompt: str,
    generated_greeting: str, custom_style: str, custom_speed: str
):
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO avatar_configs
                           (voice_stem, company_name, agent_name, language, gender,
                            original_context, generated_role, generated_prompt,
                            generated_greeting, custom_style, custom_speed, updated_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, CURRENT_TIMESTAMP)
                       ON CONFLICT (voice_stem) DO UPDATE SET
                           company_name = EXCLUDED.company_name,
                           agent_name = EXCLUDED.agent_name,
                           language = EXCLUDED.language,
                           gender = EXCLUDED.gender,
                           original_context = EXCLUDED.original_context,
                           generated_role = EXCLUDED.generated_role,
                           generated_prompt = EXCLUDED.generated_prompt,
                           generated_greeting = EXCLUDED.generated_greeting,
                           custom_style = EXCLUDED.custom_style,
                           custom_speed = EXCLUDED.custom_speed,
                           updated_at = CURRENT_TIMESTAMP""",
                    (
                        voice_stem, company_name, agent_name, language, gender,
                        original_context, generated_role, generated_prompt,
                        generated_greeting, custom_style, custom_speed
                    ),
                )
            conn.commit()
    except Exception as exc:
        logger.warning("[PGMemory] save_avatar_config failed: %s", exc)

def get_avatar_config(voice_stem: str) -> Optional[dict]:
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT voice_stem, company_name, agent_name, language, gender,
                              original_context, generated_role, generated_prompt,
                              generated_greeting, custom_style, custom_speed, updated_at
                       FROM avatar_configs WHERE voice_stem = %s LIMIT 1""",
                    (voice_stem,),
                )
                r = cur.fetchone()
        if r is None:
            return None
        return {
            "voice_stem": r[0],
            "company_name": r[1],
            "agent_name": r[2],
            "language": r[3],
            "gender": r[4],
            "original_context": r[5],
            "generated_role": r[6],
            "generated_prompt": r[7],
            "generated_greeting": r[8],
            "custom_style": r[9],
            "custom_speed": r[10],
            "updated_at": r[11].isoformat() if r[11] else None,
        }
    except Exception as exc:
        logger.warning("[PGMemory] get_avatar_config failed: %s", exc)
        return None


# ── Call records ──────────────────────────────────────────────────

def save_call_record(
    session_id:     str,
    phone:          str,
    lang:           str,
    turns:          List[dict],
    diarization:    List[dict],
    sentiment:      str   = "neutral",
    primary_intent: str   = "",
    duration_secs:  float = 0.0,
    voice_stem:     str   = "",
    llm_used:       str   = "",
    avg_response_ms: float = 0.0,
) -> None:
    """Upsert a completed call record to Neon call_records table."""
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO call_records
                           (session_id, phone, lang, sentiment, primary_intent,
                            turns_json, diarization_json, total_turns,
                            duration_secs, voice_stem, llm_used, avg_response_ms)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (session_id) DO UPDATE SET
                           turns_json       = EXCLUDED.turns_json,
                           diarization_json = EXCLUDED.diarization_json,
                           total_turns      = EXCLUDED.total_turns,
                           sentiment        = EXCLUDED.sentiment,
                           duration_secs    = EXCLUDED.duration_secs,
                           voice_stem       = EXCLUDED.voice_stem,
                           llm_used         = EXCLUDED.llm_used,
                           avg_response_ms  = EXCLUDED.avg_response_ms""",
                    (
                        session_id, phone, lang, sentiment, primary_intent,
                        json.dumps(turns), json.dumps(diarization), len(turns),
                        duration_secs, voice_stem, llm_used, avg_response_ms,
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


def get_analytics_overview(days: int = 30) -> dict:
    """Return aggregated AI call analytics for the admin console."""
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                # KPIs
                cur.execute(
                    """SELECT
                         COUNT(*)                                         AS total_calls,
                         COALESCE(AVG(duration_secs), 0)                 AS avg_duration,
                         COALESCE(AVG(total_turns), 0)                   AS avg_turns,
                         COALESCE(AVG(avg_response_ms), 0)               AS avg_response_ms
                       FROM call_records
                       WHERE created_at >= NOW() - INTERVAL '%s days'""",
                    (days,),
                )
                row = cur.fetchone()
                kpis = {
                    "total_calls":    int(row[0] or 0),
                    "avg_duration":   round(float(row[1] or 0), 1),
                    "avg_turns":      round(float(row[2] or 0), 1),
                    "avg_response_ms": round(float(row[3] or 0), 1),
                }

                # Language distribution
                cur.execute(
                    """SELECT lang, COUNT(*) FROM call_records
                       WHERE created_at >= NOW() - INTERVAL '%s days'
                       GROUP BY lang ORDER BY COUNT(*) DESC""",
                    (days,),
                )
                lang_dist = [{"lang": r[0] or "unknown", "count": int(r[1])} for r in cur.fetchall()]

                # Sentiment distribution
                cur.execute(
                    """SELECT sentiment, COUNT(*) FROM call_records
                       WHERE created_at >= NOW() - INTERVAL '%s days'
                       GROUP BY sentiment ORDER BY COUNT(*) DESC""",
                    (days,),
                )
                sentiment_dist = [{"sentiment": r[0] or "neutral", "count": int(r[1])} for r in cur.fetchall()]

                # Voice/agent distribution
                cur.execute(
                    """SELECT voice_stem, COUNT(*) FROM call_records
                       WHERE created_at >= NOW() - INTERVAL '%s days'
                         AND voice_stem != ''
                       GROUP BY voice_stem ORDER BY COUNT(*) DESC LIMIT 10""",
                    (days,),
                )
                agent_dist = [{"agent": r[0], "count": int(r[1])} for r in cur.fetchall()]

                # LLM distribution
                cur.execute(
                    """SELECT llm_used, COUNT(*) FROM call_records
                       WHERE created_at >= NOW() - INTERVAL '%s days'
                         AND llm_used != ''
                       GROUP BY llm_used ORDER BY COUNT(*) DESC""",
                    (days,),
                )
                llm_dist = [{"llm": r[0], "count": int(r[1])} for r in cur.fetchall()]

                # Daily call volume (last N days)
                cur.execute(
                    """SELECT DATE(created_at) AS day, COUNT(*)
                       FROM call_records
                       WHERE created_at >= NOW() - INTERVAL '%s days'
                       GROUP BY day ORDER BY day ASC""",
                    (days,),
                )
                daily_volume = [{"day": str(r[0]), "calls": int(r[1])} for r in cur.fetchall()]

        return {
            "kpis": kpis,
            "lang_distribution": lang_dist,
            "sentiment_distribution": sentiment_dist,
            "agent_distribution": agent_dist,
            "llm_distribution": llm_dist,
            "daily_volume": daily_volume,
        }
    except Exception as exc:
        logger.warning("[PGMemory] get_analytics_overview failed: %s", exc)
        return {
            "kpis": {"total_calls": 0, "avg_duration": 0, "avg_turns": 0, "avg_response_ms": 0},
            "lang_distribution": [],
            "sentiment_distribution": [],
            "agent_distribution": [],
            "llm_distribution": [],
            "daily_volume": [],
        }


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
