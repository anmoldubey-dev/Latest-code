#!/usr/bin/env python3
"""
File Summary:
HAUP v2.0 Real-time Listener with Parallel Processing and Checkpoint Tracking.
Uses worker pool architecture for concurrent embedding generation and batched vector storage.

====================================================================
                    PARALLEL LISTENER FLOW DIAGRAM
====================================================================
main()
  ||
  ├── [INIT 1] Display header ------------------------> Show listener info
  ├── [INIT 2] Hardware detection --------------------> Detect CPU/GPU configuration
  │       │
  │       ├── HardwareDetector.detect() --------------> Auto-detect system resources
  │       ├── CPU cores detection --------------------> Physical/logical cores
  │       ├── RAM detection ---------------------------> Total system memory
  │       ├── GPU detection ---------------------------> CUDA availability + VRAM
  │       └── Worker calculation ---------------------> Optimal thread count
  │
  ├── [INIT 3] Worker configuration ------------------> Set worker count
  │       │
  │       ├── Check REALTIME_WORKERS env -------------> Override if specified
  │       └── Use hardware-detected count ------------> Default to hw_config.num_workers
  │
  ├── [INIT 4] Initialize checkpoint -----------------> RealtimeCheckpoint('realtime_checkpoint.db')
  │       │
  │       ├── Create SQLite database -----------------> Track processed events
  │       ├── Create processed_events table ----------> user_id + operation
  │       └── Load previous stats --------------------> Show processed count
  │
  ├── [INIT 5] Initialize main checkpoint sync -------> SQLiteCheckpoint('job.db')
  │       │
  │       ├── Import from forward_core ---------------> Use same checkpoint as main.py
  │       ├── Enable sync with bulk pipeline ---------> Prevent duplicate processing
  │       └── Fallback if unavailable ----------------> Continue without sync
  │
  ├── [INIT 6] Load embedding model ------------------> SentenceTransformer (shared)
  │       │
  │       ├── Load on detected device ----------------> CPU or CUDA
  │       └── Share across workers -------------------> Avoid PyTorch threading issues
  │
  ├── [INIT 7] Connect to pgvector -------------------> Initialize vector storage
  │       │
  │       ├── PgvectorClient() -----------------------> Create client
  │       └── init_schema() --------------------------> Create table + HNSW index
  │
  ├── [INIT 8] Connect to PostgreSQL -----------------> Setup LISTEN connection
  │       │
  │       ├── psycopg2.connect() ---------------------> Connect with keepalives
  │       ├── set_isolation_level(AUTOCOMMIT) --------> Enable autocommit
  │       └── LISTEN user_changes --------------------> Subscribe to channel
  │
  ├── [INIT 9] Create queues -------------------------> Inter-thread communication
  │       │
  │       ├── task_queue (maxsize=100) ---------------> Pending embedding tasks
  │       └── result_queue (maxsize=100) -------------> Completed embeddings
  │
  ├── [INIT 10] Start worker threads -----------------> Parallel embedding generation
  │       │
  │       └── For each worker (hw-detected count) ----> EmbeddingWorker thread
  │               │
  │               ├── Get task from queue ------------> (operation, data, timestamp)
  │               ├── Generate embedding -------------> model.encode(text)
  │               ├── Put result in queue ------------> (user_id, embedding, timing)
  │               └── Loop until poison pill ---------> None = shutdown signal
  │
  ├── [INIT 11] Start storage writer -----------------> Batched vector writes
  │       │
  │       └── StorageWriter thread -------------------> Single writer thread
  │               │
  │               ├── Collect results ----------------> Batch up to 10 writes
  │               ├── Timeout check ------------------> Or wait max 0.5s
  │               ├── Batch upsert -------------------> Write to pgvector
  │               ├── Mark processed (realtime) ------> Update realtime_checkpoint.db
  │               ├── Mark processed (main) ----------> Update job.db (sync with main.py)
  │               └── Loop until poison pill ---------> None = shutdown signal
  │
  └── [MAIN LOOP] Listen for notifications -----------> Process database events
          │
          ├── [LOOP.1] Wait for notification ---------> select() with 5s timeout
          │       │
          │       ├── Heartbeat every 30s ------------> Show uptime + stats
          │       └── Reconnect on connection loss ----> Auto-recovery
          │
          ├── [LOOP.2] Receive notification ----------> PostgreSQL NOTIFY event
          │       │
          │       ├── Parse JSON payload --------------> Extract operation + data
          │       ├── Check checkpoint ----------------> Skip if already processed
          │       ├── Queue task ----------------------> Add to task_queue
          │       └── Log queued ----------------------> Show operation + queue size
          │
          ├── [WORKER PROCESSING] --------------------> Parallel embedding (background)
          │       │
          │       ├── Worker picks task ---------------> From task_queue
          │       ├── Generate embedding --------------> model.encode()
          │       └── Queue result --------------------> To result_queue
          │
          ├── [STORAGE PROCESSING] -------------------> Batched writes (background)
          │       │
          │       ├── Collect batch -------------------> Up to 10 results
          │       ├── Batch upsert --------------------> pgvector.upsert()
          │       ├── Mark processed ------------------> checkpoint.mark_processed()
          │       └── Log success ---------------------> Show timing + batch size
          │
          └── [SHUTDOWN] Ctrl+C ----------------------> Graceful cleanup
                  │
                  ├── Stop workers -------------------> Send poison pills
                  ├── Stop storage writer ------------> Send poison pill
                  ├── Display final stats ------------> Total events + timing
                  └── Close connections --------------> Cleanup resources

====================================================================
                    COMPONENT ARCHITECTURE
====================================================================

┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL (Neon)                          │
│                    NOTIFY user_changes                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Main Thread (Listener)                       │
│  • Receives NOTIFY events                                       │
│  • Checks checkpoint (skip duplicates)                          │
│  • Queues tasks → task_queue                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Worker Pool (N threads, N = CPU count)             │
│  • Worker 1: task_queue → encode() → result_queue               │
│  • Worker 2: task_queue → encode() → result_queue               │
│  • Worker N: task_queue → encode() → result_queue               │
│  • Shared model (avoid PyTorch threading issues)                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                Storage Writer Thread (Single)                   │
│  • Collects results from result_queue                           │
│  • Batches up to 10 writes (or 0.5s timeout)                    │
│  • Upserts to pgvector (HNSW index)                             │
│  • Marks processed in checkpoint                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    pgvector (Vector Store)                      │
│                  HNSW index + cosine distance                   │
└─────────────────────────────────────────────────────────────────┘

====================================================================
            FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

import psycopg2
import psycopg2.extensions
import json
import select
import sys
import signal
import time
import multiprocessing
import sqlite3
from queue import Queue, Empty
from threading import Thread, Lock
from datetime import datetime
from sentence_transformers import SentenceTransformer
from pgvector_client import PgvectorClient
from dotenv import load_dotenv
import os

# Import hardware detector
from forward_core.hardware_detector import HardwareDetector

# Load environment variables
load_dotenv()

# Global flag for graceful shutdown
running = True

"""================= Startup function signal_handler ================="""
def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully"""
    global running
    print("\n\n[STOP] Shutting down gracefully...")
    running = False
