"""
File Summary:
Semantic retrieval layer using pgvector for the HAUP RAG engine.
Supports multi-query fusion with Reciprocal Rank Fusion (RRF), similarity
threshold filtering, full row reverse-lookup from source database, and
graceful degradation if the source DB is unavailable.

====================================================================
SYSTEM PIPELINE FLOW (Architecture + Object Interaction)
====================================================================

Retriever()  [Class → Object]
||
├── __init__()  [Function] -------------------------------> Load embedding model, connect pgvector, build fetcher
│       │
│       ├── SentenceTransformer()  [Class → Object] ------> Load shared embedding model
│       ├── psycopg2.pool.SimpleConnectionPool() ---------> Connect to pgvector
│       └── _build_fetcher()  [Function] -----------------> Create MySQL or SQLite source fetcher
│
└── retrieve()  [Function] -------------------------------> Main retrieval pipeline
        │
        ├── model.encode(queries) -----------------------> Embed all query strings
        │
        ├── _search_one()  [Function] × N queries -------> Per-query pgvector search
        │       │
        │       ├── SELECT ... ORDER BY embedding <=> %s -> Cosine distance search
        │       │
        │       └── [Early Exit Branch] query fails -----> Log error, return empty list
        │
        ├── _rrf_merge()  [Function] ---------------------> Reciprocal Rank Fusion across ranked lists
        │       │
        │       └── Sort by RRF score descending ---------> Merged deduplicated ranking
        │
        ├── fused[:rerank_top_n] -------------------------> Cap results at configured limit
        │
        ├── _build_rows()  [Function] --------------------> Fetch pgvector documents and metadata
        │       │
        │       ├── SELECT * WHERE id = ANY(%s) ----------> Retrieve stored document strings
        │       │
        │       └── [Early Exit Branch] get fails --------> Log error, return empty list
        │
        ├── [Conditional Branch] fetcher available ------> Full-row reverse lookup from source DB
        │       │
        │       ├── fetcher.fetch_rows(rowids) -----------> SQL SELECT by primary key
        │       │
        │       └── [Exception Block] lookup fails -------> Log warning, continue without full rows
        │
        └── Returns RetrievalResult  [Class → Object] ---> rows, latency_ms, source_db_available

====================================================================
FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from collections import Counter
import math

from sentence_transformers import SentenceTransformer
from psycopg2 import pool
from psycopg2.extras import RealDictCursor, execute_batch
import psycopg2

from rag_core import logger as log
from rag_core.config import RAGConfig


"""================= Startup class RetrievedRow ================="""
@dataclass
class RetrievedRow:
    rowid:      str
    similarity: float                           # 0-1, higher = more relevant
    document:   str                             # embedded text (template string)
    metadata:   Dict[str, Any]                  # pgvector metadata dict
    full_row:   Optional[Dict[str, Any]] = None # full DB row (if available)
    rrf_score:  float = 0.0                     # Reciprocal Rank Fusion score
"""================= End class RetrievedRow ================="""


"""================= Startup class RetrievalResult ================="""
@dataclass
class RetrievalResult:
    query:               str
    expanded_queries:    List[str]
    rows:                List[RetrievedRow]
    latency_ms:          float
    source_db_available: bool
"""================= End class RetrievalResult ================="""


"""================= Startup class Retriever ================="""
class Retriever:
    """
    Orchestrates hybrid retrieval: vector similarity + BM25 keyword search.
    Uses Reciprocal Rank Fusion to merge results.
    """

    _RRF_K = 60   # RRF constant — higher = less rank-sensitive
    
    # BM25 parameters
    _BM25_K1 = 1.5  # Term frequency saturation
    _BM25_B  = 0.75 # Length normalization

    """================= Startup method __init__ ================="""
    def __init__(self, cfg: RAGConfig):
        self._cfg = cfg
        self._log = log.get("retriever")
        self._table = cfg.pgvector.table
        # All tables to search: vector_store + any extra_tables from RAG_TABLES env
        extra = getattr(cfg.pgvector, 'extra_tables', [])
        self._search_tables = [self._table] + [t for t in extra if t != self._table]
        self._log.info("RAG search tables: %s", self._search_tables)

        self._log.info("Loading embedding model: %s", cfg.embedding_model)
        self._model = SentenceTransformer(cfg.embedding_model)

        # Connect to pgvector
        self._log.info("Connecting to pgvector: %s", cfg.pgvector.database)
        if cfg.pgvector.connection_string:
            self._pool = pool.SimpleConnectionPool(
                minconn=cfg.pgvector.min_connections,
                maxconn=cfg.pgvector.max_connections,
                dsn=cfg.pgvector.connection_string
            )
        else:
            self._pool = pool.SimpleConnectionPool(
                minconn=cfg.pgvector.min_connections,
                maxconn=cfg.pgvector.max_connections,
                host=cfg.pgvector.host,
                port=cfg.pgvector.port,
                user=cfg.pgvector.user,
                password=cfg.pgvector.password,
                database=cfg.pgvector.database,
            )

        self._fetcher = _build_fetcher(cfg)
        
        # BM25 index: built on-demand from pgvector documents
        self._bm25_index: Optional[Dict[str, Any]] = None
        self._build_bm25_index()

    """================= Startup method _build_bm25_index ================="""
    def _build_bm25_index(self):
        """Build BM25 index from all pgvector documents."""
        try:
            conn = self._pool.getconn()
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                
                # Get total count
                cur.execute(f"SELECT COUNT(*) as count FROM {self._table}")
                count = cur.fetchone()['count']
                
                if count == 0:
                    self._log.warning("pgvector table is empty, BM25 index not built")
                    return

                self._log.info("Building BM25 index from %d documents...", count)

                # Get all documents in batches
                all_docs = []
                all_ids = []
                batch_size = 1000

                for offset in range(0, count, batch_size):
                    cur.execute(
                        f"SELECT id, document FROM {self._table} ORDER BY id LIMIT %s OFFSET %s",
                        (batch_size, offset)
                    )
                    rows = cur.fetchall()
                    for row in rows:
                        all_ids.append(row['id'])
                        all_docs.append(row['document'] or "")

                # Tokenize documents
                tokenized_docs = [self._tokenize(doc) for doc in all_docs]

                # Calculate document frequencies
                doc_count = len(tokenized_docs)
                doc_freqs = Counter()
                doc_lengths = []

                for tokens in tokenized_docs:
                    doc_freqs.update(set(tokens))
                    doc_lengths.append(len(tokens))

                avg_doc_len = sum(doc_lengths) / doc_count if doc_count > 0 else 0

                # Build inverted index: term -> [(doc_idx, term_freq), ...]
                inverted_index = {}
                for doc_idx, tokens in enumerate(tokenized_docs):
                    term_freqs = Counter(tokens)
                    for term, freq in term_freqs.items():
                        if term not in inverted_index:
                            inverted_index[term] = []
                        inverted_index[term].append((doc_idx, freq))

                self._bm25_index = {
                    "doc_ids": all_ids,
                    "doc_lengths": doc_lengths,
                    "avg_doc_len": avg_doc_len,
                    "doc_count": doc_count,
                    "doc_freqs": doc_freqs,
                    "inverted_index": inverted_index,
                }

                self._log.info("BM25 index built: %d docs, %d unique terms",
                              doc_count, len(inverted_index))
                cur.close()
            finally:
                self._pool.putconn(conn)

        except Exception as exc:
            self._log.error("Failed to build BM25 index: %s", exc)
            self._bm25_index = None
    """================= End method _build_bm25_index ================="""

    """================= Startup method _tokenize ================="""
    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenization: lowercase + split on non-alphanumeric."""
        import re
        text = text.lower()
        tokens = re.findall(r'\w+', text)
        return tokens
    """================= End method _tokenize ================="""

    """================= Startup method _bm25_search ================="""
    def _bm25_search(self, query: str, top_k: int) -> List[Tuple[str, float]]:
        """BM25 keyword search returning [(rowid, score), ...]"""
        if self._bm25_index is None:
            return []

        query_tokens = self._tokenize(query)
        if not query_tokens:
            return []

        idx = self._bm25_index
        doc_count = idx["doc_count"]
        avg_doc_len = idx["avg_doc_len"]

        # Calculate BM25 scores for all documents
        scores = {}

        for term in query_tokens:
            if term not in idx["inverted_index"]:
                continue

            # IDF calculation
            df = idx["doc_freqs"][term]
            idf = math.log((doc_count - df + 0.5) / (df + 0.5) + 1.0)

            # Score each document containing this term
            for doc_idx, term_freq in idx["inverted_index"][term]:
                doc_len = idx["doc_lengths"][doc_idx]

                # BM25 formula
                numerator = term_freq * (self._BM25_K1 + 1)
                denominator = term_freq + self._BM25_K1 * (
                    1 - self._BM25_B + self._BM25_B * (doc_len / avg_doc_len)
                )

                score = idf * (numerator / denominator)

                if doc_idx not in scores:
                    scores[doc_idx] = 0.0
                scores[doc_idx] += score

        # Sort by score and return top_k
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]

        # Convert doc_idx to rowid
        result = [(idx["doc_ids"][doc_idx], score) for doc_idx, score in ranked]

        return result
    """================= End method _bm25_search ================="""

    """================= End method __init__ ================="""

    """================= Startup method retrieve ================="""
    def retrieve(
        self,
        queries:    List[str],
        session_id: str = "",
        search_mode: str = "semantic",  # "semantic" or "hybrid"
    ) -> RetrievalResult:
        """
        Retrieval with optional hybrid search mode.
        
        Args:
            queries: List of query strings
            session_id: Session identifier
            search_mode: "semantic" (vector only) or "hybrid" (vector + keyword)
        """
        cfg = self._cfg.retrieval
        t0  = time.perf_counter()

        # 1. Embed all queries for vector search
        vectors = self._model.encode(queries)

        # 2+3. Search across all configured tables, merge results
        all_ranked_lists: List[List[Tuple[str, float]]] = []
        all_rows_by_table: dict = {}

        for table in self._search_tables:
            table_ranked: List[List[Tuple[str, float]]] = []
            for vec in vectors:
                ranked = self._search_one(vec, cfg.top_k, cfg.similarity_threshold, table=table)
                # Prefix rowid with table name to avoid collisions across tables
                ranked = [(f"{table}::{rid}", sim) for rid, sim in ranked]
                table_ranked.append(ranked)

            if search_mode == "hybrid" and self._bm25_index is not None:
                for query in queries:
                    ranked = self._bm25_search(query, cfg.top_k)
                    ranked = [(f"{table}::{rid}", sim) for rid, sim in ranked]
                    table_ranked.append(ranked)

            all_ranked_lists.extend(table_ranked)
            all_rows_by_table[table] = table_ranked

        self._log.info("Multi-table search across: %s", self._search_tables)

        # 5. Reciprocal Rank Fusion across all tables
        fused = self._rrf_merge(all_ranked_lists)

        # 6. Cap at rerank_top_n
        fused = fused[: cfg.rerank_top_n]

        # 7. Build RetrievedRow objects — fetch from correct table per row
        rows = self._build_rows_multi(fused, queries[0])

        # 8. Full-row reverse lookup from source DB
        source_available = False
        if self._fetcher is not None and rows:
            try:
                rowids   = [r.rowid for r in rows]
                full_rows = self._fetcher.fetch_rows(rowids)
                id_map   = {
                    str(r.get(self._cfg.source_primary_key, "")): r
                    for r in full_rows
                }
                for row in rows:
                    row.full_row = id_map.get(row.rowid)
                source_available = True
            except Exception as exc:
                self._log.warning("Source DB lookup failed: %s", exc)

        latency_ms = (time.perf_counter() - t0) * 1000
        log.log_retrieval(session_id, len(rows), latency_ms)

        return RetrievalResult(
            query               = queries[0],
            expanded_queries    = queries,
            rows                = rows,
            latency_ms          = latency_ms,
            source_db_available = source_available,
        )
    """================= End method retrieve ================="""

    """================= Startup method _search_one ================="""
    def _search_one(
        self,
        vector,
        top_k:     int,
        threshold: float,
        table:     str = None,
    ) -> List[Tuple[str, float]]:
        """Single-query search → [(rowid, similarity), ...]"""
        tbl = table or self._table
        try:
            conn = self._pool.getconn()
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                # Check table has embedding column; skip gracefully if not
                cur.execute(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name=%s AND column_name='embedding'", (tbl,)
                )
                if not cur.fetchone():
                    # Table exists but has no embedding column — skip it gracefully
                    self._log.debug("Table %s has no embedding col, skipping", tbl)
                    cur.close()
                    return []

                cur.execute(
                    f"SELECT id, embedding <=> %s::vector AS distance FROM {tbl} "
                    f"ORDER BY embedding <=> %s::vector LIMIT %s",
                    (vector.tolist(), vector.tolist(), top_k)
                )
                results = cur.fetchall()
                cur.close()
                ranked: List[Tuple[str, float]] = []
                for row in results:
                    similarity = max(0.0, 1.0 - float(row['distance']))
                    if similarity >= threshold:
                        ranked.append((str(row['id']), similarity))
                return ranked
            finally:
                self._pool.putconn(conn)
        except Exception as exc:
            self._log.error("pgvector query failed on table %s: %s", tbl, exc)
            return []

    """================= End method _search_one ================="""

    """================= Startup method _rrf_merge ================="""
    def _rrf_merge(
        self,
        ranked_lists: List[List[Tuple[str, float]]],
    ) -> List[Tuple[str, float]]:
        """
        Reciprocal Rank Fusion.
        Returns merged list sorted by RRF score descending.
        """
        scores:  Dict[str, float] = {}
        max_sim: Dict[str, float] = {}

        for ranked in ranked_lists:
            for rank, (rid, sim) in enumerate(ranked, start=1):
                scores[rid]  = scores.get(rid, 0.0) + 1.0 / (self._RRF_K + rank)
                max_sim[rid] = max(max_sim.get(rid, 0.0), sim)

        merged = [
            (rid, max_sim[rid], scores[rid])
            for rid in scores
        ]
        merged.sort(key=lambda x: x[2], reverse=True)
        return [(rid, sim) for rid, sim, _ in merged]
    """================= End method _rrf_merge ================="""

    """================= Startup method _build_rows ================="""
    def _build_rows(
        self,
        fused:          List[Tuple[str, float]],
        original_query: str,
    ) -> List[RetrievedRow]:
        """Fetch pgvector document strings for the fused row IDs."""
        if not fused:
            return []

        ids     = [f[0] for f in fused]
        sim_map = {f[0]: f[1] for f in fused}

        try:
            conn = self._pool.getconn()
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                
                cur.execute(
                    f"SELECT id, document, metadata FROM {self._table} WHERE id = ANY(%s)",
                    (ids,)
                )
                
                results = cur.fetchall()
                cur.close()
                
                rows: List[RetrievedRow] = []
                for row in results:
                    rows.append(RetrievedRow(
                        rowid      = row['id'],
                        similarity = sim_map.get(row['id'], 0.0),
                        document   = row['document'] or "",
                        metadata   = row['metadata'] or {},
                    ))
                return rows
            finally:
                self._pool.putconn(conn)
                
        except Exception as exc:
            self._log.error("pgvector get failed: %s", exc)
            return []
    """================= End method _build_rows ================="""

    def _build_rows_multi(
        self,
        fused: List[Tuple[str, float]],
        original_query: str,
    ) -> List[RetrievedRow]:
        """Fetch rows from the correct table using 'table::id' prefixed rowids."""
        if not fused:
            return []

        # Group by table
        by_table: Dict[str, List[str]] = {}
        sim_map: Dict[str, float] = {}
        for prefixed_id, sim in fused:
            if "::" in prefixed_id:
                tbl, rid = prefixed_id.split("::", 1)
            else:
                tbl, rid = self._table, prefixed_id
            by_table.setdefault(tbl, []).append(rid)
            sim_map[prefixed_id] = sim

        rows: List[RetrievedRow] = []
        try:
            conn = self._pool.getconn()
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                for tbl, ids in by_table.items():
                    try:
                        # Check if table has document column (vector_store style)
                        cur.execute(
                            "SELECT column_name FROM information_schema.columns "
                            "WHERE table_name=%s AND column_name='document'", (tbl,)
                        )
                        has_doc_col = bool(cur.fetchone())

                        # Try int cast first (e.g. users.id is integer), fall back to text
                        try:
                            typed_ids = [int(i) for i in ids]
                        except (ValueError, TypeError):
                            typed_ids = ids

                        if has_doc_col:
                            cur.execute(
                                f"SELECT id, document, metadata FROM {tbl} WHERE id = ANY(%s)",
                                (typed_ids,)
                            )
                            for row in cur.fetchall():
                                pid = f"{tbl}::{row['id']}"
                                rows.append(RetrievedRow(
                                    rowid      = pid,
                                    similarity = sim_map.get(pid, 0.5),
                                    document   = row.get('document') or "",
                                    metadata   = row.get('metadata') or {"table": tbl},
                                ))
                        else:
                            # Non-vector table (e.g. users) — fetch all columns as document
                            cur.execute(f"SELECT * FROM {tbl} WHERE id = ANY(%s)", (typed_ids,))
                            for row in cur.fetchall():
                                pid = f"{tbl}::{row['id']}"
                                doc = " | ".join(f"{k}: {v}" for k, v in dict(row).items() if v is not None)
                                rows.append(RetrievedRow(
                                    rowid      = pid,
                                    similarity = sim_map.get(pid, 0.5),
                                    document   = doc,
                                    metadata   = {"table": tbl, **{k: str(v) for k, v in dict(row).items()}},
                                ))
                    except Exception as exc:
                        self._log.warning("Failed to fetch from table %s: %s", tbl, exc)
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                cur.close()
            finally:
                self._pool.putconn(conn)
        except Exception as exc:
            self._log.error("_build_rows_multi failed: %s", exc)
        return rows

