"""
File Summary:
Main entry point of HAUP v2.0 with REAL-TIME PROGRESS TRACKING.
Shows live updates as execution flows through each component: A → B → C → D

====================================================================
SYSTEM PIPELINE FLOW 
====================================================================

main()
||
├── [STEP 1] get_data_source()  [Function] -----------> Configure Neon (PostgreSQL) connection
│       │
│       ├── [1.1] PostgreSQL Driver Check -----------> Verify psycopg2 is available
│       ├── [1.2] Connection Test -------------------> Connect to Neon
│       ├── [1.3] SqlSource Creation ----------------> Create data source object
│       └── [1.4] Table Validation ------------------> Test table access
│
├── [STEP 2] HardwareDetector()  [Class → Object] ----> Detect system hardware
│       │
│       ├── [2.1] CPU Detection ---------------------> Physical/logical cores
│       ├── [2.2] RAM Detection ---------------------> Total system memory
│       ├── [2.3] GPU Detection ---------------------> CUDA availability & VRAM
│       └── [2.4] Config Calculation ----------------> Workers, chunk size, batch size
│
├── [STEP 3] Data Statistics ---------------------> Analyze source data
│       │
│       ├── [3.1] Stream Reader Creation ------------> SQL reader initialization
│       ├── [3.2] File Stats Collection -------------> Row count, column analysis
│       └── [3.3] Chunk Calculation ----------------> Optimal chunk sizing
│
├── [STEP 4] Checkpoint System -------------------> Resume capability setup
│       │
│       ├── [4.1] SQLite Checkpoint Init -----------> Progress tracking database
│       ├── [4.2] Resume Summary Check --------------> Previous run analysis
│       ├── [4.3] Row Tracking Migration ------------> Legacy checkpoint conversion
│       └── [4.4] Early Exit Check -----------------> Skip if already complete
│
├── [STEP 5] Schema Analysis ---------------------> Column classification
│       │
│       ├── [5.1] Sample Data Extraction -----------> First chunk analysis
│       ├── [5.2] Column Categorization ------------> Semantic/numeric/date/skip
│       └── [5.3] Template Generation ---------------> Text serialization format
│
├── [STEP 6] Pipeline Initialization -------------> Core components setup
│       │
│       ├── [6.1] Queue Creation -------------------> Work/result/stats queues
│       ├── [6.2] Worker Pool Spawning -------------> Multiprocess workers
│       ├── [6.3] Vector Database Init --------------> pgvector connection
│       ├── [6.4] Vector Writer Start ---------------> Background storage thread
│       └── [6.5] Monitor Start --------------------> Progress tracking thread
│
├── [STEP 7] Data Processing Loop ----------------> Main execution
│       │
│       ├── [7.1] Orchestrator Start ---------------> Pipeline controller
│       ├── [7.2] Chunk Streaming ------------------> Data source reading
│       ├── [7.3] Worker Processing ----------------> Embedding generation
│       ├── [7.4] Vector Storage -------------------> pgvector writes
│       └── [7.5] Progress Updates -----------------> Real-time monitoring
│
└── [STEP 8] Cleanup & Results -------------------> Final statistics
        │
        ├── [8.1] Worker Shutdown ------------------> Graceful process termination
        ├── [8.2] Thread Cleanup -------------------> Stop background threads
        ├── [8.3] Stats Collection -----------------> Final performance metrics
        └── [8.4] Results Display ------------------> Summary and completion

====================================================================
FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

import multiprocessing
import logging
import sys
import math
import os
import time
import json
import threading
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path


# Fix Windows console encoding for Rich library
if os.name == 'nt':  # Windows
    if sys.stdout.encoding != 'utf-8':
        sys.stdout.reconfigure(encoding='utf-8')

# Load environment variables from .env file
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# FIX: Removed duplicate logging.basicConfig (DEBUG-level call was immediately
# overridden by the ERROR-level call below it, making it dead code).
logging.basicConfig(level=logging.ERROR, format="%(message)s")
for _n in ["httpx", "httpcore", "huggingface_hub", "huggingface_hub.utils._http",
           "sentence_transformers", "sentence_transformers.SentenceTransformer",
           "transformers", "filelock", "urllib3", "requests", "hf_transfer",
           "torch", "PIL", "tqdm"]:
    logging.getLogger(_n).setLevel(logging.ERROR)

# Enable debug logging for vector writer and pgvector
logging.getLogger("haup.vector_writer").setLevel(logging.DEBUG)
logging.getLogger("pgvector").setLevel(logging.DEBUG)
# Real-time sync now uses PostgreSQL LISTEN/NOTIFY (see realtime_listener.py)

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("TRANSFORMERS_VERBOSITY",  "error")
os.environ.setdefault("HF_HUB_VERBOSITY",        "error")

from rich.console import Console
from rich.panel   import Panel
from rich.table   import Table
from rich         import box as rbox
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn, TimeElapsedColumn
from rich.live import Live
from rich.text import Text

console = Console()

from forward_core.hardware_detector       import HardwareDetector
from forward_core.stream_reader           import SQLStreamReader
from forward_core.schema_analyzer         import SchemaAnalyzer
from forward_core.worker_pool_manager     import WorkerPoolManager
from forward_core.vector_writer           import VectorWriter
from forward_core.checkpoint_queue_bridge import SQLiteCheckpoint
from forward_core.monitor                 import Monitor
# FIX: Removed unused ExcelSource and ExcelStreamReader imports — pipeline
# is Neon (PostgreSQL) only; neither class is referenced anywhere in main().
from forward_core.orchestrator import SqlSource, Orchestrator


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
        "⚡": "cyan",
        "⏭️": "dim"
    }.get(status, "white")

    # Track operation timing
    operation_key = f"{step}::{substep}"
    duration_info = ""
    
    if status == "⏳" or status == "🔄":
        # Starting an operation
        _operation_start_times[operation_key] = current_time
        duration_info = "[dim]Started[/]"
    elif status in ["✅", "❌"] and operation_key in _operation_start_times:
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


"""================= Startup function get_data_source ================="""
def get_data_source():
    """
    Configure Neon (PostgreSQL) database connection.
    Requires NEON_CONNECTION_STRING or individual PG_* environment variables.
    """
    progress_update("STEP 1", "get_data_source()", "⏳", "Initializing Neon (PostgreSQL) connection...")

    try:
        conn_string = os.getenv("NEON_CONNECTION_STRING")

        if not conn_string:
            # Build a connection string from individual PG_* vars
            host     = os.getenv("PG_HOST", "localhost")
            port     = os.getenv("PG_PORT", "5432")
            user     = os.getenv("PG_USER", "postgres")
            password = os.getenv("PG_PASSWORD", "")
            database = os.getenv("PG_DATABASE", "Vector")
            conn_string = f"postgresql://{user}:{password}@{host}:{port}/{database}"
            progress_update("STEP 1.1", "os.getenv()", "⏳", "Building connection string from PG_* variables...")
        else:
            progress_update("STEP 1.1", "os.getenv()", "✅", "NEON_CONNECTION_STRING loaded")

        progress_update("STEP 1.2", "psycopg2.connect()", "⏳", "Connecting to Neon...")
        import psycopg2
        conn = psycopg2.connect(conn_string)
        progress_update("STEP 1.2", "psycopg2.connect()", "✅", "Connection established")

        progress_update("STEP 1.3", "SqlSource()", "⏳", "Creating SqlSource object...")
        source = SqlSource(
            connection = conn,
            table             = os.getenv("PG_TABLE", "users"),
            primary_key       = "id",
            name              = "Srcom-soft",
        )
        progress_update("STEP 1.3", "SqlSource()", "✅", f"SqlSource created for table '{source.table}'")

        progress_update("STEP 1.4", "cursor.execute()", "⏳", "Validating table access...")
        verify_conn = psycopg2.connect(conn_string)
        cursor = verify_conn.cursor()
        cursor.execute(f'SELECT COUNT(*) FROM "{source.table}" LIMIT 1')
        cursor.fetchone()
        cursor.close()
        verify_conn.close()
        progress_update("STEP 1.4", "cursor.execute()", "✅", "Table access verified")

        return source

    except ImportError:
        progress_update("STEP 1.1", "import psycopg2", "❌", "psycopg2 not installed")
        console.print("[red]ERROR: psycopg2 is required. Install with: pip install psycopg2-binary[/]")
        raise
    except Exception as e:
        progress_update("STEP 1", "get_data_source()", "❌", f"Failed: {str(e)}")
        raise
"""================= End function get_data_source ================="""


"""================= Startup function init_vector_db ================="""
def init_vector_db(table_name: str = "vector_store"):
    progress_update("STEP 6.3", "init_vector_db()", "⏳", "Initializing pgvector...")

    try:
        from pgvector_client import PgvectorClient
        from dotenv import load_dotenv
        load_dotenv()
        
        progress_update("STEP 6.3.1", "from pgvector_client import PgvectorClient", "✅", "pgvector library loaded")

        progress_update("STEP 6.3.2", "PgvectorClient()", "⏳", "Creating pgvector client...")
        
        # Load configuration from environment
        connection_string = os.getenv("PGVECTOR_CONNECTION_STRING", "")
        
        client = PgvectorClient(
            host=os.getenv("PGVECTOR_HOST", "localhost"),
            port=int(os.getenv("PGVECTOR_PORT", "5432")),
            user=os.getenv("PGVECTOR_USER", "postgres"),
            password=os.getenv("PGVECTOR_PASSWORD", ""),
            database=os.getenv("PGVECTOR_DATABASE", "vector_db"),
            table=table_name,
            connection_string=connection_string,
            embedding_dimension=384  # all-MiniLM-L6-v2 dimension
        )
        progress_update("STEP 6.3.2", "PgvectorClient()", "✅", "Client instance created")

        progress_update("STEP 6.3.3", "client.init_schema()", "⏳", f"Creating table '{table_name}' with HNSW index...")
        client.init_schema(use_hnsw=True, m=16, ef_construction=64)
        progress_update("STEP 6.3.3", "client.init_schema()", "✅", f"Table '{table_name}' ready with HNSW index (cosine distance)")

        return client

    except ImportError as e:
        progress_update("STEP 6.3", "init_vector_db()", "❌", f"pgvector not available: {e}")
        return _StubVectorDB()
    except Exception as e:
        progress_update("STEP 6.3", "init_vector_db()", "❌", f"Failed to initialize: {e}")
        return _StubVectorDB()
"""================= End function init_vector_db ================="""

"""================= Startup class _StubVectorDB ================="""
class _StubVectorDB:

    """================= Startup function upsert ================="""
    def upsert(self, ids, embeddings, metadatas):
        pass
    """================= End function upsert ================="""

    """================= Startup function query ================="""
    def query(self, query_embeddings, n_results, include):
        return {'ids': [[]], 'documents': [[]], 'metadatas': [[]], 'distances': [[]]}
    """================= End function query ================="""
    
    """================= Startup function get ================="""
    def get(self, ids=None, limit=None, offset=None, include=None):
        return {'ids': [], 'documents': [], 'metadatas': []}
    """================= End function get ================="""

    """================= Startup function delete ================="""
    def delete(self, ids):
        pass
    """================= End function delete ================="""
    
    """================= Startup function count ================="""
    def count(self):
        return 0
    """================= End function count ================="""
    
    """================= Startup function peek ================="""
    def peek(self, limit=10):
        return {'ids': [], 'documents': [], 'metadatas': []}
    """================= End function peek ================="""
    
    """================= Startup function close ================="""
    def close(self):
        pass
    """================= End function close ================="""

"""================= End class _StubVectorDB ================="""


"""================= Startup function _kv ================="""
def _kv(label: str, value: str, val_style: str = "cyan") -> None:
    console.print(f"  [bold]{label:<24}[/][{val_style}]{value}[/]")
"""================= End function _kv ================="""


"""================= Startup function _section ================="""
def _section(title: str) -> None:
    console.print(f"\n[bold bright_blue]{title}[/]  "
                  f"[dim]{'─' * max(0, 46 - len(title))}[/]")
"""================= End function _section ================="""


"""================= Startup function _hw_table ================="""
def _hw_table(cfg) -> None:
    tbl = Table(box=rbox.SIMPLE, show_header=False, expand=False, padding=(0, 1))
    tbl.add_column("k", style="bold dim", width=22)
    tbl.add_column("v", style="cyan")
    tbl.add_row("Physical CPU cores",  str(cfg.cpu_physical))
    tbl.add_row("Logical cores (HT)",  str(cfg.cpu_logical))
    tbl.add_row("Total RAM",           f"{cfg.total_ram_gb:.2f} GB")
    tbl.add_row("GPU",
                f"CUDA  {cfg.gpu_vram_gb:.1f} GB VRAM"
                if cfg.gpu_available else "Not available (CPU mode)")
    tbl.add_row("", "")
    tbl.add_row("Workers spawned",    str(cfg.num_workers))
    tbl.add_row("Device",             cfg.device)
    tbl.add_row("Initial batch size", str(cfg.initial_batch))
    console.print(tbl)
"""================= End function _hw_table ================="""


"""================= Startup function _schema_table ================="""
def _schema_table(strategy) -> None:
    tbl = Table(box=rbox.SIMPLE, show_header=True,
                header_style="bold magenta", expand=False, padding=(0, 1))
    tbl.add_column("Category",  style="bold",  width=14)
    tbl.add_column("Columns",   style="cyan")
    tbl.add_column("Action",    style="dim",   width=24)
    tbl.add_row("RowID",      strategy.rowid_col,                               "primary link-back key")
    tbl.add_row("Semantic",   ", ".join(strategy.semantic_cols) or "—",         "embedded as text")
    tbl.add_row("Numeric",    ", ".join(strategy.numeric_cols)  or "—",         "embedded with label")
    tbl.add_row("Date/Time",  ", ".join(strategy.date_cols)     or "—",         "stored as metadata")
    tbl.add_row("ID/Meta",    ", ".join(strategy.id_cols)       or "—",         "stored as metadata")
    tbl.add_row("Skipped",    ", ".join(strategy.skip_cols)     or "—",         "excluded entirely")
    console.print(tbl)
    console.print(f"  [dim]Template :[/]  [yellow]{strategy.template}[/]")
"""================= End function _schema_table ================="""


"""================= Startup function _worker_stats_table ================="""
def _worker_stats_table(worker_stats: list, title: str = "Worker Stats") -> None:
    if not worker_stats:
        console.print("  [dim]No worker stats saved yet.[/]")
        return

    _section(title)

    n_workers  = len(worker_stats)
    total_rows = sum(ws["rows_processed"] for ws in worker_stats)

    console.print(
        f"  [bold white]{n_workers} workers[/] processed "
        f"[bold cyan]{total_rows:,} rows[/] in total"
    )

    tbl = Table(box=rbox.ROUNDED, show_header=True,
                header_style="bold dim", expand=False, padding=(0, 2))
    tbl.add_column("#",             style="bold cyan",   width=4,  justify="center")
    tbl.add_column("Rows processed",style="white",       width=16, justify="right")
    tbl.add_column("Share %",       style="yellow",      width=10, justify="right")
    tbl.add_column("Rows bar",      width=22)
    tbl.add_column("Final batch",   style="green",       width=13, justify="right")

    for ws in sorted(worker_stats, key=lambda x: x["worker_id"]):
        wid   = ws["worker_id"]
        rows  = ws["rows_processed"]
        batch = ws["final_batch"]
        share = (rows / total_rows * 100) if total_rows else 0

        filled = max(1, int(share / 100 * 20))
        bar    = f"[cyan]{'█' * filled}[/][dim]{'░' * (20 - filled)}[/]"

        tbl.add_row(
            str(wid),
            f"{rows:,}",
            f"{share:.1f}%",
            bar,
            str(batch),
        )

    console.print(tbl)
    console.print(
        f"  [dim]Avg rows/worker: "
        f"[bold]{total_rows // n_workers if n_workers else 0:,}[/]   │   "
        f"Batch size grows automatically as VRAM allows.[/]\n"
    )
"""================= End function _worker_stats_table ================="""


"""================= Startup function _drain_stats_q ================="""
def _drain_stats_q(stats_q) -> list:
    import queue
    latest = {}
    while True:
        try:
            stat = stats_q.get_nowait()
            latest[stat.worker_id] = stat
        except Exception:
            break
    return list(latest.values())
"""================= End function _drain_stats_q ================="""


"""================= Startup function _start_realtime_listener ================="""
def _start_realtime_listener(source):
    """
    Set up PostgreSQL trigger and start the realtime listener.
    This function is called either after pipeline completion or when skipping pipeline.
    """
    _section("Real-Time Sync")
    progress_update("STEP 10", "setup_realtime_trigger()", "⏳", "Setting up automatic real-time embedding...")
    
    # Check if trigger is set up, if not, set it up automatically
    try:
        import psycopg2
        conn = psycopg2.connect(os.getenv('NEON_CONNECTION_STRING'))
        conn.autocommit = True
        cur = conn.cursor()
        
        progress_update("STEP 10.1", "cur.execute(SELECT FROM triggers)", "⏳", "Checking PostgreSQL trigger...")
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.triggers
            WHERE trigger_name = 'user_change_trigger'
        """)
        trigger_exists = cur.fetchone()[0] > 0
        
        if not trigger_exists:
            progress_update("STEP 10.1", "cur.execute(CREATE TRIGGER)", "⏳", "Creating PostgreSQL trigger...")
            
            # Create notification function with duplicate prevention
            cur.execute("""
                CREATE OR REPLACE FUNCTION notify_user_change()
                RETURNS TRIGGER AS $$
                BEGIN
                    -- For UPDATE: only notify if actual data changed (not just updated_at)
                    IF TG_OP = 'UPDATE' THEN
                        -- Skip if only updated_at changed
                        IF OLD.name = NEW.name AND 
                           OLD.email = NEW.email AND 
                           OLD.phone_number = NEW.phone_number AND 
                           OLD.country_code = NEW.country_code AND 
                           OLD.is_active = NEW.is_active AND
                           OLD.password_hash = NEW.password_hash THEN
                            RETURN NEW;  -- Skip notification
                        END IF;
                        
                        PERFORM pg_notify('user_changes', 
                            json_build_object(
                                'operation', TG_OP,
                                'id', NEW.id,
                                'name', NEW.name,
                                'email', NEW.email,
                                'phone_number', NEW.phone_number,
                                'country_code', NEW.country_code,
                                'is_active', NEW.is_active,
                                'created_at', NEW.created_at::text,
                                'updated_at', NEW.updated_at::text
                            )::text
                        );
                        RETURN NEW;
                    ELSIF TG_OP = 'INSERT' THEN
                        PERFORM pg_notify('user_changes', 
                            json_build_object(
                                'operation', TG_OP,
                                'id', NEW.id,
                                'name', NEW.name,
                                'email', NEW.email,
                                'phone_number', NEW.phone_number,
                                'country_code', NEW.country_code,
                                'is_active', NEW.is_active,
                                'created_at', NEW.created_at::text,
                                'updated_at', NEW.updated_at::text
                            )::text
                        );
                        RETURN NEW;
                    ELSIF TG_OP = 'DELETE' THEN
                        PERFORM pg_notify('user_changes',
                            json_build_object(
                                'operation', TG_OP,
                                'id', OLD.id
                            )::text
                        );
                        RETURN OLD;
                    END IF;
                END;
                $$ LANGUAGE plpgsql;
            """)
            
            # Create trigger
            cur.execute(f"""
                DROP TRIGGER IF EXISTS user_change_trigger ON {source.table};
            """)
            
            cur.execute(f"""
                CREATE TRIGGER user_change_trigger
                AFTER INSERT OR UPDATE OR DELETE ON {source.table}
                FOR EACH ROW EXECUTE FUNCTION notify_user_change();
            """)
            
            progress_update("STEP 10.1", "cur.execute(CREATE TRIGGER)", "✅", "PostgreSQL trigger created successfully")
            console.print("[green]✅ Real-time trigger installed automatically[/]")
        else:
            progress_update("STEP 10.1", "cur.execute(SELECT FROM triggers)", "✅", "PostgreSQL trigger already exists")
        
        cur.close()
        conn.close()
        
        # Start the real-time listener (now it will wait for incoming data)
        progress_update("STEP 10.2", "realtime_listener.main()", "⏳", "Starting real-time listener...")
        
        console.print()
        console.print("[bold cyan]═══════════════════════════════════════════════════════════════════[/]")
        console.print("[bold green]  Starting Real-Time Listener[/]")
        console.print("[bold cyan]═══════════════════════════════════════════════════════════════════[/]")
        console.print()
        console.print("[green]✅ Now monitoring for real-time changes[/]")
        console.print()
        console.print("[dim]The listener will wait for INSERT/UPDATE/DELETE operations...[/]")
        console.print("[dim]Test with: [bold]python test_data_operations.py[/bold] in another terminal[/]")
        console.print("[dim]Press Ctrl+C to stop[/]")
        console.print()
        
        # Import and run the listener directly (not subprocess)
        try:
            # Check if parallel mode is enabled
            use_parallel = os.getenv("REALTIME_PARALLEL", "true").lower() == "true"
            
            if use_parallel:
                # Import the parallel listener module
                import realtime_listener_parallel
                
                # Run the parallel listener's main function (this will block and wait for events)
                progress_update("STEP 10.2", "realtime_listener_parallel.main()", "🔄", "Parallel listener active with worker pool...")
                realtime_listener_parallel.main()
            else:
                # Import the standard listener module
                import realtime_listener
                
                # Run the listener's main function (this will block and wait for events)
                progress_update("STEP 10.2", "realtime_listener.main()", "🔄", "Listener active, waiting for database changes...")
                realtime_listener.main()
            
        except KeyboardInterrupt:
            console.print()
            console.print("[yellow]Real-time listener stopped by user[/]")
            progress_update("STEP 10.2", "realtime_listener.main()", "✅", "Listener stopped gracefully")
        except Exception as e:
            progress_update("STEP 10.2", "realtime_listener.main()", "❌", f"Failed: {str(e)}")
            console.print(f"[red]Failed to start listener: {e}[/]")
            console.print()
            console.print("[dim]You can start it manually with: [bold]python realtime_listener.py[/][/]")
            
    except Exception as e:
        progress_update("STEP 10", "setup_realtime_trigger()", "❌", f"Setup failed: {str(e)}")
        console.print()
        console.print(f"[red]⚠️  Real-time sync setup failed: {e}[/]")
        console.print()
        console.print("[dim]You can set it up manually:[/]")
        console.print("  [bold]1.[/] Run: [cyan]python setup_trigger.py[/]")
        console.print("  [bold]2.[/] Run: [cyan]python realtime_listener.py[/]")
        console.print()
