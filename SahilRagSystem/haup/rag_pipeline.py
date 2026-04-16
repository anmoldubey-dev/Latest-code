"""
HAUP v3.0 - Complete RAG Pipeline (Single File)
All-in-one RAG system: Query → Retrieve → Generate → Answer

====================================================================
COMPLETE RAG PIPELINE FLOW DIAGRAM
====================================================================

                        USER QUESTION
                             │
                             ▼
        ┌────────────────────────────────────────────┐
        │         RAG PIPELINE ORCHESTRATOR          │
        └────────────────────────────────────────────┘
                             │
                             ▼
        ╔════════════════════════════════════════════╗
        ║  STEP 1: QUERY EMBEDDING                   ║
        ╠════════════════════════════════════════════╣
        ║  • Load: all-MiniLM-L6-v2 model           ║
        ║  • Input: "Show me users from India"      ║
        ║  • Output: [0.123, -0.456, ...] (384-dim) ║
        ╚════════════════════════════════════════════╝
                             │
                             ▼
        ╔════════════════════════════════════════════╗
        ║  STEP 2: VECTOR SEARCH (pgvector)         ║
        ╠════════════════════════════════════════════╣
        ║  • Index: HNSW (Hierarchical NSW)         ║
        ║  • Metric: Cosine Distance                ║
        ║  • Query: embedding <=> vector            ║
        ║  • Limit: top_k (default: 8)              ║
        ║  • Filter: similarity >= 0.30             ║
        ╚════════════════════════════════════════════╝
                             │
                             ▼
        ┌────────────────────────────────────────────┐
        │  RESULTS: Matching Row IDs + Similarities  │
        │  ┌──────────────────────────────────────┐  │
        │  │ • user_123: 0.85 (85% similar)       │  │
        │  │ • user_456: 0.78 (78% similar)       │  │
        │  │ • user_789: 0.72 (72% similar)       │  │
        │  └──────────────────────────────────────┘  │
        └────────────────────────────────────────────┘
                             │
                             ▼
        ╔════════════════════════════════════════════╗
        ║  STEP 3: FULL ROW FETCH (PostgreSQL)      ║
        ╠════════════════════════════════════════════╣
        ║  • Connect: Neon/PostgreSQL               ║
        ║  • Query: SELECT * FROM users             ║
        ║         WHERE id IN (...)                 ║
        ║  • Fetch: Complete customer records       ║
        ╚════════════════════════════════════════════╝
                             │
                             ▼
        ┌────────────────────────────────────────────┐
        │  COMPLETE DATA: All Columns Retrieved      │
        │  ┌──────────────────────────────────────┐  │
        │  │ id: user_123                         │  │
        │  │ name: Rajesh Kumar                   │  │
        │  │ email: rajesh@example.com            │  │
        │  │ phone: +91-9876543210                │  │
        │  │ country: IN                          │  │
        │  │ is_active: true                      │  │
        │  │ created_at: 2024-01-15               │  │
        │  └──────────────────────────────────────┘  │
        └────────────────────────────────────────────┘
                             │
                             ▼
        ╔════════════════════════════════════════════╗
        ║  STEP 4: CONTEXT BUILDING                 ║
        ╠════════════════════════════════════════════╣
        ║  • Format: Markdown Table                 ║
        ║  • Include: Top 5 results                 ║
        ║  • Add: Similarity scores                 ║
        ║  • Truncate: Long values (50 chars)       ║
        ╚════════════════════════════════════════════╝
                             │
                             ▼
        ┌────────────────────────────────────────────┐
        │  FORMATTED CONTEXT                         │
        │  ┌──────────────────────────────────────┐  │
        │  │ Based on the following data:         │  │
        │  │                                      │  │
        │  │ | ID | Name | Email | Country |     │  │
        │  │ |----|------|-------|----------|     │  │
        │  │ | 123| Rajesh| raj@..| IN |         │  │
        │  │ | 456| Priya | pri@..| IN |         │  │
        │  │ | 789| Amit  | ami@..| IN |         │  │
        │  └──────────────────────────────────────┘  │
        └────────────────────────────────────────────┘
                             │
                             ▼
        ╔════════════════════════════════════════════╗
        ║  STEP 5: LLM GENERATION                   ║
        ╠════════════════════════════════════════════╣
        ║  Backend Options:                         ║
        ║  ┌────────────────────────────────────┐   ║
        ║  │ • OpenAI (GPT-4, GPT-3.5)          │   ║
        ║  │ • Anthropic (Claude)               │   ║
        ║  │ • Ollama (Local LLMs)              │   ║
        ║  └────────────────────────────────────┘   ║
        ║                                           ║
        ║  Prompt Structure:                        ║
        ║  ┌────────────────────────────────────┐   ║
        ║  │ System: You are a helpful AI...    │   ║
        ║  │ Context: [Formatted data table]    │   ║
        ║  │ Question: Show me users from India │   ║
        ║  │ Answer: [Generated by LLM]         │   ║
        ║  └────────────────────────────────────┘   ║
        ╚════════════════════════════════════════════╝
                             │
                             ▼
        ┌────────────────────────────────────────────┐
        │  GENERATED ANSWER                          │
        │  ┌──────────────────────────────────────┐  │
        │  │ Based on the data, here are the     │  │
        │  │ users from India:                   │  │
        │  │                                     │  │
        │  │ 1. Rajesh Kumar                     │  │
        │  │    Email: rajesh@example.com        │  │
        │  │    Phone: +91-9876543210            │  │
        │  │                                     │  │
        │  │ 2. Priya Sharma                     │  │
        │  │    Email: priya@example.com         │  │
        │  │    Phone: +91-9876543211            │  │
        │  │                                     │  │
        │  │ All users are currently active.     │  │
        │  └──────────────────────────────────────┘  │
        └────────────────────────────────────────────┘
                             │
                             ▼
        ╔════════════════════════════════════════════╗
        ║  STEP 6: RESPONSE FORMATTING              ║
        ╠════════════════════════════════════════════╣
        ║  • Answer: Generated text                 ║
        ║  • Sources: List with similarities        ║
        ║  • Metadata: Latency, row count           ║
        ║  • Citations: Source row IDs              ║
        ╚════════════════════════════════════════════╝
                             │
                             ▼
        ┌────────────────────────────────────────────┐
        │  FINAL OUTPUT TO USER                      │
        │  ┌──────────────────────────────────────┐  │
        │  │ ✓ Answer with citations              │  │
        │  │ ✓ Source table with similarities     │  │
        │  │ ✓ Performance metrics (latency)      │  │
        │  │ ✓ Full row data (if requested)       │  │
        │  └──────────────────────────────────────┘  │
        └────────────────────────────────────────────┘

====================================================================
COMPONENT ARCHITECTURE
====================================================================

┌─────────────────────────────────────────────────────────────────┐
│                      RAG PIPELINE COMPONENTS                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                │
│  │   RETRIEVER        │  │  SOURCE FETCHER    │                │
│  ├────────────────────┤  ├────────────────────┤                │
│  │ • SentenceTransf.  │  │ • PostgreSQL Pool  │                │
│  │ • pgvector Pool    │  │ • Full Row Fetch   │                │
│  │ • HNSW Search      │  │ • Data Enrichment  │                │
│  │ • Cosine Distance  │  │                    │                │
│  └────────────────────┘  └────────────────────┘                │
│           │                        │                            │
│           └────────┬───────────────┘                            │
│                    ▼                                            │
│         ┌────────────────────┐                                  │
│         │  CONTEXT BUILDER   │                                  │
│         ├────────────────────┤                                  │
│         │ • Format Data      │                                  │
│         │ • Build Tables     │                                  │
│         │ • Truncate Values  │                                  │
│         └────────────────────┘                                  │
│                    │                                            │
│                    ▼                                            │
│         ┌────────────────────┐                                  │
│         │    LLM CLIENT      │                                  │
│         ├────────────────────┤                                  │
│         │ • OpenAI API       │                                  │
│         │ • Anthropic API    │                                  │
│         │ • Ollama Local     │                                  │
│         └────────────────────┘                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

====================================================================
DATA SOURCES
====================================================================

┌─────────────────────────────────────────────────────────────────┐
│  PRIMARY: pgvector (Vector Database)                            │
├─────────────────────────────────────────────────────────────────┤
│  Table: vector_store                                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ id          TEXT PRIMARY KEY                              │  │
│  │ embedding   vector(384)  ← HNSW indexed                  │  │
│  │ document    TEXT         ← Searchable text               │  │
│  │ metadata    JSONB        ← Additional info               │  │
│  │ created_at  TIMESTAMP                                     │  │
│  │ updated_at  TIMESTAMP                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Index: HNSW (m=16, ef_construction=64)                         │
│  Distance: Cosine (<=> operator)                                │
│  Performance: 10-50ms per query                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SECONDARY: PostgreSQL/Neon (Source Database)                   │
├─────────────────────────────────────────────────────────────────┤
│  Table: users (configurable)                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ id              SERIAL PRIMARY KEY                        │  │
│  │ name            VARCHAR(255)                              │  │
│  │ email           VARCHAR(255)                              │  │
│  │ phone_number    VARCHAR(50)                               │  │
│  │ country_code    VARCHAR(10)                               │  │
│  │ is_active       BOOLEAN                                   │  │
│  │ created_at      TIMESTAMP                                 │  │
│  │ updated_at      TIMESTAMP                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Purpose: Full row data enrichment                              │
│  Performance: 50-100ms per batch fetch                          │
└─────────────────────────────────────────────────────────────────┘

====================================================================
USAGE MODES
====================================================================

1. SINGLE QUERY MODE
   ┌─────────────────────────────────────────────────────────────┐
   │ $ python rag_pipeline.py --query "Show me users from India" │
   │                                                              │
   │ → Executes one query and exits                              │
   │ → Shows full details and citations                          │
   │ → Perfect for scripts and automation                        │
   └─────────────────────────────────────────────────────────────┘

2. INTERACTIVE MODE
   ┌─────────────────────────────────────────────────────────────┐
   │ $ python rag_pipeline.py --interactive                      │
   │                                                              │
   │ You: Show me active users                                   │
   │ Assistant: [Answer with citations]                          │
   │                                                              │
   │ You: How many are from India?                               │
   │ Assistant: [Answer with citations]                          │
   │                                                              │
   │ You: quit                                                    │
   │                                                              │
   │ → REPL-style conversation                                   │
   │ → Maintains context between queries                         │
   │ → Type 'quit' to exit                                       │
   └─────────────────────────────────────────────────────────────┘

3. REST API MODE
   ┌─────────────────────────────────────────────────────────────┐
   │ $ python rag_pipeline.py --api --port 8000                  │
   │                                                              │
   │ POST http://localhost:8000/query                            │
   │ {                                                            │
   │   "question": "Show me users from India"                    │
   │ }                                                            │
   │                                                              │
   │ Response:                                                    │
   │ {                                                            │
   │   "answer": "...",                                           │
   │   "sources": [...],                                          │
   │   "latency_ms": 1234                                         │
   │ }                                                            │
   │                                                              │
   │ → FastAPI server with OpenAPI docs                          │
   │ → Swagger UI at /docs                                       │
   │ → Production-ready with CORS                                │
   └─────────────────────────────────────────────────────────────┘

====================================================================
CONFIGURATION
====================================================================

Environment Variables (.env):
┌─────────────────────────────────────────────────────────────────┐
│ # Vector Database                                               │
│ PGVECTOR_CONNECTION_STRING=postgresql://user:pass@host/db      │
│ PGVECTOR_TABLE=vector_store                                     │
│                                                                  │
│ # Source Database                                               │
│ NEON_CONNECTION_STRING=postgresql://user:pass@host/db          │
│ PG_TABLE=users                                                  │
│                                                                  │
│ # Embedding Model                                               │
│ EMBEDDING_MODEL=all-MiniLM-L6-v2                                │
│                                                                  │
│ # LLM Backend (choose one)                                      │
│ LLM_BACKEND=openai                                              │
│ OPENAI_API_KEY=sk-...                                           │
│ LLM_MODEL=gpt-4o-mini                                           │
│                                                                  │
│ # Or use Anthropic                                              │
│ # LLM_BACKEND=anthropic                                         │
│ # ANTHROPIC_API_KEY=sk-ant-...                                  │
│                                                                  │
│ # Or use Ollama (local)                                         │
│ # LLM_BACKEND=ollama                                            │
└─────────────────────────────────────────────────────────────────┘

Command Line Options:
┌─────────────────────────────────────────────────────────────────┐
│ --query, -q          Single query mode                          │
│ --interactive, -i    Interactive REPL mode                      │
│ --api                Start REST API server                      │
│ --port               API port (default: 8000)                   │
│ --backend            LLM backend (openai/anthropic/ollama)      │
│ --model              LLM model name                             │
│ --top-k              Number of results to retrieve              │
└─────────────────────────────────────────────────────────────────┘

====================================================================
PERFORMANCE METRICS
====================================================================

Typical Latency Breakdown:
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Query Embedding           →    50-100ms                │
│ Step 2: pgvector Search (HNSW)    →    10-50ms                 │
│ Step 3: PostgreSQL Fetch          →    50-100ms                │
│ Step 4: Context Building          →    5-10ms                  │
│ Step 5: LLM Generation            →    500-2000ms              │
│ ─────────────────────────────────────────────────               │
│ Total End-to-End Latency          →    1-2 seconds             │
└─────────────────────────────────────────────────────────────────┘

Optimization Tips:
• Use direct connection (not pooler) for pgvector
• Increase HNSW m parameter for better accuracy
• Use streaming for LLM responses
• Cache frequent queries
• Batch multiple queries together

====================================================================

Usage:
    python rag_pipeline.py --query "Show me users from India"
    python rag_pipeline.py --interactive
    python rag_pipeline.py --api  # Start REST API server
"""