"""================= End class Retriever ================="""


"""================= Startup class _MySQLFetcher ================="""
class _MySQLFetcher:

    """================= Startup method __init__ ================="""
    def __init__(self, cfg: RAGConfig):
        import mysql.connector.pooling  # type: ignore
        self._pool = mysql.connector.pooling.MySQLConnectionPool(
            pool_name         = "haup_pool",
            pool_size         = 5,
            pool_reset_session = True,
            host              = cfg.source_host,
            port              = cfg.source_port,
            user              = cfg.source_user,
            password          = cfg.source_password,
            database          = cfg.source_database,
        )
        self._table = cfg.source_table
        self._pk    = cfg.source_primary_key
    """================= End method __init__ ================="""

    """================= Startup method fetch_rows ================="""
    def fetch_rows(self, rowids: List[str]) -> List[Dict[str, Any]]:
        conn = self._pool.get_connection()
        try:
            cur          = conn.cursor(dictionary=True)
            placeholders = ",".join(["%s"] * len(rowids))
            cur.execute(
                f"SELECT * FROM `{self._table}` WHERE `{self._pk}` IN ({placeholders})",
                rowids,
            )
            rows = cur.fetchall()
            cur.close()
            return [_coerce_row(r) for r in rows]
        finally:
            conn.close()
    """================= End method fetch_rows ================="""

