# =============================================================================
# FILE: smart_rag.py
# DESC: Direct pgvector similarity search across RAG tables (inline, no HAUP).
# =============================================================================
#
# EXECUTION FLOW
# =============================================================================
#
#  +--------------------------------+
#  | _get_pool()                    |
#  | * lazy-init connection pool    |
#  +--------------------------------+
#           |
#           |----> <ThreadedConnectionPool> -> __init__()
#           |
#           v
#  +--------------------------------+
#  | _get_table_info()              |
#  | * cache columns + embedding    |
#  +--------------------------------+
#           |
#           |----> <cursor> -> execute()
#           |
#           v
#  +--------------------------------+
#  | _cached_encode()               |
#  | * LRU-cached query embedding   |
#  +--------------------------------+
#           |
#           |----> <embedder> -> encode()
#           |
#           v
#  +--------------------------------+
#  | search()                       |
#  | * cosine search across tables  |
#  +--------------------------------+
#           |
#           |----> _cached_encode()
#           |----> _get_pool()
#           |----> _get_table_info()
#           |----> <cursor> -> execute()
#
# =============================================================================
"""
smart_rag.py
============
Direct pgvector similarity search across RAG_TABLES.
Used when SMART_RAG=true — runs inline before every LLM response.
No HAUP session needed. Uses the same embedder as pg_memory.

Optimisations (v2):
  - ThreadedConnectionPool (1–5 conns) instead of fresh connect() per table
  - Module-level column cache (_TABLE_SAFE_COLS / _TABLE_HAS_EMBEDDING)
  - OrderedDict-based embedding LRU cache (50 entries)
"""

import logging
import threading
from collections import OrderedDict
from typing import Dict, List, Optional

import psycopg2.pool

logger = logging.getLogger("callcenter.smart_rag")

_NEON_DSN = (
    "postgresql://neondb_owner:npg_4U3AtckjizXN"
    "@ep-shiny-glitter-a1t4vbtj.ap-southeast-1.aws.neon.tech"
    "/Srcom-soft?sslmode=require"
)

# Columns to use as document text per table (fallback: all non-null columns)
_TABLE_TEXT_COLS = {
    "users":              ["name", "email", "phone_number", "country_code", "is_active"],
    "conversation_turns": ["role", "text", "lang"],
    "agents":             ["name", "email"],
    "vector_store":       ["document"],
}

_TOP_K = 5
_THRESHOLD = 0.20

# Tables that have no embedding col but whose data lives in vector_store
# When user requests 'users' we auto-add vector_store search too
_BACKED_BY_VECTOR_STORE = {"users", "agents"}


# ── Connection Pool (Task 1) ─────────────────────────────────────────────
# Lazy singleton — created on first call, not at import time.

_pool: Optional[psycopg2.pool.ThreadedConnectionPool] = None
_pool_lock = threading.Lock()


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    """Return (and lazily create) the module-level connection pool."""
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = psycopg2.pool.ThreadedConnectionPool(
                    minconn=1,
                    maxconn=5,
                    dsn=_NEON_DSN,
                )
                # Connections default to autocommit=False which is what we need
                logger.info("[SmartRAG] connection pool created (1–5 conns)")
    return _pool


# ── Column Cache (Task 2) ────────────────────────────────────────────────
# Populated once per table on first call, reused thereafter.

_TABLE_SAFE_COLS: Dict[str, List[str]] = {}
_TABLE_HAS_EMBEDDING: Dict[str, bool] = {}
_col_cache_lock = threading.Lock()


def _get_table_info(conn, table: str):
    """
    Return (has_embedding, safe_cols) for a table.
    Uses a thread-safe cache so pg_attribute is only queried once per table.
    """
    if table in _TABLE_SAFE_COLS and table in _TABLE_HAS_EMBEDDING:
        return _TABLE_HAS_EMBEDDING[table], _TABLE_SAFE_COLS[table]

    with _col_cache_lock:
        # Double-check after acquiring lock
        if table in _TABLE_SAFE_COLS and table in _TABLE_HAS_EMBEDDING:
            return _TABLE_HAS_EMBEDDING[table], _TABLE_SAFE_COLS[table]

        cur = conn.cursor()

        # Check if table has embedding column
        cur.execute(
            "SELECT pa.attname FROM pg_attribute pa "
            "JOIN pg_class pc ON pa.attrelid=pc.oid "
            "WHERE pc.relname=%s AND pa.attname='embedding' AND pa.attnum>0",
            (table,)
        )
        has_embedding = bool(cur.fetchone())

        # Get non-embedding columns
        safe_cols: List[str] = []
        if has_embedding:
            cur.execute(
                "SELECT attname FROM pg_attribute pa "
                "JOIN pg_class pc ON pa.attrelid=pc.oid "
                "WHERE pc.relname=%s AND pa.attnum>0 AND attname!='embedding' "
                "AND NOT attisdropped",
                (table,)
            )
            safe_cols = [r[0] for r in cur.fetchall()]

        cur.close()

        _TABLE_HAS_EMBEDDING[table] = has_embedding
        _TABLE_SAFE_COLS[table] = safe_cols
        logger.info("[SmartRAG] cached columns for table %s: has_embedding=%s, cols=%d",
                     table, has_embedding, len(safe_cols))

        return has_embedding, safe_cols


