# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +---------------------------+
# | __init__()                |
# | * open SQLite, init schema|
# +---------------------------+
#     |
#     |----> _connect()
#     |        * open SQLite connection
#     |
#     |----> _init_db()
#     |        * create tables and indexes
#     |
#     v
# +---------------------------+
# | upsert_customer()         |
# | * create or update caller |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | save_call_record()        |
# | * persist post-call data  |
# +---------------------------+
#     |
#     |----> upsert_customer()
#     |        * update caller total_calls
#     |
#     v
# +---------------------------+
# | get_customer()            |
# | * fetch customer profile  |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | get_call_history()        |
# | * last N call summaries   |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | get_customer_context()    |
# | * build LLM context string|
# +---------------------------+
#     |
#     |----> get_customer()
#     |        * fetch customer row
#     |
#     |----> get_call_history()
#     |        * fetch recent records
#     |
#     v
# +---------------------------+
# | stats()                   |
# | * return DB stats         |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | get_long_term_memory()    |
# | * singleton factory       |
# +---------------------------+
#     |
#     v
# [ END ]
#
# ================================================================

"""
long_term_memory
================
Persistent customer history store backed by SQLite.

Purpose
-------
- Persist customer interaction history across sessions.
- Provide retrieval for personalisation (e.g. "you called last week about X").
- Track repeat-caller patterns, top issues, sentiment trend.

Schema
------
customers(phone, name, lang, first_seen, last_seen, total_calls)
call_records(id, phone, session_id, lang, summary_json, sentiment,
             primary_intent, tags, created_at)

Retrieval
---------
``get_customer_context()`` returns a compact context string injected
into the system prompt so the agent "remembers" the caller.

License: Apache 2.0
"""

import json
import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("callcenter.memory.long_term")

_DEFAULT_DB = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "long_term_memory.db"
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class LongTermMemory:
    """
    SQLite-backed persistent memory for customer history.

    Thread-safe via WAL mode + threading.Lock.
    """

    def __init__(self, db_path: str = _DEFAULT_DB) -> None:
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._db_path = db_path
        self._lock    = threading.Lock()
        self._init_db()
        logger.info("[LongTermMemory] ready  db=%s", db_path)

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS customers (
                    phone       TEXT PRIMARY KEY,
                    name        TEXT,
                    lang        TEXT,
                    first_seen  TEXT,
                    last_seen   TEXT,
                    total_calls INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS call_records (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone           TEXT,
                    session_id      TEXT,
                    lang            TEXT,
                    summary_json    TEXT,
                    sentiment       TEXT,
                    primary_intent  TEXT,
                    tags            TEXT,
                    created_at      TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_cr_phone
                    ON call_records(phone);
                CREATE INDEX IF NOT EXISTS idx_cr_intent
                    ON call_records(primary_intent);
            """)
            conn.commit()

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def upsert_customer(
        self,
        phone: str,
        name:  str = "",
        lang:  str = "en",
    ) -> None:
        """Create or update customer record."""
        now = _now()
        with self._lock, self._connect() as conn:
            conn.execute("""
                INSERT INTO customers (phone, name, lang, first_seen, last_seen, total_calls)
                VALUES (?, ?, ?, ?, ?, 1)
                ON CONFLICT(phone) DO UPDATE SET
                    name       = COALESCE(NULLIF(excluded.name,''), name),
                    last_seen  = excluded.last_seen,
                    total_calls = total_calls + 1
            """, (phone, name, lang, now, now))
            conn.commit()

    def save_call_record(
        self,
        phone:          str,
        session_id:     str,
        summary:        Dict[str, Any],
        lang:           str = "en",
    ) -> int:
        """Persist a post-call summary to the call_records table."""
        sentiment       = summary.get("sentiment", "neutral")
        primary_intent  = summary.get("primary_intent", "unknown")
        tags            = json.dumps(summary.get("crm_tags", []))
        summary_json    = json.dumps(summary)
        now             = _now()

        with self._lock, self._connect() as conn:
            cur = conn.execute("""
                INSERT INTO call_records
                    (phone, session_id, lang, summary_json,
                     sentiment, primary_intent, tags, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (phone, session_id, lang, summary_json,
                  sentiment, primary_intent, tags, now))
            conn.commit()
            row_id = cur.lastrowid

        # Update customer record
        self.upsert_customer(
            phone = phone,
            name  = summary.get("caller_name", ""),
            lang  = lang,
        )
        logger.info(
            "[LongTermMemory] record saved  phone=%s  session=%s  intent=%s",
            phone[:4] + "****", session_id[:8], primary_intent,
        )
        return row_id

    # ------------------------------------------------------------------
    # Read / Retrieval
    # ------------------------------------------------------------------

    def get_customer(self, phone: str) -> Optional[dict]:
        """Return customer profile or None if unknown."""
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM customers WHERE phone = ?", (phone,)
            ).fetchone()
        return dict(row) if row else None

    def get_call_history(self, phone: str, limit: int = 5) -> List[dict]:
        """Return last ``limit`` call summaries for a customer."""
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                """SELECT summary_json, sentiment, primary_intent, created_at
                   FROM call_records WHERE phone = ?
                   ORDER BY created_at DESC LIMIT ?""",
                (phone, limit),
            ).fetchall()
        records = []
        for r in rows:
            try:
                s = json.loads(r["summary_json"])
            except Exception:
                s = {}
            s["_created_at"] = r["created_at"]
            records.append(s)
        return records

    def get_customer_context(self, phone: str) -> str:
        """
        Build a compact context string for injection into the LLM system prompt.

        Returns empty string for unknown customers (first-time callers).
        """
        customer = self.get_customer(phone)
        if not customer:
            return ""

        history  = self.get_call_history(phone, limit=3)
        name     = customer.get("name") or "the caller"
        calls    = customer.get("total_calls", 0)

        lines = [f"Customer context: {name} has called {calls} time(s) before."]
        for rec in history:
            intent  = rec.get("primary_intent", "")
            issue   = rec.get("issue_summary", "")
            res     = rec.get("resolution", "")
            date    = rec.get("_created_at", "")[:10]
            if intent or issue:
                lines.append(f"  [{date}] {intent}: {issue[:80]}. Resolved: {res[:60]}.")

        return "\n".join(lines)

    def stats(self) -> dict:
        with self._lock, self._connect() as conn:
            n_customers = conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
            n_records   = conn.execute("SELECT COUNT(*) FROM call_records").fetchone()[0]
            intents     = conn.execute(
                "SELECT primary_intent, COUNT(*) as n FROM call_records "
                "GROUP BY primary_intent ORDER BY n DESC LIMIT 5"
            ).fetchall()
        return {
            "total_customers": n_customers,
            "total_records":   n_records,
            "top_intents":     {r["primary_intent"]: r["n"] for r in intents},
        }


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_ltm: Optional[LongTermMemory] = None


def get_long_term_memory(db_path: str = _DEFAULT_DB) -> LongTermMemory:
    global _ltm
    if _ltm is None:
        _ltm = LongTermMemory(db_path=db_path)
    return _ltm