"""================= End class _MySQLFetcher ================="""


"""================= Startup class _PostgreSQLFetcher ================="""
class _PostgreSQLFetcher:

    """================= Startup method __init__ ================="""
    def __init__(self, cfg: RAGConfig):
        from psycopg2 import pool
        
        # Use connection string if provided, otherwise build from parameters
        if cfg.source_connection_string:
            self._pool = pool.SimpleConnectionPool(
                minconn=1,
                maxconn=5,
                dsn=cfg.source_connection_string
            )
        else:
            self._pool = pool.SimpleConnectionPool(
                minconn=1,
                maxconn=5,
                host=cfg.source_host,
                port=cfg.source_port,
                user=cfg.source_user,
                password=cfg.source_password,
                database=cfg.source_database,
            )
        self._table = cfg.source_table
        self._pk    = cfg.source_primary_key
    """================= End method __init__ ================="""

    """================= Startup method fetch_rows ================="""
    def fetch_rows(self, rowids: List[str]) -> List[Dict[str, Any]]:
        from psycopg2.extras import RealDictCursor
        # Strip "table::" prefix if present
        clean_ids = [rid.split("::", 1)[-1] if "::" in rid else rid for rid in rowids]
        try:
            typed_ids = [int(i) for i in clean_ids]
        except (ValueError, TypeError):
            typed_ids = clean_ids
        conn = self._pool.getconn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            placeholders = ",".join(["%s"] * len(typed_ids))
            cur.execute(
                f'SELECT * FROM "{self._table}" WHERE "{self._pk}" IN ({placeholders})',
                typed_ids,
            )
            rows = cur.fetchall()
            cur.close()
            return [_coerce_row(dict(r)) for r in rows]
        finally:
            self._pool.putconn(conn)
    """================= End method fetch_rows ================="""

