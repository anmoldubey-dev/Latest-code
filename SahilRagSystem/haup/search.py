"""
File Summary:
HAUP v2.0 Semantic Search Engine with Hybrid Search capability. Provides both vector-only
semantic search and hybrid search combining vector similarity with BM25 keyword matching
using Reciprocal Rank Fusion (RRF) for result merging.

====================================================================
                            Startup
====================================================================
search
  ||
  ├── progress_update()  [Function] --------------------> Real-time progress with timestamp
  │
  ├── print_header()  [Function] -----------------------> Display search tool header
  │
  ├── print_menu()  [Function] -------------------------> Display mode selection menu
  │
  ├── get_search_mode_choice()  [Function] -------------> Get user's mode choice (1/2/Q)
  │
  ├── run_semantic_search()  [Function] ----------------> Vector similarity search only
  │       │
  │       ├── [SEARCH.1] Model Loading -----------------> Load SentenceTransformer
  │       ├── [SEARCH.2] Database Connection -----------> Connect to pgvector
  │       ├── [SEARCH.3] Query Encoding ----------------> Generate query embedding
  │       ├── [SEARCH.4] Vector Search -----------------> Query pgvector for top-k
  │       └── [SEARCH.5] Results Display ---------------> Format and display results
  │
  ├── run_hybrid_search()  [Function] ------------------> Vector + BM25 keyword search
  │       │
  │       ├── [HYBRID.1] Dependencies ------------------> Import required modules
  │       ├── [HYBRID.2] Model Loading -----------------> Load SentenceTransformer
  │       ├── [HYBRID.3] Database Connection -----------> Connect to pgvector
  │       ├── [HYBRID.4] Vector Search -----------------> Perform vector similarity
  │       ├── [HYBRID.5] BM25 Search -------------------> Perform keyword matching
  │       │       │
  │       │       ├── Tokenize query -------------------> Extract query terms
  │       │       ├── Search documents + metadata ------> Combined text search
  │       │       ├── Exact match detection ------------> Priority scoring
  │       │       └── BM25 scoring ---------------------> Calculate term frequency
  │       │
  │       ├── [HYBRID.6] Result Merging ----------------> RRF algorithm
  │       │       │
  │       │       ├── Vector results scoring -----------> RRF score calculation
  │       │       ├── BM25 results boosting ------------> Apply boost factor
  │       │       └── Merge and sort -------------------> Combined ranking
  │       │
  │       ├── [HYBRID.7] Result Fetching ---------------> Fetch merged details
  │       └── [HYBRID.8] Results Display ---------------> Format and display
  │
  ├── display_results()  [Function] --------------------> Format results table
  │       │
  │       ├── Calculate similarity bars ----------------> Visual similarity indicator
  │       ├── Show source tags (hybrid) ----------------> Vector/BM25/Both indicators
  │       ├── Display metadata -------------------------> Show first 3 metadata fields
  │       └── Display document preview -----------------> Show first 100 chars
  │
  ├── interactive_mode()  [Function] -------------------> Interactive REPL loop
  │       │
  │       ├── print_menu() -----------------------------> Show mode selection
  │       ├── get_search_mode_choice() -----------------> Get user choice
  │       ├── Get query input --------------------------> Prompt for search query
  │       ├── [Conditional Branch] mode ----------------> Semantic or Hybrid
  │       │       ├── Mode 1 → run_semantic_search() --> Vector only
  │       │       └── Mode 2 → run_hybrid_search() ----> Vector + BM25
  │       └── Continue prompt --------------------------> Search again or exit
  │
  └── main()  [Function] --------------------------------> Entry point
          │
          ├── Parse arguments --------------------------> CLI argument parsing
          ├── [Conditional Branch] query provided? -----> Single or interactive mode
          │       ├── Query provided → Single mode -----> Run once and exit
          │       └── No query → Interactive mode ------> REPL loop
          └── Execute search ---------------------------> Call appropriate function

====================================================================
            FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

import argparse
import sys
import os
from datetime import datetime
from pgvector_client import PgvectorClient

# Fix Windows console encoding
if os.name == 'nt':  # Windows
    if sys.stdout.encoding != 'utf-8':
        sys.stdout.reconfigure(encoding='utf-8')

# Configuration - Load from environment
import os
from dotenv import load_dotenv
load_dotenv()

PGVECTOR_HOST = os.getenv("PGVECTOR_HOST", "localhost")
PGVECTOR_PORT = int(os.getenv("PGVECTOR_PORT", "5432"))
PGVECTOR_USER = os.getenv("PGVECTOR_USER", "postgres")
PGVECTOR_PASSWORD = os.getenv("PGVECTOR_PASSWORD", "")
PGVECTOR_DATABASE = os.getenv("PGVECTOR_DATABASE", "vector_db")
PGVECTOR_TABLE = os.getenv("PGVECTOR_TABLE", "vector_store")
PGVECTOR_CONNECTION_STRING = os.getenv("PGVECTOR_CONNECTION_STRING", "")

MODEL_NAME = "all-MiniLM-L6-v2"
DEFAULT_TOP_K = 10


"""================= Startup function progress_update ================="""
def progress_update(step: str, substep: str, status: str = "⏳", details: str = ""):
    """Real-time progress update with timestamp"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    status_color_map = {
        "⏳": "yellow",
        "✅": "green",
        "❌": "red",
        "🔄": "blue",
        "🔍": "cyan"
    }
    # Simple print since we don't have rich console here
    print(f"[{timestamp}] [{status}] {step} → {substep} {details}")
