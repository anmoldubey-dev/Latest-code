# HAUP v3.0 - Hybrid Adaptive Unified Pipeline

> Transform your PostgreSQL/Neon database into an intelligent, searchable knowledge base with vector embeddings, semantic search, and conversational AI

## Description

HAUP (Hybrid Adaptive Unified Pipeline) is a comprehensive data intelligence platform that bridges traditional relational databases with modern AI capabilities. It automatically converts your PostgreSQL/Neon data into vector embeddings, enabling semantic search, conversational queries, and knowledge graph relationships.

### What It Does

- **Forward Pipeline**: Ingests PostgreSQL/Neon data and generates vector embeddings using sentence transformers
- **Reverse Pipeline**: Extracts and reconstructs data from vector stores back to PostgreSQL or Excel
- **RAG Engine**: Provides conversational AI interface for natural language queries over your data
- **Graph Pipeline**: Builds knowledge graphs with customer relationships and similarity networks
- **Real-time Sync**: Automatically updates embeddings when database changes occur

### Why It Exists

Traditional databases excel at structured queries but struggle with semantic search and natural language understanding. HAUP solves this by:

- Eliminating the gap between SQL databases and AI-powered search
- Enabling non-technical users to query data using natural language
- Providing instant semantic similarity search across millions of records
- Maintaining data consistency with automatic real-time synchronization

### The Problem It Solves

1. **Semantic Search**: Find similar records based on meaning, not just keywords
2. **Natural Language Queries**: Ask questions in plain English instead of writing SQL
3. **Data Intelligence**: Discover hidden relationships and patterns in your data
4. **Scalability**: Process millions of records with hardware-adaptive parallel processing
5. **Cost Efficiency**: $0.00 operational cost using open-source models and local processing

## Features

- **HNSW Indexing**: Fast approximate nearest neighbor search using Hierarchical Navigable Small World graphs
- **Cosine Similarity**: Accurate semantic similarity measurement using cosine distance metric
- **Hardware-Adaptive Processing**: Automatically detects CPU, RAM, and GPU capabilities to optimize performance
- **Crash-Safe Checkpointing**: Resume interrupted operations without data loss
- **Multi-Pipeline Architecture**: Forward, reverse, RAG, and graph pipelines work independently or together
- **Real-Time Synchronization**: PostgreSQL triggers automatically update embeddings on INSERT/UPDATE/DELETE
- **Conversational AI**: Chat-based interface with session management and conversation history
- **Multiple LLM Backends**: Support for OpenAI GPT, Anthropic Claude, and local Ollama models
- **Response Caching**: Intelligent caching reduces latency and API costs
- **Citation & Provenance**: Every AI response includes source citations with cosine similarity scores
- **Knowledge Graphs**: Build Neo4j graphs with customer relationships and similarity networks
- **REST API**: FastAPI-based API with SSE streaming, health checks, and analytics
- **Excel Export**: Extract vector data back to Excel with full schema preservation
- **Constraint Preservation**: Maintains primary keys, foreign keys, and unique constraints during reverse extraction
- **Rich Terminal UI**: Beautiful progress tracking with real-time statistics

## Tech Stack

### Core Technologies
- **Python 3.8+**: Primary programming language
- **PostgreSQL/Neon**: Source database and vector storage
- **pgvector**: PostgreSQL extension for vector similarity search with HNSW indexing
- **sentence-transformers**: Embedding generation (all-MiniLM-L6-v2)
- **PyTorch**: Deep learning framework for embeddings
- **HNSW (Hierarchical Navigable Small World)**: Graph-based approximate nearest neighbor search
- **Cosine Distance**: Similarity metric for vector comparisons

> 📖 **Learn More**: See [VECTOR_INDEX_GUIDE.md](VECTOR_INDEX_GUIDE.md) for detailed information about HNSW vs IVFFlat indexing options

### AI & ML
- **OpenAI API**: GPT-4 and GPT-3.5 support
- **Anthropic API**: Claude models support
- **Ollama**: Local LLM inference
- **spaCy**: Entity extraction for knowledge graphs (optional)

### Data Processing
- **psycopg2**: PostgreSQL database adapter
- **pandas**: Data manipulation and analysis
- **numpy**: Numerical computing
- **openpyxl**: Excel file generation

### Graph Database
- **Neo4j**: Knowledge graph storage and querying
- **neo4j-driver**: Python driver for Neo4j