"""================= End class _PostgreSQLFetcher ================="""


"""================= Startup class _SQLiteFetcher ================="""
class _SQLiteFetcher:

    """================= Startup method __init__ ================="""
    def __init__(self, cfg: RAGConfig):
        import sqlite3
        self._conn       = sqlite3.connect(cfg.source_database)
        self._conn.row_factory = sqlite3.Row
        self._table      = cfg.source_table
        self._pk         = cfg.source_primary_key
    """================= End method __init__ ================="""

    """================= Startup method fetch_rows ================="""
    def fetch_rows(self, rowids: List[str]) -> List[Dict[str, Any]]:
        placeholders = ",".join(["?"] * len(rowids))
        cur = self._conn.execute(
            f"SELECT * FROM `{self._table}` WHERE `{self._pk}` IN ({placeholders})",
            rowids,
        )
        return [dict(r) for r in cur.fetchall()]
    """================= End method fetch_rows ================="""

"""================= End class _SQLiteFetcher ================="""


"""================= Startup function _build_fetcher ================="""
def _build_fetcher(cfg: RAGConfig):
    if cfg.source_type == "postgresql":
        try:
            return _PostgreSQLFetcher(cfg)
        except Exception as exc:
            log.get("retriever").warning("PostgreSQL source unavailable: %s", exc)
            return None
    elif cfg.source_type == "mysql":
        try:
            return _MySQLFetcher(cfg)
        except Exception as exc:
            log.get("retriever").warning("MySQL source unavailable: %s", exc)
            return None
    elif cfg.source_type == "sqlite":
        try:
            return _SQLiteFetcher(cfg)
        except Exception as exc:
            log.get("retriever").warning("SQLite source unavailable: %s", exc)
            return None
    return None
"""================= End function _build_fetcher ================="""


"""================= Startup function _coerce_row ================="""
def _coerce_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Convert datetime/bytes to string so rows are JSON-serialisable."""
    import datetime
    result = {}
    for k, v in row.items():
        if isinstance(v, (datetime.date, datetime.datetime)):
            result[k] = v.isoformat()
        elif isinstance(v, (bytes, bytearray)):
            result[k] = v.decode("utf-8", errors="replace")
        else:
            result[k] = v
    return result
"""================= End function _coerce_row ================="""