import os
import sys
import time
import argparse
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from dotenv import load_dotenv

# Load environment
load_dotenv()

# Rich terminal UI
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich.markdown import Markdown
    console = Console()
except ImportError:
    class Console:
        def print(self, *args, **kwargs): print(*args)
    console = Console()

# ============================================================================
# CONFIGURATION
# ============================================================================

@dataclass
class RAGPipelineConfig:
    """Complete RAG pipeline configuration"""
    
    # Vector Database (pgvector)
    pgvector_connection: str = os.getenv("PGVECTOR_CONNECTION_STRING", "")
    pgvector_table: str = os.getenv("PGVECTOR_TABLE", "vector_store")
    
    # Source Database (PostgreSQL/Neon)
    source_connection: str = os.getenv("NEON_CONNECTION_STRING", "")
    source_table: str = os.getenv("PG_TABLE", "users")
    source_primary_key: str = "id"
    
    # Embedding Model
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    
    # LLM Configuration
    llm_backend: str = os.getenv("LLM_BACKEND", "openai")  # openai, anthropic, ollama
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_model: str = "claude-3-5-haiku-20241022"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama2"
    
    # Retrieval Settings
    top_k: int = 8
    similarity_threshold: float = 0.30
    max_context_rows: int = 5
    
    # Search Mode
    search_mode: str = "semantic"  # semantic or hybrid