"""================= End function signal_handler ================="""

signal.signal(signal.SIGINT, signal_handler)

"""================= Startup function log ================="""
def log(message, level="INFO"):
    """Pretty logging with colors and icons"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    colors = {
        "INFO": "\033[36m",
        "SUCCESS": "\033[32m",
        "ERROR": "\033[31m",
        "WARNING": "\033[33m",
        "DEBUG": "\033[90m",
    }
    reset = "\033[0m"
    color = colors.get(level, "")
    
    icons = {
        "INFO": "ℹ️ " if sys.stdout.isatty() else "[i]",
        "SUCCESS": "✅" if sys.stdout.isatty() else "[+]",
        "ERROR": "❌" if sys.stdout.isatty() else "[!]",
        "WARNING": "⚠️ " if sys.stdout.isatty() else "[*]",
        "DEBUG": "🔍" if sys.stdout.isatty() else "[?]",
    }
    icon = icons.get(level, "")
    
    print(f"[{timestamp}] {color}{icon} {level}{reset} {message}")
    sys.stdout.flush()
"""================= End function log ================="""

"""================= Startup function format_duration ================="""
def format_duration(seconds):
    """Format duration in human-readable format"""
    if seconds < 1:
        return f"{seconds*1000:.0f}ms"
    elif seconds < 60:
        return f"{seconds:.1f}s"
    else:
        minutes = int(seconds / 60)
        secs = seconds % 60
        return f"{minutes}m {secs:.0f}s"
"""================= End function format_duration ================="""

"""================= Startup class RealtimeCheckpoint ================="""
class RealtimeCheckpoint:
    """Checkpoint system for realtime listener to track processed rows"""
    
    """================= Startup function __init__ ================="""
    def __init__(self, db_path='realtime_checkpoint.db'):
        self.db_path = db_path
        self.lock = Lock()
        self._init_db()
    """================= End function __init__ ================="""
    
    """================= Startup function _init_db ================="""
    def _init_db(self):
        """Initialize checkpoint database"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Create table for processed rows
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS processed_events (
                    user_id INTEGER PRIMARY KEY,
                    operation TEXT NOT NULL,
                    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    event_data TEXT
                )
            """)
            
            # Create index for faster lookups
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_processed_at 
                ON processed_events(processed_at DESC)
            """)
            
            conn.commit()
            conn.close()
    """================= End function _init_db ================="""
    
    """================= Startup function is_processed ================="""
    def is_processed(self, user_id, operation):
        """Check if a user_id + operation has been processed"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT COUNT(*) FROM processed_events 
                WHERE user_id = ? AND operation = ?
            """, (user_id, operation))
            
            count = cursor.fetchone()[0]
            conn.close()
            
            return count > 0
    """================= End function is_processed ================="""
    
    """================= Startup function mark_processed ================="""
    def mark_processed(self, user_id, operation, event_data=None):
        """Mark a user_id + operation as processed"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT OR REPLACE INTO processed_events (user_id, operation, event_data)
                VALUES (?, ?, ?)
            """, (user_id, operation, json.dumps(event_data) if event_data else None))
            
            conn.commit()
            conn.close()
    """================= End function mark_processed ================="""
    
    """================= Startup function get_stats ================="""
    def get_stats(self):
        """Get checkpoint statistics"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN operation = 'INSERT' THEN 1 ELSE 0 END) as inserts,
                    SUM(CASE WHEN operation = 'UPDATE' THEN 1 ELSE 0 END) as updates,
                    SUM(CASE WHEN operation = 'DELETE' THEN 1 ELSE 0 END) as deletes
                FROM processed_events
            """)
            
            row = cursor.fetchone()
            conn.close()
            
            return {
                'total': row[0] or 0,
                'inserts': row[1] or 0,
                'updates': row[2] or 0,
                'deletes': row[3] or 0
            }
    """================= End function get_stats ================="""
    
    """================= Startup function cleanup_old ================="""
    def cleanup_old(self, days=7):
        """Clean up old checkpoint entries (older than N days)"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                DELETE FROM processed_events 
                WHERE processed_at < datetime('now', '-' || ? || ' days')
            """, (days,))
            
            deleted = cursor.rowcount
            conn.commit()
            conn.close()
            
            return deleted
    """================= End function cleanup_old ================="""