# ── Embedding Cache (Task 6) ─────────────────────────────────────────────
# Simple OrderedDict LRU: query_text → embedding list.  Max 50 entries.

_EMBED_CACHE_MAX = 50
_embed_cache: OrderedDict = OrderedDict()
_embed_cache_lock = threading.Lock()


def _cached_encode(embedder, query: str) -> list:
    """Encode query with LRU cache. Returns list[float] for ::vector cast."""
    key = query.strip().lower()

    with _embed_cache_lock:
        if key in _embed_cache:
            _embed_cache.move_to_end(key)
            return _embed_cache[key]

    # Encode outside the lock (CPU-bound, don't hold lock during inference)
    vec = embedder.encode(query).tolist()

    with _embed_cache_lock:
        _embed_cache[key] = vec
        if len(_embed_cache) > _EMBED_CACHE_MAX:
            _embed_cache.popitem(last=False)  # evict oldest

    return vec


def search(query: str, tables: List[str]) -> str:
    """
    Embed query, search each table in `tables` via pgvector cosine similarity.
    Returns a compact context string to inject into the LLM system prompt.
    Returns "" on any failure so the pipeline never crashes.
    """
    if not query or not tables:
        return ""
    tables = list(tables)
    try:
        from backend.memory.pg_memory import _get_embedder
        embedder = _get_embedder()
        vec = _cached_encode(embedder, query)
    except Exception as exc:
        logger.warning("[SmartRAG] embed failed: %s", exc)
        return ""

    pool = _get_pool()
    results = []
    for table in tables:
        conn = None
        try:
            conn = pool.getconn()
            try:
                has_embedding, safe_cols = _get_table_info(conn, table)
                conn.commit()  # commit after pg_attribute reads

                if not has_embedding:
                    logger.debug("[SmartRAG] table %s has no embedding col, skipping", table)
                    continue

                col_list = ", ".join(f'"{c}"' for c in safe_cols)

                cur2 = conn.cursor()
                cur2.execute(
                    f"SELECT {col_list}, similarity FROM "
                    f"(SELECT {col_list}, 1-(embedding<=>%s::vector) AS similarity FROM {table}) sub "
                    f"WHERE similarity>=%s ORDER BY similarity DESC LIMIT %s",
                    (vec, _THRESHOLD, _TOP_K)
                )
                cols = [d[0] for d in cur2.description]
                rows = cur2.fetchall()
                cur2.close()
                conn.commit()  # commit between tables

                text_cols = _TABLE_TEXT_COLS.get(table, [])
                for row in rows:
                    rd = dict(zip(cols, row))
                    sim = float(rd.get("similarity", 0))
                    if "document" in rd and rd["document"]:
                        doc = rd["document"]
                    elif text_cols:
                        doc = " | ".join(f"{c}: {rd[c]}" for c in text_cols if c in rd and rd[c] is not None)
                    else:
                        doc = " | ".join(f"{k}: {v}" for k, v in rd.items() if k not in ("embedding","similarity","password_hash","metadata") and v is not None)
                    results.append(f"[{table} | {sim:.0%}] {doc}")
            except Exception as exc:
                logger.warning("[SmartRAG] search failed on table %s: %s", table, exc)
        except Exception as exc:
            logger.warning("[SmartRAG] db connect failed for table %s: %s", table, exc)
        finally:
            if conn is not None:
                try:
                    pool.putconn(conn)
                except Exception:
                    pass

    if not results:
        return ""

    top = results[:_TOP_K * len(tables)]
    context = "Relevant data from knowledge base:\n" + "\n".join(top)
    scores = [r.split("]")[0].split("|")[-1].strip() for r in top]
    logger.info("[SmartRAG] %d results | scores=%s", len(top), scores)
    for i, r in enumerate(top, 1):
        logger.info("  [%d] %s", i, r[:100])
    return context