### API & Web
- **FastAPI**: Modern REST API framework
- **uvicorn**: ASGI server
- **Server-Sent Events (SSE)**: Real-time streaming responses

### UI & Monitoring
- **Rich**: Beautiful terminal UI with progress bars
- **psutil**: System resource monitoring

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HAUP v3.0 Architecture                          │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────────────┐
                    │   PostgreSQL / Neon DB      │
                    │   (Source Data)              │
                    └──────────┬───────────────────┘
                               │
                               │ Real-time Triggers
                               │ (LISTEN/NOTIFY)
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐    ┌──────────────────┐    ┌──────────────┐
│   Forward     │    │  Real-time       │    │   Reverse    │
│   Pipeline    │    │  Listener        │    │   Pipeline   │
│   (main.py)   │    │  (parallel)      │    │ (reverse.py) │
└───────┬───────┘    └────────┬─────────┘    └──────┬───────┘
        │                     │                      │
        │ Embeddings          │ Incremental          │ Reconstruct
        │                     │ Updates              │
        │                     │                      │
        │ ┌───────────────────┘                      │
        │ │ Auto-trigger                             │
        │ │ (if enabled)                             │
        ▼ ▼                   ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│              pgvector (Vector Store)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  • 384-dim embeddings (all-MiniLM-L6-v2)            │  │
│  │  • HNSW index for fast similarity search            │  │
│  │  • Cosine distance metric                           │  │
│  │  • Metadata: rowid, source, timestamps              │  │
│  └──────────────────────────────────────────────────────┘  │
└────────┬────────────────────────────────┬───────────────────┘
         │                                │
         │                                │
         ▼                                ▼
┌──────────────────┐            ┌──────────────────┐
│   RAG Engine     │            │  Graph Builder   │
│   (rag_main.py)  │            │  (graph_main.py) │
└────────┬─────────┘            └────────┬─────────┘
         │                               │
         │ Retrieval                     │ Relationships
         │ + LLM                         │
         ▼                               ▼
┌──────────────────┐            ┌──────────────────┐
│   REST API       │            │     Neo4j        │
│   (rag_api.py)   │            │  Knowledge Graph │
│                  │            │                  │
│  • /sessions     │            │  • Customer      │
│  • /ask          │            │    Nodes         │
│  • /stream       │            │  • SIMILAR_TO    │
│  • /analytics    │            │    Edges         │
└──────────────────┘            │  • Entity        │
                                │    Extraction    │
                                └──────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Data Flow Summary                        │
├─────────────────────────────────────────────────────────────┤
│  1. Forward: PostgreSQL → Embeddings → pgvector            │
│  2. Graph (Auto): pgvector → Neo4j (if enabled)            │
│  3. Real-time: DB Changes → Auto-embed → pgvector          │
│  4. RAG: User Query → Semantic Search → LLM → Answer       │
│  5. Graph: pgvector + PostgreSQL → Neo4j Relationships     │
│  6. Reverse: pgvector → Reconstruct → PostgreSQL/Excel     │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
haup-v3/
│
├── main.py                          # Forward pipeline entry point
├── reverse_main.py                  # Reverse pipeline entry point
├── rag_main.py                      # RAG CLI interface
├── rag_api.py                       # REST API server
├── graph_main.py                    # Graph pipeline entry point
├── realtime_listener_parallel.py   # Real-time sync with worker pool
├── search.py                        # Simple semantic search CLI
├── test_data_operations.py         # Test INSERT/UPDATE/DELETE operations
├── reset_checkpoints.py            # Reset pipeline checkpoints
│
├── pgvector_client.py              # pgvector database client
├── graph_config.json               # Graph pipeline configuration
├── requirements.txt                # Python dependencies
├── .env.example                    # Environment variables template
│
├── forward_core/                   # Forward pipeline modules
│   ├── orchestrator.py            # Pipeline orchestration
│   ├── stream_reader.py           # SQL data streaming
│   ├── schema_analyzer.py         # Column classification
│   ├── worker_pool_manager.py     # Parallel embedding workers
│   ├── vector_writer.py           # pgvector batch writer
│   ├── checkpoint_queue_bridge.py # Crash-safe checkpointing
│   ├── hardware_detector.py       # System capability detection
│   ├── monitor.py                 # Real-time progress monitoring
│   └── query_engine.py            # Semantic search engine
│
├── reverse_core/                   # Reverse pipeline modules
│   ├── vect_batch_reader.py       # Vector batch streaming
│   ├── schema_loader.py           # Schema strategy loading
│   ├── schema_reconciler.py       # Type inference and reconciliation
│   ├── constraint_reader.py       # PostgreSQL constraint extraction
│   ├── reverse_writer.py          # SQL/Excel writer
│   ├── reverse_worker_pool.py     # Parallel text parsing workers
│   ├── checkpoint.py              # Chunk progress tracking
│   ├── hardware_detector.py       # Hardware detection
│   ├── monitor.py                 # Progress monitoring
│   └── text_filter/               # Text parsing utilities
│       ├── heuristic_parser.py    # Document-to-row parser
│       └── __init__.py
│
├── rag_core/                       # RAG engine modules
│   ├── rag_engine.py              # Main RAG orchestrator
│   ├── config.py                  # Configuration management
│   ├── retriever.py               # Vector similarity retrieval
│   ├── llm_client.py              # Multi-backend LLM client
│   ├── prompt_builder.py          # Dynamic prompt generation
│   ├── context_builder.py         # Context formatting
│   ├── query_rewriter.py          # Query expansion
│   ├── reranker.py                # Result reranking
│   ├── conversation_manager.py    # Session management
│   ├── cache.py                   # Response caching
│   ├── guardrails.py              # Input/output validation
│   ├── analytics.py               # Usage analytics
│   ├── background_worker.py       # Async maintenance tasks
│   └── logger.py                  # Structured logging
│
└── graph_core/                     # Graph pipeline modules
    ├── neo4j_client.py            # Neo4j connection manager
    ├── graph_builder.py           # Graph construction
    ├── knowledge_extractor.py     # Entity extraction (spaCy)
    └── relationship_analyzer.py   # Network analysis
