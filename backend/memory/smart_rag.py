"""
smart_rag.py
============
Direct pgvector similarity search across RAG_TABLES.
Used when SMART_RAG=true — runs inline before every LLM response.
No HAUP session needed. Uses the same embedder as pg_memory.
"""

import logging
from typing import List

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


def search(query: str, tables: List[str]) -> str:
    """
    Embed query, search each table in `tables` via pgvector cosine similarity.
    Returns a compact context string to inject into the LLM system prompt.
    Returns "" on any failure so the pipeline never crashes.
    """
    if not query or not tables:
        return ""
    # Expand: if user asked for 'users' or 'agents', also search vector_store
    # (user/agent data was ingested there as embeddings)
    expanded_tables = list(tables)
    if any(t in _BACKED_BY_VECTOR_STORE for t in tables) and "vector_store" not in expanded_tables:
        expanded_tables.append("vector_store")
    tables = expanded_tables
    try:
        from backend.memory.pg_memory import _get_embedder, _connect
        embedder = _get_embedder()
        vec = embedder.encode(query).tolist()  # list for ::vector cast
    except Exception as exc:
        logger.warning("[SmartRAG] embed failed: %s", exc)
        return ""

    results = []
    for table in tables:
        try:
            conn = _connect()
            try:
                cur = conn.cursor()
                cur.execute(
                    "SELECT pa.attname FROM pg_attribute pa "
                    "JOIN pg_class pc ON pa.attrelid=pc.oid "
                    "WHERE pc.relname=%s AND pa.attname='embedding' AND pa.attnum>0",
                    (table,)
                )
                has_embedding = bool(cur.fetchone())
                cur.close()

                if not has_embedding:
                    logger.debug("[SmartRAG] table %s has no embedding col, skipping", table)
                    continue

                # Get non-embedding columns to avoid vector deserialization issues
                cur_cols = conn.cursor()
                cur_cols.execute(
                    "SELECT attname FROM pg_attribute pa "
                    "JOIN pg_class pc ON pa.attrelid=pc.oid "
                    "WHERE pc.relname=%s AND pa.attnum>0 AND attname!='embedding' "
                    "AND NOT attisdropped",
                    (table,)
                )
                safe_cols = [r[0] for r in cur_cols.fetchall()]
                cur_cols.close()
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
            finally:
                conn.close()
        except Exception as exc:
            logger.warning("[SmartRAG] db connect failed for table %s: %s", table, exc)

    if not results:
        return ""

    context = "Relevant data from knowledge base:\n" + "\n".join(results[:_TOP_K * len(tables)])
    logger.info("[SmartRAG] found %d results across tables: %s", len(results), tables)
    return context