# ============================================================================
# STEP 1: RETRIEVER (Vector Search)
# ============================================================================

class Retriever:
    """Semantic retrieval using pgvector with HNSW + cosine distance"""
    
    def __init__(self, config: RAGPipelineConfig):
        self.config = config
        
        console.print("[dim]Loading embedding model...[/]")
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer(config.embedding_model)
        
        console.print("[dim]Connecting to pgvector...[/]")
        import psycopg2
        from psycopg2 import pool
        self.pool = pool.SimpleConnectionPool(
            minconn=1,
            maxconn=5,
            dsn=config.pgvector_connection
        )
        
        console.print("[green]✓[/] Retriever initialized\n")
    
    def retrieve(self, query: str) -> List[Dict[str, Any]]:
        """
        Retrieve relevant rows from pgvector
        
        Returns:
            List of dicts with: id, similarity, document, metadata
        """
        # 1. Embed query
        query_vector = self.model.encode(query)
        
        # 2. Search pgvector using HNSW + cosine distance
        conn = self.pool.getconn()
        try:
            from psycopg2.extras import RealDictCursor
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            cur.execute(
                f"""
                SELECT id, 
                       document, 
                       metadata,
                       embedding <=> %s::vector AS distance
                FROM {self.config.pgvector_table}
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (query_vector.tolist(), query_vector.tolist(), self.config.top_k)
            )
            
            results = cur.fetchall()
            cur.close()
            
            # Convert distance to similarity (0-1 scale)
            rows = []
            for row in results:
                distance = float(row['distance'])
                similarity = max(0.0, 1.0 - distance)
                
                if similarity >= self.config.similarity_threshold:
                    rows.append({
                        'id': row['id'],
                        'similarity': similarity,
                        'document': row['document'] or "",
                        'metadata': row['metadata'] or {}
                    })
            
            return rows
            
        finally:
            self.pool.putconn(conn)
    
    def close(self):
        """Close connections"""
        if hasattr(self, 'pool'):
            self.pool.closeall()


# ============================================================================
# STEP 2: SOURCE FETCHER (Full Row Lookup)
# ============================================================================

class SourceFetcher:
    """Fetch complete rows from source database"""
    
    def __init__(self, config: RAGPipelineConfig):
        self.config = config
        
        console.print("[dim]Connecting to source database...[/]")
        import psycopg2
        from psycopg2 import pool
        self.pool = pool.SimpleConnectionPool(
            minconn=1,
            maxconn=5,
            dsn=config.source_connection
        )
        
        console.print("[green]✓[/] Source fetcher initialized\n")
    
    def fetch_rows(self, row_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Fetch full rows from source database
        
        Returns:
            Dict mapping id -> full row data
        """
        if not row_ids:
            return {}
        
        conn = self.pool.getconn()
        try:
            from psycopg2.extras import RealDictCursor
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            placeholders = ','.join(['%s'] * len(row_ids))
            cur.execute(
                f'SELECT * FROM "{self.config.source_table}" WHERE "{self.config.source_primary_key}" IN ({placeholders})',
                row_ids
            )
            
            rows = cur.fetchall()
            cur.close()
            
            # Convert to dict mapping id -> row
            result = {}
            for row in rows:
                row_dict = dict(row)
                row_id = str(row_dict.get(self.config.source_primary_key))
                result[row_id] = row_dict
            
            return result
            
        finally:
            self.pool.putconn(conn)
    
    def close(self):
        """Close connections"""
        if hasattr(self, 'pool'):
            self.pool.closeall()


# ============================================================================
# STEP 3: CONTEXT BUILDER (Format Data for LLM)
# ============================================================================

class ContextBuilder:
    """Build context from retrieved rows"""
    
    @staticmethod
    def build_context(retrieved_rows: List[Dict], full_rows: Dict[str, Dict]) -> str:
        """
        Build formatted context for LLM
        
        Args:
            retrieved_rows: Results from vector search
            full_rows: Complete row data from source DB
        
        Returns:
            Formatted context string
        """
        if not retrieved_rows:
            return "No relevant data found."
        
        context_parts = []
        context_parts.append("Based on the following customer data:\n")
        
        # Build markdown table
        if full_rows:
            # Get columns from first row
            first_row = next(iter(full_rows.values()))
            columns = list(first_row.keys())
            
            # Table header
            header = "| " + " | ".join(columns) + " |"
            separator = "|" + "|".join(["---"] * len(columns)) + "|"
            context_parts.append(header)
            context_parts.append(separator)
            
            # Table rows
            for retrieved in retrieved_rows[:5]:  # Limit to top 5
                row_id = retrieved['id']
                if row_id in full_rows:
                    row_data = full_rows[row_id]
                    values = [str(row_data.get(col, "")) for col in columns]
                    # Truncate long values
                    values = [v[:50] + "..." if len(v) > 50 else v for v in values]
                    row_str = "| " + " | ".join(values) + " |"
                    context_parts.append(row_str)
        else:
            # Fallback to document strings
            for i, retrieved in enumerate(retrieved_rows[:5], 1):
                context_parts.append(f"\n{i}. {retrieved['document']}")
                context_parts.append(f"   (Similarity: {retrieved['similarity']:.2%})")
        
        return "\n".join(context_parts)


# ============================================================================
# STEP 4: LLM CLIENT (Generate Answers)
# ============================================================================

class LLMClient:
    """Multi-backend LLM client (OpenAI, Anthropic, Ollama)"""
    
    def __init__(self, config: RAGPipelineConfig):
        self.config = config
        self.backend = config.llm_backend.lower()
        
        console.print(f"[dim]Initializing LLM: {self.backend}...[/]")
        
        if self.backend == "openai":
            if not config.openai_api_key:
                raise ValueError("OPENAI_API_KEY not set")
            from openai import OpenAI
            self.client = OpenAI(api_key=config.openai_api_key)
            self.model = config.openai_model
            
        elif self.backend == "anthropic":
            if not config.anthropic_api_key:
                raise ValueError("ANTHROPIC_API_KEY not set")
            from anthropic import Anthropic
            self.client = Anthropic(api_key=config.anthropic_api_key)
            self.model = config.anthropic_model
            
        elif self.backend == "ollama":
            import requests
            self.base_url = config.ollama_base_url
            self.model = config.ollama_model
            # Test connection
            try:
                requests.get(f"{self.base_url}/api/tags", timeout=5)
            except Exception as e:
                raise ValueError(f"Cannot connect to Ollama at {self.base_url}: {e}")
        
        else:
            raise ValueError(f"Unknown LLM backend: {self.backend}")
        
        console.print("[green]✓[/] LLM client initialized\n")
    
    def generate(self, context: str, question: str) -> str:
        """
        Generate answer using LLM
        
        Args:
            context: Retrieved data context
            question: User question
        
        Returns:
            Generated answer
        """
        system_prompt = """You are a helpful AI assistant analyzing customer data.
Answer questions based ONLY on the provided data.
Be concise and cite specific data points.
If the data doesn't contain the answer, say so."""

        user_prompt = f"""{context}

Question: {question}

Answer:"""

        if self.backend == "openai":
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                max_tokens=1000
            )
            return response.choices[0].message.content
        
        elif self.backend == "anthropic":
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1000,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_prompt}
                ]
            )
            return response.content[0].text
        
        elif self.backend == "ollama":
            import requests
            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": f"{system_prompt}\n\n{user_prompt}",
                    "stream": False
                },
                timeout=120
            )
            return response.json()["response"]