"""================= End class RealtimeCheckpoint ================="""

"""================= Startup class EmbeddingWorker ================="""
class EmbeddingWorker(Thread):
    """Worker thread that processes embedding tasks"""
    
    """================= Startup function __init__ ================="""
    def __init__(self, task_queue, result_queue, worker_id, shared_model):
        super().__init__(daemon=True)
        self.task_queue = task_queue
        self.result_queue = result_queue
        self.worker_id = worker_id
        self.model = shared_model  # Use shared model instead of loading per worker
    """================= End function __init__ ================="""
        
    """================= Startup function run ================="""
    def run(self):
        """Main worker loop"""
        log(f"Worker {self.worker_id} ready", "DEBUG")
        
        while running:
            try:
                # Get task with timeout
                task = self.task_queue.get(timeout=1)
                if task is None:  # Poison pill
                    break
                
                # Process task
                operation, data, event_start = task
                user_id = data['id']
                
                if operation in ['INSERT', 'UPDATE']:
                    # Create text representation
                    text = (
                        f"name: {data['name']} | "
                        f"email: {data['email']} | "
                        f"phone_number: {data['phone_number']} | "
                        f"id: {data['id']} | "
                        f"country_code: {data['country_code']}"
                    )
                    
                    # Generate embedding
                    embed_start = time.time()
                    embedding = self.model.encode([text])[0].tolist()
                    embed_time = time.time() - embed_start
                    
                    # Put result in queue
                    result = {
                        'operation': operation,
                        'user_id': user_id,
                        'text': text,
                        'embedding': embedding,
                        'embed_time': embed_time,
                        'event_start': event_start,
                        'worker_id': self.worker_id
                    }
                    self.result_queue.put(result)
                    
                elif operation == 'DELETE':
                    # Put delete result
                    result = {
                        'operation': 'DELETE',
                        'user_id': user_id,
                        'event_start': event_start,
                        'worker_id': self.worker_id
                    }
                    self.result_queue.put(result)
                
                self.task_queue.task_done()
                
            except Empty:
                continue
            except Exception as e:
                log(f"Worker {self.worker_id} error: {e}", "ERROR")
                self.task_queue.task_done()
    """================= End function run ================="""