```

## Installation & Setup

### Prerequisites

- Python 3.8 or higher
- PostgreSQL 12+ with pgvector extension
- (Optional) Neo4j 5.0+ for knowledge graphs
- (Optional) CUDA-capable GPU for faster embeddings

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd haup-v3
```

### Step 2: Install Dependencies

```bash
# Install Python packages
pip install -r requirements.txt

# Install pgvector extension in PostgreSQL
# For Neon: pgvector is pre-installed with HNSW support
# For local PostgreSQL:
psql -U postgres -d your_database -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

> **Note**: HAUP v3.0 uses HNSW indexing by default for optimal performance. See [VECTOR_INDEX_GUIDE.md](VECTOR_INDEX_GUIDE.md) for configuration options.

### Step 3: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

Required environment variables:

```bash
# PostgreSQL/Neon Connection
NEON_CONNECTION_STRING=postgresql://user:password@host.neon.tech/dbname
PGVECTOR_CONNECTION_STRING=postgresql://user:password@host.neon.tech/dbname
PGVECTOR_TABLE=vector_store
PG_TABLE=users

# Hardware
DEVICE=cpu  # or cuda for GPU

# Embedding Model
EMBEDDING_MODEL=all-MiniLM-L6-v2

# Vector Index Configuration (HNSW with cosine distance - default)
VECTOR_INDEX_TYPE=hnsw  # Options: hnsw (default), ivfflat
HNSW_M=16               # HNSW connections per layer (16-32)
HNSW_EF_CONSTRUCTION=64 # HNSW build quality (64-200)

# LLM Configuration (choose one)
OPENAI_API_KEY=your_openai_key
LLM_MODEL=gpt-4

# Or use Ollama (local)
# LLM_BACKEND=ollama
# OLLAMA_MODEL=llama2

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000

# Optional: Neo4j (for graph features)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
```

### Step 4: Run Forward Pipeline

```bash
# Initial run - processes all data and optionally builds graph
python main.py

# Reset and start fresh
python main.py --reset
```

**Note**: If `graph_config.json` exists with `auto_start_after_forward: true`, the graph pipeline will automatically run after the forward pipeline completes.

### Step 5: Start Real-time Sync (Optional)

```bash
# Automatically starts after forward pipeline completes
# Or run manually:
python realtime_listener_parallel.py
```

### Step 6: Query Your Data

```bash
# Interactive RAG CLI
python rag_main.py

# Single query
python rag_main.py --query "Show me users from Delhi"

