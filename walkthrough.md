# RAG System Optimization — Walkthrough

All 8 optimization tasks have been implemented across 6 files. Here's what changed and why.

---

## Changes Made

### 1. Smart RAG — Connection Pool, Column Cache, Embedding Cache

**File**: [smart_rag.py](file:///c:/Users/SKY%20WALKER/OneDrive/Desktop/Srcom/voice-ai-core/backend/memory/smart_rag.py)

```diff:smart_rag.py
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
===
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
    # Expand: if user asked for 'users' or 'agents', also search vector_store
    # (user/agent data was ingested there as embeddings)
    expanded_tables = list(tables)
    if any(t in _BACKED_BY_VECTOR_STORE for t in tables) and "vector_store" not in expanded_tables:
        expanded_tables.append("vector_store")
    tables = expanded_tables
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

    context = "Relevant data from knowledge base:\n" + "\n".join(results[:_TOP_K * len(tables)])
    logger.info("[SmartRAG] found %d results across tables: %s", len(results), tables)
    return context

```

**What changed:**
- **Connection Pool (Task 1)**: Replaced per-table `_connect()` with a lazy `ThreadedConnectionPool(1–5)` singleton. Connections acquired via `pool.getconn()` and always released in `finally` via `pool.putconn()`. Saves ~300ms/table/turn.
- **Column Cache (Task 2)**: `_TABLE_SAFE_COLS` and `_TABLE_HAS_EMBEDDING` dicts populated once per table on first call. Double-checked locking pattern. Eliminates 2x `pg_attribute` queries per table per turn.
- **Embedding Cache (Task 6)**: `OrderedDict`-based LRU cache (50 entries) keyed by `query.strip().lower()`. Encoding runs outside the lock. Saves ~50ms on repeated queries.

**Preserved**: SQL subquery pattern, `conn.commit()` between tables, `_BACKED_BY_VECTOR_STORE` expansion, `pg_attribute` approach.

---

### 2. HAUP — Gemini LLM Backend (Task 4)

Three files modified:

#### [config.py](file:///c:/Users/SKY%20WALKER/OneDrive/Desktop/Srcom/voice-ai-core/SahilRagSystem/haup/rag_core/config.py)

```diff:config.py
"""
File Summary:
Central configuration for the HAUP RAG engine. All tunables live here —
no magic numbers scattered across modules. Covers LLM backends, retrieval,
context, conversation, cache, guardrails, observability, and HAUP integration paths.

====================================================================
Startup
====================================================================

RAGConfig  [Class]
||
├── OllamaConfig  [Class] --------------------------------> Local Ollama LLM server settings
│
├── OpenAIConfig  [Class] --------------------------------> OpenAI cloud API settings
│
├── AnthropicConfig  [Class] -----------------------------> Anthropic Claude API settings
│
├── RetrievalConfig  [Class] -----------------------------> Vector search and ranking settings
│       │
│       ├── top_k ----------------------------------------> Initial pgvector candidate count
│       ├── rerank_top_n ---------------------------------> Final context size after reranking
│       ├── similarity_threshold -------------------------> Relevance filtering cutoff
│       └── enable_query_expansion ----------------------> Multi-query rewriting toggle
│
├── ContextConfig  [Class] -------------------------------> Response formatting and token budget
│       │
│       ├── max_context_tokens ---------------------------> Token budget for retrieved rows
│       ├── row_format -----------------------------------> markdown_table / json / key_value
│       └── truncate_long_values -------------------------> Chars per cell before truncation
│
├── ConversationConfig  [Class] --------------------------> Session and history management
│       │
│       ├── max_history_turns ----------------------------> User/assistant pairs kept in memory
│       ├── session_ttl_seconds --------------------------> Idle timeout before session expires
│       └── persist_sessions -----------------------------> Write sessions to SQLite toggle
│
├── CacheConfig  [Class] ---------------------------------> Response cache settings
│       │
│       ├── ttl_seconds ----------------------------------> Cache entry lifetime
│       ├── max_entries ----------------------------------> Max cached responses
│       └── similarity_threshold -------------------------> Cosine sim for cache hit detection
│
├── GuardrailsConfig  [Class] ----------------------------> Safety, security, and rate limiting
│       │
│       ├── __post_init__()  [Function] ------------------> Default blocked_keywords to []
│       ├── rate_limit_enabled / max_queries_per_minute --> Abuse prevention
│       ├── injection_detection --------------------------> Prompt injection scanning
│       ├── pii_detection --------------------------------> Privacy protection
│       └── hallucination_check --------------------------> Response accuracy validation
│
├── ObservabilityConfig  [Class] -------------------------> Logging and tracing settings
│       │
│       ├── log_level ------------------------------------> WARNING / INFO / DEBUG
│       ├── log_queries / log_retrieved_rows -------------> Verbose request logging
│       └── trace_file -----------------------------------> JSONL trace output path
│
└── RAGConfig  [Class] -----------------------------------> Master config dataclass
        │
        ├── llm_backend ----------------------------------> Active backend selection
        ├── ollama / openai / anthropic ------------------> Backend sub-configs
        ├── retrieval / context / conversation -----------> Pipeline sub-configs
        ├── cache / observability / guardrails -----------> System sub-configs
        ├── pgvector.table / collection_name -------------> HAUP vector DB paths
        ├── source_type / source_host / source_table -----> Original data source config
        ├── source_connection_string ---------------------> Full Neon DSN (overrides host/port/user)
        │
        └── from_env()  [Function] ----------------------> Build config from environment variables
                │
                ├── DB_TYPE / SOURCE_TYPE ----------------> Both accepted for source_type
                ├── NEON_CONNECTION_STRING ---------------> Populates source_connection_string
                └── os.getenv() overrides ----------------> Every field overridable via env

====================================================================
FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal, Optional


# ─────────────────────────────────────────────
#  LLM Backend
# ─────────────────────────────────────────────
LLMBackend = Literal["ollama", "openai", "anthropic"]


"""================= Startup class OllamaConfig ================="""
@dataclass
class OllamaConfig:
    base_url:   str = "http://localhost:11434"
    model:      str = "deepseek-v3.1:671b-cloud"
    timeout:    int = 120          # seconds per request
    keep_alive: str = "10m"        # how long Ollama keeps model in VRAM
"""================= End class OllamaConfig ================="""


"""================= Startup class OpenAIConfig ================="""
@dataclass
class OpenAIConfig:
    api_key:  str           = ""        # read from env if empty
    model:    str           = "gpt-4o-mini"
    base_url: Optional[str] = None      # supports Azure / proxy endpoints
    timeout:  int           = 60
"""================= End class OpenAIConfig ================="""


"""================= Startup class AnthropicConfig ================="""
@dataclass
class AnthropicConfig:
    api_key: str = ""
    model:   str = "claude-3-5-haiku-20241022"
    timeout: int = 60
"""================= End class AnthropicConfig ================="""


# ─────────────────────────────────────────────
#  Retrieval
# ─────────────────────────────────────────────

"""================= Startup class RetrievalConfig ================="""
@dataclass
class RetrievalConfig:
    top_k:                  int   = 8       # candidates fetched from pgvector
    rerank_top_n:           int   = 5       # kept after reranking
    similarity_threshold:   float = 0.30
    enable_query_expansion: bool  = True
    expansion_variations:   int   = 3       # how many rewritten queries to combine
    max_context_rows:       int   = 20      # hard cap before context window overflow
"""================= End class RetrievalConfig ================="""


# ─────────────────────────────────────────────
#  Context Builder
# ─────────────────────────────────────────────

"""================= Startup class ContextConfig ================="""
@dataclass
class ContextConfig:
    max_context_tokens:     int                                        = 6000
    include_schema_summary: bool                                       = True
    row_format:             Literal["markdown_table", "json", "key_value"] = "markdown_table"
    truncate_long_values:   int                                        = 200
"""================= End class ContextConfig ================="""


# ─────────────────────────────────────────────
#  Conversation
# ─────────────────────────────────────────────

"""================= Startup class ConversationConfig ================="""
@dataclass
class ConversationConfig:
    max_history_turns:   int  = 10      # number of user/assistant pairs kept
    session_ttl_seconds: int  = 3600    # 1 hour idle → session expires
    persist_sessions:    bool = True    # write sessions to SQLite
"""================= End class ConversationConfig ================="""


# ─────────────────────────────────────────────
#  Cache
# ─────────────────────────────────────────────

"""================= Startup class CacheConfig ================="""
@dataclass
class CacheConfig:
    enabled:              bool  = True
    ttl_seconds:          int   = 300     # 5 min — data changes slowly
    max_entries:          int   = 500
    similarity_threshold: float = 0.95   # cosine sim to consider a cache hit
"""================= End class CacheConfig ================="""


# ─────────────────────────────────────────────
#  Guardrails
# ─────────────────────────────────────────────

"""================= Startup class GuardrailsConfig ================="""
@dataclass
class GuardrailsConfig:
    max_query_length:       int  = 1000
    min_query_length:       int  = 2
    rate_limit_enabled:     bool = True
    max_queries_per_minute: int  = 30
    injection_detection:    bool = True
    block_injections:       bool = True
    pii_detection:          bool = True
    pii_redact_in_query:    bool = False
    pii_redact_in_response: bool = False
    blocked_keywords:       list = None
    hallucination_check:    bool = True

    """================= Startup method __post_init__ ================="""
    def __post_init__(self):
        if self.blocked_keywords is None:
            self.blocked_keywords = []
    """================= End method __post_init__ ================="""

"""================= End class GuardrailsConfig ================="""


# ─────────────────────────────────────────────
#  Logging / Observability
# ─────────────────────────────────────────────

"""================= Startup class ObservabilityConfig ================="""
@dataclass
class ObservabilityConfig:
    log_level:           str           = "WARNING"
    log_queries:         bool          = False
    log_retrieved_rows:  bool          = False
    log_llm_prompts:     bool          = False
    trace_file:          Optional[str] = None    # write JSONL trace if set
"""================= End class ObservabilityConfig ================="""


# ─────────────────────────────────────────────
#  pgvector Configuration
# ─────────────────────────────────────────────

"""================= Startup class PgvectorConfig ================="""
@dataclass
class PgvectorConfig:
    host:               str = "localhost"
    port:               int = 5432
    user:               str = "postgres"
    password:           str = ""
    database:           str = "vector_db"
    table:              str = "vector_store"
    extra_tables:       list = field(default_factory=list)  # additional tables from RAG_TABLES env
    connection_string:  str = ""           # Full DSN (overrides individual params)
    min_connections:    int = 2
    max_connections:    int = 10
    embedding_dimension: int = 384         # all-MiniLM-L6-v2 dimension
"""================= End class PgvectorConfig ================="""


# ─────────────────────────────────────────────
#  Master Config
# ─────────────────────────────────────────────

"""================= Startup class RAGConfig ================="""
@dataclass
class RAGConfig:
    # Which LLM backend to use
    llm_backend: LLMBackend = "ollama"

    # Backend configs
    ollama:    OllamaConfig    = field(default_factory=OllamaConfig)
    openai:    OpenAIConfig    = field(default_factory=OpenAIConfig)
    anthropic: AnthropicConfig = field(default_factory=AnthropicConfig)

    # Pipeline configs
    retrieval:     RetrievalConfig     = field(default_factory=RetrievalConfig)
    context:       ContextConfig       = field(default_factory=ContextConfig)
    conversation:  ConversationConfig  = field(default_factory=ConversationConfig)
    cache:         CacheConfig         = field(default_factory=CacheConfig)
    observability: ObservabilityConfig = field(default_factory=ObservabilityConfig)
    pgvector:      PgvectorConfig      = field(default_factory=PgvectorConfig)

    # HAUP integration paths
    checkpoint_db:   str = "./haup_checkpoint.db"
    embedding_model: str = "all-MiniLM-L6-v2"

    # Session persistence DB
    session_db: str = "./rag_sessions.db"

    # Source DB (for reverse row lookup)
    source_type:        Literal["mysql", "postgresql", "sqlite", "none"] = "postgresql"
    source_host:        str = "localhost"
    source_port:        int = 5432
    source_user:        str = "postgres"
    source_password:    str = ""
    source_database:    str = "Vector"
    source_table:       str = "Users"
    source_primary_key: str = "id"
    # Full DSN — when set, retriever uses this directly and ignores
    # source_host / source_port / source_user / source_password / source_database.
    # Populated automatically from NEON_CONNECTION_STRING env var.
    source_connection_string: str = ""

    """================= Startup method from_env ================="""
    @classmethod
    def from_env(cls) -> "RAGConfig":
        """
        Build config from environment variables so nothing sensitive
        lives in source code. Every field can be overridden via env.

        Source-type resolution order (first match wins):
          1. SOURCE_TYPE  (explicit override)
          2. DB_TYPE      (your Neon .env key)
          3. dataclass default ("postgresql")

        Connection-string resolution order:
          1. NEON_CONNECTION_STRING  (full DSN — recommended for Neon)
          2. Individual SOURCE_HOST / SOURCE_PORT / SOURCE_USER / … vars
        """
        cfg = cls()

        # LLM backend
        cfg.llm_backend = os.getenv("RAG_LLM_BACKEND", cfg.llm_backend)  # type: ignore

        # Ollama
        cfg.ollama.base_url = os.getenv("OLLAMA_BASE_URL", cfg.ollama.base_url)
        cfg.ollama.model    = os.getenv("OLLAMA_MODEL",    cfg.ollama.model)

        # OpenAI
        cfg.openai.api_key  = os.getenv("OPENAI_API_KEY",  cfg.openai.api_key)
        cfg.openai.model    = os.getenv("OPENAI_MODEL",    cfg.openai.model)
        cfg.openai.base_url = os.getenv("OPENAI_BASE_URL", cfg.openai.base_url)

        # Anthropic
        cfg.anthropic.api_key = os.getenv("ANTHROPIC_API_KEY", cfg.anthropic.api_key)
        cfg.anthropic.model   = os.getenv("ANTHROPIC_MODEL",   cfg.anthropic.model)

        # ── pgvector Configuration ────────────────────────────────────────────
        pgvector_dsn = os.getenv("PGVECTOR_CONNECTION_STRING", "")
        if pgvector_dsn:
            cfg.pgvector.connection_string = pgvector_dsn
        
        cfg.pgvector.host     = os.getenv("PGVECTOR_HOST",     cfg.pgvector.host)
        cfg.pgvector.port     = int(os.getenv("PGVECTOR_PORT", str(cfg.pgvector.port)))
        cfg.pgvector.user     = os.getenv("PGVECTOR_USER",     cfg.pgvector.user)
        cfg.pgvector.password = os.getenv("PGVECTOR_PASSWORD", cfg.pgvector.password)
        cfg.pgvector.database = os.getenv("PGVECTOR_DATABASE", cfg.pgvector.database)
        cfg.pgvector.table    = os.getenv("PGVECTOR_TABLE",    cfg.pgvector.table)

        # ── RAG_TABLES — comma-separated extra tables to search ───────────────
        # Format: RAG_TABLES=users,agents,knowledge_base
        # vector_store is always searched; these are additional source tables.
        rag_tables_raw = os.getenv("RAG_TABLES", "")
        if rag_tables_raw:
            cfg.pgvector.extra_tables = [
                t.strip() for t in rag_tables_raw.split(",") if t.strip()
            ]

        # ── Source DB type ────────────────────────────────────────────────────
        # Accept both SOURCE_TYPE (explicit) and DB_TYPE (Neon .env convention).
        # SOURCE_TYPE takes precedence if both are set.
        source_type = (
            os.getenv("SOURCE_TYPE")
            or os.getenv("DB_TYPE")
            or cfg.source_type
        )
        cfg.source_type = source_type  # type: ignore

        # ── Connection string (Neon DSN) ──────────────────────────────────────
        # NEON_CONNECTION_STRING carries the full DSN including sslmode and
        # channel_binding, so nothing extra needs to be configured.
        # When present it takes priority; individual host/port/user vars are
        # still read so the config object is fully populated for logging/debug.
        neon_dsn = os.getenv("NEON_CONNECTION_STRING", "")
        if neon_dsn:
            cfg.source_connection_string = neon_dsn

        # Individual source DB parameters (used when no full DSN is set)
        cfg.source_host     = os.getenv("SOURCE_HOST",     cfg.source_host)
        cfg.source_port     = int(os.getenv("SOURCE_PORT", str(cfg.source_port)))
        cfg.source_user     = os.getenv("SOURCE_USER",     cfg.source_user)
        cfg.source_password = os.getenv("SOURCE_PASSWORD", cfg.source_password)
        cfg.source_database = os.getenv("SOURCE_DATABASE", cfg.source_database)
        cfg.source_table    = os.getenv("PG_TABLE",        cfg.source_table)

        # Paths
        cfg.checkpoint_db   = os.getenv("CHECKPOINT_DB",   cfg.checkpoint_db)

        return cfg
    """================= End method from_env ================="""

"""================= End class RAGConfig ================="""
===
"""
File Summary:
Central configuration for the HAUP RAG engine. All tunables live here —
no magic numbers scattered across modules. Covers LLM backends, retrieval,
context, conversation, cache, guardrails, observability, and HAUP integration paths.

====================================================================
Startup
====================================================================

RAGConfig  [Class]
||
├── OllamaConfig  [Class] --------------------------------> Local Ollama LLM server settings
│
├── OpenAIConfig  [Class] --------------------------------> OpenAI cloud API settings
│
├── AnthropicConfig  [Class] -----------------------------> Anthropic Claude API settings
│
├── RetrievalConfig  [Class] -----------------------------> Vector search and ranking settings
│       │
│       ├── top_k ----------------------------------------> Initial pgvector candidate count
│       ├── rerank_top_n ---------------------------------> Final context size after reranking
│       ├── similarity_threshold -------------------------> Relevance filtering cutoff
│       └── enable_query_expansion ----------------------> Multi-query rewriting toggle
│
├── ContextConfig  [Class] -------------------------------> Response formatting and token budget
│       │
│       ├── max_context_tokens ---------------------------> Token budget for retrieved rows
│       ├── row_format -----------------------------------> markdown_table / json / key_value
│       └── truncate_long_values -------------------------> Chars per cell before truncation
│
├── ConversationConfig  [Class] --------------------------> Session and history management
│       │
│       ├── max_history_turns ----------------------------> User/assistant pairs kept in memory
│       ├── session_ttl_seconds --------------------------> Idle timeout before session expires
│       └── persist_sessions -----------------------------> Write sessions to SQLite toggle
│
├── CacheConfig  [Class] ---------------------------------> Response cache settings
│       │
│       ├── ttl_seconds ----------------------------------> Cache entry lifetime
│       ├── max_entries ----------------------------------> Max cached responses
│       └── similarity_threshold -------------------------> Cosine sim for cache hit detection
│
├── GuardrailsConfig  [Class] ----------------------------> Safety, security, and rate limiting
│       │
│       ├── __post_init__()  [Function] ------------------> Default blocked_keywords to []
│       ├── rate_limit_enabled / max_queries_per_minute --> Abuse prevention
│       ├── injection_detection --------------------------> Prompt injection scanning
│       ├── pii_detection --------------------------------> Privacy protection
│       └── hallucination_check --------------------------> Response accuracy validation
│
├── ObservabilityConfig  [Class] -------------------------> Logging and tracing settings
│       │
│       ├── log_level ------------------------------------> WARNING / INFO / DEBUG
│       ├── log_queries / log_retrieved_rows -------------> Verbose request logging
│       └── trace_file -----------------------------------> JSONL trace output path
│
└── RAGConfig  [Class] -----------------------------------> Master config dataclass
        │
        ├── llm_backend ----------------------------------> Active backend selection
        ├── ollama / openai / anthropic ------------------> Backend sub-configs
        ├── retrieval / context / conversation -----------> Pipeline sub-configs
        ├── cache / observability / guardrails -----------> System sub-configs
        ├── pgvector.table / collection_name -------------> HAUP vector DB paths
        ├── source_type / source_host / source_table -----> Original data source config
        ├── source_connection_string ---------------------> Full Neon DSN (overrides host/port/user)
        │
        └── from_env()  [Function] ----------------------> Build config from environment variables
                │
                ├── DB_TYPE / SOURCE_TYPE ----------------> Both accepted for source_type
                ├── NEON_CONNECTION_STRING ---------------> Populates source_connection_string
                └── os.getenv() overrides ----------------> Every field overridable via env

====================================================================
FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal, Optional


# ─────────────────────────────────────────────
#  LLM Backend
# ─────────────────────────────────────────────
LLMBackend = Literal["ollama", "openai", "anthropic", "gemini"]


"""================= Startup class OllamaConfig ================="""
@dataclass
class OllamaConfig:
    base_url:   str = "http://localhost:11434"
    model:      str = "deepseek-v3.1:671b-cloud"
    timeout:    int = 120          # seconds per request
    keep_alive: str = "10m"        # how long Ollama keeps model in VRAM
"""================= End class OllamaConfig ================="""


"""================= Startup class OpenAIConfig ================="""
@dataclass
class OpenAIConfig:
    api_key:  str           = ""        # read from env if empty
    model:    str           = "gpt-4o-mini"
    base_url: Optional[str] = None      # supports Azure / proxy endpoints
    timeout:  int           = 60
"""================= End class OpenAIConfig ================="""


"""================= Startup class AnthropicConfig ================="""
@dataclass
class AnthropicConfig:
    api_key: str = ""
    model:   str = "claude-3-5-haiku-20241022"
    timeout: int = 60
"""================= End class AnthropicConfig ================="""


"""================= Startup class GeminiConfig ================="""
@dataclass
class GeminiConfig:
    api_key: str = ""              # read from GEMINI_API_KEY env var
    model:   str = "gemini-2.0-flash"  # fast, cost-effective
    timeout: int = 30
"""================= End class GeminiConfig ================="""


# ─────────────────────────────────────────────
#  Retrieval
# ─────────────────────────────────────────────

"""================= Startup class RetrievalConfig ================="""
@dataclass
class RetrievalConfig:
    top_k:                  int   = 8       # candidates fetched from pgvector
    rerank_top_n:           int   = 5       # kept after reranking
    similarity_threshold:   float = 0.30
    enable_query_expansion: bool  = True
    expansion_variations:   int   = 3       # how many rewritten queries to combine
    max_context_rows:       int   = 20      # hard cap before context window overflow
"""================= End class RetrievalConfig ================="""


# ─────────────────────────────────────────────
#  Context Builder
# ─────────────────────────────────────────────

"""================= Startup class ContextConfig ================="""
@dataclass
class ContextConfig:
    max_context_tokens:     int                                        = 6000
    include_schema_summary: bool                                       = True
    row_format:             Literal["markdown_table", "json", "key_value"] = "markdown_table"
    truncate_long_values:   int                                        = 200
"""================= End class ContextConfig ================="""


# ─────────────────────────────────────────────
#  Conversation
# ─────────────────────────────────────────────

"""================= Startup class ConversationConfig ================="""
@dataclass
class ConversationConfig:
    max_history_turns:   int  = 10      # number of user/assistant pairs kept
    session_ttl_seconds: int  = 3600    # 1 hour idle → session expires
    persist_sessions:    bool = True    # write sessions to SQLite
"""================= End class ConversationConfig ================="""


# ─────────────────────────────────────────────
#  Cache
# ─────────────────────────────────────────────

"""================= Startup class CacheConfig ================="""
@dataclass
class CacheConfig:
    enabled:              bool  = True
    ttl_seconds:          int   = 300     # 5 min — data changes slowly
    max_entries:          int   = 500
    similarity_threshold: float = 0.95   # cosine sim to consider a cache hit
"""================= End class CacheConfig ================="""


# ─────────────────────────────────────────────
#  Guardrails
# ─────────────────────────────────────────────

"""================= Startup class GuardrailsConfig ================="""
@dataclass
class GuardrailsConfig:
    max_query_length:       int  = 1000
    min_query_length:       int  = 2
    rate_limit_enabled:     bool = True
    max_queries_per_minute: int  = 30
    injection_detection:    bool = True
    block_injections:       bool = True
    pii_detection:          bool = True
    pii_redact_in_query:    bool = False
    pii_redact_in_response: bool = False
    blocked_keywords:       list = None
    hallucination_check:    bool = True

    """================= Startup method __post_init__ ================="""
    def __post_init__(self):
        if self.blocked_keywords is None:
            self.blocked_keywords = []
    """================= End method __post_init__ ================="""

"""================= End class GuardrailsConfig ================="""


# ─────────────────────────────────────────────
#  Logging / Observability
# ─────────────────────────────────────────────

"""================= Startup class ObservabilityConfig ================="""
@dataclass
class ObservabilityConfig:
    log_level:           str           = "WARNING"
    log_queries:         bool          = False
    log_retrieved_rows:  bool          = False
    log_llm_prompts:     bool          = False
    trace_file:          Optional[str] = None    # write JSONL trace if set
"""================= End class ObservabilityConfig ================="""


# ─────────────────────────────────────────────
#  pgvector Configuration
# ─────────────────────────────────────────────

"""================= Startup class PgvectorConfig ================="""
@dataclass
class PgvectorConfig:
    host:               str = "localhost"
    port:               int = 5432
    user:               str = "postgres"
    password:           str = ""
    database:           str = "vector_db"
    table:              str = "vector_store"
    extra_tables:       list = field(default_factory=list)  # additional tables from RAG_TABLES env
    connection_string:  str = ""           # Full DSN (overrides individual params)
    min_connections:    int = 2
    max_connections:    int = 8
    embedding_dimension: int = 384         # all-MiniLM-L6-v2 dimension
"""================= End class PgvectorConfig ================="""


# ─────────────────────────────────────────────
#  Master Config
# ─────────────────────────────────────────────

"""================= Startup class RAGConfig ================="""
@dataclass
class RAGConfig:
    # Which LLM backend to use
    llm_backend: LLMBackend = "ollama"

    # Backend configs
    ollama:    OllamaConfig    = field(default_factory=OllamaConfig)
    openai:    OpenAIConfig    = field(default_factory=OpenAIConfig)
    anthropic: AnthropicConfig = field(default_factory=AnthropicConfig)
    gemini:    GeminiConfig    = field(default_factory=GeminiConfig)

    # Pipeline configs
    retrieval:     RetrievalConfig     = field(default_factory=RetrievalConfig)
    context:       ContextConfig       = field(default_factory=ContextConfig)
    conversation:  ConversationConfig  = field(default_factory=ConversationConfig)
    cache:         CacheConfig         = field(default_factory=CacheConfig)
    observability: ObservabilityConfig = field(default_factory=ObservabilityConfig)
    pgvector:      PgvectorConfig      = field(default_factory=PgvectorConfig)

    # HAUP integration paths
    checkpoint_db:   str = "./haup_checkpoint.db"
    embedding_model: str = "all-MiniLM-L6-v2"

    # Session persistence DB
    session_db: str = "./rag_sessions.db"

    # Source DB (for reverse row lookup)
    source_type:        Literal["mysql", "postgresql", "sqlite", "none"] = "postgresql"
    source_host:        str = "localhost"
    source_port:        int = 5432
    source_user:        str = "postgres"
    source_password:    str = ""
    source_database:    str = "Vector"
    source_table:       str = "Users"
    source_primary_key: str = "id"
    # Full DSN — when set, retriever uses this directly and ignores
    # source_host / source_port / source_user / source_password / source_database.
    # Populated automatically from NEON_CONNECTION_STRING env var.
    source_connection_string: str = ""

    """================= Startup method from_env ================="""
    @classmethod
    def from_env(cls) -> "RAGConfig":
        """
        Build config from environment variables so nothing sensitive
        lives in source code. Every field can be overridden via env.

        Source-type resolution order (first match wins):
          1. SOURCE_TYPE  (explicit override)
          2. DB_TYPE      (your Neon .env key)
          3. dataclass default ("postgresql")

        Connection-string resolution order:
          1. NEON_CONNECTION_STRING  (full DSN — recommended for Neon)
          2. Individual SOURCE_HOST / SOURCE_PORT / SOURCE_USER / … vars
        """
        cfg = cls()

        # LLM backend
        cfg.llm_backend = os.getenv("RAG_LLM_BACKEND", cfg.llm_backend)  # type: ignore

        # Ollama
        cfg.ollama.base_url = os.getenv("OLLAMA_BASE_URL", cfg.ollama.base_url)
        cfg.ollama.model    = os.getenv("OLLAMA_MODEL",    cfg.ollama.model)

        # OpenAI
        cfg.openai.api_key  = os.getenv("OPENAI_API_KEY",  cfg.openai.api_key)
        cfg.openai.model    = os.getenv("OPENAI_MODEL",    cfg.openai.model)
        cfg.openai.base_url = os.getenv("OPENAI_BASE_URL", cfg.openai.base_url)

        # Anthropic
        cfg.anthropic.api_key = os.getenv("ANTHROPIC_API_KEY", cfg.anthropic.api_key)
        cfg.anthropic.model   = os.getenv("ANTHROPIC_MODEL",   cfg.anthropic.model)

        # Gemini
        cfg.gemini.api_key = os.getenv("GEMINI_API_KEY", cfg.gemini.api_key)
        cfg.gemini.model   = os.getenv("GEMINI_MODEL",   cfg.gemini.model)

        # ── pgvector Configuration ────────────────────────────────────────────
        pgvector_dsn = os.getenv("PGVECTOR_CONNECTION_STRING", "")
        if pgvector_dsn:
            cfg.pgvector.connection_string = pgvector_dsn
        
        cfg.pgvector.host     = os.getenv("PGVECTOR_HOST",     cfg.pgvector.host)
        cfg.pgvector.port     = int(os.getenv("PGVECTOR_PORT", str(cfg.pgvector.port)))
        cfg.pgvector.user     = os.getenv("PGVECTOR_USER",     cfg.pgvector.user)
        cfg.pgvector.password = os.getenv("PGVECTOR_PASSWORD", cfg.pgvector.password)
        cfg.pgvector.database = os.getenv("PGVECTOR_DATABASE", cfg.pgvector.database)
        cfg.pgvector.table    = os.getenv("PGVECTOR_TABLE",    cfg.pgvector.table)

        # ── RAG_TABLES — comma-separated extra tables to search ───────────────
        # Format: RAG_TABLES=users,agents,knowledge_base
        # vector_store is always searched; these are additional source tables.
        rag_tables_raw = os.getenv("RAG_TABLES", "")
        if rag_tables_raw:
            cfg.pgvector.extra_tables = [
                t.strip() for t in rag_tables_raw.split(",") if t.strip()
            ]

        # ── Source DB type ────────────────────────────────────────────────────
        # Accept both SOURCE_TYPE (explicit) and DB_TYPE (Neon .env convention).
        # SOURCE_TYPE takes precedence if both are set.
        source_type = (
            os.getenv("SOURCE_TYPE")
            or os.getenv("DB_TYPE")
            or cfg.source_type
        )
        cfg.source_type = source_type  # type: ignore

        # ── Connection string (Neon DSN) ──────────────────────────────────────
        # NEON_CONNECTION_STRING carries the full DSN including sslmode and
        # channel_binding, so nothing extra needs to be configured.
        # When present it takes priority; individual host/port/user vars are
        # still read so the config object is fully populated for logging/debug.
        neon_dsn = os.getenv("NEON_CONNECTION_STRING", "")
        if neon_dsn:
            cfg.source_connection_string = neon_dsn

        # Individual source DB parameters (used when no full DSN is set)
        cfg.source_host     = os.getenv("SOURCE_HOST",     cfg.source_host)
        cfg.source_port     = int(os.getenv("SOURCE_PORT", str(cfg.source_port)))
        cfg.source_user     = os.getenv("SOURCE_USER",     cfg.source_user)
        cfg.source_password = os.getenv("SOURCE_PASSWORD", cfg.source_password)
        cfg.source_database = os.getenv("SOURCE_DATABASE", cfg.source_database)
        cfg.source_table    = os.getenv("PG_TABLE",        cfg.source_table)

        # Paths
        cfg.checkpoint_db   = os.getenv("CHECKPOINT_DB",   cfg.checkpoint_db)

        return cfg
    """================= End method from_env ================="""

"""================= End class RAGConfig ================="""
```

- Added `"gemini"` to `LLMBackend` Literal
- New `GeminiConfig` dataclass (api_key, model=`gemini-2.0-flash`, timeout=30)
- Added `gemini: GeminiConfig` field to `RAGConfig`
- `from_env()` reads `GEMINI_API_KEY` and `GEMINI_MODEL` from environment

#### [llm_client.py](file:///c:/Users/SKY%20WALKER/OneDrive/Desktop/Srcom/voice-ai-core/SahilRagSystem/haup/rag_core/llm_client.py)

```diff:llm_client.py
"""
File Summary:
Unified LLM client abstraction layer for RAG system.
Provides a common interface for multiple LLM backends (Ollama, OpenAI, Anthropic)
with retry logic, streaming support, logging, and observability.

====================================================================
SYSTEM PIPELINE FLOW (Architecture + Object Interaction)
====================================================================

build_llm_client(cfg)
||
├── Select backend from config ------------------------> "ollama" | "openai" | "anthropic"
│
├── OllamaClient()     [Class → Object] ---------------> Local LLM (default, zero cost)
├── OpenAIClient()     [Class → Object] ---------------> Cloud LLM (fallback)
└── AnthropicClient()  [Class → Object] ---------------> Claude LLM (fallback)

====================================================================

BaseLLMClient (Abstract Layer)
||
├── chat()  [Function] --------------------------------> Main entry point
│       │
│       ├── _chat_with_retry() ------------------------> Non-streaming execution
│       │       │
│       │       ├── _chat_raw() (backend impl) --------> Actual API call
│       │       ├── Retry loop ------------------------> Exponential backoff
│       │       └── log_llm_call() --------------------> Observability logging
│       │
│       └── _stream_with_logging() --------------------> Streaming execution
│               │
│               ├── _stream_raw() ---------------------> Token streaming
│               ├── Token estimation ------------------> Approx token count
│               └── log_llm_call() --------------------> Final logging
│
├── complete()  [Function] ----------------------------> Wrapper over chat()
│
├── health_check()  [Abstract] ------------------------> Backend availability check
│
└── _chat_raw()  [Abstract] ---------------------------> Must be implemented by backend

====================================================================

OllamaClient (Local Backend)
||
├── health_check() -----------------------------------> Check /api/tags endpoint
│
├── _chat_raw() --------------------------------------> POST /api/chat (non-stream)
│       │
│       ├── Build JSON payload
│       ├── Send HTTP request
│       └── Parse response → content + token counts
│
└── _stream_raw() ------------------------------------> Streaming response
        │
        ├── Iterate line-by-line response
        ├── Extract token chunks
        └── Yield tokens

====================================================================

OpenAIClient (Cloud Backend)
||
├── health_check() -----------------------------------> models.list()
│
├── _chat_raw() --------------------------------------> chat.completions.create()
│       │
│       ├── Send request
│       ├── Extract response text
│       └── Extract token usage
│
└── _stream_raw() ------------------------------------> Streaming chunks
        │
        └── Yield delta tokens

====================================================================

AnthropicClient (Claude Backend)
||
├── health_check() -----------------------------------> models.list()
│
└── _chat_raw() --------------------------------------> messages.create()
        │
        ├── Separate system prompt
        ├── Build message structure
        ├── Execute request
        └── Extract content + token usage

====================================================================

KEY DESIGN FEATURES
====================================================================

• Unified interface across all LLM providers
• Retry with exponential backoff (robustness)
• Streaming + non-streaming support
• Token usage tracking (observability)
• Backend-agnostic architecture
• Factory pattern for clean initialization

====================================================================
FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Generator, Iterator, List, Optional, Union

from rag_core import logger as log
from rag_core.config import RAGConfig


# ─── Message schema ───────────────────────────────────────────────────────────

@dataclass
class Message:
    role: str   # "system" | "user" | "assistant"
    content: str



# ─── Abstract base ────────────────────────────────────────────────────────────

class BaseLLMClient(ABC):
    """
    All concrete clients inherit from here.
    They must implement _chat_raw and optionally _stream_raw.
    """

    _MAX_RETRIES = 3
    _RETRY_BASE  = 1.5   # seconds, doubles per retry

    def __init__(self, model: str):
        self.model = model
        self._log = log.get("llm")

    # ── Public helpers ─────────────────────────────────────────────────────


    def chat(
        self,
        messages: List[Message],
        *,
        max_tokens: int = 1024,
        temperature: float = 0.2,
        stream: bool = False,
        session_id: str = "",

    ) -> Union[str, Iterator[str]]:
        if stream:
            return self._stream_with_logging(messages, max_tokens, temperature, session_id)
        return self._chat_with_retry(messages, max_tokens, temperature, session_id)

    def complete(
        self,
        prompt: str,
        *,
        max_tokens: int = 256,
        temperature: float = 0.3,

    ) -> str:
        return self._chat_with_retry(
            [Message(role="user", content=prompt)],
            max_tokens,
            temperature,
            session_id="",
        )

    @abstractmethod
    def health_check(self) -> bool: ...

    # ── Retry wrapper ──────────────────────────────────────────────────────


    def _chat_with_retry(
        self,
        messages: List[Message],
        max_tokens: int,
        temperature: float,
        session_id: str,

    ) -> str:
        t0 = time.perf_counter()
        last_exc: Optional[Exception] = None

        for attempt in range(self._MAX_RETRIES):
            try:
                content, pt, ct = self._chat_raw(messages, max_tokens, temperature)
                latency_ms = (time.perf_counter() - t0) * 1000
                log.log_llm_call(session_id, self.__class__.__name__, self.model,
                                 latency_ms, pt, ct)
                return content
            except Exception as exc:
                last_exc = exc
                wait = self._RETRY_BASE * (2 ** attempt)
                self._log.warning("LLM attempt %d failed: %s — retry in %.1fs", attempt + 1, exc, wait)
                time.sleep(wait)

        raise RuntimeError(f"LLM call failed after {self._MAX_RETRIES} retries: {last_exc}") from last_exc

    def _stream_with_logging(
        self,
        messages: List[Message],
        max_tokens: int,
        temperature: float,
        session_id: str,

    ) -> Iterator[str]:
        t0 = time.perf_counter()
        tokens = 0
        try:
            for chunk in self._stream_raw(messages, max_tokens, temperature):
                tokens += len(chunk) // 4
                yield chunk
        finally:
            latency_ms = (time.perf_counter() - t0) * 1000
            prompt_tokens = sum(len(m.content) for m in messages) // 4
            log.log_llm_call(session_id, self.__class__.__name__, self.model,
                             latency_ms, prompt_tokens, tokens)

    # ── To be implemented ──────────────────────────────────────────────────

    @abstractmethod
    def _chat_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> tuple[str, int, int]:
        """Returns (content, prompt_tokens, completion_tokens)."""
        ...

    def _stream_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> Iterator[str]:
        """Default: fall back to non-streaming."""
        content, _, _ = self._chat_raw(messages, max_tokens, temperature)
        yield content



# ─── Ollama backend ───────────────────────────────────────────────────────────

class OllamaClient(BaseLLMClient):
    """
    Uses Ollama's /api/chat endpoint (OpenAI-compatible format available too,
    but native gives keep_alive and better error messages).
    """

    def __init__(self, base_url: str, model: str, timeout: int, keep_alive: str):
        super().__init__(model)
        self._base = base_url.rstrip("/")
        self._timeout = timeout
        self._keep_alive = keep_alive


    def health_check(self) -> bool:
        try:
            import urllib.request
            urllib.request.urlopen(f"{self._base}/api/tags", timeout=5)
            return True
        except Exception:
            return False


    def _chat_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> tuple[str, int, int]:
        import json as _json, urllib.request as _req

        payload = _json.dumps({
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
            "keep_alive": self._keep_alive,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
            },
        }).encode()

        req = _req.Request(
            f"{self._base}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with _req.urlopen(req, timeout=self._timeout) as resp:
            data = _json.loads(resp.read())

        content = data["message"]["content"]
        pt = data.get("prompt_eval_count", len(payload) // 4)
        ct = data.get("eval_count", len(content) // 4)
        return content, pt, ct

    def _stream_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> Iterator[str]:
        import json as _json, urllib.request as _req

        payload = _json.dumps({
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": True,
            "keep_alive": self._keep_alive,
            "options": {"num_predict": max_tokens, "temperature": temperature},
        }).encode()

        req = _req.Request(
            f"{self._base}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with _req.urlopen(req, timeout=self._timeout) as resp:
            for line in resp:
                if not line.strip():
                    continue
                chunk = _json.loads(line)
                token = chunk.get("message", {}).get("content", "")
                if token:
                    yield token
                if chunk.get("done"):
                    break



# ─── OpenAI backend ───────────────────────────────────────────────────────────

class OpenAIClient(BaseLLMClient):

    def __init__(self, api_key: str, model: str, base_url: Optional[str], timeout: int):
        super().__init__(model)
        try:
            from openai import OpenAI  # type: ignore
            self._client = OpenAI(
                api_key=api_key or None,
                base_url=base_url,
                timeout=timeout,
            )
        except ImportError:
            raise ImportError("openai package not installed. Run: pip install openai")


    def health_check(self) -> bool:
        try:
            self._client.models.list()
            return True
        except Exception:
            return False


    def _chat_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> tuple[str, int, int]:
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=[{"role": m.role, "content": m.content} for m in messages],  # type: ignore
            max_tokens=max_tokens,
            temperature=temperature,
        )
        content = resp.choices[0].message.content or ""
        pt = resp.usage.prompt_tokens if resp.usage else 0
        ct = resp.usage.completion_tokens if resp.usage else 0
        return content, pt, ct

    def _stream_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> Iterator[str]:
        stream = self._client.chat.completions.create(
            model=self.model,
            messages=[{"role": m.role, "content": m.content} for m in messages],  # type: ignore
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta



# ─── Anthropic backend ────────────────────────────────────────────────────────

class AnthropicClient(BaseLLMClient):

    def __init__(self, api_key: str, model: str, timeout: int):
        super().__init__(model)
        try:
            import anthropic  # type: ignore
            self._client = anthropic.Anthropic(api_key=api_key or None, timeout=timeout)
        except ImportError:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")


    def health_check(self) -> bool:
        try:
            self._client.models.list()
            return True
        except Exception:
            return False


    def _chat_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> tuple[str, int, int]:
        system_text = ""
        chat_msgs = []
        for m in messages:
            if m.role == "system":
                system_text = m.content
            else:
                chat_msgs.append({"role": m.role, "content": m.content})

        kwargs: Dict[str, Any] = dict(
            model=self.model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=chat_msgs,
        )
        if system_text:
            kwargs["system"] = system_text

        resp = self._client.messages.create(**kwargs)
        content = resp.content[0].text if resp.content else ""
        pt = resp.usage.input_tokens if resp.usage else 0
        ct = resp.usage.output_tokens if resp.usage else 0
        return content, pt, ct



# ─── Factory ──────────────────────────────────────────────────────────────────

def build_llm_client(cfg: RAGConfig) -> BaseLLMClient:
    """Instantiate the correct backend from RAGConfig."""
    backend = cfg.llm_backend
    if backend == "ollama":
        return OllamaClient(
            base_url=cfg.ollama.base_url,
            model=cfg.ollama.model,
            timeout=cfg.ollama.timeout,
            keep_alive=cfg.ollama.keep_alive,
        )
    elif backend == "openai":
        return OpenAIClient(
            api_key=cfg.openai.api_key,
            model=cfg.openai.model,
            base_url=cfg.openai.base_url,
            timeout=cfg.openai.timeout,
        )
    elif backend == "anthropic":
        return AnthropicClient(
            api_key=cfg.anthropic.api_key,
            model=cfg.anthropic.model,
            timeout=cfg.anthropic.timeout,
        )
    raise ValueError(f"Unknown LLM backend: {backend!r}")

===
"""
File Summary:
Unified LLM client abstraction layer for RAG system.
Provides a common interface for multiple LLM backends (Ollama, OpenAI, Anthropic)
with retry logic, streaming support, logging, and observability.

====================================================================
SYSTEM PIPELINE FLOW (Architecture + Object Interaction)
====================================================================

build_llm_client(cfg)
||
├── Select backend from config ------------------------> "ollama" | "openai" | "anthropic"
│
├── OllamaClient()     [Class → Object] ---------------> Local LLM (default, zero cost)
├── OpenAIClient()     [Class → Object] ---------------> Cloud LLM (fallback)
└── AnthropicClient()  [Class → Object] ---------------> Claude LLM (fallback)

====================================================================

BaseLLMClient (Abstract Layer)
||
├── chat()  [Function] --------------------------------> Main entry point
│       │
│       ├── _chat_with_retry() ------------------------> Non-streaming execution
│       │       │
│       │       ├── _chat_raw() (backend impl) --------> Actual API call
│       │       ├── Retry loop ------------------------> Exponential backoff
│       │       └── log_llm_call() --------------------> Observability logging
│       │
│       └── _stream_with_logging() --------------------> Streaming execution
│               │
│               ├── _stream_raw() ---------------------> Token streaming
│               ├── Token estimation ------------------> Approx token count
│               └── log_llm_call() --------------------> Final logging
│
├── complete()  [Function] ----------------------------> Wrapper over chat()
│
├── health_check()  [Abstract] ------------------------> Backend availability check
│
└── _chat_raw()  [Abstract] ---------------------------> Must be implemented by backend

====================================================================

OllamaClient (Local Backend)
||
├── health_check() -----------------------------------> Check /api/tags endpoint
│
├── _chat_raw() --------------------------------------> POST /api/chat (non-stream)
│       │
│       ├── Build JSON payload
│       ├── Send HTTP request
│       └── Parse response → content + token counts
│
└── _stream_raw() ------------------------------------> Streaming response
        │
        ├── Iterate line-by-line response
        ├── Extract token chunks
        └── Yield tokens

====================================================================

OpenAIClient (Cloud Backend)
||
├── health_check() -----------------------------------> models.list()
│
├── _chat_raw() --------------------------------------> chat.completions.create()
│       │
│       ├── Send request
│       ├── Extract response text
│       └── Extract token usage
│
└── _stream_raw() ------------------------------------> Streaming chunks
        │
        └── Yield delta tokens

====================================================================

AnthropicClient (Claude Backend)
||
├── health_check() -----------------------------------> models.list()
│
└── _chat_raw() --------------------------------------> messages.create()
        │
        ├── Separate system prompt
        ├── Build message structure
        ├── Execute request
        └── Extract content + token usage

====================================================================

KEY DESIGN FEATURES
====================================================================

• Unified interface across all LLM providers
• Retry with exponential backoff (robustness)
• Streaming + non-streaming support
• Token usage tracking (observability)
• Backend-agnostic architecture
• Factory pattern for clean initialization

====================================================================
FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Generator, Iterator, List, Optional, Union

from rag_core import logger as log
from rag_core.config import RAGConfig


# ─── Message schema ───────────────────────────────────────────────────────────

@dataclass
class Message:
    role: str   # "system" | "user" | "assistant"
    content: str



# ─── Abstract base ────────────────────────────────────────────────────────────

class BaseLLMClient(ABC):
    """
    All concrete clients inherit from here.
    They must implement _chat_raw and optionally _stream_raw.
    """

    _MAX_RETRIES = 3
    _RETRY_BASE  = 1.5   # seconds, doubles per retry

    def __init__(self, model: str):
        self.model = model
        self._log = log.get("llm")

    # ── Public helpers ─────────────────────────────────────────────────────


    def chat(
        self,
        messages: List[Message],
        *,
        max_tokens: int = 1024,
        temperature: float = 0.2,
        stream: bool = False,
        session_id: str = "",

    ) -> Union[str, Iterator[str]]:
        if stream:
            return self._stream_with_logging(messages, max_tokens, temperature, session_id)
        return self._chat_with_retry(messages, max_tokens, temperature, session_id)

    def complete(
        self,
        prompt: str,
        *,
        max_tokens: int = 256,
        temperature: float = 0.3,

    ) -> str:
        return self._chat_with_retry(
            [Message(role="user", content=prompt)],
            max_tokens,
            temperature,
            session_id="",
        )

    @abstractmethod
    def health_check(self) -> bool: ...

    # ── Retry wrapper ──────────────────────────────────────────────────────


    def _chat_with_retry(
        self,
        messages: List[Message],
        max_tokens: int,
        temperature: float,
        session_id: str,

    ) -> str:
        t0 = time.perf_counter()
        last_exc: Optional[Exception] = None

        for attempt in range(self._MAX_RETRIES):
            try:
                content, pt, ct = self._chat_raw(messages, max_tokens, temperature)
                latency_ms = (time.perf_counter() - t0) * 1000
                log.log_llm_call(session_id, self.__class__.__name__, self.model,
                                 latency_ms, pt, ct)
                return content
            except Exception as exc:
                last_exc = exc
                wait = self._RETRY_BASE * (2 ** attempt)
                self._log.warning("LLM attempt %d failed: %s — retry in %.1fs", attempt + 1, exc, wait)
                time.sleep(wait)

        raise RuntimeError(f"LLM call failed after {self._MAX_RETRIES} retries: {last_exc}") from last_exc

    def _stream_with_logging(
        self,
        messages: List[Message],
        max_tokens: int,
        temperature: float,
        session_id: str,

    ) -> Iterator[str]:
        t0 = time.perf_counter()
        tokens = 0
        try:
            for chunk in self._stream_raw(messages, max_tokens, temperature):
                tokens += len(chunk) // 4
                yield chunk
        finally:
            latency_ms = (time.perf_counter() - t0) * 1000
            prompt_tokens = sum(len(m.content) for m in messages) // 4
            log.log_llm_call(session_id, self.__class__.__name__, self.model,
                             latency_ms, prompt_tokens, tokens)

    # ── To be implemented ──────────────────────────────────────────────────

    @abstractmethod
    def _chat_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> tuple[str, int, int]:
        """Returns (content, prompt_tokens, completion_tokens)."""
        ...

    def _stream_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> Iterator[str]:
        """Default: fall back to non-streaming."""
        content, _, _ = self._chat_raw(messages, max_tokens, temperature)
        yield content



# ─── Ollama backend ───────────────────────────────────────────────────────────

class OllamaClient(BaseLLMClient):
    """
    Uses Ollama's /api/chat endpoint (OpenAI-compatible format available too,
    but native gives keep_alive and better error messages).
    """

    def __init__(self, base_url: str, model: str, timeout: int, keep_alive: str):
        super().__init__(model)
        self._base = base_url.rstrip("/")
        self._timeout = timeout
        self._keep_alive = keep_alive


    def health_check(self) -> bool:
        try:
            import urllib.request
            urllib.request.urlopen(f"{self._base}/api/tags", timeout=5)
            return True
        except Exception:
            return False


    def _chat_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> tuple[str, int, int]:
        import json as _json, urllib.request as _req

        payload = _json.dumps({
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
            "keep_alive": self._keep_alive,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
            },
        }).encode()

        req = _req.Request(
            f"{self._base}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with _req.urlopen(req, timeout=self._timeout) as resp:
            data = _json.loads(resp.read())

        content = data["message"]["content"]
        pt = data.get("prompt_eval_count", len(payload) // 4)
        ct = data.get("eval_count", len(content) // 4)
        return content, pt, ct

    def _stream_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> Iterator[str]:
        import json as _json, urllib.request as _req

        payload = _json.dumps({
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": True,
            "keep_alive": self._keep_alive,
            "options": {"num_predict": max_tokens, "temperature": temperature},
        }).encode()

        req = _req.Request(
            f"{self._base}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with _req.urlopen(req, timeout=self._timeout) as resp:
            for line in resp:
                if not line.strip():
                    continue
                chunk = _json.loads(line)
                token = chunk.get("message", {}).get("content", "")
                if token:
                    yield token
                if chunk.get("done"):
                    break



# ─── OpenAI backend ───────────────────────────────────────────────────────────

class OpenAIClient(BaseLLMClient):

    def __init__(self, api_key: str, model: str, base_url: Optional[str], timeout: int):
        super().__init__(model)
        try:
            from openai import OpenAI  # type: ignore
            self._client = OpenAI(
                api_key=api_key or None,
                base_url=base_url,
                timeout=timeout,
            )
        except ImportError:
            raise ImportError("openai package not installed. Run: pip install openai")


    def health_check(self) -> bool:
        try:
            self._client.models.list()
            return True
        except Exception:
            return False


    def _chat_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> tuple[str, int, int]:
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=[{"role": m.role, "content": m.content} for m in messages],  # type: ignore
            max_tokens=max_tokens,
            temperature=temperature,
        )
        content = resp.choices[0].message.content or ""
        pt = resp.usage.prompt_tokens if resp.usage else 0
        ct = resp.usage.completion_tokens if resp.usage else 0
        return content, pt, ct

    def _stream_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> Iterator[str]:
        stream = self._client.chat.completions.create(
            model=self.model,
            messages=[{"role": m.role, "content": m.content} for m in messages],  # type: ignore
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta



# ─── Anthropic backend ────────────────────────────────────────────────────────

class AnthropicClient(BaseLLMClient):

    def __init__(self, api_key: str, model: str, timeout: int):
        super().__init__(model)
        try:
            import anthropic  # type: ignore
            self._client = anthropic.Anthropic(api_key=api_key or None, timeout=timeout)
        except ImportError:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")


    def health_check(self) -> bool:
        try:
            self._client.models.list()
            return True
        except Exception:
            return False


    def _chat_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> tuple[str, int, int]:
        system_text = ""
        chat_msgs = []
        for m in messages:
            if m.role == "system":
                system_text = m.content
            else:
                chat_msgs.append({"role": m.role, "content": m.content})

        kwargs: Dict[str, Any] = dict(
            model=self.model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=chat_msgs,
        )
        if system_text:
            kwargs["system"] = system_text

        resp = self._client.messages.create(**kwargs)
        content = resp.content[0].text if resp.content else ""
        pt = resp.usage.input_tokens if resp.usage else 0
        ct = resp.usage.output_tokens if resp.usage else 0
        return content, pt, ct



# ─── Gemini backend ───────────────────────────────────────────────────────────

class GeminiClient(BaseLLMClient):
    """
    Uses the google-genai SDK (google.genai) for Gemini models.
    Matches the same SDK used by the backend's GeminiResponder.
    API key comes from GEMINI_API_KEY env var (root .env).
    """

    def __init__(self, api_key: str, model: str, timeout: int):
        super().__init__(model)
        try:
            import google.genai as genai  # type: ignore
            self._genai = genai
            self._types = genai.types
            self._client = genai.Client(api_key=api_key)
            self._timeout = timeout
        except ImportError:
            raise ImportError(
                "google-genai package not installed. "
                "Run: pip install google-genai"
            )


    def health_check(self) -> bool:
        try:
            self._client.models.generate_content(
                model=self.model,
                contents="test",
                config=self._types.GenerateContentConfig(max_output_tokens=1),
            )
            return True
        except Exception:
            return False


    def _chat_raw(
        self, messages: List[Message], max_tokens: int, temperature: float

    ) -> tuple[str, int, int]:
        # Separate system instruction from conversation messages
        system_text = ""
        contents = []
        for m in messages:
            if m.role == "system":
                system_text = m.content
            else:
                # google.genai uses "user" and "model" roles
                role = "model" if m.role == "assistant" else "user"
                contents.append(
                    self._types.Content(
                        role=role,
                        parts=[self._types.Part(text=m.content)],
                    )
                )

        config = self._types.GenerateContentConfig(
            system_instruction=system_text if system_text else None,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )

        response = self._client.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )

        content = (response.text or "").strip()
        # Token usage from response metadata
        usage = getattr(response, "usage_metadata", None)
        pt = getattr(usage, "prompt_token_count", 0) if usage else 0
        ct = getattr(usage, "candidates_token_count", len(content) // 4) if usage else 0
        return content, pt, ct



# ─── Factory ──────────────────────────────────────────────────────────────────

def build_llm_client(cfg: RAGConfig) -> BaseLLMClient:
    """Instantiate the correct backend from RAGConfig."""
    backend = cfg.llm_backend
    if backend == "ollama":
        return OllamaClient(
            base_url=cfg.ollama.base_url,
            model=cfg.ollama.model,
            timeout=cfg.ollama.timeout,
            keep_alive=cfg.ollama.keep_alive,
        )
    elif backend == "openai":
        return OpenAIClient(
            api_key=cfg.openai.api_key,
            model=cfg.openai.model,
            base_url=cfg.openai.base_url,
            timeout=cfg.openai.timeout,
        )
    elif backend == "anthropic":
        return AnthropicClient(
            api_key=cfg.anthropic.api_key,
            model=cfg.anthropic.model,
            timeout=cfg.anthropic.timeout,
        )
    elif backend == "gemini":
        return GeminiClient(
            api_key=cfg.gemini.api_key,
            model=cfg.gemini.model,
            timeout=cfg.gemini.timeout,
        )
    raise ValueError(f"Unknown LLM backend: {backend!r}")

```

- New `GeminiClient(BaseLLMClient)` using **`google.genai`** SDK (same SDK the backend's `GeminiResponder` uses)
- Uses `genai.Client(api_key=...)` + `client.models.generate_content()` with `types.Content` / `types.GenerateContentConfig`
- System instructions handled via `GenerateContentConfig.system_instruction` (matches backend pattern)
- Token usage extracted from `response.usage_metadata`
- Factory `build_llm_client()` updated with `elif backend == "gemini":` branch

#### [.env](file:///c:/Users/SKY%20WALKER/OneDrive/Desktop/Srcom/voice-ai-core/SahilRagSystem/haup/.env)

- Changed `RAG_LLM_BACKEND=gemini` (was `ollama`)
- `GEMINI_API_KEY` is **not** duplicated here — it comes from the root `.env` which is already loaded into the environment

> [!NOTE]
> Expected impact: HAUP answer generation drops from ~90s (Ollama qwen2.5:7b on CPU) to ~2s (Gemini API).

---

### 3. HAUP — Connection Pool Tuning (Task 5)

**File**: [config.py](file:///c:/Users/SKY%20WALKER/OneDrive/Desktop/Srcom/voice-ai-core/SahilRagSystem/haup/rag_core/config.py)

- `PgvectorConfig.min_connections`: 2 → 2 (unchanged, already correct)
- `PgvectorConfig.max_connections`: 10 → 8

---

### 4. HAUP — Reranker Skip Fast-Path (Task 7)

**File**: [rag_engine.py](file:///c:/Users/SKY%20WALKER/OneDrive/Desktop/Srcom/voice-ai-core/SahilRagSystem/haup/rag_core/rag_engine.py)

```diff:rag_engine.py
"""
File Summary:
Central orchestrator for the HAUP RAG engine. Coordinates the full query pipeline
from input guardrails through vector retrieval, reranking, context building, LLM
generation, output guardrails, caching, analytics, and conversation persistence.

====================================================================
SYSTEM PIPELINE FLOW (Architecture + Object Interaction)
====================================================================

RAGEngine()  [Class → Object]
||
├── __init__()  [Function] -------------------------------> Initialise all pipeline components
│       │
│       ├── log.setup() ---------------------------------> Configure structured logging
│       ├── Retriever()  [Class → Object] ----------------> pgvector vector search
│       ├── build_llm_client()  [Function] ---------------> Ollama / OpenAI / Anthropic client
│       ├── QueryRewriter()  [Class → Object] ------------> Multi-query expansion
│       ├── Reranker()  [Class → Object] -----------------> Cross-encoder reranking
│       │       └── [Exception Block] --------------------> Fall back to PassthroughReranker
│       ├── ResponseCache()  [Class → Object] ------------> SQLite-backed response cache
│       ├── ConversationManager()  [Class → Object] ------> Session and history persistence
│       ├── ContextBuilder()  [Class → Object] -----------> Format retrieved rows for prompt
│       ├── PromptBuilder()  [Class → Object] ------------> Assemble LLM message list
│       ├── Guardrails()  [Class → Object] ---------------> Input/output safety checks
│       ├── Analytics()  [Class → Object] ----------------> SQLite query event tracking
│       └── build_for_engine()  [Function] ---------------> Launch background maintenance worker
│               └── [Exception Block] --------------------> Warn and continue without bg worker
│
├── new_session()  [Function] ----------------------------> Create new conversation session
│
├── ask()  [Function] ------------------------------------> Full blocking RAG query pipeline
│       │
│       ├── Step 1: _guardrails.check_input() ------------> Validate and optionally modify query
│       │       └── [Early Exit Branch] not allowed ------> Return _blocked_response()
│       │
│       ├── Step 2: _cache.get() ------------------------> Return cached answer if hit
│       │       └── [Early Exit Branch] cache hit --------> Save to session, return RAGResponse
│       │
│       ├── Step 3: _rewriter.expand() -------------------> Generate expanded query variants
│       │
│       ├── Step 4: _retriever.retrieve() ----------------> Fetch top-k vectors from pgvector
│       │
│       ├── Step 5: _reranker.rerank() -------------------> Re-score and filter to top-n rows
│       │
│       ├── Step 6: _context_builder.build() -------------> Format rows into context string
│       │
│       ├── Step 7: _prompt_builder.build() --------------> Assemble system + history + user messages
│       │
│       ├── Step 8: _llm.chat() --------------------------> Generate answer from LLM
│       │       └── [Exception Block] --------------------> Log error, set fallback answer
│       │
│       ├── Step 9: _guardrails.check_output() -----------> Validate and optionally modify answer
│       │
│       ├── Step 10: _cache.set() + session save ---------> Persist answer and conversation turn
│       │
│       └── _record()  [Function] -----------------------> Write QueryEvent to analytics
│
├── ask_stream()  [Function] -----------------------------> Streaming RAG query pipeline
│       │
│       ├── _guardrails.check_input() --------------------> Validate input
│       │       └── [Early Exit Branch] not allowed ------> Yield [Blocked] message and return
│       │
│       ├── Expand → Retrieve → Rerank → Build -----------> Same as ask() steps 3-7
│       │
│       ├── _llm.chat(stream=True) -----------------------> Yield tokens one by one
│       │
│       └── Save cache + session + analytics -------------> Persist after stream completes
│
├── get_session_history()  [Function] -------------------> Return conversation turns for session
│       └── [Conditional Branch] session not found ------> Return None
│
├── health_check()  [Function] --------------------------> Check LLM, pgvector, reranker, cache
│
├── analytics_summary()  [Function] ---------------------> Delegate to Analytics.summary()
│
├── shutdown()  [Function] -------------------------------> Stop background worker, log shutdown
│
├── _get_or_create_session()  [Function] ----------------> Get existing or create new session
│
├── _blocked_response()  [Function] ---------------------> Build RAGResponse for blocked queries
│
└── _record()  [Function] -------------------------------> Record QueryEvent to Analytics

====================================================================
FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, Iterator, List, Optional

from rag_core import logger as log
from rag_core.analytics import Analytics, QueryEvent
from rag_core.background_worker import BackgroundWorker, build_for_engine
from rag_core.cache import ResponseCache
from rag_core.config import GuardrailsConfig, RAGConfig
from rag_core.context_builder import ContextBuilder, build_schema_summary
from rag_core.conversation_manager import ConversationManager, Session
from rag_core.guardrails import Guardrails
from rag_core.llm_client import BaseLLMClient, build_llm_client
from rag_core.prompt_builder import PromptBuilder
from rag_core.query_rewriter import QueryRewriter
from rag_core.reranker import PassthroughReranker, Reranker
from rag_core.retriever import RetrievalResult, Retriever


"""================= Startup class RAGResponse ================="""
@dataclass
class RAGResponse:
    answer:              str
    session_id:          str
    citations:           List[Dict]
    retrieved_rows:      int
    latency_ms:          float
    cache_hit:           bool
    expanded_queries:    List[str]
    source_db_available: bool
    reranked:            bool       = False
    guard_warnings:      List[str]  = field(default_factory=list)
    metadata:            Dict       = field(default_factory=dict)
"""================= End class RAGResponse ================="""


"""================= Startup class RAGEngine ================="""
class RAGEngine:
    """
    Production RAG engine for HAUP v2.0.

    Quickstart:
        cfg = RAGConfig.from_env()
        engine = RAGEngine(cfg)
        sid = engine.new_session()
        response = engine.ask("find active users from India", sid)
        print(response.answer)
    """

    """================= Startup method __init__ ================="""
    def __init__(self, cfg: RAGConfig):
        self._cfg = cfg
        self._log = log.get("engine")

        log.setup(
            level              = cfg.observability.log_level,
            log_queries        = cfg.observability.log_queries,
            log_retrieved_rows = cfg.observability.log_retrieved_rows,
            log_llm_prompts    = cfg.observability.log_llm_prompts,
            trace_file         = cfg.observability.trace_file,
        )

        self._log.info("Initialising RAG engine (backend=%s)", cfg.llm_backend)
        t0 = time.perf_counter()

        self._retriever      = Retriever(cfg)
        self._llm: BaseLLMClient = build_llm_client(cfg)
        self._rewriter       = QueryRewriter(
            llm_client     = None,
            max_variations = cfg.retrieval.expansion_variations,
        )

        try:
            self._reranker: Reranker = Reranker(top_n=cfg.retrieval.rerank_top_n, enabled=True)
        except Exception:
            self._log.warning("Reranker unavailable, using passthrough")
            self._reranker = PassthroughReranker(top_n=cfg.retrieval.rerank_top_n)

        self._cache        = ResponseCache(cfg.cache, db_path=cfg.session_db)
        self._conversation = ConversationManager(cfg.conversation, db_path=cfg.session_db)

        schema_summary        = build_schema_summary(cfg.checkpoint_db)
        self._context_builder = ContextBuilder(cfg.context)
        self._prompt_builder  = PromptBuilder(schema_summary)
        self._guardrails      = Guardrails(GuardrailsConfig())
        self._analytics       = Analytics(
            db_path=cfg.session_db.replace(".db", "_analytics.db")
        )

        self._bg_worker: Optional[BackgroundWorker] = None
        try:
            self._bg_worker = build_for_engine(self)
        except Exception as exc:
            self._log.warning("Background worker failed: %s", exc)

        elapsed = (time.perf_counter() - t0) * 1000
        self._log.info(
            "RAG engine ready %.0fms | reranker=%s | backend=%s",
            elapsed,
            "cross-encoder" if self._reranker.is_available() else "passthrough",
            cfg.llm_backend,
        )
    """================= End method __init__ ================="""

    """================= Startup method new_session ================="""
    def new_session(self, metadata: Optional[Dict] = None) -> str:
        return self._conversation.new_session(metadata).session_id
    """================= End method new_session ================="""

    """================= Startup method ask ================="""
    def ask(
        self,
        question:   str,
        session_id: Optional[str] = None,
        *,
        use_cache:  bool = True,
    ) -> RAGResponse:
        t0             = time.perf_counter()
        guard_warnings: List[str]    = []
        error:          Optional[str] = None

        session = self._get_or_create_session(session_id)
        sid     = session.session_id

        # Step 1: Input guard
        guard_in = self._guardrails.check_input(question, session_id=sid)
        if not guard_in.allowed:
            return self._blocked_response(guard_in.block_reason or "Blocked", sid, t0)
        guard_warnings.extend(guard_in.warnings)
        effective_query = guard_in.modified_query or question

        # Step 2: Cache
        if use_cache:
            cached = self._cache.get(effective_query, session_id=sid)
            if cached is not None:
                session.add_user(question)
                session.add_assistant(cached)
                self._conversation.save(session)
                resp = RAGResponse(
                    answer               = cached,
                    session_id           = sid,
                    citations            = [],
                    retrieved_rows       = 0,
                    latency_ms           = (time.perf_counter() - t0) * 1000,
                    cache_hit            = True,
                    expanded_queries     = [question],
                    source_db_available  = False,
                    guard_warnings       = guard_warnings,
                )
                self._record(resp, question, sid, None)
                return resp

        # Step 3: Query expansion
        expanded = (self._rewriter.expand(effective_query)
                    if self._cfg.retrieval.enable_query_expansion
                    else [effective_query])
        log.log_query(sid, question, expanded)

        # Step 4: Retrieval
        retrieval: RetrievalResult = self._retriever.retrieve(expanded, session_id=sid)

        # Step 5: Reranking
        reranked_rows = self._reranker.rerank(query=effective_query, rows=retrieval.rows)
        did_rerank    = self._reranker.is_available() and bool(retrieval.rows)

        # Step 6: Context building
        context, citations = self._context_builder.build(reranked_rows)
        has_results        = bool(reranked_rows)

        # Step 7: Prompt assembly
        history  = session.to_messages(self._cfg.conversation.max_history_turns)
        messages = self._prompt_builder.build(
            question    = effective_query,
            context     = context,
            history     = history,
            has_results = has_results,
        )

        # Step 8: LLM call
        try:
            answer = self._llm.chat(
                messages, max_tokens=1024, temperature=0.2, session_id=sid,
            )
        except Exception as exc:
            error  = str(exc)
            log.log_error(sid, "llm_call", error)
            answer = f"Error generating response: {exc}"

        # Step 9: Output guard
        if not error:
            guard_out = self._guardrails.check_output(
                answer, [r.document for r in reranked_rows], session_id=sid,
            )
            guard_warnings.extend(guard_out.warnings)
            if guard_out.modified_response:
                answer = guard_out.modified_response

        # Step 10: Cache + persist
        if not error:
            self._cache.set(effective_query, answer)
        session.add_user(question)
        session.add_assistant(answer, citations=citations)
        self._conversation.save(session)

        resp = RAGResponse(
            answer               = str(answer),
            session_id           = sid,
            citations            = citations,
            retrieved_rows       = len(reranked_rows),
            latency_ms           = (time.perf_counter() - t0) * 1000,
            cache_hit            = False,
            expanded_queries     = expanded,
            source_db_available  = retrieval.source_db_available,
            reranked             = did_rerank,
            guard_warnings       = guard_warnings,
        )
        self._record(resp, question, sid, error)
        return resp
    """================= End method ask ================="""

    """================= Startup method ask_stream ================="""
    def ask_stream(
        self,
        question:   str,
        session_id: Optional[str] = None,
    ) -> Iterator[str]:
        t0      = time.perf_counter()
        session = self._get_or_create_session(session_id)
        sid     = session.session_id

        guard_in = self._guardrails.check_input(question, session_id=sid)
        if not guard_in.allowed:
            yield f"[Blocked: {guard_in.block_reason}]"
            return

        effective_query = guard_in.modified_query or question
        expanded = (self._rewriter.expand(effective_query)
                    if self._cfg.retrieval.enable_query_expansion
                    else [effective_query])
        log.log_query(sid, question, expanded)

        retrieval     = self._retriever.retrieve(expanded, session_id=sid)
        reranked_rows = self._reranker.rerank(effective_query, retrieval.rows)
        context, citations = self._context_builder.build(reranked_rows)
        history  = session.to_messages(self._cfg.conversation.max_history_turns)
        messages = self._prompt_builder.build(
            question    = effective_query,
            context     = context,
            history     = history,
            has_results = bool(reranked_rows),
        )

        full_answer: List[str] = []
        for token in self._llm.chat(
            messages, max_tokens=1024, temperature=0.2, stream=True, session_id=sid,
        ):
            full_answer.append(token)
            yield token

        answer = "".join(full_answer)
        self._cache.set(effective_query, answer)
        session.add_user(question)
        session.add_assistant(answer, citations=citations)
        self._conversation.save(session)
        self._analytics.record(QueryEvent(
            session_id     = sid,
            query          = question,
            answer_length  = len(answer),
            retrieved_rows = len(reranked_rows),
            latency_ms     = (time.perf_counter() - t0) * 1000,
            cache_hit      = False,
            llm_backend    = self._cfg.llm_backend,
            llm_model      = self._llm.model,
        ))
    """================= End method ask_stream ================="""

    """================= Startup method get_session_history ================="""
    def get_session_history(self, session_id: str) -> Optional[List[Dict]]:
        session = self._conversation.get(session_id)
        if not session:
            return None
        return [
            {"role": t.role, "content": t.content,
             "timestamp": t.timestamp, "citations": t.citations}
            for t in session.turns
        ]
    """================= End method get_session_history ================="""

    """================= Startup method health_check ================="""
    def health_check(self) -> Dict:
        status = {
            "llm_backend":         self._cfg.llm_backend,
            "llm_model":           self._llm.model,
            "llm_healthy":         False,
            "pgvector_healthy":      False,
            "reranker_available":  self._reranker.is_available(),
            "cache_stats":         self._cache.stats(),
        }
        try:
            status["llm_healthy"] = self._llm.health_check()
        except Exception as e:
            status["llm_error"] = str(e)
        try:
            conn = self._retriever._pool.getconn()
            try:
                cur = conn.cursor()
                cur.execute(f"SELECT COUNT(*) FROM {self._retriever._table}")
                n = cur.fetchone()[0]
                cur.close()
            finally:
                self._retriever._pool.putconn(conn)
            status["pgvector_healthy"] = True
            status["vector_count"] = n
        except Exception as e:
            status["pgvector_error"] = str(e)
        if self._bg_worker:
            status["background_jobs"] = self._bg_worker.status()
        return status
    """================= End method health_check ================="""

    """================= Startup method analytics_summary ================="""
    def analytics_summary(self, hours: int = 24) -> Dict:
        return self._analytics.summary(last_n_hours=hours)
    """================= End method analytics_summary ================="""

    """================= Startup method shutdown ================="""
    def shutdown(self) -> None:
        if self._bg_worker:
            self._bg_worker.stop()
        self._log.info("RAG engine shut down")
    """================= End method shutdown ================="""

    """================= Startup method _get_or_create_session ================="""
    def _get_or_create_session(self, session_id: Optional[str]) -> Session:
        if session_id:
            session = self._conversation.get(session_id)
            if session:
                return session
        return self._conversation.new_session()
    """================= End method _get_or_create_session ================="""

    """================= Startup method _blocked_response ================="""
    def _blocked_response(self, reason: str, session_id: str, t0: float) -> RAGResponse:
        return RAGResponse(
            answer               = f"Your request could not be processed: {reason}.",
            session_id           = session_id,
            citations            = [],
            retrieved_rows       = 0,
            latency_ms           = (time.perf_counter() - t0) * 1000,
            cache_hit            = False,
            expanded_queries     = [],
            source_db_available  = False,
            guard_warnings       = [reason],
        )
    """================= End method _blocked_response ================="""

    """================= Startup method _record ================="""
    def _record(self, resp: RAGResponse, question: str, sid: str, error: Optional[str]) -> None:
        self._analytics.record(QueryEvent(
            session_id     = sid,
            query          = question,
            answer_length  = len(resp.answer),
            retrieved_rows = resp.retrieved_rows,
            latency_ms     = resp.latency_ms,
            cache_hit      = resp.cache_hit,
            llm_backend    = self._cfg.llm_backend,
            llm_model      = self._llm.model,
            error          = error,
            warnings       = resp.guard_warnings or None,
        ))
    """================= End method _record ================="""

"""================= End class RAGEngine ================="""
===
"""
File Summary:
Central orchestrator for the HAUP RAG engine. Coordinates the full query pipeline
from input guardrails through vector retrieval, reranking, context building, LLM
generation, output guardrails, caching, analytics, and conversation persistence.

====================================================================
SYSTEM PIPELINE FLOW (Architecture + Object Interaction)
====================================================================

RAGEngine()  [Class → Object]
||
├── __init__()  [Function] -------------------------------> Initialise all pipeline components
│       │
│       ├── log.setup() ---------------------------------> Configure structured logging
│       ├── Retriever()  [Class → Object] ----------------> pgvector vector search
│       ├── build_llm_client()  [Function] ---------------> Ollama / OpenAI / Anthropic client
│       ├── QueryRewriter()  [Class → Object] ------------> Multi-query expansion
│       ├── Reranker()  [Class → Object] -----------------> Cross-encoder reranking
│       │       └── [Exception Block] --------------------> Fall back to PassthroughReranker
│       ├── ResponseCache()  [Class → Object] ------------> SQLite-backed response cache
│       ├── ConversationManager()  [Class → Object] ------> Session and history persistence
│       ├── ContextBuilder()  [Class → Object] -----------> Format retrieved rows for prompt
│       ├── PromptBuilder()  [Class → Object] ------------> Assemble LLM message list
│       ├── Guardrails()  [Class → Object] ---------------> Input/output safety checks
│       ├── Analytics()  [Class → Object] ----------------> SQLite query event tracking
│       └── build_for_engine()  [Function] ---------------> Launch background maintenance worker
│               └── [Exception Block] --------------------> Warn and continue without bg worker
│
├── new_session()  [Function] ----------------------------> Create new conversation session
│
├── ask()  [Function] ------------------------------------> Full blocking RAG query pipeline
│       │
│       ├── Step 1: _guardrails.check_input() ------------> Validate and optionally modify query
│       │       └── [Early Exit Branch] not allowed ------> Return _blocked_response()
│       │
│       ├── Step 2: _cache.get() ------------------------> Return cached answer if hit
│       │       └── [Early Exit Branch] cache hit --------> Save to session, return RAGResponse
│       │
│       ├── Step 3: _rewriter.expand() -------------------> Generate expanded query variants
│       │
│       ├── Step 4: _retriever.retrieve() ----------------> Fetch top-k vectors from pgvector
│       │
│       ├── Step 5: _reranker.rerank() -------------------> Re-score and filter to top-n rows
│       │
│       ├── Step 6: _context_builder.build() -------------> Format rows into context string
│       │
│       ├── Step 7: _prompt_builder.build() --------------> Assemble system + history + user messages
│       │
│       ├── Step 8: _llm.chat() --------------------------> Generate answer from LLM
│       │       └── [Exception Block] --------------------> Log error, set fallback answer
│       │
│       ├── Step 9: _guardrails.check_output() -----------> Validate and optionally modify answer
│       │
│       ├── Step 10: _cache.set() + session save ---------> Persist answer and conversation turn
│       │
│       └── _record()  [Function] -----------------------> Write QueryEvent to analytics
│
├── ask_stream()  [Function] -----------------------------> Streaming RAG query pipeline
│       │
│       ├── _guardrails.check_input() --------------------> Validate input
│       │       └── [Early Exit Branch] not allowed ------> Yield [Blocked] message and return
│       │
│       ├── Expand → Retrieve → Rerank → Build -----------> Same as ask() steps 3-7
│       │
│       ├── _llm.chat(stream=True) -----------------------> Yield tokens one by one
│       │
│       └── Save cache + session + analytics -------------> Persist after stream completes
│
├── get_session_history()  [Function] -------------------> Return conversation turns for session
│       └── [Conditional Branch] session not found ------> Return None
│
├── health_check()  [Function] --------------------------> Check LLM, pgvector, reranker, cache
│
├── analytics_summary()  [Function] ---------------------> Delegate to Analytics.summary()
│
├── shutdown()  [Function] -------------------------------> Stop background worker, log shutdown
│
├── _get_or_create_session()  [Function] ----------------> Get existing or create new session
│
├── _blocked_response()  [Function] ---------------------> Build RAGResponse for blocked queries
│
└── _record()  [Function] -------------------------------> Record QueryEvent to Analytics

====================================================================
FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, Iterator, List, Optional

from rag_core import logger as log
from rag_core.analytics import Analytics, QueryEvent
from rag_core.background_worker import BackgroundWorker, build_for_engine
from rag_core.cache import ResponseCache
from rag_core.config import GuardrailsConfig, RAGConfig
from rag_core.context_builder import ContextBuilder, build_schema_summary
from rag_core.conversation_manager import ConversationManager, Session
from rag_core.guardrails import Guardrails
from rag_core.llm_client import BaseLLMClient, build_llm_client
from rag_core.prompt_builder import PromptBuilder
from rag_core.query_rewriter import QueryRewriter
from rag_core.reranker import PassthroughReranker, Reranker
from rag_core.retriever import RetrievalResult, Retriever


"""================= Startup class RAGResponse ================="""
@dataclass
class RAGResponse:
    answer:              str
    session_id:          str
    citations:           List[Dict]
    retrieved_rows:      int
    latency_ms:          float
    cache_hit:           bool
    expanded_queries:    List[str]
    source_db_available: bool
    reranked:            bool       = False
    guard_warnings:      List[str]  = field(default_factory=list)
    metadata:            Dict       = field(default_factory=dict)
"""================= End class RAGResponse ================="""


"""================= Startup class RAGEngine ================="""
class RAGEngine:
    """
    Production RAG engine for HAUP v2.0.

    Quickstart:
        cfg = RAGConfig.from_env()
        engine = RAGEngine(cfg)
        sid = engine.new_session()
        response = engine.ask("find active users from India", sid)
        print(response.answer)
    """

    """================= Startup method __init__ ================="""
    def __init__(self, cfg: RAGConfig):
        self._cfg = cfg
        self._log = log.get("engine")

        log.setup(
            level              = cfg.observability.log_level,
            log_queries        = cfg.observability.log_queries,
            log_retrieved_rows = cfg.observability.log_retrieved_rows,
            log_llm_prompts    = cfg.observability.log_llm_prompts,
            trace_file         = cfg.observability.trace_file,
        )

        self._log.info("Initialising RAG engine (backend=%s)", cfg.llm_backend)
        t0 = time.perf_counter()

        self._retriever      = Retriever(cfg)
        self._llm: BaseLLMClient = build_llm_client(cfg)
        self._rewriter       = QueryRewriter(
            llm_client     = None,
            max_variations = cfg.retrieval.expansion_variations,
        )

        try:
            self._reranker: Reranker = Reranker(top_n=cfg.retrieval.rerank_top_n, enabled=True)
        except Exception:
            self._log.warning("Reranker unavailable, using passthrough")
            self._reranker = PassthroughReranker(top_n=cfg.retrieval.rerank_top_n)

        self._cache        = ResponseCache(cfg.cache, db_path=cfg.session_db)
        self._conversation = ConversationManager(cfg.conversation, db_path=cfg.session_db)

        schema_summary        = build_schema_summary(cfg.checkpoint_db)
        self._context_builder = ContextBuilder(cfg.context)
        self._prompt_builder  = PromptBuilder(schema_summary)
        self._guardrails      = Guardrails(GuardrailsConfig())
        self._analytics       = Analytics(
            db_path=cfg.session_db.replace(".db", "_analytics.db")
        )

        self._bg_worker: Optional[BackgroundWorker] = None
        try:
            self._bg_worker = build_for_engine(self)
        except Exception as exc:
            self._log.warning("Background worker failed: %s", exc)

        elapsed = (time.perf_counter() - t0) * 1000
        self._log.info(
            "RAG engine ready %.0fms | reranker=%s | backend=%s",
            elapsed,
            "cross-encoder" if self._reranker.is_available() else "passthrough",
            cfg.llm_backend,
        )
    """================= End method __init__ ================="""

    """================= Startup method new_session ================="""
    def new_session(self, metadata: Optional[Dict] = None) -> str:
        return self._conversation.new_session(metadata).session_id
    """================= End method new_session ================="""

    """================= Startup method ask ================="""
    def ask(
        self,
        question:   str,
        session_id: Optional[str] = None,
        *,
        use_cache:  bool = True,
    ) -> RAGResponse:
        t0             = time.perf_counter()
        guard_warnings: List[str]    = []
        error:          Optional[str] = None

        session = self._get_or_create_session(session_id)
        sid     = session.session_id

        # Step 1: Input guard
        guard_in = self._guardrails.check_input(question, session_id=sid)
        if not guard_in.allowed:
            return self._blocked_response(guard_in.block_reason or "Blocked", sid, t0)
        guard_warnings.extend(guard_in.warnings)
        effective_query = guard_in.modified_query or question

        # Step 2: Cache
        if use_cache:
            cached = self._cache.get(effective_query, session_id=sid)
            if cached is not None:
                session.add_user(question)
                session.add_assistant(cached)
                self._conversation.save(session)
                resp = RAGResponse(
                    answer               = cached,
                    session_id           = sid,
                    citations            = [],
                    retrieved_rows       = 0,
                    latency_ms           = (time.perf_counter() - t0) * 1000,
                    cache_hit            = True,
                    expanded_queries     = [question],
                    source_db_available  = False,
                    guard_warnings       = guard_warnings,
                )
                self._record(resp, question, sid, None)
                return resp

        # Step 3: Query expansion
        expanded = (self._rewriter.expand(effective_query)
                    if self._cfg.retrieval.enable_query_expansion
                    else [effective_query])
        log.log_query(sid, question, expanded)

        # Step 4: Retrieval
        retrieval: RetrievalResult = self._retriever.retrieve(expanded, session_id=sid)

        # Step 5: Reranking (skip for tiny result sets — cross-encoder costs ~200ms even for 1-2 rows)
        if len(retrieval.rows) <= 2:
            reranked_rows = retrieval.rows
            did_rerank    = False
        else:
            reranked_rows = self._reranker.rerank(query=effective_query, rows=retrieval.rows)
            did_rerank    = self._reranker.is_available() and bool(retrieval.rows)

        # Step 6: Context building
        context, citations = self._context_builder.build(reranked_rows)
        has_results        = bool(reranked_rows)

        # Step 7: Prompt assembly
        history  = session.to_messages(self._cfg.conversation.max_history_turns)
        messages = self._prompt_builder.build(
            question    = effective_query,
            context     = context,
            history     = history,
            has_results = has_results,
        )

        # Step 8: LLM call
        try:
            answer = self._llm.chat(
                messages, max_tokens=1024, temperature=0.2, session_id=sid,
            )
        except Exception as exc:
            error  = str(exc)
            log.log_error(sid, "llm_call", error)
            answer = f"Error generating response: {exc}"

        # Step 9: Output guard
        if not error:
            guard_out = self._guardrails.check_output(
                answer, [r.document for r in reranked_rows], session_id=sid,
            )
            guard_warnings.extend(guard_out.warnings)
            if guard_out.modified_response:
                answer = guard_out.modified_response

        # Step 10: Cache + persist
        if not error:
            self._cache.set(effective_query, answer)
        session.add_user(question)
        session.add_assistant(answer, citations=citations)
        self._conversation.save(session)

        resp = RAGResponse(
            answer               = str(answer),
            session_id           = sid,
            citations            = citations,
            retrieved_rows       = len(reranked_rows),
            latency_ms           = (time.perf_counter() - t0) * 1000,
            cache_hit            = False,
            expanded_queries     = expanded,
            source_db_available  = retrieval.source_db_available,
            reranked             = did_rerank,
            guard_warnings       = guard_warnings,
        )
        self._record(resp, question, sid, error)
        return resp
    """================= End method ask ================="""

    """================= Startup method ask_stream ================="""
    def ask_stream(
        self,
        question:   str,
        session_id: Optional[str] = None,
    ) -> Iterator[str]:
        t0      = time.perf_counter()
        session = self._get_or_create_session(session_id)
        sid     = session.session_id

        guard_in = self._guardrails.check_input(question, session_id=sid)
        if not guard_in.allowed:
            yield f"[Blocked: {guard_in.block_reason}]"
            return

        effective_query = guard_in.modified_query or question
        expanded = (self._rewriter.expand(effective_query)
                    if self._cfg.retrieval.enable_query_expansion
                    else [effective_query])
        log.log_query(sid, question, expanded)

        retrieval     = self._retriever.retrieve(expanded, session_id=sid)
        if len(retrieval.rows) <= 2:
            reranked_rows = retrieval.rows
        else:
            reranked_rows = self._reranker.rerank(effective_query, retrieval.rows)
        context, citations = self._context_builder.build(reranked_rows)
        history  = session.to_messages(self._cfg.conversation.max_history_turns)
        messages = self._prompt_builder.build(
            question    = effective_query,
            context     = context,
            history     = history,
            has_results = bool(reranked_rows),
        )

        full_answer: List[str] = []
        for token in self._llm.chat(
            messages, max_tokens=1024, temperature=0.2, stream=True, session_id=sid,
        ):
            full_answer.append(token)
            yield token

        answer = "".join(full_answer)
        self._cache.set(effective_query, answer)
        session.add_user(question)
        session.add_assistant(answer, citations=citations)
        self._conversation.save(session)
        self._analytics.record(QueryEvent(
            session_id     = sid,
            query          = question,
            answer_length  = len(answer),
            retrieved_rows = len(reranked_rows),
            latency_ms     = (time.perf_counter() - t0) * 1000,
            cache_hit      = False,
            llm_backend    = self._cfg.llm_backend,
            llm_model      = self._llm.model,
        ))
    """================= End method ask_stream ================="""

    """================= Startup method get_session_history ================="""
    def get_session_history(self, session_id: str) -> Optional[List[Dict]]:
        session = self._conversation.get(session_id)
        if not session:
            return None
        return [
            {"role": t.role, "content": t.content,
             "timestamp": t.timestamp, "citations": t.citations}
            for t in session.turns
        ]
    """================= End method get_session_history ================="""

    """================= Startup method health_check ================="""
    def health_check(self) -> Dict:
        status = {
            "llm_backend":         self._cfg.llm_backend,
            "llm_model":           self._llm.model,
            "llm_healthy":         False,
            "pgvector_healthy":      False,
            "reranker_available":  self._reranker.is_available(),
            "cache_stats":         self._cache.stats(),
        }
        try:
            status["llm_healthy"] = self._llm.health_check()
        except Exception as e:
            status["llm_error"] = str(e)
        try:
            conn = self._retriever._pool.getconn()
            try:
                cur = conn.cursor()
                cur.execute(f"SELECT COUNT(*) FROM {self._retriever._table}")
                n = cur.fetchone()[0]
                cur.close()
            finally:
                self._retriever._pool.putconn(conn)
            status["pgvector_healthy"] = True
            status["vector_count"] = n
        except Exception as e:
            status["pgvector_error"] = str(e)
        if self._bg_worker:
            status["background_jobs"] = self._bg_worker.status()
        return status
    """================= End method health_check ================="""

    """================= Startup method analytics_summary ================="""
    def analytics_summary(self, hours: int = 24) -> Dict:
        return self._analytics.summary(last_n_hours=hours)
    """================= End method analytics_summary ================="""

    """================= Startup method shutdown ================="""
    def shutdown(self) -> None:
        if self._bg_worker:
            self._bg_worker.stop()
        self._log.info("RAG engine shut down")
    """================= End method shutdown ================="""

    """================= Startup method _get_or_create_session ================="""
    def _get_or_create_session(self, session_id: Optional[str]) -> Session:
        if session_id:
            session = self._conversation.get(session_id)
            if session:
                return session
        return self._conversation.new_session()
    """================= End method _get_or_create_session ================="""

    """================= Startup method _blocked_response ================="""
    def _blocked_response(self, reason: str, session_id: str, t0: float) -> RAGResponse:
        return RAGResponse(
            answer               = f"Your request could not be processed: {reason}.",
            session_id           = session_id,
            citations            = [],
            retrieved_rows       = 0,
            latency_ms           = (time.perf_counter() - t0) * 1000,
            cache_hit            = False,
            expanded_queries     = [],
            source_db_available  = False,
            guard_warnings       = [reason],
        )
    """================= End method _blocked_response ================="""

    """================= Startup method _record ================="""
    def _record(self, resp: RAGResponse, question: str, sid: str, error: Optional[str]) -> None:
        self._analytics.record(QueryEvent(
            session_id     = sid,
            query          = question,
            answer_length  = len(resp.answer),
            retrieved_rows = resp.retrieved_rows,
            latency_ms     = resp.latency_ms,
            cache_hit      = resp.cache_hit,
            llm_backend    = self._cfg.llm_backend,
            llm_model      = self._llm.model,
            error          = error,
            warnings       = resp.guard_warnings or None,
        ))
    """================= End method _record ================="""

"""================= End class RAGEngine ================="""
```

- In `ask()` and `ask_stream()`: if `len(retrieval.rows) <= 2`, skip the cross-encoder reranker entirely
- Saves ~200ms on CPU for small result sets (cross-encoder/ms-marco-MiniLM-L-6-v2 is expensive even for 1-2 pairs)

---

### 5. HAUP Requirements

**File**: [requirements.txt](file:///c:/Users/SKY%20WALKER/OneDrive/Desktop/Srcom/voice-ai-core/SahilRagSystem/haup/requirements.txt)

- Added `google-genai>=1.0.0` (the correct SDK matching `google.genai` used in the backend)

---

### 6. No-Ops (Verified, No Changes)

| Task | Finding |
|------|---------|
| **Task 3** — Async-native | Executor pattern in `app.py` is already correct. The three smart_rag optimizations reduce in-thread work. |
| **Task 8** — BM25 at startup | `_build_bm25_index()` already called in `Retriever.__init__()` at line 144 ✅ |

---

## Things NOT Changed

- ✅ Logging style / `progress_update()` calls in HAUP
- ✅ SQL subquery pattern for vector similarity (Neon)
- ✅ `pg_attribute` approach for column detection
- ✅ `conn.commit()` between tables (not rollback)
- ✅ `_BACKED_BY_VECTOR_STORE` expansion logic
- ✅ `haup_rag_client.py` — timeouts already tuned

## Expected Latency Improvements

| Component | Before | After | Saving |
|-----------|--------|-------|--------|
| Smart RAG — DB connect | ~300ms × 3 tables | ~5ms (pool) | **~900ms** |
| Smart RAG — pg_attribute | ~50ms × 3 tables | 0ms (cached) | **~150ms** |
| Smart RAG — embedding | ~50ms | 0ms (cache hit) | **~50ms** |
| HAUP — LLM generation | ~90s (Ollama CPU) | ~2s (Gemini API) | **~88s** |
| HAUP — reranker (≤2 rows) | ~200ms | 0ms (skipped) | **~200ms** |
