"""
File Summary:
HAUP v2.0 Database Test Suite for testing realtime listener and parallel processing.
Provides three test modes for comprehensive database operation testing.

====================================================================
                        TEST FLOW DIAGRAM
====================================================================
main()
  ||
  ├── print_header() ---------------------------------> Display test suite header
  ├── print_menu() -----------------------------------> Show available tests
  ├── get_user_choice() ------------------------------> Get test selection (1-3 or q)
  │
  ├── [TEST 1] sequential_insert() [Method] ----------> One-by-one insertion
  │       │
  │       ├── [1.1] get_connection() -----------------> Connect to database
  │       ├── [1.2] get_table_columns() --------------> Get dynamic column list
  │       ├── [1.3] Infinite loop --------------------> Until Ctrl+C
  │       │       │
  │       │       ├── generate_random_data(1) --------> Create test record
  │       │       ├── INSERT INTO users --------------> Execute insert
  │       │       ├── conn.commit() ------------------> Commit transaction
  │       │       ├── Update progress ----------------> Show count + rate
  │       │       └── time.sleep(0.1) ----------------> Small delay
  │       │
  │       └── [1.4] Display summary ------------------> Total records + rate
  │
  ├── [TEST 2] concurrent_batch_insert() [Method] ----> Batch insertion (10 at a time)
  │       │
  │       ├── [2.1] ThreadPoolExecutor(10) -----------> Create thread pool
  │       ├── [2.2] Submit N batches -----------------> Queue batch jobs
  │       │       │
  │       │       ├── insert_batch() [Function] ------> Process one batch
  │       │       │       │
  │       │       │       ├── get_connection() -------> New connection
  │       │       │       ├── generate_random_data(10) -> Create 10 records
  │       │       │       ├── execute_batch() --------> Batch insert
  │       │       │       └── conn.commit() ----------> Commit batch
  │       │       │
  │       │       └── as_completed() -----------------> Wait for completion
  │       │
  │       └── [2.3] Display summary ------------------> Total records + rate
  │
  ├── [TEST 3] mixed_operations() [Method] -----------> Concurrent insert/update/delete
  │       │
  │       ├── [3.1] Prepare test data ----------------> Insert 50 records first
  │       ├── [3.2] ThreadPoolExecutor(10) -----------> Create thread pool
  │       ├── [3.3] Submit N operations --------------> Queue random ops
  │       │       │
  │       │       ├── perform_operation() [Function] -> Execute random op
  │       │       │       │
  │       │       │       ├── [Branch] operation type -> insert/update/delete
  │       │       │       │       │
  │       │       │       │       ├── INSERT ---------> Add new record
  │       │       │       │       ├── UPDATE ---------> Modify random field
  │       │       │       │       └── DELETE ---------> Remove random record
  │       │       │       │
  │       │       │       └── conn.commit() ----------> Commit operation
  │       │       │
  │       │       └── as_completed() -----------------> Wait for completion
  │       │
  │       └── [3.4] Display summary ------------------> Breakdown by operation type
  │
  └── DatabaseTester [Class] -------------------------> Test orchestrator
          │
          ├── __init__() -----------------------------> Load connection string
          ├── get_connection() -----------------------> Create DB connection
          ├── generate_random_data() -----------------> Generate test records
          └── get_table_columns() --------------------> Get dynamic schema

====================================================================
            FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

import os
import sys
import time
import random
import string
import psycopg2
from psycopg2.extras import execute_batch
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.table import Table
from rich import box

console = Console()
load_dotenv()

# Database configuration
NEON_CONNECTION_STRING = os.getenv("NEON_CONNECTION_STRING")
TABLE_NAME = os.getenv("PG_TABLE", "users")

"""================= Startup class DatabaseTester ================="""
class DatabaseTester:
    """================= Startup function __init__ ================="""
    def __init__(self):
        self.conn_string = NEON_CONNECTION_STRING
        if not self.conn_string:
            raise ValueError("NEON_CONNECTION_STRING not found in .env file")
    """================= End function __init__ ================="""
        
    """================= Startup function get_connection ================="""
    def get_connection(self):
        """Create a new database connection"""
        return psycopg2.connect(self.conn_string)
    """================= End function get_connection ================="""
    
    """================= Startup function generate_random_data ================="""
    def generate_random_data(self, count=1):
        """Generate random test data matching the users table schema"""
        data = []
        for _ in range(count):
            record = {
                'name': ''.join(random.choices(string.ascii_letters, k=10)),
                'email': f"test_{random.randint(1000, 9999)}@example.com",
                'password_hash': f"hash_{random.randint(100000, 999999)}",  # Required field
                'phone_number': f"{random.randint(1000000000, 9999999999)}",
                'country_code': random.choice(['+1', '+44', '+91', '+81', '+33']),
                'is_active': random.choice([True, False]),
                'created_at': datetime.now(),
                'updated_at': datetime.now()
            }
            data.append(record)
        return data
    """================= End function generate_random_data ================="""
    
    """================= Startup function get_table_columns ================="""
    def get_table_columns(self):
        """Get table columns dynamically"""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(f"""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = '{TABLE_NAME}'
                AND column_name != 'id'
                ORDER BY ordinal_position
            """)
            columns = [row[0] for row in cursor.fetchall()]
            cursor.close()
            return columns
        finally:
            conn.close()
    """================= End function get_table_columns ================="""
    
    """================= Startup function sequential_insert ================="""
    def sequential_insert(self):
        """Test 1: Sequential insertion until stopped"""
        console.print(Panel(
            "[bold cyan]Test 1: Sequential Insertion[/]\n"
            "[dim]Inserting records one by one. Press Ctrl+C to stop.[/]",
            border_style="cyan"
        ))
        
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            columns = self.get_table_columns()
            insert_count = 0
            start_time = time.time()
            
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                BarColumn(),
                TaskProgressColumn(),
            ) as progress:
                task = progress.add_task("[cyan]Inserting records...", total=None)
                
                while True:
                    data = self.generate_random_data(1)[0]
                    
                    # Build dynamic INSERT query
                    cols = [col for col in columns if col in data]
                    values = [data[col] for col in cols]
                    
                    query = f"""
                        INSERT INTO {TABLE_NAME} ({', '.join(cols)})
                        VALUES ({', '.join(['%s'] * len(cols))})
                    """
                    
                    cursor.execute(query, values)
                    conn.commit()
                    
                    insert_count += 1
                    elapsed = time.time() - start_time
                    rate = insert_count / elapsed if elapsed > 0 else 0
                    
                    progress.update(
                        task,
                        description=f"[cyan]Inserted: {insert_count:,} records | Rate: {rate:.2f} rec/sec"
                    )
                    
                    time.sleep(0.1)  # Small delay to avoid overwhelming the database
                    
        except KeyboardInterrupt:
            console.print(f"\n[yellow]Stopped by user[/]")
        finally:
            elapsed = time.time() - start_time
            cursor.close()
            conn.close()
            
            # Summary
            table = Table(title="Sequential Insert Summary", box=box.ROUNDED)
            table.add_column("Metric", style="cyan")
            table.add_column("Value", style="green")
            table.add_row("Total Records Inserted", f"{insert_count:,}")
            table.add_row("Time Elapsed", f"{elapsed:.2f} seconds")
            table.add_row("Average Rate", f"{insert_count/elapsed:.2f} records/sec")
            console.print(table)
    """================= End function sequential_insert ================="""
    
    """================= Startup function concurrent_batch_insert ================="""
    def concurrent_batch_insert(self, batch_size=10, num_batches=100):
        """Test 2: Concurrent batch insertion (10 at a time)"""
        console.print(Panel(
            f"[bold cyan]Test 2: Concurrent Batch Insertion[/]\n"
            f"[dim]Inserting {batch_size} records per batch, {num_batches} batches total[/]",
            border_style="cyan"
        ))
        
        def insert_batch(batch_num):
            """Insert a batch of records"""
            conn = self.get_connection()
            cursor = conn.cursor()
            
            try:
                columns = self.get_table_columns()
                data_batch = self.generate_random_data(batch_size)
                
                # Build dynamic INSERT query
                cols = [col for col in columns if col in data_batch[0]]
                query = f"""
                    INSERT INTO {TABLE_NAME} ({', '.join(cols)})
                    VALUES ({', '.join(['%s'] * len(cols))})
                """
                
                values_list = [[record[col] for col in cols] for record in data_batch]
                execute_batch(cursor, query, values_list)
                conn.commit()
                
                return batch_num, batch_size, True
            except Exception as e:
                console.print(f"[red]Batch {batch_num} failed: {e}[/]")
                return batch_num, 0, False
            finally:
                cursor.close()
                conn.close()
        
        start_time = time.time()
        total_inserted = 0
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
        ) as progress:
            task = progress.add_task("[cyan]Processing batches...", total=num_batches)
            
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = [executor.submit(insert_batch, i) for i in range(num_batches)]
                
                for future in as_completed(futures):
                    batch_num, count, success = future.result()
                    if success:
                        total_inserted += count
                    progress.advance(task)
        
        elapsed = time.time() - start_time
        
        # Summary
        table = Table(title="Concurrent Batch Insert Summary", box=box.ROUNDED)
        table.add_column("Metric", style="cyan")
        table.add_column("Value", style="green")
        table.add_row("Total Records Inserted", f"{total_inserted:,}")
        table.add_row("Batches Processed", f"{num_batches}")
        table.add_row("Batch Size", f"{batch_size}")
        table.add_row("Time Elapsed", f"{elapsed:.2f} seconds")
        table.add_row("Average Rate", f"{total_inserted/elapsed:.2f} records/sec")
        console.print(table)
    """================= End function concurrent_batch_insert ================="""
    
    """================= Startup function mixed_operations ================="""
    def mixed_operations(self, num_operations=100):
        """Test 3: Mixed concurrent operations (insert, update, delete)"""
        console.print(Panel(
            f"[bold cyan]Test 3: Mixed Concurrent Operations[/]\n"
            f"[dim]Performing {num_operations} random operations (insert/update/delete)[/]",
            border_style="cyan"
        ))
        
        # First, ensure we have some data to update/delete
        console.print("[yellow]Preparing test data...[/]")
        self.concurrent_batch_insert(batch_size=10, num_batches=5)
        
        def perform_operation(op_num):
            """Perform a random operation"""
            conn = self.get_connection()
            cursor = conn.cursor()
            
            try:
                operation = random.choice(['insert', 'update', 'delete'])
                
                if operation == 'insert':
                    columns = self.get_table_columns()
                    data = self.generate_random_data(1)[0]
                    cols = [col for col in columns if col in data]
                    values = [data[col] for col in cols]
                    
                    query = f"""
                        INSERT INTO {TABLE_NAME} ({', '.join(cols)})
                        VALUES ({', '.join(['%s'] * len(cols))})
                    """
                    cursor.execute(query, values)
                    result = ('insert', 1)
                
                elif operation == 'update':
                    # Get a random ID to update
                    cursor.execute(f"SELECT id FROM {TABLE_NAME} ORDER BY RANDOM() LIMIT 1")
                    row = cursor.fetchone()
                    
                    if row:
                        record_id = row[0]
                        new_data = self.generate_random_data(1)[0]
                        
                        # Update a random field (only non-critical fields)
                        field = random.choice(['name', 'email', 'phone_number', 'country_code', 'is_active'])
                        if field in new_data:
                            query = f"UPDATE {TABLE_NAME} SET {field} = %s, updated_at = %s WHERE id = %s"
                            cursor.execute(query, (new_data[field], datetime.now(), record_id))
                            result = ('update', 1)
                        else:
                            result = ('update', 0)
                    else:
                        result = ('update', 0)
                
                else:  # delete
                    # Get a random ID to delete
                    cursor.execute(f"SELECT id FROM {TABLE_NAME} ORDER BY RANDOM() LIMIT 1")
                    row = cursor.fetchone()
                    
                    if row:
                        record_id = row[0]
                        cursor.execute(f"DELETE FROM {TABLE_NAME} WHERE id = %s", (record_id,))
                        result = ('delete', 1)
                    else:
                        result = ('delete', 0)
                
                conn.commit()
                return op_num, result, True
                
            except Exception as e:
                console.print(f"[red]Operation {op_num} failed: {e}[/]")
                return op_num, (operation, 0), False
            finally:
                cursor.close()
                conn.close()
        
        start_time = time.time()
        stats = {'insert': 0, 'update': 0, 'delete': 0}
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
        ) as progress:
            task = progress.add_task("[cyan]Performing operations...", total=num_operations)
            
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = [executor.submit(perform_operation, i) for i in range(num_operations)]
                
                for future in as_completed(futures):
                    op_num, (op_type, count), success = future.result()
                    if success:
                        stats[op_type] += count
                    progress.advance(task)
        
        elapsed = time.time() - start_time
        
        # Summary
        table = Table(title="Mixed Operations Summary", box=box.ROUNDED)
        table.add_column("Operation", style="cyan")
        table.add_column("Count", style="green")
        table.add_row("Inserts", f"{stats['insert']:,}")
        table.add_row("Updates", f"{stats['update']:,}")
        table.add_row("Deletes", f"{stats['delete']:,}")
        table.add_row("Total Operations", f"{sum(stats.values()):,}")
        table.add_row("Time Elapsed", f"{elapsed:.2f} seconds")
        table.add_row("Average Rate", f"{sum(stats.values())/elapsed:.2f} ops/sec")
        console.print(table)
    """================= End function mixed_operations ================="""

"""================= End class DatabaseTester ================="""

"""================= Startup function main ================="""
def main():
    console.print(Panel(
        "[bold white]HAUP v2.0 - Database Test Suite[/]\n"
        "[dim]Choose a test to run[/]",
        border_style="bright_blue"
    ))
    
    console.print("\n[bold cyan]Available Tests:[/]")
    console.print("  [bold]1[/] - Sequential Insert (one by one until stopped)")
    console.print("  [bold]2[/] - Concurrent Batch Insert (10 records at a time)")
    console.print("  [bold]3[/] - Mixed Operations (concurrent insert/update/delete)")
    console.print("  [bold]q[/] - Quit\n")
    
    choice = console.input("[bold cyan]Enter your choice (1-3 or q):[/] ").strip()
    
    if choice == 'q':
        console.print("[yellow]Exiting...[/]")
        return
    
    try:
        tester = DatabaseTester()
        
        if choice == '1':
            tester.sequential_insert()
        elif choice == '2':
            num_batches = console.input("[cyan]Number of batches (default 100):[/] ").strip()
            num_batches = int(num_batches) if num_batches else 100
            tester.concurrent_batch_insert(batch_size=10, num_batches=num_batches)
        elif choice == '3':
            num_ops = console.input("[cyan]Number of operations (default 100):[/] ").strip()
            num_ops = int(num_ops) if num_ops else 100
            tester.mixed_operations(num_operations=num_ops)
        else:
            console.print("[red]Invalid choice![/]")
    
    except Exception as e:
        console.print(f"[red]Error: {e}[/]")
        import traceback
        traceback.print_exc()
"""================= End function main ================="""

if __name__ == "__main__":
    main()