"""================= End function progress_update ================="""


"""================= Startup function print_header ================="""
def print_header():
    """Print search tool header"""
    print("\n" + "=" * 70)
    print("  HAUP v2.0 — Semantic Search Engine")
    print("=" * 70)
"""================= End function print_header ================="""


"""================= Startup function print_menu ================="""
def print_menu():
    """Print search mode selection menu"""
    print("\n📊 SELECT SEARCH MODE:")
    print("  [1] Semantic Search (Vector similarity only)")
    print("  [2] Hybrid Search (Vector + Keyword matching)")
    print("  [Q] Quit")
    print()
"""================= End function print_menu ================="""


"""================= Startup function get_search_mode_choice ================="""
def get_search_mode_choice():
    """Get user's search mode choice"""
    while True:
        choice = input("  Enter choice [1/2/Q]: ").strip().lower()
        if choice in ['1', '2', 'q', 'quit', 'exit']:
            return choice
        print("  ❌ Invalid choice. Please enter 1, 2, or Q")
"""================= End function get_search_mode_choice ================="""


"""================= Startup function run_semantic_search ================="""
def run_semantic_search(query: str, top_k: int = DEFAULT_TOP_K):
    """Run semantic (vector-only) search"""
    print(f"\n🔍 Running SEMANTIC search for: '{query}'")
    print("   Mode: Vector similarity only")
    
    progress_update("SEARCH", "Initialization", "⏳", "Starting semantic search...")
    
    try:
        progress_update("SEARCH.1", "Model Loading", "⏳", f"Loading {MODEL_NAME}...")
        from sentence_transformers import SentenceTransformer
        
        # Load model
        print("   Loading embedding model...")
        model = SentenceTransformer(MODEL_NAME)
        progress_update("SEARCH.1", "Model Loading", "✅", "Model loaded")
        
        # Connect to pgvector
        progress_update("SEARCH.2", "Database Connection", "⏳", f"Connecting to pgvector...")
        print("   Connecting to pgvector...")
        client = PgvectorClient(
            host=PGVECTOR_HOST,
            port=PGVECTOR_PORT,
            user=PGVECTOR_USER,
            password=PGVECTOR_PASSWORD,
            database=PGVECTOR_DATABASE,
            table=PGVECTOR_TABLE,
            connection_string=PGVECTOR_CONNECTION_STRING
        )
        progress_update("SEARCH.2", "Database Connection", "✅", f"Connected to table '{PGVECTOR_TABLE}'")
        
        # Encode query
        progress_update("SEARCH.3", "Query Encoding", "⏳", "Generating query embedding...")
        print("   Encoding query...")
        query_vector = model.encode([query])[0]
        progress_update("SEARCH.3", "Query Encoding", "✅", "Query encoded")
        
        # Search
        progress_update("SEARCH.4", "Vector Search", "🔍", f"Searching for top {top_k} results...")
        print("   Searching vectors...")
        results = client.query(
            query_embeddings=[query_vector.tolist()],
            n_results=top_k,
            include=["documents", "metadatas", "distances"]
        )
        progress_update("SEARCH.4", "Vector Search", "✅", f"Found {len(results['ids'][0])} results")
        
        # Display results
        progress_update("SEARCH.5", "Results Display", "⏳", "Formatting results...")
        display_results(query, results, "semantic")
        progress_update("SEARCH.5", "Results Display", "✅", "Results displayed")
        progress_update("SEARCH", "Completion", "✅", "Semantic search completed successfully")
        
        client.close()
        
    except Exception as e:
        progress_update("SEARCH", "Error", "❌", f"Search failed: {str(e)}")
        print(f"   ❌ Error: {e}")
        import traceback
        traceback.print_exc()