# ============================================================================
# STEP 5: RAG PIPELINE (Complete Flow)
# ============================================================================

class RAGPipeline:
    """Complete RAG pipeline orchestrator"""
    
    def __init__(self, config: RAGPipelineConfig):
        self.config = config
        
        console.print(Panel(
            "[bold cyan]HAUP v3.0 - RAG Pipeline[/]\n"
            "[dim]Initializing components...[/]",
            border_style="cyan"
        ))
        
        # Initialize components
        self.retriever = Retriever(config)
        self.source_fetcher = SourceFetcher(config)
        self.llm = LLMClient(config)
        
        console.print("[bold green]✓ RAG Pipeline Ready![/]\n")
    
    def query(self, question: str, show_details: bool = True) -> Dict[str, Any]:
        """
        Execute complete RAG pipeline
        
        Args:
            question: User question
            show_details: Show retrieval details
        
        Returns:
            Dict with answer, sources, latency
        """
        start_time = time.time()
        
        if show_details:
            console.print(f"[bold]Question:[/] {question}\n")
        
        # Step 1: Retrieve from pgvector
        if show_details:
            console.print("[cyan]→[/] Searching pgvector...")
        retrieved_rows = self.retriever.retrieve(question)
        
        if not retrieved_rows:
            return {
                "answer": "I couldn't find any relevant data to answer your question.",
                "sources": [],
                "latency_ms": (time.time() - start_time) * 1000
            }
        
        if show_details:
            console.print(f"[green]✓[/] Found {len(retrieved_rows)} relevant rows\n")
        
        # Step 2: Fetch full rows from source
        if show_details:
            console.print("[cyan]→[/] Fetching complete data...")
        row_ids = [r['id'] for r in retrieved_rows]
        full_rows = self.source_fetcher.fetch_rows(row_ids)
        
        if show_details:
            console.print(f"[green]✓[/] Retrieved {len(full_rows)} complete records\n")
        
        # Step 3: Build context
        if show_details:
            console.print("[cyan]→[/] Building context...")
        context = ContextBuilder.build_context(retrieved_rows, full_rows)
        
        # Step 4: Generate answer
        if show_details:
            console.print("[cyan]→[/] Generating answer...\n")
        answer = self.llm.generate(context, question)
        
        latency_ms = (time.time() - start_time) * 1000
        
        return {
            "answer": answer,
            "sources": retrieved_rows,
            "full_rows": full_rows,
            "latency_ms": latency_ms
        }
    
    def close(self):
        """Cleanup resources"""
        self.retriever.close()
        self.source_fetcher.close()