"""================= End class EmbeddingWorker ================="""

"""================= Startup class StorageWriter ================="""
class StorageWriter(Thread):
    """Thread that writes embeddings to pgvector with batching and checkpoint tracking"""
    
    """================= Startup function __init__ ================="""
    def __init__(self, result_queue, vector_client, stats, checkpoint, main_checkpoint=None):
        super().__init__(daemon=True)
        self.result_queue = result_queue
        self.vector_client = vector_client
        self.stats = stats
        self.checkpoint = checkpoint  # Realtime checkpoint
        self.main_checkpoint = main_checkpoint  # Main pipeline checkpoint (job.db)
        self.batch_size = 10  # Batch up to 10 writes
        self.batch_timeout = 0.5  # Or wait max 0.5s
    """================= End function __init__ ================="""
        
    """================= Startup function run ================="""
    def run(self):
        """Main storage loop with batching"""
        log("Storage writer ready (batching enabled)", "DEBUG")
        
        batch = []
        last_batch_time = time.time()
        
        while running:
            try:
                # Try to get result with short timeout
                try:
                    result = self.result_queue.get(timeout=0.1)
                    if result is None:  # Poison pill
                        # Flush remaining batch
                        if batch:
                            self._flush_batch(batch)
                        break
                    batch.append(result)
                    self.result_queue.task_done()
                except Empty:
                    pass
                
                # Flush batch if full or timeout reached
                should_flush = (
                    len(batch) >= self.batch_size or
                    (batch and time.time() - last_batch_time >= self.batch_timeout)
                )
                
                if should_flush:
                    self._flush_batch(batch)
                    batch = []
                    last_batch_time = time.time()
                    
            except Exception as e:
                log(f"Storage writer error: {e}", "ERROR")
                if batch:
                    batch = []
    """================= End function run ================="""
    
    """================= Startup function _flush_batch ================="""
    def _flush_batch(self, batch):
        """Flush a batch of results to pgvector with checkpoint tracking"""
        if not batch:
            return
        
        # Separate by operation type
        inserts_updates = [r for r in batch if r['operation'] in ['INSERT', 'UPDATE']]
        deletes = [r for r in batch if r['operation'] == 'DELETE']
        
        # Batch write inserts/updates
        if inserts_updates:
            store_start = time.time()
            try:
                ids = [str(r['user_id']) for r in inserts_updates]
                embeddings = [r['embedding'] for r in inserts_updates]
                documents = [r['text'] for r in inserts_updates]
                metadatas = [{
                    'rowid': r['user_id'],
                    'source': 'users',
                    'table_or_sheet': 'users'
                } for r in inserts_updates]
                
                self.vector_client.upsert(
                    ids=ids,
                    embeddings=embeddings,
                    documents=documents,
                    metadatas=metadatas
                )
                store_time = time.time() - store_start
                
                # Update statistics, log, and mark as processed
                for r in inserts_updates:
                    if r['operation'] == 'INSERT':
                        self.stats['inserts'] += 1
                    else:
                        self.stats['updates'] += 1
                    
                    total_time = time.time() - r['event_start']
                    self.stats['total_time'] += total_time
                    
                    # Mark as processed in checkpoint
                    self.checkpoint.mark_processed(r['user_id'], r['operation'], {
                        'text': r['text'][:100],  # Store first 100 chars for reference
                        'processed_at': datetime.now().isoformat()
                    })
                    
                    # Also mark in main checkpoint if available
                    if self.main_checkpoint:
                        self.main_checkpoint.mark_row_processed(
                            row_id=r['user_id'],
                            source='users',
                            table_name='users'
                        )
                    
                    icon = ">>>" if not sys.stdout.isatty() else "✅"
                    print(f"{icon} [{datetime.now().strftime('%H:%M:%S')}] {r['operation']} user {r['user_id']} | "
                          f"embed={format_duration(r['embed_time'])}, "
                          f"store={format_duration(store_time / len(inserts_updates))}, "
                          f"total={format_duration(total_time)} "
                          f"[worker-{r['worker_id']}] [batch={len(inserts_updates)}]")
                    sys.stdout.flush()
                    
            except Exception as e:
                log(f"Batch write failed: {e}", "ERROR")
        
        # Batch delete
        if deletes:
            try:
                ids = [str(r['user_id']) for r in deletes]
                self.vector_client.delete(ids=ids)
                
                for r in deletes:
                    self.stats['deletes'] += 1
                    total_time = time.time() - r['event_start']
                    self.stats['total_time'] += total_time
                    
                    # Mark as processed in checkpoint
                    self.checkpoint.mark_processed(r['user_id'], 'DELETE')
                    
                    # Also mark in main checkpoint if available
                    if self.main_checkpoint:
                        self.main_checkpoint.mark_row_processed(
                            row_id=r['user_id'],
                            source='users',
                            table_name='users'
                        )
                    
                    log(f"Deleted vector for user {r['user_id']}", "SUCCESS")
                    
            except Exception as e:
                log(f"Batch delete failed: {e}", "ERROR")
    """================= End function _flush_batch ================="""

