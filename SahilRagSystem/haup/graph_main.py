"""
File Summary:
Main entry point for HAUP v3.0 Graph Pipeline. Builds knowledge graph from
pgvector embeddings and PostgreSQL data, creating customer nodes and relationships.

====================================================================
SYSTEM PIPELINE FLOW
====================================================================

main()
||
├── [STEP 1] Load Configuration --------------------------> graph_config.json
│       │
│       ├── Neo4j connection settings -------------------> URI, credentials
│       ├── Graph build settings ------------------------> Batch sizes, workers
│       └── Knowledge extraction settings ---------------> NLP options
│
├── [STEP 2] Initialize Clients --------------------------> Database connections
│       │
│       ├── Neo4jClient() -------------------------------> Graph database
│       ├── PgvectorClient() ----------------------------> Vector database
│       └── PostgreSQL connection -----------------------> Source data
│
├── [STEP 3] Verify Prerequisites ------------------------> Check data availability
│       │
│       ├── Check pgvector has vectors ------------------> Count embeddings
│       ├── Check PostgreSQL has data -------------------> Count source rows
│       └── Check Neo4j connectivity --------------------> Test connection
│
├── [STEP 4] Build Graph ---------------------------------> Main construction
│       │
│       ├── GraphBuilder.build_graph() ------------------> Execute build
│       │       │
│       │       ├── Extract customers -------------------> From PostgreSQL
│       │       ├── Create customer nodes ---------------> Batch insert
│       │       ├── Build similarity graph --------------> From vectors
│       │       └── Extract entities (optional) ---------> NLP extraction
│       │
│       └── Display statistics --------------------------> Progress summary
│
├── [STEP 5] Analyze Relationships (optional) ------------> Network analysis
│       │
│       ├── RelationshipAnalyzer() ----------------------> Initialize analyzer
│       ├── Sample customer analysis --------------------> Demo analysis
│       └── Display insights ----------------------------> Network metrics
│
└── [STEP 6] Cleanup -------------------------------------> Close connections
        │
        ├── Close Neo4j connection ----------------------> Release resources
        ├── Close pgvector connection -------------------> Release resources
        └── Display completion summary ------------------> Final stats

====================================================================
FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Fix Windows console encoding
if os.name == 'nt':
    if sys.stdout.encoding != 'utf-8':
        sys.stdout.reconfigure(encoding='utf-8')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s"
)

# Suppress verbose libraries
for lib in ["httpx", "httpcore", "neo4j", "urllib3"]:
    logging.getLogger(lib).setLevel(logging.WARNING)

logger = logging.getLogger("haup.graph_main")

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    console = Console()
except ImportError:
    class Console:
        def print(self, *args, **kwargs):
            print(*args)
    console = Console()
    Panel = lambda text, **kwargs: text
    Table = None


"""================= Startup function progress_update ================="""
# Global dictionary to track start times for operations
_operation_start_times = {}

def progress_update(step: str, substep: str, status: str = "⏳", details: str = ""):
    """Real-time progress update with timestamp and duration tracking"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    current_time = datetime.now()
    
    status_color = {
        "⏳": "yellow",
        "✅": "green",
        "❌": "red",
        "🔄": "blue",
        "🔍": "cyan",
        "⚠️": "yellow",
        "⏭️": "dim"
    }.get(status, "white")

    # Track operation timing
    operation_key = f"{step}::{substep}"
    duration_info = ""
    
    if status == "⏳" or status == "🔄":
        # Starting an operation
        _operation_start_times[operation_key] = current_time
        duration_info = "[dim]Started[/]"
    elif status in ["✅", "❌", "⚠️"] and operation_key in _operation_start_times:
        # Completing an operation
        start_time = _operation_start_times[operation_key]
        duration = (current_time - start_time).total_seconds()
        
        if duration < 1:
            duration_info = f"[dim]Ended ({duration*1000:.0f}ms)[/]"
        elif duration < 60:
            duration_info = f"[dim]Ended ({duration:.2f}s)[/]"
        else:
            minutes = int(duration // 60)
            seconds = duration % 60
            duration_info = f"[dim]Ended ({minutes}m {seconds:.1f}s)[/]"
        
        # Clean up the tracking dictionary
        del _operation_start_times[operation_key]

    # Format the output
    if duration_info:
        console.print(f"[dim]{timestamp}[/] [{status_color}]{status}[/] [bold]{step}[/] → [cyan]{substep}[/] {duration_info} {details}")
    else:
        console.print(f"[dim]{timestamp}[/] [{status_color}]{status}[/] [bold]{step}[/] → [cyan]{substep}[/] {details}")
"""================= End function progress_update ================="""


"""================= Startup function load_config ================="""
def load_config(config_path: str = "graph_config.json") -> dict:
    """Load graph configuration from JSON file"""
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        logger.info(f"✅ Loaded configuration from {config_path}")
        return config
    except Exception as e:
        logger.error(f"❌ Failed to load config: {e}")
        sys.exit(1)
"""================= End function load_config ================="""


"""================= Startup function display_config ================="""
def display_config(config: dict):
    """Display configuration summary"""
    console.print("\n[bold bright_blue]Configuration[/]  " + "─" * 45)
    
    neo4j_cfg = config.get("neo4j", {})
    console.print(f"  [bold]Neo4j URI[/]              [cyan]{neo4j_cfg.get('uri')}[/]")
    console.print(f"  [bold]Neo4j Database[/]         [cyan]{neo4j_cfg.get('database')}[/]")
    
    build_cfg = config.get("graph_build", {})
    console.print(f"  [bold]Batch Size[/]             [cyan]{build_cfg.get('batch_size')}[/]")
    console.print(f"  [bold]Max Workers[/]            [cyan]{build_cfg.get('max_workers')}[/]")
    
    sim_cfg = config.get("similarity_linking", {})
    console.print(f"  [bold]Similarity Threshold[/]   [cyan]{sim_cfg.get('cosine_threshold')}[/]")
    console.print(f"  [bold]Max Edges/Node[/]         [cyan]{sim_cfg.get('max_edges_per_node')}[/]")
    
    kg_cfg = config.get("knowledge_graph", {})
    console.print(f"  [bold]Knowledge Extraction[/]   [cyan]{'Enabled' if kg_cfg.get('enabled') else 'Disabled'}[/]")
"""================= End function display_config ================="""


"""================= Startup function display_statistics ================="""
def display_statistics(stats: dict):
    """Display graph build statistics"""
    console.print("\n[bold bright_blue]Build Statistics[/]  " + "─" * 42)
    console.print(f"  [bold]Customers Created[/]      [cyan]{stats.get('customers_created', 0):,}[/]")
    console.print(f"  [bold]Similarity Edges[/]       [cyan]{stats.get('similarity_edges', 0):,}[/]")
    console.print(f"  [bold]Entities Created[/]       [cyan]{stats.get('entities_created', 0):,}[/]")
    console.print(f"  [bold]Entity Edges[/]           [cyan]{stats.get('entity_edges', 0):,}[/]")
    console.print(f"  [bold]Elapsed Time[/]           [cyan]{stats.get('elapsed_seconds', 0)}s[/]")
"""================= End function display_statistics ================="""


"""================= Startup function main ================="""
def main():
    """Main graph pipeline execution"""
    parser = argparse.ArgumentParser(
        description="HAUP v3.0 Graph Pipeline - Build knowledge graph from pgvector and PostgreSQL"
    )
    parser.add_argument("--config", default="graph_config.json",
                        help="Path to graph configuration file")
    parser.add_argument("--source-table", default="users",
                        help="PostgreSQL source table name")
    parser.add_argument("--enable-knowledge-extraction", action="store_true",
                        help="Enable NLP entity extraction (requires spaCy)")
    parser.add_argument("--analyze-sample", action="store_true",
                        help="Run sample relationship analysis after build")
    args = parser.parse_args()
    
    # Header
    console.print(Panel(
        "[bold white]HAUP v3.0  ─  Graph Pipeline[/]\n"
        "[dim]Knowledge Graph & Customer Relationships  │  Neo4j + pgvector[/]\n"
        "[dim]Build graph from embeddings and source data[/]",
        border_style="bright_blue",
        expand=False
    ))
    
    progress_update("STARTUP", "main()", "⏳", "Starting graph pipeline...")
    
    # STEP 1: Load configuration
    progress_update("STEP 1", "load_config()", "⏳", f"Loading {args.config}...")
    config = load_config(args.config)
    display_config(config)
    progress_update("STEP 1", "load_config()", "✅", "Configuration loaded")
    
    # STEP 2: Initialize clients
    progress_update("STEP 2", "Client Initialization", "⏳", "Connecting to databases...")
    
    try:
        # Import graph core modules
        from graph_core import Neo4jClient, GraphBuilder, RelationshipAnalyzer
        from pgvector_client import PgvectorClient
        import psycopg2
        
        progress_update("STEP 2.1", "Neo4jClient.connect()", "⏳", "Connecting to Neo4j...")
        neo4j_client = Neo4jClient(args.config)
        if not neo4j_client.connect():
            progress_update("STEP 2.1", "Neo4jClient.connect()", "❌", "Failed to connect")
            sys.exit(1)
        progress_update("STEP 2.1", "Neo4jClient.connect()", "✅", "Connected to Neo4j")
        
        progress_update("STEP 2.2", "PgvectorClient()", "⏳", "Connecting to pgvector...")
        pgvector_client = PgvectorClient(
            host=os.getenv("PGVECTOR_HOST", "localhost"),
            port=int(os.getenv("PGVECTOR_PORT", "5432")),
            user=os.getenv("PGVECTOR_USER", "postgres"),
            password=os.getenv("PGVECTOR_PASSWORD", ""),
            database=os.getenv("PGVECTOR_DATABASE", "vector_db"),
            table=os.getenv("PGVECTOR_TABLE", "vector_store"),
            connection_string=os.getenv("PGVECTOR_CONNECTION_STRING", "")
        )
        progress_update("STEP 2.2", "PgvectorClient()", "✅", "Connected to pgvector")
        
        progress_update("STEP 2.3", "psycopg2.connect()", "⏳", "Connecting to source database...")
        pg_conn_string = os.getenv("NEON_CONNECTION_STRING", "")
        if not pg_conn_string:
            progress_update("STEP 2.3", "psycopg2.connect()", "❌", "NEON_CONNECTION_STRING not set")
            sys.exit(1)
        
        # Test connection
        conn = psycopg2.connect(pg_conn_string)
        conn.close()
        progress_update("STEP 2.3", "psycopg2.connect()", "✅", "Connected to PostgreSQL")
        
        progress_update("STEP 2", "Client Initialization", "✅", "All clients initialized")
        
    except Exception as e:
        progress_update("STEP 2", "Client Initialization", "❌", f"Failed: {str(e)}")
        logger.error(f"Error details: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # STEP 3: Verify prerequisites
    progress_update("STEP 3", "pgvector_client.count()", "⏳", "Verifying data availability...")
    
    try:
        # Check pgvector has vectors
        vector_count = pgvector_client.count()
        console.print(f"  [bold]pgvector Vectors[/]       [cyan]{vector_count:,}[/]")
        
        if vector_count == 0:
            progress_update("STEP 3", "pgvector_client.count()", "❌", "No vectors in pgvector")
            console.print("[red]ERROR:[/] pgvector is empty. Run forward pipeline first (python main.py)")
            sys.exit(1)
        
        # Check PostgreSQL has data
        conn = psycopg2.connect(pg_conn_string)
        cursor = conn.cursor()
        cursor.execute(f'SELECT COUNT(*) FROM "{args.source_table}"')
        row_count = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        
        console.print(f"  [bold]PostgreSQL Rows[/]        [cyan]{row_count:,}[/]")
        
        if row_count == 0:
            progress_update("STEP 3", "cursor.execute()", "❌", "Source table is empty")
            sys.exit(1)
        
        progress_update("STEP 3", "cursor.execute()", "✅", "All prerequisites met")
        
    except Exception as e:
        progress_update("STEP 3", "cursor.execute()", "❌", f"Failed: {str(e)}")
        sys.exit(1)
    
    # STEP 4: Build graph
    progress_update("STEP 4", "GraphBuilder.build_graph()", "🔄", "Starting graph construction...")
    
    try:
        builder = GraphBuilder(
            neo4j_client=neo4j_client,
            pgvector_client=pgvector_client,
            pg_connection_string=pg_conn_string,
            source_table=args.source_table,
            config=config
        )
        
        stats = builder.build_graph(
            enable_knowledge_extraction=args.enable_knowledge_extraction
        )
        
        display_statistics(stats)
        progress_update("STEP 4", "GraphBuilder.build_graph()", "✅", "Graph construction completed")
        
    except Exception as e:
        progress_update("STEP 4", "GraphBuilder.build_graph()", "❌", f"Failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # STEP 5: Sample analysis (optional)
    if args.analyze_sample and stats.get("customers_created", 0) > 0:
        progress_update("STEP 5", "RelationshipAnalyzer.analyze_customer_network()", "🔍", "Running relationship analysis...")
        
        try:
            analyzer = RelationshipAnalyzer(neo4j_client, config)
            
            # Get a sample customer ID
            sample_query = f'SELECT id FROM "{args.source_table}" LIMIT 1'
            conn = psycopg2.connect(pg_conn_string)
            cursor = conn.cursor()
            cursor.execute(sample_query)
            sample_id = str(cursor.fetchone()[0])
            cursor.close()
            conn.close()
            
            console.print(f"\n[bold bright_blue]Sample Analysis (Customer {sample_id})[/]  " + "─" * 25)
            
            # Analyze network
            analysis = analyzer.analyze_customer_network(sample_id)
            console.print(f"  [bold]Degree (connections)[/]  [cyan]{analysis.get('degree', 0)}[/]")
            console.print(f"  [bold]Avg Similarity[/]        [cyan]{analysis.get('avg_similarity', 0):.3f}[/]")
            console.print(f"  [bold]Community Size[/]        [cyan]{analysis.get('community_size', 0)}[/]")
            
            # Show top connections
            top_conns = analysis.get("top_connections", [])
            if top_conns:
                console.print(f"\n  [bold]Top Connections:[/]")
                for i, conn in enumerate(top_conns[:3], 1):
                    console.print(f"    {i}. Customer {conn['customer_id']} (similarity: {conn['similarity']:.3f})")
            
            progress_update("STEP 5", "RelationshipAnalyzer.analyze_customer_network()", "✅", "Analysis completed")
            
        except Exception as e:
            progress_update("STEP 5", "RelationshipAnalyzer.analyze_customer_network()", "⚠️", f"Failed: {str(e)}")
    
    # STEP 6: Cleanup
    progress_update("STEP 6", "neo4j_client.close()", "⏳", "Closing connections...")
    neo4j_client.close()
    pgvector_client.close()
    progress_update("STEP 6", "neo4j_client.close()", "✅", "Connections closed")
    
    # Final summary
    console.print("\n" + "=" * 70)
    console.print("HAUP v3.0  Graph Pipeline Complete")
    console.print(f"  Customers   : {stats.get('customers_created', 0):,}")
    console.print(f"  Edges       : {stats.get('similarity_edges', 0):,}")
    console.print(f"  Entities    : {stats.get('entities_created', 0):,}")
    console.print(f"  Elapsed     : {stats.get('elapsed_seconds', 0)}s")
    console.print("=" * 70 + "\n")
    
    console.print(Panel(
        "[bold green]✅  Graph build completed successfully![/bold green]\n\n"
        "[bold cyan]🌐 Neo4j Browser:[/bold cyan]\n"
        "  [link=http://localhost:7474]http://localhost:7474[/link]\n\n"
        "[dim]• Click the link above to open Neo4j Browser\n"
        "• Or copy-paste: http://localhost:7474\n"
        "• Or run: python open_neo4j.py\n"
        "• Integrate with RAG: Enable 'use_graph' in graph_config.json\n"
        "• Analyze relationships: Use RelationshipAnalyzer API[/dim]",
        border_style="green",
        expand=False
    ))
    
    # Optionally open browser automatically
    try:
        import webbrowser
        console.print("\n[dim]Opening Neo4j Browser in your default browser...[/]")
        webbrowser.open("http://localhost:7474")
        console.print("[green]✓[/] Browser opened. If not, use the link above.\n")
    except Exception:
        pass  # Silently fail if browser can't be opened)

"""================= End function main ================="""


if __name__ == "__main__":
    main()