# ============================================================================
# DISPLAY FUNCTIONS
# ============================================================================

def display_result(result: Dict[str, Any]):
    """Display RAG result in terminal"""
    
    # Answer
    console.print(Panel(
        Markdown(result["answer"]),
        title="[bold green]Answer[/]",
        border_style="green"
    ))
    
    # Sources
    if result["sources"]:
        console.print("\n[bold cyan]Sources:[/]")
        table = Table(show_header=True, header_style="bold magenta")
        table.add_column("#", width=4)
        table.add_column("ID", width=12)
        table.add_column("Similarity", width=15)
        
        for i, source in enumerate(result["sources"][:5], 1):
            similarity_bar = "█" * int(source['similarity'] * 10) + "░" * (10 - int(source['similarity'] * 10))
            table.add_row(
                str(i),
                source['id'],
                f"{similarity_bar} {source['similarity']:.1%}"
            )
        
        console.print(table)
    
    # Metadata
    console.print(f"\n[dim]Latency: {result['latency_ms']:.0f}ms[/]")


# ============================================================================
# MODES: SINGLE QUERY, INTERACTIVE, API
# ============================================================================

def single_query_mode(config: RAGPipelineConfig, question: str):
    """Single question mode"""
    pipeline = RAGPipeline(config)
    try:
        result = pipeline.query(question)
        display_result(result)
    finally:
        pipeline.close()