# Start REST API
python rag_api.py
# Then visit: http://localhost:8000/docs
```

### Step 7: Build Knowledge Graph (Optional)

The graph pipeline can run automatically after the forward pipeline or manually.

**Automatic (Recommended)**:
```bash
# Graph builds automatically if configured in graph_config.json
# Set: "auto_start_after_forward": true
python main.py
# Neo4j Browser will automatically open at http://localhost:7474
```

**Manual**:
```bash
# Build graph from embeddings
python graph_main.py --enable-knowledge-extraction

# Analyze relationships
python graph_main.py --analyze-sample

# Open Neo4j Browser manually
python open_neo4j.py
```

**Access Neo4j Browser**:
- Automatic: Browser opens automatically after graph build
- Click link: Click the clickable link in terminal output
- Manual: Open http://localhost:7474 in your browser

**Configuration** (graph_config.json):
```json
{
  "graph_build": {
    "enabled": true,
    "auto_start_after_forward": true,
    "batch_size": 1000,
    "max_workers": 4
  },
  "similarity_linking": {
    "enabled": true,
    "cosine_threshold": 0.75,
    "max_edges_per_node": 10
  }
}
```

### Step 8: Reverse Extraction (Optional)

```bash
# Extract to PostgreSQL
python reverse_main.py --output-table users_extracted

# Extract to Excel
python reverse_main.py --output-excel extracted.xlsx
```

## Screenshots from Demo

*Note: Add your actual screenshots here*

### 1. Forward Pipeline Processing
```
[Screenshot showing real-time progress with worker stats, embedding generation, and vector storage]
```

### 2. RAG Interactive Chat
```
[Screenshot of conversational interface with natural language queries and cited responses]
```

### 3. REST API Documentation
```
[Screenshot of FastAPI Swagger UI at /docs showing all endpoints]
```

### 4. Knowledge Graph Visualization
```
[Screenshot of Neo4j Browser showing customer nodes and similarity relationships]
```

### 5. Real-time Sync Monitoring
```
[Screenshot showing automatic embedding updates when database changes]
```

## Example Usage

### Example 1: Semantic Search for Similar Customers

```python
# search.py - Simple semantic search
from pgvector_client import PgvectorClient
from forward_core.query_engine import QueryEngine

# Initialize
client = PgvectorClient(
    connection_string="postgresql://user:pass@host/db",
    table="vector_store"
)
engine = QueryEngine(client)

# Search using cosine similarity with HNSW index
results = engine.search("customers interested in technology products", top_k=5)

for result in results:
    print(f"Customer: {result.metadata['name']}")
    print(f"Similarity: {result.similarity:.3f}")
    print(f"Email: {result.metadata['email']}")
    print("---")
```

Output:
```
Customer: John Smith
Similarity: 0.892
Email: john.smith@example.com
---
Customer: Sarah Johnson
Similarity: 0.867
Email: sarah.j@example.com
---
```

### Example 2: Conversational AI Query

```python
# Using the RAG API
import requests

# Create session
response = requests.post("http://localhost:8000/sessions")
session_id = response.json()["session_id"]

# Ask question
response = requests.post(
    f"http://localhost:8000/sessions/{session_id}/ask",
    json={
        "question": "Who are the most active users from India?",
        "use_cache": True
    }
)

result = response.json()
print(result["answer"])
print(f"\nSources: {result['retrieved_rows']} rows")
print(f"Latency: {result['latency_ms']:.0f}ms")
print(f"Cache hit: {result['cache_hit']}")

# Citations
for citation in result["citations"][:3]:
    print(f"  - Row {citation['rowid']} (similarity: {citation['similarity']:.3f})")
```

Output:
```
Based on the data, the most active users from India are:

1. Rajesh Kumar (rajesh.k@example.com) - Active since 2023, frequent transactions
2. Priya Sharma (priya.sharma@example.com) - High engagement score
3. Amit Patel (amit.p@example.com) - Regular monthly activity

These users show consistent engagement patterns and high interaction rates.

Sources: 15 rows
Latency: 1247ms
Cache hit: False
  - Row 1234 (similarity: 0.891)
  - Row 5678 (similarity: 0.876)
  - Row 9012 (similarity: 0.854)
```

---

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- Documentation: [repository-url]/wiki

## Acknowledgments

- Built with sentence-transformers for embeddings
- Powered by pgvector with HNSW indexing for efficient similarity search
- Cosine distance metric for accurate semantic similarity
- UI enhanced with Rich terminal library
- Graph capabilities provided by Neo4j

---

**HAUP v3.0** - Transform your database into an intelligent knowledge base 🚀
