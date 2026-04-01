"""
File Summary:
pgvector client wrapper for HAUP v3.0. Provides a simple interface for vector operations
that mimics ChromaDB's API for easier migration.

HAUP v3.0 uses HNSW (Hierarchical Navigable Small World) indexing with cosine distance
as the default configuration for optimal semantic similarity search performance.

Index Options:
- HNSW (DEFAULT): Fast queries (10-50ms), high accuracy (99%+), more memory
- IVFFlat (OPTIONAL): Lower memory, slightly lower accuracy (85-90%)

Distance Metric:
- Cosine Distance: Measures angle between vectors, ideal for semantic similarity
  Range: 0 (identical) to 2 (opposite direction)

====================================================================
SYSTEM PIPELINE FLOW (pgvector Operations)
====================================================================

PgvectorClient
||
├── [INIT] __init__() ----------------------------> Initialize connection
│       │
│       ├── [1.1] Parse Connection String --------> Extract DB credentials
│       ├── [1.2] Create Connection Pool ---------> Min/max connections
│       └── [1.3] Store Configuration ------------> Table name, dimensions
│
├── [SETUP] init_schema() -----------------------> Create table & indexes
│       │
│       ├── [2.1] Enable pgvector Extension ------> CREATE EXTENSION vector
│       ├── [2.2] Create Table -------------------> With vector column
│       ├── [2.3] Create HNSW Index --------------> For fast similarity search
│       └── [2.4] Create Metadata Index ----------> For filtering
│
├── [WRITE] upsert() ----------------------------> Insert or update vectors
│       │
│       ├── [3.1] Validate Input -----------------> Check dimensions match
│       ├── [3.2] Prepare Batch ------------------> Group operations
│       ├── [3.3] Execute INSERT -----------------> ON CONFLICT DO UPDATE
│       └── [3.4] Commit Transaction -------------> Ensure durability
│
├── [READ] query() ------------------------------> Vector similarity search
│       │
│       ├── [4.1] Generate Query Embedding -------> If text provided
│       ├── [4.2] Execute Similarity Search ------> ORDER BY <-> distance
│       ├── [4.3] Apply Filters ------------------> WHERE metadata conditions
│       ├── [4.4] Limit Results ------------------> TOP K results
│       └── [4.5] Return Documents ---------------> With distances & metadata
│
├── [READ] get() --------------------------------> Fetch by IDs
│       │
│       ├── [5.1] Build WHERE Clause -------------> id IN (...)
│       ├── [5.2] Execute SELECT -----------------> Fetch matching rows
│       └── [5.3] Return Results -----------------> Documents & metadata
│
├── [DELETE] delete() ---------------------------> Remove vectors
│       │
│       ├── [6.1] Build DELETE Statement ---------> WHERE id IN (...)
│       ├── [6.2] Execute DELETE -----------------> Remove rows
│       └── [6.3] Commit Transaction -------------> Ensure durability
│
├── [STATS] count() -----------------------------> Get total vectors
│       │
│       ├── [7.1] Execute COUNT(*) ---------------> Fast count query
│       └── [7.2] Return Integer -----------------> Total rows
│
└── [CLEANUP] close() ---------------------------> Close connections
        │
        └── [8.1] Close Connection Pool ----------> Release resources

====================================================================
FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from psycopg2 import pool
from psycopg2.extras import RealDictCursor, execute_batch
import psycopg2
import json

logger = logging.getLogger("haup.pgvector_client")


"""================= Startup class PgvectorClient ================="""
class PgvectorClient:
    """
    pgvector client that provides ChromaDB-like API for vector operations.
    """

    """================= Startup method __init__ ================="""
    def __init__(
        self,
        host: str = "localhost",
        port: int = 5432,
        user: str = "postgres",
        password: str = "",
        database: str = "vector_db",
        table: str = "vector_store",
        connection_string: str = "",
        min_connections: int = 2,
        max_connections: int = 10,
        embedding_dimension: int = 384,
    ):
        self.table = table
        self.embedding_dimension = embedding_dimension
        
        # Create connection pool
        if connection_string:
            self._pool = pool.SimpleConnectionPool(
                minconn=min_connections,
                maxconn=max_connections,
                dsn=connection_string
            )
        else:
            self._pool = pool.SimpleConnectionPool(
                minconn=min_connections,
                maxconn=max_connections,
                host=host,
                port=port,
                user=user,
                password=password,
                database=database,
            )
        
        logger.info(f"pgvector client initialized: table={table}, dimension={embedding_dimension}")
    """================= End method __init__ ================="""

    """================= Startup method init_schema ================="""
    def init_schema(self, use_hnsw: bool = True, m: int = 16, ef_construction: int = 64) -> None:
        """
        Create table and indexes if they don't exist.
        
        HAUP v3.0 uses HNSW (Hierarchical Navigable Small World) indexing with cosine distance
        for optimal semantic similarity search performance.
        
        Args:
            use_hnsw: If True, use HNSW index (DEFAULT - better performance, more memory).
                     If False, use IVFFlat index (less memory, slightly lower accuracy).
            m: HNSW parameter - number of connections per layer (default 16)
            ef_construction: HNSW parameter - build quality (default 64)
        """
        conn = self._pool.getconn()
        try:
            cur = conn.cursor()
            
            # Enable pgvector extension
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
            
            # Create table with version and timestamp tracking
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS {self.table} (
                    id TEXT PRIMARY KEY,
                    embedding vector({self.embedding_dimension}),
                    document TEXT,
                    metadata JSONB,
                    version INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Check if we have enough data for index
            cur.execute(f"SELECT COUNT(*) FROM {self.table}")
            count = cur.fetchone()[0]
            
            # Create vector index based on preference
            if use_hnsw:
                # HNSW index - HAUP v3.0 DEFAULT
                # Hierarchical Navigable Small World graph-based index
                # Provides: Fast queries (10-50ms), High accuracy (99%+), Cosine distance metric
                # Good for: production, high query volume, semantic similarity search
                try:
                    cur.execute(f"""
                        CREATE INDEX IF NOT EXISTS {self.table}_embedding_idx 
                        ON {self.table} USING hnsw (embedding vector_cosine_ops)
                        WITH (m = {m}, ef_construction = {ef_construction})
                    """)
                    logger.info(f"✅ HNSW index created for {self.table} with cosine distance (m={m}, ef_construction={ef_construction})")
                except Exception as e:
                    logger.warning(f"Could not create HNSW index: {e}")
            else:
                # IVFFlat index - less memory, slightly lower accuracy
                # Good for: development, limited memory, large datasets
                if count >= 100:
                    try:
                        cur.execute(f"""
                            CREATE INDEX IF NOT EXISTS {self.table}_embedding_idx 
                            ON {self.table} USING ivfflat (embedding vector_cosine_ops) 
                            WITH (lists = 100)
                        """)
                        logger.info(f"IVFFlat index created for {self.table} with cosine distance")
                    except Exception as e:
                        logger.warning(f"Could not create IVFFlat index: {e}")
                else:
                    logger.info(f"Table has {count} rows, skipping IVFFlat index (requires 100+)")
            
            # Create metadata index (GIN for JSONB)
            cur.execute(f"""
                CREATE INDEX IF NOT EXISTS {self.table}_metadata_idx 
                ON {self.table} USING gin (metadata)
            """)
            
            # Create index on updated_at for freshness queries
            cur.execute(f"""
                CREATE INDEX IF NOT EXISTS {self.table}_updated_at_idx 
                ON {self.table} (updated_at DESC)
            """)
            
            conn.commit()
            cur.close()
            logger.info(f"Schema initialized for table {self.table}")
        finally:
            self._pool.putconn(conn)
    """================= End method init_schema ================="""

    """================= Startup method upsert ================="""
    def upsert(
        self,
        ids: List[str],
        embeddings: List[List[float]],
        metadatas: Optional[List[Dict[str, Any]]] = None,
        documents: Optional[List[Optional[str]]] = None,
    ) -> None:
        """
        Insert or update vectors with version tracking.
        
        Args:
            ids: List of unique identifiers
            embeddings: List of embedding vectors
            metadatas: Optional list of metadata dicts
            documents: Optional list of document strings
        """
        if not ids:
            return
        
        if metadatas is None:
            metadatas = [{}] * len(ids)
        if documents is None:
            documents = [None] * len(ids)
        
        conn = self._pool.getconn()
        try:
            cur = conn.cursor()
            
            # Prepare data for batch insert
            data = []
            for i, (id_, emb, meta, doc) in enumerate(zip(ids, embeddings, metadatas, documents)):
                data.append((
                    id_,
                    emb,
                    doc,
                    json.dumps(meta) if meta else '{}'
                ))
            
            # Batch upsert with version increment and timestamp update
            execute_batch(
                cur,
                f"""
                INSERT INTO {self.table} (id, embedding, document, metadata, version, created_at, updated_at)
                VALUES (%s, %s::vector, %s, %s::jsonb, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    document = EXCLUDED.document,
                    metadata = EXCLUDED.metadata,
                    version = {self.table}.version + 1,
                    updated_at = CURRENT_TIMESTAMP
                """,
                data,
                page_size=100
            )
            
            conn.commit()
            cur.close()
            logger.debug(f"Upserted {len(ids)} vectors with version tracking")
        except Exception as exc:
            conn.rollback()
            logger.error(f"Upsert failed: {exc}")
            raise
        finally:
            self._pool.putconn(conn)
    """================= End method upsert ================="""

    """================= Startup method query ================="""
    def query(
        self,
        query_embeddings: List[List[float]],
        n_results: int = 10,
        include: Optional[List[str]] = None,
    ) -> Dict[str, List[Any]]:
        """
        Vector similarity search using HNSW index with cosine distance.
        
        Cosine distance measures the angle between vectors, making it ideal for
        semantic similarity where magnitude doesn't matter, only direction.
        
        Args:
            query_embeddings: List of query vectors (384-dim for all-MiniLM-L6-v2)
            n_results: Number of results to return per query
            include: Fields to include in results (documents, metadatas, distances)
        
        Returns:
            Dict with keys: ids, documents, metadatas, distances
            - distances: Cosine distance (0 = identical, 2 = opposite)
        """
        if include is None:
            include = ["documents", "metadatas", "distances"]
        
        conn = self._pool.getconn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            all_ids = []
            all_documents = []
            all_metadatas = []
            all_distances = []
            
            for query_emb in query_embeddings:
                # Cosine distance search using HNSW index
                # Operator <=> computes cosine distance: 1 - cosine_similarity
                # Range: 0 (identical) to 2 (opposite direction)
                cur.execute(
                    f"""
                    SELECT id, document, metadata, embedding <=> %s::vector AS distance
                    FROM {self.table}
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                    """,
                    (query_emb, query_emb, n_results)
                )
                
                results = cur.fetchall()
                
                ids = [r['id'] for r in results]
                documents = [r['document'] for r in results] if 'documents' in include else []
                metadatas = [r['metadata'] for r in results] if 'metadatas' in include else []
                distances = [float(r['distance']) for r in results] if 'distances' in include else []
                
                all_ids.append(ids)
                all_documents.append(documents)
                all_metadatas.append(metadatas)
                all_distances.append(distances)
            
            cur.close()
            
            result = {"ids": all_ids}
            if 'documents' in include:
                result['documents'] = all_documents
            if 'metadatas' in include:
                result['metadatas'] = all_metadatas
            if 'distances' in include:
                result['distances'] = all_distances
            
            return result
        finally:
            self._pool.putconn(conn)
    """================= End method query ================="""

    """================= Startup method get ================="""
    def get(
        self,
        ids: Optional[List[str]] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        include: Optional[List[str]] = None,
    ) -> Dict[str, List[Any]]:
        """
        Fetch vectors by IDs or paginate through all vectors.
        
        Args:
            ids: Optional list of IDs to fetch
            limit: Optional limit for pagination
            offset: Optional offset for pagination
            include: Fields to include (documents, metadatas, embeddings, versions, timestamps)
        
        Returns:
            Dict with keys: ids, documents, metadatas, embeddings, versions, created_ats, updated_ats
        """
        if include is None:
            include = ["documents", "metadatas"]
        
        conn = self._pool.getconn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            # Build query
            if ids is not None:
                cur.execute(
                    f"SELECT * FROM {self.table} WHERE id = ANY(%s)",
                    (ids,)
                )
            else:
                query = f"SELECT * FROM {self.table} ORDER BY id"
                params = []
                if limit is not None:
                    query += " LIMIT %s"
                    params.append(limit)
                if offset is not None:
                    query += " OFFSET %s"
                    params.append(offset)
                cur.execute(query, params)
            
            results = cur.fetchall()
            cur.close()
            
            result = {
                "ids": [r['id'] for r in results]
            }
            
            if 'documents' in include:
                result['documents'] = [r['document'] for r in results]
            if 'metadatas' in include:
                result['metadatas'] = [r['metadata'] for r in results]
            if 'embeddings' in include:
                # Convert pgvector format to list of floats
                embeddings = []
                for r in results:
                    emb = r['embedding']
                    if isinstance(emb, str):
                        # Parse string representation: "[0.1,0.2,...]"
                        emb = emb.strip('[]').split(',')
                        emb = [float(x) for x in emb]
                    embeddings.append(emb)
                result['embeddings'] = embeddings
            if 'versions' in include:
                result['versions'] = [r.get('version', 1) for r in results]
            if 'timestamps' in include:
                result['created_ats'] = [r.get('created_at').isoformat() if r.get('created_at') else None for r in results]
                result['updated_ats'] = [r.get('updated_at').isoformat() if r.get('updated_at') else None for r in results]
            
            return result
        finally:
            self._pool.putconn(conn)
    """================= End method get ================="""

    """================= Startup method delete ================="""
    def delete(self, ids: List[str]) -> None:
        """Delete vectors by IDs."""
        if not ids:
            return
        
        conn = self._pool.getconn()
        try:
            cur = conn.cursor()
            cur.execute(
                f"DELETE FROM {self.table} WHERE id = ANY(%s)",
                (ids,)
            )
            conn.commit()
            cur.close()
            logger.debug(f"Deleted {len(ids)} vectors")
        finally:
            self._pool.putconn(conn)
    """================= End method delete ================="""

    """================= Startup method count ================="""
    def count(self) -> int:
        """Get total number of vectors."""
        conn = self._pool.getconn()
        try:
            cur = conn.cursor()
            cur.execute(f"SELECT COUNT(*) FROM {self.table}")
            count = cur.fetchone()[0]
            cur.close()
            return count
        finally:
            self._pool.putconn(conn)
    """================= End method count ================="""

    """================= Startup method peek ================="""
    def peek(self, limit: int = 10) -> Dict[str, List[Any]]:
        """Peek at first N vectors."""
        return self.get(limit=limit, include=["documents", "metadatas"])
    """================= End method peek ================="""

    """================= Startup method close ================="""
    def close(self) -> None:
        """Close connection pool."""
        if self._pool:
            self._pool.closeall()
            logger.info("pgvector client closed")
    """================= End method close ================="""
    
    """================= Startup method rebuild_index ================="""
    def rebuild_index(self, lists: int = 100) -> None:
        """
        Rebuild the IVFFlat index. Call this after bulk loading data.
        
        Args:
            lists: Number of lists for IVFFlat index (default 100)
                   Rule of thumb: lists = rows / 1000, max 1000
        """
        conn = self._pool.getconn()
        try:
            cur = conn.cursor()
            
            # Drop existing index
            cur.execute(f"DROP INDEX IF EXISTS {self.table}_embedding_idx")
            
            # Recreate with new parameters
            cur.execute(f"""
                CREATE INDEX {self.table}_embedding_idx 
                ON {self.table} USING ivfflat (embedding vector_cosine_ops) 
                WITH (lists = {lists})
            """)
            
            conn.commit()
            cur.close()
            logger.info(f"IVFFlat index rebuilt with lists={lists}")
        finally:
            self._pool.putconn(conn)
    """================= End method rebuild_index ================="""
    
    """================= Startup method switch_to_hnsw ================="""
    def switch_to_hnsw(self, m: int = 16, ef_construction: int = 64) -> None:
        """
        Switch from IVFFlat to HNSW index for better performance at scale.
        
        Args:
            m: Number of connections per layer (default 16)
               - 16: Good for <1M vectors
               - 24: Better for 1M-10M vectors
               - 32: Best for 10M+ vectors
            
            ef_construction: Build quality (default 64)
               - 64: Fast build, good accuracy
               - 100: Slower build, better accuracy
               - 200: Slow build, best accuracy
        
        Note: HNSW provides:
            - Faster queries (10-50ms vs 100-500ms)
            - Better accuracy (99% vs 85-90%)
            - More memory usage
        """
        conn = self._pool.getconn()
        try:
            cur = conn.cursor()
            
            logger.info(f"Switching to HNSW index with m={m}, ef_construction={ef_construction}")
            
            # Drop existing index
            cur.execute(f"DROP INDEX IF EXISTS {self.table}_embedding_idx")
            
            # Create HNSW index
            cur.execute(f"""
                CREATE INDEX {self.table}_embedding_idx 
                ON {self.table} USING hnsw (embedding vector_cosine_ops)
                WITH (m = {m}, ef_construction = {ef_construction})
            """)
            
            conn.commit()
            cur.close()
            logger.info(f"HNSW index created successfully")
        finally:
            self._pool.putconn(conn)
    """================= End method switch_to_hnsw ================="""
    
    """================= Startup method switch_to_ivfflat ================="""
    def switch_to_ivfflat(self, lists: int = 100) -> None:
        """
        Switch from HNSW to IVFFlat index for lower memory usage.
        
        Args:
            lists: Number of lists for IVFFlat index (default 100)
                   Rule of thumb: lists = sqrt(rows)
        
        Note: IVFFlat provides:
            - Lower memory usage
            - Faster inserts
            - Slightly lower accuracy (85-90%)
        """
        conn = self._pool.getconn()
        try:
            cur = conn.cursor()
            
            logger.info(f"Switching to IVFFlat index with lists={lists}")
            
            # Drop existing index
            cur.execute(f"DROP INDEX IF EXISTS {self.table}_embedding_idx")
            
            # Create IVFFlat index
            cur.execute(f"""
                CREATE INDEX {self.table}_embedding_idx 
                ON {self.table} USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = {lists})
            """)
            
            conn.commit()
            cur.close()
            logger.info(f"IVFFlat index created successfully")
        finally:
            self._pool.putconn(conn)
    """================= End method switch_to_ivfflat ================="""
    
    """================= Startup method get_freshness_stats ================="""
    def get_freshness_stats(self) -> Dict[str, Any]:
        """
        Get data freshness statistics.
        
        Returns:
            Dict with freshness metrics:
            - total_vectors: Total number of vectors
            - avg_version: Average version number
            - oldest_update: Oldest updated_at timestamp
            - newest_update: Newest updated_at timestamp
            - stale_count: Vectors older than 24 hours
        """
        conn = self._pool.getconn()
        try:
            cur = conn.cursor()
            
            cur.execute(f"""
                SELECT 
                    COUNT(*) as total,
                    AVG(version) as avg_version,
                    MIN(updated_at) as oldest,
                    MAX(updated_at) as newest,
                    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '24 hours') as stale_count
                FROM {self.table}
            """)
            
            row = cur.fetchone()
            cur.close()
            
            return {
                "total_vectors": row[0] or 0,
                "avg_version": float(row[1]) if row[1] else 1.0,
                "oldest_update": row[2].isoformat() if row[2] else None,
                "newest_update": row[3].isoformat() if row[3] else None,
                "stale_count": row[4] or 0
            }
        finally:
            self._pool.putconn(conn)
    """================= End method get_freshness_stats ================="""
    
    """================= Startup method get_stale_vectors ================="""
    def get_stale_vectors(self, hours: int = 24, limit: int = 100) -> List[str]:
        """
        Get IDs of vectors that haven't been updated in specified hours.
        
        Args:
            hours: Number of hours to consider stale (default 24)
            limit: Maximum number of IDs to return
            
        Returns:
            List of vector IDs that are stale
        """
        conn = self._pool.getconn()
        try:
            cur = conn.cursor()
            
            cur.execute(f"""
                SELECT id 
                FROM {self.table}
                WHERE updated_at < NOW() - INTERVAL '{hours} hours'
                ORDER BY updated_at ASC
                LIMIT %s
            """, (limit,))
            
            ids = [row[0] for row in cur.fetchall()]
            cur.close()
            
            return ids
        finally:
            self._pool.putconn(conn)
    """================= End method get_stale_vectors ================="""

"""================= End class PgvectorClient ================="""