"""================= End function run_semantic_search ================="""


"""================= Startup function run_hybrid_search ================="""
def run_hybrid_search(query: str, top_k: int = DEFAULT_TOP_K):
    """Run hybrid (vector + keyword) search"""
    print(f"\n🔍 Running HYBRID search for: '{query}'")
    print("   Mode: Vector similarity + BM25 keyword matching")
    
    progress_update("HYBRID", "Initialization", "⏳", "Starting hybrid search...")
    
    try:
        progress_update("HYBRID.1", "Dependencies", "⏳", "Loading required modules...")
        from sentence_transformers import SentenceTransformer
        import math
        from collections import Counter
        import re
        progress_update("HYBRID.1", "Dependencies", "✅", "Modules loaded")
        
        # Load model
        progress_update("HYBRID.2", "Model Loading", "⏳", f"Loading {MODEL_NAME}...")
        print("   Loading embedding model...")
        model = SentenceTransformer(MODEL_NAME)
        progress_update("HYBRID.2", "Model Loading", "✅", "Model loaded")
        
        # Connect to pgvector
        progress_update("HYBRID.3", "Database Connection", "⏳", f"Connecting to pgvector...")
        print("   Connecting to pgvector...")
        client = PgvectorClient(
            host=PGVECTOR_HOST,
            port=PGVECTOR_PORT,
            user=PGVECTOR_USER,
            password=PGVECTOR_PASSWORD,
            database=PGVECTOR_DATABASE,
            table=PGVECTOR_TABLE,
            connection_string=PGVECTOR_CONNECTION_STRING
        )
        progress_update("HYBRID.3", "Database Connection", "✅", f"Connected to '{PGVECTOR_TABLE}'")
        
        # === VECTOR SEARCH ===
        progress_update("HYBRID.4", "Vector Search", "🔍", "Performing vector similarity search...")
        print("   [1/3] Vector search...")
        query_vector = model.encode([query])[0]
        vector_results = client.query(
            query_embeddings=[query_vector.tolist()],
            n_results=top_k,
            include=["documents", "metadatas", "distances"]
        )
        progress_update("HYBRID.4", "Vector Search", "✅", f"Found {len(vector_results['ids'][0])} vector matches")
        
        # === BM25 KEYWORD SEARCH ===
        progress_update("HYBRID.5", "BM25 Search", "🔍", "Performing BM25 keyword search...")
        print("   [2/3] BM25 keyword search...")
        
        # Get all documents with metadata
        all_docs = client.get(include=["documents", "metadatas"])
        
        # Tokenize query
        query_tokens = re.findall(r'\w+', query.lower())
        query_lower = query.lower()
        
        # Build BM25 scores - search in BOTH document text AND metadata
        doc_scores = {}
        for idx, (doc, meta) in enumerate(zip(all_docs['documents'], all_docs['metadatas'])):
            if not doc:
                continue
            
            # Combine document text with metadata for searching
            searchable_text = doc.lower()
            if meta:
                # Add metadata values to searchable text
                meta_text = " ".join([str(v).lower() for v in meta.values() if v])
                searchable_text = searchable_text + " " + meta_text
            
            # Check for EXACT match first (highest priority)
            if query_lower in searchable_text:
                doc_scores[all_docs['ids'][idx]] = 100.0  # Very high score for exact match
                continue
            
            # Tokenize combined text for partial matching
            doc_tokens = re.findall(r'\w+', searchable_text)
            
            # Calculate BM25-like score for partial matches
            score = 0
            matched_terms = 0
            for term in query_tokens:
                if term in doc_tokens:
                    tf = doc_tokens.count(term)
                    # BM25 formula: tf / (tf + k1)
                    score += tf / (tf + 1.5)
                    matched_terms += 1
            
            # Only include if ALL query terms matched
            if matched_terms == len(query_tokens) and score > 0:
                doc_scores[all_docs['ids'][idx]] = score
        
        # Get top BM25 results
        bm25_top = sorted(doc_scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
        bm25_ids = [doc_id for doc_id, _ in bm25_top]
        
        print(f"   Found {len(bm25_ids)} BM25 matches")
        progress_update("HYBRID.5", "BM25 Search", "✅", f"Found {len(bm25_ids)} keyword matches")
        
        # === MERGE RESULTS (RRF) ===
        progress_update("HYBRID.6", "Result Merging", "🔄", "Merging results with RRF algorithm...")
        print("   [3/3] Merging results with RRF...")
        
        # RRF scoring with strong BM25 boost for exact matches
        rrf_scores = {}
        k = 60
        bm25_boost = 5.0  # Strong boost for exact matches (was 2.0)
        
        # Add vector results with their actual distances
        vector_ids = vector_results['ids'][0]
        vector_distances = vector_results['distances'][0]
        for rank, (doc_id, dist) in enumerate(zip(vector_ids, vector_distances), start=1):
            rrf_scores[doc_id] = {
                'rrf': 1 / (k + rank),
                'distance': dist,
                'source': 'vector'
            }
        
        # Add BM25 results with strong boost
        for rank, doc_id in enumerate(bm25_ids, start=1):
            bm25_score = (1 / (k + rank)) * bm25_boost  # Apply strong boost
            if doc_id in rrf_scores:
                # Already in vector results, boost RRF score
                rrf_scores[doc_id]['rrf'] += bm25_score
                rrf_scores[doc_id]['source'] = 'both'
            else:
                # Only in BM25 results - prioritize exact matches
                rrf_scores[doc_id] = {
                    'rrf': bm25_score,
                    'distance': 0.1,  # High score for exact keyword matches
                    'source': 'bm25'
                }
        
        # Sort by RRF score
        merged_ids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x]['rrf'], reverse=True)[:top_k]
        progress_update("HYBRID.6", "Result Merging", "✅", f"Merged to {len(merged_ids)} final results")
        
        # Fetch merged results
        progress_update("HYBRID.7", "Result Fetching", "⏳", "Fetching merged result details...")
        merged_results = client.get(
            ids=merged_ids,
            include=["documents", "metadatas"]
        )
        
        # Format for display with proper distances
        hybrid_results = {
            'ids': [merged_results['ids']],
            'documents': [merged_results['documents']],
            'metadatas': [merged_results['metadatas']],
            'distances': [[rrf_scores[doc_id]['distance'] for doc_id in merged_results['ids']]],
            'sources': [[rrf_scores[doc_id]['source'] for doc_id in merged_results['ids']]]
        }
        progress_update("HYBRID.7", "Result Fetching", "✅", "Results fetched")
        
        # Display results
        progress_update("HYBRID.8", "Results Display", "⏳", "Formatting results...")
        display_results(query, hybrid_results, "hybrid")
        progress_update("HYBRID.8", "Results Display", "✅", "Results displayed")
        progress_update("HYBRID", "Completion", "✅", "Hybrid search completed successfully")
        
        client.close()
        
    except Exception as e:
        progress_update("HYBRID", "Error", "❌", f"Search failed: {str(e)}")
        print(f"   ❌ Error: {e}")
        import traceback
        traceback.print_exc()
