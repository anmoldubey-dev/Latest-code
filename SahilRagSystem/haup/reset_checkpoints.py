#!/usr/bin/env python3
"""
File Summary:
HAUP v2.0 Checkpoint Reset Utility for forcing re-sync with actual database state.
Resets all checkpoint tracking and provides recommendations for next steps.

====================================================================
                        RESET FLOW DIAGRAM
====================================================================
main()
  ||
  ├── [STEP 1] Display header ------------------------> Show reset utility info
  ├── [STEP 2] Explain actions -----------------------> What will be done
  ├── [STEP 3] User confirmation ---------------------> Ask to proceed (y/n)
  │
  ├── [STEP 4] Check database state ------------------> Analyze current state
  │       │
  │       ├── [4.1] Connect to PostgreSQL ------------> Connect to Neon
  │       ├── [4.2] Count database rows --------------> SELECT COUNT(*) FROM users
  │       └── [4.3] Display count --------------------> Show total rows
  │
  ├── [STEP 5] Check pgvector state ------------------> Analyze vector storage
  │       │
  │       ├── [5.1] PgvectorClient() -----------------> Initialize client
  │       ├── [5.2] client.count() -------------------> Count vectors
  │       └── [5.3] Display count --------------------> Show total vectors
  │
  ├── [STEP 6] Analyze sync status -------------------> Compare counts
  │       │
  │       ├── [Branch] db_count == vector_count ------> Perfect sync
  │       ├── [Branch] vector_count < db_count -------> Partial sync (need embedding)
  │       └── [Branch] vector_count > db_count -------> Error state (unexpected)
  │
  ├── [STEP 7] Reset checkpoint files ----------------> Remove tracking databases
  │       │
  │       ├── [7.1] Remove job.db --------------------> Main pipeline checkpoint
  │       ├── [7.2] Remove haup_checkpoint.db --------> Legacy checkpoint
  │       └── [7.3] Remove realtime_checkpoint.db ----> Realtime listener checkpoint
  │
  └── [STEP 8] Provide recommendations ---------------> Next steps guidance
          │
          ├── [Branch] sync_status == "complete" -----> All data embedded
          │       │
          │       └── Recommend: python main.py ------> Start realtime listener only
          │
          ├── [Branch] sync_status == "partial" ------> Some rows need embedding
          │       │
          │       └── Recommend: python main.py ------> Process remaining + listener
          │
          └── [Branch] sync_status == "error" --------> Unexpected state
                  │
                  └── Recommend: Manual investigation -> Check data integrity

====================================================================
            FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

import os
import sqlite3
import psycopg2
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel

console = Console()
load_dotenv()

NEON_CONNECTION_STRING = os.getenv("NEON_CONNECTION_STRING")
PGVECTOR_CONNECTION_STRING = os.getenv("PGVECTOR_CONNECTION_STRING")
TABLE_NAME = os.getenv("PG_TABLE", "users")

"""================= Startup function main ================="""
def main():
    console.print(Panel(
        "[bold white]Checkpoint Reset Utility[/]\n"
        "[dim]This will reset checkpoint tracking and sync with actual data[/]",
        border_style="yellow"
    ))
    
    console.print("\n[bold]What this does:[/]")
    console.print("  1. Checks actual row count in database")
    console.print("  2. Checks actual vector count in pgvector")
    console.print("  3. Resets checkpoint databases")
    console.print("  4. Syncs checkpoint with actual state")
    
    response = console.input("\n[yellow]Continue? (y/n):[/] ").strip().lower()
    if response != 'y':
        console.print("[dim]Cancelled[/]")
        return
    
    # Step 1: Check database
    console.print("\n[cyan]Step 1: Checking database...[/]")
    try:
        conn = psycopg2.connect(NEON_CONNECTION_STRING)
        cursor = conn.cursor()
        cursor.execute(f"SELECT COUNT(*) FROM {TABLE_NAME}")
        db_count = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        console.print(f"[green]✅ Database has {db_count:,} rows[/]")
    except Exception as e:
        console.print(f"[red]❌ Failed: {e}[/]")
        return
    
    # Step 2: Check pgvector
    console.print("\n[cyan]Step 2: Checking pgvector...[/]")
    try:
        from pgvector_client import PgvectorClient
        
        vector_client = PgvectorClient(
            connection_string=PGVECTOR_CONNECTION_STRING,
            table="vector_store"
        )
        vector_count = vector_client.count()
        vector_client.close()
        console.print(f"[green]✅ pgvector has {vector_count:,} vectors[/]")
    except Exception as e:
        console.print(f"[red]❌ Failed: {e}[/]")
        return
    
    # Step 3: Show sync status
    console.print("\n[cyan]Step 3: Sync status...[/]")
    if db_count == vector_count:
        console.print(f"[green]✅ Perfect sync! All {db_count:,} rows are embedded[/]")
        sync_status = "complete"
    elif vector_count < db_count:
        diff = db_count - vector_count
        console.print(f"[yellow]⚠️  {diff:,} rows need embedding[/]")
        sync_status = "partial"
    else:
        console.print(f"[red]❌ More vectors than database rows (unexpected)[/]")
        sync_status = "error"
    
    # Step 4: Reset checkpoints
    console.print("\n[cyan]Step 4: Resetting checkpoints...[/]")
    
    # Reset main pipeline checkpoint
    if os.path.exists('job.db'):
        console.print("[dim]  Removing job.db...[/]")
        os.remove('job.db')
        console.print("[green]  ✅ job.db removed[/]")
    
    if os.path.exists('haup_checkpoint.db'):
        console.print("[dim]  Removing haup_checkpoint.db...[/]")
        os.remove('haup_checkpoint.db')
        console.print("[green]  ✅ haup_checkpoint.db removed[/]")
    
    # Reset realtime checkpoint
    if os.path.exists('realtime_checkpoint.db'):
        console.print("[dim]  Removing realtime_checkpoint.db...[/]")
        os.remove('realtime_checkpoint.db')
        console.print("[green]  ✅ realtime_checkpoint.db removed[/]")
    
    # Step 5: Recommendations
    console.print("\n[bold cyan]Next Steps:[/]")
    
    if sync_status == "complete":
        console.print("\n[green]All data is already embedded![/]")
        console.print("\n[bold]Run:[/] [cyan]python main.py[/]")
        console.print("[dim]  - Will skip bulk processing (nothing to do)[/]")
        console.print("[dim]  - Will start realtime listener[/]")
        console.print("[dim]  - Ready for new data[/]")
    
    elif sync_status == "partial":
        console.print(f"\n[yellow]{diff:,} rows need embedding[/]")
        console.print("\n[bold]Run:[/] [cyan]python main.py[/]")
        console.print(f"[dim]  - Will process {diff:,} unembedded rows[/]")
        console.print("[dim]  - Will start realtime listener[/]")
        console.print("[dim]  - System will be fully synced[/]")
    
    else:
        console.print("\n[red]Unexpected state - manual investigation needed[/]")
    
    console.print("\n[bold green]✅ Checkpoint reset complete![/]")
"""================= End function main ================="""

if __name__ == "__main__":
    main()