"""================= End class StorageWriter ================="""

"""================= Startup function main ================="""
def main():
    """Main listener with parallel processing"""
    
    # Print header
    print("\n" + "=" * 70)
    print("  HAUP v2.0 — Real-Time Embedding Listener (PARALLEL)")
    print("  Method: PostgreSQL LISTEN/NOTIFY + Worker Pool")
    print("=" * 70)
    print()
    sys.stdout.flush()
    
    # Hardware detection
    log("Detecting hardware configuration...")
    hw_detector = HardwareDetector()
    hw_config = hw_detector.detect()
    
    # Get number of workers from environment or use hardware detection
    env_workers = os.getenv("REALTIME_WORKERS")
    if env_workers:
        num_workers = int(env_workers)
        log(f"Using REALTIME_WORKERS from environment: {num_workers}", "INFO")
    else:
        num_workers = hw_config.num_workers
        log(f"Using hardware-detected workers: {num_workers}", "INFO")
    
    # Display hardware info
    log(f"Hardware Configuration:", "INFO")
    log(f"  CPU Cores: {hw_config.cpu_physical} physical, {hw_config.cpu_logical} logical", "DEBUG")
    log(f"  RAM: {hw_config.total_ram_gb:.2f} GB", "DEBUG")
    if hw_config.gpu_available:
        log(f"  GPU: CUDA available, {hw_config.gpu_vram_gb:.1f} GB VRAM", "DEBUG")
        log(f"  Device: {hw_config.device} (GPU mode)", "SUCCESS")
    else:
        log(f"  GPU: Not available", "DEBUG")
        log(f"  Device: {hw_config.device} (CPU mode)", "INFO")
    log(f"  Workers: {num_workers} embedding threads", "SUCCESS")
    
    # Initialize checkpoint system
    log("Initializing checkpoint system...")
    checkpoint = RealtimeCheckpoint()
    checkpoint_stats = checkpoint.get_stats()
    log(f"Checkpoint loaded: {checkpoint_stats['total']} events previously processed", "SUCCESS")
    if checkpoint_stats['total'] > 0:
        log(f"  Inserts: {checkpoint_stats['inserts']}, Updates: {checkpoint_stats['updates']}, Deletes: {checkpoint_stats['deletes']}", "DEBUG")
    
    # Initialize main pipeline checkpoint (job.db) for sync with main.py
    log("Initializing main pipeline checkpoint sync...")
    try:
        from forward_core.checkpoint_queue_bridge import SQLiteCheckpoint
        main_checkpoint = SQLiteCheckpoint('job.db')
        log("Main checkpoint sync enabled (job.db)", "SUCCESS")
    except Exception as e:
        log(f"Main checkpoint sync disabled: {e}", "WARNING")
        main_checkpoint = None
    
    # Load embedding model ONCE (shared by all workers)
    log(f"Loading embedding model: {hw_config.model_name}...")
    try:
        shared_model = SentenceTransformer(hw_config.model_name, device=hw_config.device)
        log(f"Embedding model loaded on {hw_config.device} (shared by all workers)", "SUCCESS")
    except Exception as e:
        log(f"Failed to load model: {e}", "ERROR")
        return 1
    
    # Initialize pgvector client
    log("Connecting to pgvector...")
    try:
        pgvector_conn_str = os.getenv("PGVECTOR_CONNECTION_STRING")
        if not pgvector_conn_str:
            log("PGVECTOR_CONNECTION_STRING not found in .env", "ERROR")
            return 1
            
        vector_client = PgvectorClient(
            connection_string=pgvector_conn_str,
            table=os.getenv("PGVECTOR_TABLE", "vector_store")
        )
        log(f"Connected to pgvector table: {vector_client.table}", "SUCCESS")
        
        # Initialize schema (create table and HNSW index with cosine distance if not exists)
        log("Initializing pgvector schema with HNSW index...")
        vector_client.init_schema(use_hnsw=True, m=16, ef_construction=64)
        log("pgvector schema ready with HNSW + cosine distance", "SUCCESS")
        
    except Exception as e:
        log(f"Failed to connect to pgvector: {e}", "ERROR")
        return 1
    
    # Connect to PostgreSQL for LISTEN
    log("Connecting to PostgreSQL for LISTEN...")
    try:
        neon_conn_str = os.getenv("NEON_CONNECTION_STRING")
        if not neon_conn_str:
            log("NEON_CONNECTION_STRING not found in .env", "ERROR")
            return 1
            
        conn = psycopg2.connect(neon_conn_str, keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5)
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        log("Connected to PostgreSQL", "SUCCESS")
    except Exception as e:
        log(f"Failed to connect to PostgreSQL: {e}", "ERROR")
        return 1
    
    # Start listening
    try:
        cur.execute("LISTEN user_changes;")
        log("Listening for user changes on channel 'user_changes'", "SUCCESS")
    except Exception as e:
        log(f"Failed to start LISTEN: {e}", "ERROR")
        cur.close()
        conn.close()
        return 1
    
    # Create queues
    task_queue = Queue(maxsize=100)
    result_queue = Queue(maxsize=100)
    
    # Statistics
    stats = {
        'inserts': 0,
        'updates': 0,
        'deletes': 0,
        'errors': 0,
        'total_time': 0.0
    }
    
    # Start worker threads
    workers = []
    for i in range(num_workers):
        worker = EmbeddingWorker(task_queue, result_queue, i, shared_model)
        worker.start()
        workers.append(worker)
    
    # Start storage writer
    storage_writer = StorageWriter(result_queue, vector_client, stats, checkpoint, main_checkpoint)
    storage_writer.start()
    
    # Print status
    print()
    print("=" * 70)
    print(f"  ✅ Real-Time Sync Active (Parallel Mode)")
    print("=" * 70)
    print(f"  Hardware: {hw_config.cpu_physical} CPU cores, {hw_config.total_ram_gb:.1f} GB RAM")
    if hw_config.gpu_available:
        print(f"  GPU: CUDA enabled, {hw_config.gpu_vram_gb:.1f} GB VRAM")
    print(f"  Device: {hw_config.device}")
    print(f"  Workers: {num_workers} embedding threads")
    print(f"  Model: {hw_config.model_name}")
    print(f"  Database: Neon PostgreSQL")
    print(f"  Vector Store: pgvector")
    print(f"  Channel: user_changes")
    print(f"  Status: Waiting for database changes...")
    print()
    print("  Press Ctrl+C to stop")
    print("=" * 70)
    print()
    sys.stdout.flush()
    
    start_time = time.time()
    last_activity = time.time()
    
    # Main loop
    global running
    while running:
        try:
            # Check if connection is still alive
            try:
                conn.poll()
            except psycopg2.OperationalError:
                log("Connection lost, reconnecting...", "WARNING")
                try:
                    conn.close()
                except:
                    pass
                
                # Reconnect
                conn = psycopg2.connect(neon_conn_str)
                conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
                cur = conn.cursor()
                cur.execute("LISTEN user_changes;")
                log("Reconnected successfully", "SUCCESS")
                continue
            
            # Wait for notification (5 second timeout)
            if select.select([conn], [], [], 5) == ([], [], []):
                # Show heartbeat every 30 seconds
                if time.time() - last_activity > 30:
                    uptime = time.time() - start_time
                    total = stats['inserts'] + stats['updates'] + stats['deletes']
                    avg_time = stats['total_time'] / total if total > 0 else 0
                    log(f"Heartbeat: {total} events, avg {format_duration(avg_time)}, uptime: {format_duration(uptime)}", "DEBUG")
                    last_activity = time.time()
                continue
            
            # Poll for notifications
            conn.poll()
            
            while conn.notifies:
                notify = conn.notifies.pop(0)
                event_start = time.time()
                
                try:
                    data = json.loads(notify.payload)
                    operation = data['operation']
                    user_id = data['id']
                    
                    # Check if already processed (duplicate detection)
                    if checkpoint.is_processed(user_id, operation):
                        icon = ">>>" if not sys.stdout.isatty() else "⏭️"
                        print(f"{icon} [{datetime.now().strftime('%H:%M:%S')}] Skipped: {operation} for user {user_id} (already processed)")
                        sys.stdout.flush()
                        continue
                    
                    # Queue task for workers
                    task = (operation, data, event_start)
                    task_queue.put(task)
                    
                    icon = ">>>" if not sys.stdout.isatty() else "📨"
                    print(f"{icon} [{datetime.now().strftime('%H:%M:%S')}] Queued: {operation} for user {user_id} [queue: {task_queue.qsize()}]")
                    sys.stdout.flush()
                    
                    last_activity = time.time()
                    
                except json.JSONDecodeError as e:
                    log(f"Failed to parse notification: {e}", "ERROR")
                    stats['errors'] += 1
                except Exception as e:
                    log(f"Error processing notification: {e}", "ERROR")
                    stats['errors'] += 1
        
        except psycopg2.OperationalError as e:
            log(f"Connection error: {e}", "ERROR")
            log("Attempting to reconnect in 5 seconds...", "WARNING")
            time.sleep(5)
            
            try:
                conn = psycopg2.connect(neon_conn_str)
                conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
                cur = conn.cursor()
                cur.execute("LISTEN user_changes;")
                log("Reconnected successfully", "SUCCESS")
            except Exception as reconnect_error:
                log(f"Reconnection failed: {reconnect_error}", "ERROR")
                time.sleep(5)  # Wait before next retry
        
        except Exception as e:
            log(f"Error in main loop: {e}", "ERROR")
            stats['errors'] += 1
            time.sleep(1)  # Prevent tight error loop
    
    # Cleanup
    log("Stopping workers...")
    for _ in workers:
        task_queue.put(None)  # Poison pill
    for worker in workers:
        worker.join(timeout=5)
    
    result_queue.put(None)  # Poison pill for storage writer
    storage_writer.join(timeout=5)
    
    # Final statistics
    print()
    print("=" * 70)
    print("  Final Statistics")
    print("=" * 70)
    
    total = stats['inserts'] + stats['updates'] + stats['deletes']
    uptime = time.time() - start_time
    avg_time = stats['total_time'] / total if total > 0 else 0
    
    print(f"  Inserts:     {stats['inserts']}")
    print(f"  Updates:     {stats['updates']}")
    print(f"  Deletes:     {stats['deletes']}")
    print(f"  Errors:      {stats['errors']}")
    print(f"  Total:       {total} events")
    print(f"  Uptime:      {format_duration(uptime)}")
    print(f"  Avg Time:    {format_duration(avg_time)} per event")
    
    if total > 0:
        events_per_sec = total / uptime
        print(f"  Throughput:  {events_per_sec:.2f} events/sec")
    
    print("=" * 70)
    print()
    
    # Close connections
    try:
        cur.close()
        conn.close()
        vector_client.close()
    except:
        pass
    
    log("Listener stopped", "SUCCESS")
    return 0
"""================= End function main ================="""

if __name__ == "__main__":
    sys.exit(main())