"""================= End function run_hybrid_search ================="""


"""================= Startup function display_results ================="""
def display_results(query: str, results: dict, mode: str):
    """Display search results in a formatted table"""
    print(f"\n{'=' * 70}")
    print(f"  RESULTS ({mode.upper()} MODE)")
    print(f"{'=' * 70}")
    
    if not results['ids'][0]:
        print("  No results found.")
        return
    
    ids = results['ids'][0]
    documents = results['documents'][0]
    metadatas = results['metadatas'][0]
    distances = results.get('distances', [[0.5] * len(ids)])[0]
    sources = results.get('sources', [[None] * len(ids)])[0]
    
    for i, (doc_id, doc, meta, dist, src) in enumerate(zip(ids, documents, metadatas, distances, sources), 1):
        similarity = 1.0 - dist
        bar_len = int(similarity * 10)
        bar = "█" * bar_len + "░" * (10 - bar_len)
        
        # Source indicator for hybrid mode
        source_tag = ""
        if mode == "hybrid" and src:
            if src == "both":
                source_tag = " [Vector+BM25]"
            elif src == "bm25":
                source_tag = " [BM25 only]"
            elif src == "vector":
                source_tag = " [Vector only]"
        
        print(f"\n  [{i}] Score: {similarity:.3f} {bar}{source_tag}")
        print(f"      ID: {doc_id}")
        
        # Show metadata
        if meta:
            meta_str = " | ".join([f"{k}: {v}" for k, v in list(meta.items())[:3]])
            print(f"      Meta: {meta_str}")
        
        # Show document preview
        doc_preview = doc[:100] + "..." if len(doc) > 100 else doc
        print(f"      Doc: {doc_preview}")
    
    print(f"\n{'=' * 70}")
    print(f"  Total: {len(ids)} results")
    print(f"{'=' * 70}\n")