"""================= End function _start_realtime_listener ================="""


"""================= Note: Real-Time Sync ================="""
# Real-time sync is now handled by PostgreSQL LISTEN/NOTIFY
# To enable real-time embedding:
#   1. Run: psql $NEON_CONNECTION_STRING -f setup_realtime.sql
#   2. Run: python realtime_listener.py
# See REALTIME_SETUP_GUIDE.md for details
"""================= End Note ================="""


"""================= Startup function main ================="""
def main():
    import sys

    # Handle reset flag
    if len(sys.argv) > 1 and sys.argv[1] == '--reset':
        progress_update("RESET", "os.remove()", "⏳", "Removing checkpoint files...")
        files_to_remove = ['job.db', 'haup_checkpoint.db']
        for file in files_to_remove:
            if os.path.exists(file):
                os.remove(file)
                progress_update("RESET", "os.remove()", "✅", f"Removed {file}")
        progress_update("RESET", "os.remove()", "✅", "Reset complete")
        console.print("[green]Checkpoint reset complete. Run again without --reset flag.[/]")
        return

    # Header
    console.print(Panel(
        "[bold white]HAUP v2.0  ─  Hybrid Adaptive Unified Pipeline[/]\n"
        "[dim]Neon (PostgreSQL) Edition  │  RowID Reverse Lookup  │  Cost: $0.00[/]\n"
        "[dim]Run [bold]search.py[/bold] for semantic search after ingestion.[/]",
        border_style="bright_blue", expand=False,
    ))

    console.print("\n[bold bright_blue]🚀 REAL-TIME EXECUTION FLOW[/]")
    console.print("[dim]Following the data pipeline step by step...[/]\n")

    # STEP 1: Data Source Configuration
    _section("Data Source")
    source = get_data_source()
    _kv("Mode",   "POSTGRESQL (NEON)")
    _kv("Target", source.table)

    # STEP 2: Hardware Detection
    _section("Hardware Detection")
    progress_update("STEP 2", "HardwareDetector()", "⏳", "Detecting system capabilities...")

    progress_update("STEP 2.1", "HardwareDetector.detect_cpu()", "⏳", "Scanning CPU cores...")
    progress_update("STEP 2.2", "HardwareDetector.detect_ram()", "⏳", "Checking memory...")
    progress_update("STEP 2.3", "HardwareDetector.detect_gpu()", "⏳", "Looking for CUDA devices...")

    config = HardwareDetector().detect()

    progress_update("STEP 2.4", "HardwareDetector.calculate_config()", "✅", f"Optimal: {config.num_workers} workers, {config.chunk_size} chunk size")
    _hw_table(config)

    # STEP 3: Data Statistics
    _section("Data Stats")
    progress_update("STEP 3", "SQLStreamReader.get_file_stats()", "⏳", "Analyzing source data...")

    progress_update("STEP 3.1", "SQLStreamReader()", "⏳", "Creating stream reader...")
    stats_reader = SQLStreamReader(source.conn, source.table, source.primary_key)
    progress_update("STEP 3.1", "SQLStreamReader()", "✅", "Stream reader initialized")

    progress_update("STEP 3.2", "stats_reader.get_file_stats()", "⏳", "Counting rows and columns...")
    stats = stats_reader.get_file_stats()
    progress_update("STEP 3.2", "stats_reader.get_file_stats()", "✅", f"Found {stats.total_rows:,} rows, {len(stats.columns)} columns")

    progress_update("STEP 3.3", "math.ceil()", "⏳", "Calculating optimal chunk size...")
    if stats.total_rows <= config.chunk_size:
        effective_chunk = max(1, math.ceil(stats.total_rows / config.num_workers))
    else:
        effective_chunk = config.chunk_size

    total_chunks  = math.ceil(stats.total_rows / effective_chunk) if effective_chunk else 1
    active_workers = min(config.num_workers, total_chunks)
    progress_update("STEP 3.3", "math.ceil()", "✅", f"Chunks: {total_chunks}, Active workers: {active_workers}")

    _kv("Total rows",    f"{stats.total_rows:,}")
    _kv("Chunk size",    f"{effective_chunk:,} rows  "
                          f"[dim](max configured: {config.chunk_size:,})[/]", "cyan")
    _kv("Total chunks",  f"{total_chunks:,}")
    _kv("Active workers", f"{active_workers}  [dim](capped to chunk count)[/]"
                           if active_workers < config.num_workers
                           else str(active_workers), "cyan")
    _kv("Columns",
        f"{len(stats.columns)}  →  [dim]{', '.join(stats.columns)}[/]", "white")

    # STEP 4: Checkpoint System
    _section("Resume Check")
    progress_update("STEP 4", "SQLiteCheckpoint()", "⏳", "Initializing progress tracking...")

    progress_update("STEP 4.1", "SQLiteCheckpoint('job.db')", "⏳", "Creating checkpoint database...")
    checkpoint = SQLiteCheckpoint('job.db')
    progress_update("STEP 4.1", "SQLiteCheckpoint('job.db')", "✅", "Checkpoint database ready")

    progress_update("STEP 4.2", "checkpoint.get_resume_summary()", "⏳", "Checking previous progress...")
    summary = checkpoint.get_resume_summary()

    if summary.failed > 0:
        progress_update("STEP 4.2", "checkpoint.retry_failed_chunks()", "⏳", f"Retrying {summary.failed} failed chunks...")
        retried_count = checkpoint.retry_failed_chunks()
        if retried_count > 0:
            summary = checkpoint.get_resume_summary()
            progress_update("STEP 4.2", "checkpoint.retry_failed_chunks()", "✅", f"Reset {retried_count} failed chunks for retry")

    progress_update("STEP 4.2", "checkpoint.get_resume_summary()", "✅", f"Found {summary.done} completed, {summary.failed} failed chunks")

    progress_update("STEP 4.3", "checkpoint.get_processed_row_count()", "⏳", "Checking row-level progress...")
    processed_rows = checkpoint.get_processed_row_count()
    if processed_rows == 0 and summary.done > 0:
        progress_update("STEP 4.3", "checkpoint.migrate_chunk_to_row_tracking()", "⏳", "Migrating legacy checkpoints...")
        migrated = checkpoint.migrate_chunk_to_row_tracking(source, source.table)
        if migrated > 0:
            processed_rows = checkpoint.get_processed_row_count()
            progress_update("STEP 4.3", "checkpoint.migrate_chunk_to_row_tracking()", "✅", f"Migrated {migrated} rows to new tracking")
            _kv("Migration", f"Migrated {migrated} rows to new tracking system", "yellow")

    rows_remaining = max(0, stats.total_rows - processed_rows)
    progress_update("STEP 4.3", "checkpoint.get_processed_row_count()", "✅", f"Processed: {processed_rows:,}, Remaining: {rows_remaining:,}")

    _kv("Rows processed", f"{processed_rows:,} / {stats.total_rows:,}",
        "green" if processed_rows > 0 else "dim")
    _kv("Rows remaining", f"{rows_remaining:,}",
        "yellow" if rows_remaining > 0 else "dim")
    _kv("Chunks done",   f"{summary.done} / {total_chunks}",
        "green" if summary.done > 0 else "dim")
    _kv("Chunks failed", str(summary.failed),
        "red" if summary.failed > 0 else "dim")

    # STEP 4.4: Early Exit Check - but still start realtime listener
    # Skip bulk pipeline if remaining rows are below threshold (realtime can handle them)
    REALTIME_THRESHOLD = int(os.getenv("REALTIME_THRESHOLD", "50"))  # Default: 50 rows
    
    if (rows_remaining == 0 and summary.failed == 0) or (rows_remaining <= REALTIME_THRESHOLD and summary.failed == 0):
        if rows_remaining == 0:
            progress_update("STEP 4.4", "if rows_remaining == 0", "✅", "All rows already processed - skipping pipeline")
        else:
            progress_update("STEP 4.4", "if rows_remaining <= threshold", "✅", f"Only {rows_remaining} rows remaining (threshold: {REALTIME_THRESHOLD}) - letting realtime listener handle them")

        saved_stats = checkpoint.get_worker_stats()
        _worker_stats_table(saved_stats, title="Worker Stats  (last run)")

        console.print()
        if rows_remaining == 0:
            console.print(Panel(
                "[bold green]✅  All rows already processed.[/]\n\n"
                "[dim]• To search: run [bold]python search.py[/bold]\n"
                "• To re-embed: delete [bold]job.db[/bold] "
                "and [bold]haup_checkpoint.db[/bold][/]\n\n"
                "[bold cyan]✅ All data embedded successfully![/]",
                border_style="green", expand=False,
            ))
        else:
            console.print(Panel(
                f"[bold yellow]⚠️  {rows_remaining} rows remaining[/]\n\n"
                f"[dim]• Below threshold ({REALTIME_THRESHOLD} rows)\n"
                f"• Realtime listener will process them automatically\n"
                f"• To force bulk processing: set REALTIME_THRESHOLD=0[/]\n\n"
                f"[bold cyan]✅ Skipping to realtime mode[/]",
                border_style="yellow", expand=False,
            ))
        
        # Skip to realtime listener setup (STEP 10)
        # Jump directly to starting the realtime listener
        _start_realtime_listener(source)
        return

    # STEP 5: Schema Analysis
    _section("Schema Analysis")
    progress_update("STEP 5", "SchemaAnalyzer.analyze()", "⏳", "Analyzing column types...")

    progress_update("STEP 5.1", "first_reader.stream_chunks()", "⏳", "Reading first chunk for analysis...")
    first_reader = SQLStreamReader(source.conn, source.table, source.primary_key)
    first_chunk  = next(first_reader.stream_chunks(config.chunk_size), None)
    if first_chunk is None:
        progress_update("STEP 5.1", "first_reader.stream_chunks()", "❌", "Data source is empty")
        console.print("[bold red]ERROR:[/] Data source is empty.")
        sys.exit(1)
    progress_update("STEP 5.1", "first_reader.stream_chunks()", "✅", f"Extracted {len(first_chunk.data)} sample rows")

    progress_update("STEP 5.2", "SchemaAnalyzer().analyze()", "⏳", "Categorizing columns...")
    strategy = SchemaAnalyzer().analyze(first_chunk.data, stats.columns)
    progress_update("STEP 5.2", "SchemaAnalyzer().analyze()", "✅",
                    f"Semantic: {len(strategy.semantic_cols)}, Numeric: {len(strategy.numeric_cols)}")

    progress_update("STEP 5.3", "strategy.template", "✅", "Text serialization template created")
    _schema_table(strategy)

    # STEP 6: Pipeline Initialization
    _section("Pipeline")
    progress_update("STEP 6", "multiprocessing.Queue()", "⏳", "Initializing core components...")

    progress_update("STEP 6.1", "multiprocessing.Queue()", "⏳", "Creating inter-process queues...")
    work_q   = multiprocessing.Queue(maxsize=20)
    result_q = multiprocessing.Queue()
    stats_q  = multiprocessing.Queue()
    progress_update("STEP 6.1", "multiprocessing.Queue()", "✅", "Work, result, and stats queues ready")

    config.num_workers = active_workers

    _kv("Workers", f"Spawning {active_workers} processes  [dim](1 per chunk)[/]")
    _kv("Model",   "all-MiniLM-L6-v2  (loading, first run downloads ~80 MB…)")
    console.print()

    progress_update("STEP 6.2", "WorkerPoolManager.spawn_workers()", "⏳", f"Spawning {active_workers} worker processes...")
    processes = WorkerPoolManager().spawn_workers(
        config, strategy, work_q, result_q, stats_q)

    actual_active_workers = len(processes)
    if actual_active_workers != active_workers:
        console.print(f"[yellow]Note: Adjusted worker count from {active_workers} to {actual_active_workers} for platform compatibility[/]")
        active_workers = actual_active_workers

    progress_update("STEP 6.2", "WorkerPoolManager.spawn_workers()", "✅", f"{len(processes)} workers spawned successfully")

    vector_db = init_vector_db()

    progress_update("STEP 6.4", "VectorWriter.start_thread()", "⏳", "Starting background storage thread...")
    writer = VectorWriter(
        result_q=result_q, checkpoint=checkpoint, vector_db=vector_db,
        data_source_name=source.table, table_name=source.table, strategy=strategy,
    ).start_thread()
    progress_update("STEP 6.4", "VectorWriter.start_thread()", "✅", "Background writer thread started")

    progress_update("STEP 6.5", "Monitor.start_thread()", "⏳", "Starting progress monitor...")
    monitor = Monitor(
        stats_q=stats_q, checkpoint=checkpoint,
        writer_ref=writer, total_chunks=total_chunks,
    ).start_thread()
    progress_update("STEP 6.5", "Monitor.start_thread()", "✅", "Progress monitor active")

    config.chunk_size = effective_chunk

    # STEP 7: Data Processing Loop
    console.print(f"\n[bold bright_blue]⚡ PROCESSING PIPELINE ACTIVE[/]")
    progress_update("STEP 7", "Orchestrator.run()", "🔄", "Starting main execution loop...")

    progress_update("STEP 7.1", "Orchestrator()", "⏳", "Initializing pipeline controller...")

    try:
        progress_update("STEP 7.2", "orchestrator.run()", "🔄", "Beginning data stream processing...")
        Orchestrator().run(
            config=config, data_source=source, strategy=strategy,
            processes=processes, work_queue=work_q,
            result_queue=result_q, checkpoint=checkpoint,
        )
        progress_update("STEP 7", "Orchestrator.run()", "✅", "Pipeline execution completed successfully")

    except Exception as e:
        progress_update("STEP 7", "Orchestrator.run()", "❌", f"Pipeline failed: {str(e)}")
        console.print(f"[red]ERROR: Pipeline failed during execution: {e}[/red]")
        try:
            progress_update("STEP 7", "WorkerPoolManager.shutdown()", "⏳", "Shutting down workers...")
            WorkerPoolManager().shutdown(work_q, timeout=10)
            progress_update("STEP 7", "WorkerPoolManager.shutdown()", "✅", "Workers shut down")
        except:
            pass

    # STEP 8: Cleanup & Results
    console.print(f"\n[bold bright_blue]🏁 PIPELINE CLEANUP[/]")
    progress_update("STEP 8", "cleanup()", "⏳", "Shutting down components...")

    progress_update("STEP 8.1", "writer.stop()", "⏳", "Stopping vector writer...")
    writer.stop()
    progress_update("STEP 8.1", "writer.stop()", "✅", "Vector writer stopped")

    progress_update("STEP 8.2", "monitor.stop()", "⏳", "Stopping progress monitor...")
    monitor.stop()
    progress_update("STEP 8.2", "monitor.stop()", "✅", "Monitor stopped")

    progress_update("STEP 8.3", "monitor.get_final_worker_stats()", "⏳", "Collecting final statistics...")
    worker_stats_list = monitor.get_final_worker_stats()
    checkpoint.save_worker_stats(worker_stats_list)

    time.sleep(0.5)

    progress_update("STEP 8.3", "checkpoint.save_worker_stats()", "✅", "Statistics saved")

    _worker_stats_table(
        checkpoint.get_worker_stats(),
        title="Worker Stats  (this run)"
    )

    progress_update("STEP 8.4", "checkpoint.get_resume_summary()", "⏳", "Generating completion report...")

    final = checkpoint.get_resume_summary()
    final_processed_rows = checkpoint.get_processed_row_count()

    success_rate = (final_processed_rows / stats.total_rows * 100) if stats.total_rows > 0 else 0

    progress_update("STEP 8.4", "checkpoint.get_resume_summary()", "✅",
                    f"Pipeline complete: {final.done} chunks done, {final.failed} failed, {final_processed_rows:,} rows embedded ({success_rate:.1f}%)")

    console.print()
    console.print(Panel(
        f"[bold green]✅  Pipeline Complete[/]\n\n"
        f"  [bold]Chunks done   :[/]  [cyan]{final.done}[/]\n"
        f"  [bold]Chunks failed :[/]  "
        f"{'[red]' + str(final.failed) + '[/red]' if final.failed else '[dim]0[/dim]'}\n"
        f"  [bold]Rows embedded :[/]  [cyan]{final_processed_rows:,}[/] [dim]({success_rate:.1f}%)[/]\n"
        f"  [bold]Cost          :[/]  [bold green]$0.00[/]\n\n"
        f"  [dim]Run [bold]python search.py[/bold] to query your data.[/]",
        title="[bold white]HAUP v2.0[/]",
        border_style="green", expand=False,
    ))

    console.print(f"\n[bold green]🎉 EXECUTION COMPLETE[/] - All steps finished successfully!")

    # STEP 9: Optional Graph Build
    _section("Graph Build (Optional)")
    progress_update("STEP 9", "os.path.exists('graph_config.json')", "⏳", "Checking graph configuration...")

    if os.path.exists('graph_config.json'):
        with open('graph_config.json', 'r') as f:
            graph_cfg = json.load(f)

        if graph_cfg.get('graph_build', {}).get('enabled', False) and \
           graph_cfg.get('graph_build', {}).get('auto_start_after_forward', False):
            progress_update("STEP 9.1", "GraphBuilder.build_graph()", "⏳", "Auto-starting graph build pipeline...")
            console.print(Panel(
                "[bold cyan]🔗 Starting Graph Build Pipeline[/]\n\n"
                "[dim]Building knowledge graph from embeddings...[/]\n"
                "[dim]This will create customer nodes and similarity edges in Neo4j.[/]",
                border_style="cyan",
                expand=False
            ))

            try:
                # Import graph components
                from graph_core import Neo4jClient, GraphBuilder
                from pgvector_client import PgvectorClient
                import psycopg2

                progress_update("STEP 9.1.1", "Neo4jClient.connect()", "⏳", "Connecting to Neo4j...")
                
                # Initialize Neo4j client
                neo4j_client = Neo4jClient('graph_config.json')
                if not neo4j_client.connect():
                    progress_update("STEP 9.1.1", "Neo4jClient.connect()", "❌", "Failed to connect to Neo4j")
                    console.print("[yellow]⚠️  Could not connect to Neo4j. Is Neo4j running?[/]")
                    console.print("[dim]Start Neo4j or run graph build manually: python graph_main.py[/]")
                else:
                    progress_update("STEP 9.1.1", "Neo4jClient.connect()", "✅", "Connected to Neo4j")
                    
                    progress_update("STEP 9.1.2", "PgvectorClient()", "⏳", "Connecting to pgvector...")
                    
                    # Initialize pgvector client
                    pgvector_client = PgvectorClient(
                        connection_string=os.getenv("PGVECTOR_CONNECTION_STRING", ""),
                        table=os.getenv("PGVECTOR_TABLE", "vector_store")
                    )
                    progress_update("STEP 9.1.2", "PgvectorClient()", "✅", "Connected to pgvector")
                    
                    # Check if we have vectors
                    vector_count = pgvector_client.count()
                    if vector_count == 0:
                        progress_update("STEP 9.1.3", "pgvector_client.count()", "⚠️", "No vectors found")
                        console.print("[yellow]⚠️  No vectors in pgvector. Graph build skipped.[/]")
                    else:
                        progress_update("STEP 9.1.3", "pgvector_client.count()", "✅", f"{vector_count:,} vectors found")
                        
                        progress_update("STEP 9.1.4", "GraphBuilder.build_graph()", "⏳", "Building graph...")
                        
                        # Initialize graph builder
                        builder = GraphBuilder(
                            neo4j_client=neo4j_client,
                            pgvector_client=pgvector_client,
                            pg_connection_string=os.getenv("NEON_CONNECTION_STRING", ""),
                            source_table=source.table,
                            config=graph_cfg
                        )
                        
                        # Build graph
                        enable_knowledge = graph_cfg.get('knowledge_graph', {}).get('enabled', False)
                        stats = builder.build_graph(enable_knowledge_extraction=enable_knowledge)
                        
                        progress_update("STEP 9.1.4", "GraphBuilder.build_graph()", "✅", 
                                      f"Created {stats.get('customers_created', 0):,} nodes, "
                                      f"{stats.get('similarity_edges', 0):,} edges")
                        
                        # Display statistics
                        console.print(Panel(
                            f"[bold green]✅ Graph Build Complete[/]\n\n"
                            f"  [bold]Customers Created:[/]  [cyan]{stats.get('customers_created', 0):,}[/]\n"
                            f"  [bold]Similarity Edges:[/]   [cyan]{stats.get('similarity_edges', 0):,}[/]\n"
                            f"  [bold]Entities Created:[/]   [cyan]{stats.get('entities_created', 0):,}[/]\n"
                            f"  [bold]Entity Edges:[/]       [cyan]{stats.get('entity_edges', 0):,}[/]\n"
                            f"  [bold]Elapsed Time:[/]       [cyan]{stats.get('elapsed_seconds', 0)}s[/]\n\n"
                            f"[bold cyan]🌐 Neo4j Browser:[/]\n"
                            f"  [link=http://localhost:7474]http://localhost:7474[/link]\n\n"
                            f"[dim]• Click the link above to open Neo4j Browser\n"
                            f"• Or copy-paste: http://localhost:7474\n"
                            f"• Or run: python open_neo4j.py\n"
                            f"• Enable graph-enhanced RAG in graph_config.json\n"
                            f"• Analyze relationships: python graph_main.py --analyze-sample[/]",
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
                            pass  # Silently fail if browser can't be opened
                        
                        # Cleanup
                        pgvector_client.close()
                    
                    neo4j_client.close()

            except ImportError as e:
                progress_update("STEP 9.1", "import graph_core", "❌", f"Missing dependency: {e}")
                console.print(f"[yellow]⚠️  Graph build enabled but dependencies not installed: {e}[/]")
                console.print("[dim]Install with: pip install neo4j[/]")
            except Exception as e:
                progress_update("STEP 9.1", "GraphBuilder.build_graph()", "❌", f"Failed: {str(e)}")
                console.print(f"[red]Graph build failed: {e}[/]")
                console.print("[dim]Run manually with: python graph_main.py[/]")
                import traceback
                traceback.print_exc()
        else:
            if not graph_cfg.get('graph_build', {}).get('enabled', False):
                progress_update("STEP 9", "graph_cfg['graph_build']['enabled']", "⏭️", "Graph build disabled in config")
                console.print("[dim]Graph build disabled. Enable in graph_config.json or run manually: python graph_main.py[/]")
            else:
                progress_update("STEP 9", "graph_cfg['graph_build']['auto_start_after_forward']", "⏭️", "Graph auto-start disabled")
                console.print("[dim]Graph auto-start disabled. Run manually: python graph_main.py[/]")
    else:
        progress_update("STEP 9", "os.path.exists('graph_config.json')", "⏭️", "No graph_config.json found")
        console.print("[dim]No graph_config.json found. Graph features not configured.[/]")
        console.print("[dim]To enable: Copy graph_config.json.example and configure Neo4j settings.[/]")

    # Real-time sync integration (AUTOMATIC)
    _start_realtime_listener(source)

"""================= End function main ================="""

if __name__ == "__main__":
    multiprocessing.freeze_support()

    try:
        multiprocessing.set_start_method('spawn', force=True)
    except RuntimeError:
        pass

    main()