def interactive_mode(config: RAGPipelineConfig):
    """Interactive REPL mode"""
    pipeline = RAGPipeline(config)
    
    console.print(Panel(
        "[bold]Interactive RAG Mode[/]\n"
        "[dim]Type your questions or 'quit' to exit[/]",
        border_style="blue"
    ))
    
    try:
        while True:
            try:
                question = console.input("\n[bold blue]You:[/] ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            
            if not question:
                continue
            
            if question.lower() in ['quit', 'exit', 'q']:
                break
            
            result = pipeline.query(question, show_details=False)
            console.print()
            display_result(result)
    
    finally:
        console.print("\n[yellow]Goodbye![/]")
        pipeline.close()


def api_mode(config: RAGPipelineConfig, port: int = 8000):
    """REST API mode"""
    try:
        from fastapi import FastAPI, HTTPException
        from fastapi.middleware.cors import CORSMiddleware
        from pydantic import BaseModel
        import uvicorn
    except ImportError:
        console.print("[red]FastAPI not installed. Install with: pip install fastapi uvicorn[/]")
        sys.exit(1)
    
    app = FastAPI(title="HAUP RAG API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"]
    )
    
    # Initialize pipeline
    pipeline = RAGPipeline(config)
    
    class QueryRequest(BaseModel):
        question: str
    
    @app.post("/query")
    def query_endpoint(request: QueryRequest):
        """Query the RAG system"""
        try:
            result = pipeline.query(request.question, show_details=False)
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/health")
    def health():
        """Health check"""
        return {"status": "healthy"}
    
    console.print(f"\n[bold green]Starting API server on http://localhost:{port}[/]")
    console.print(f"[dim]Docs: http://localhost:{port}/docs[/]\n")
    
    uvicorn.run(app, host="0.0.0.0", port=port)


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="HAUP v3.0 - Complete RAG Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument("--query", "-q", help="Single query mode")
    parser.add_argument("--interactive", "-i", action="store_true", help="Interactive mode")
    parser.add_argument("--api", action="store_true", help="Start REST API server")
    parser.add_argument("--port", type=int, default=8000, help="API port (default: 8000)")
    
    # Configuration overrides
    parser.add_argument("--backend", choices=["openai", "anthropic", "ollama"], help="LLM backend")
    parser.add_argument("--model", help="LLM model name")
    parser.add_argument("--top-k", type=int, help="Number of results to retrieve")
    
    args = parser.parse_args()
    
    # Load configuration
    config = RAGPipelineConfig()
    
    # Apply overrides
    if args.backend:
        config.llm_backend = args.backend
    if args.model:
        if config.llm_backend == "openai":
            config.openai_model = args.model
        elif config.llm_backend == "anthropic":
            config.anthropic_model = args.model
        elif config.llm_backend == "ollama":
            config.ollama_model = args.model
    if args.top_k:
        config.top_k = args.top_k
    
    # Execute mode
    try:
        if args.api:
            api_mode(config, args.port)
        elif args.interactive:
            interactive_mode(config)
        elif args.query:
            single_query_mode(config, args.query)
        else:
            # Default to interactive
            interactive_mode(config)
    
    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted[/]")
        sys.exit(0)
    except Exception as e:
        console.print(f"\n[red]Error: {e}[/]")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