"""================= End function display_results ================="""


"""================= Startup function interactive_mode ================="""
def interactive_mode():
    """Interactive search mode with menu"""
    print_header()
    
    while True:
        print_menu()
        choice = get_search_mode_choice()
        
        if choice in ['q', 'quit', 'exit']:
            print("\n  👋 Goodbye!\n")
            break
        
        # Get query
        print()
        query = input("  Enter search query: ").strip()
        
        if not query:
            print("  ❌ Query cannot be empty")
            continue
        
        # Run search based on choice
        if choice == '1':
            run_semantic_search(query)
        elif choice == '2':
            run_hybrid_search(query)
        
        # Ask if user wants to continue
        print()
        cont = input("  Search again? [Y/n]: ").strip().lower()
        if cont in ['n', 'no']:
            print("\n  👋 Goodbye!\n")
            break
"""================= End function interactive_mode ================="""


"""================= Startup function main ================="""
def main():
    parser = argparse.ArgumentParser(description="HAUP v2.0 Semantic Search")
    parser.add_argument("query", nargs="?", default=None,
                        help="Search query (omit for interactive mode)")
    parser.add_argument("--mode", choices=["semantic", "hybrid"], default="semantic",
                        help="Search mode: semantic (vector only) or hybrid (vector + keyword)")
    parser.add_argument("--top", type=int, default=DEFAULT_TOP_K,
                        help="Number of results to return")
    args = parser.parse_args()
    
    if args.query:
        # Single query mode
        print_header()
        if args.mode == "semantic":
            run_semantic_search(args.query, top_k=args.top)
        else:
            run_hybrid_search(args.query, top_k=args.top)
    else:
        # Interactive mode
        interactive_mode()
"""================= End function main ================="""


if __name__ == "__main__":
    main()
