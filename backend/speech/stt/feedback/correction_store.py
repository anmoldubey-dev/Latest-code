# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------------------+
# | __init__()                                   |
# | * open or create SQLite DB                  |
# +----------------------------------------------+
#     |
#     v
# +----------------------------------------------+
# | add_correction()                             |
# | * insert or update (bad → corrected) pair    |
# +----------------------------------------------+
#     |
#     v
# +----------------------------------------------+
# | get_corrections()                            |
# | * fetch all corrections for a language       |
# +----------------------------------------------+
#     |
#     v
# +----------------------------------------------+
# | delete_correction()                          |
# | * remove a correction by ID                  |
# +----------------------------------------------+
#
# ================================================================
"""
CorrectionStore
===============
Persistent store for STT corrections.

Schema
------
corrections(
    id          INTEGER PRIMARY KEY,
    lang        TEXT NOT NULL,              -- BCP-47 (e.g. "hi", "en")
    bad_text    TEXT NOT NULL,              -- what Whisper said (normalised)
    corrected   TEXT NOT NULL,             -- what the agent corrected to
    hits        INTEGER DEFAULT 0,          -- how many times correction applied
    created_at  TEXT,
    updated_at  TEXT
)

Normalisation: both bad_text and corrected are lowercased + stripped so
matching is case-insensitive.

License: Apache 2.0
"""

import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import List, Optional, Tuple

logger = logging.getLogger("callcenter.stt.correction_store")

_DEFAULT_DB = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "data", "stt_corrections.db"
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class CorrectionStore:
    """
    Thread-safe SQLite-backed store for STT corrections.

    Parameters
    ----------
    db_path : str
        Path to the SQLite file (created automatically if absent).
    """

    def __init__(self, db_path: str = _DEFAULT_DB) -> None:
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._db_path = db_path
        self._lock    = threading.Lock()
        self._init_db()
        logger.info("[CorrectionStore] ready  db=%s", db_path)

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
            conn.execute("""
                CREATE TABLE IF NOT EXISTS corrections (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    lang        TEXT    NOT NULL,
                    bad_text    TEXT    NOT NULL,
                    corrected   TEXT    NOT NULL,
                    hits        INTEGER DEFAULT 0,
                    created_at  TEXT,
                    updated_at  TEXT,
                    UNIQUE(lang, bad_text)
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_lang ON corrections(lang)"
            )
            conn.commit()

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def add_correction(
        self,
        lang:      str,
        bad_text:  str,
        corrected: str,
    ) -> int:
        """
        Insert or update a correction pair.

        Returns the row id.
        """
        bad_n = bad_text.strip().lower()
        cor_n = corrected.strip()
        now   = _now()

        with self._lock, self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO corrections (lang, bad_text, corrected, hits, created_at, updated_at)
                VALUES (?, ?, ?, 0, ?, ?)
                ON CONFLICT(lang, bad_text)
                DO UPDATE SET corrected=excluded.corrected, updated_at=excluded.updated_at
                """,
                (lang, bad_n, cor_n, now, now),
            )
            conn.commit()
            row_id = cur.lastrowid
        logger.info(
            "[CorrectionStore] saved  lang=%s  bad=%r  corrected=%r",
            lang, bad_n[:40], cor_n[:40],
        )
        return row_id

    def increment_hit(self, correction_id: int) -> None:
        """Record that a correction was applied (for analytics)."""
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE corrections SET hits = hits + 1, updated_at = ? WHERE id = ?",
                (_now(), correction_id),
            )
            conn.commit()

    def delete_correction(self, correction_id: int) -> None:
        """Remove a correction entry by primary key."""
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM corrections WHERE id = ?", (correction_id,))
            conn.commit()

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def get_corrections(
        self,
        lang: str,
    ) -> List[Tuple[int, str, str]]:
        """
        Return all corrections for a language as list of (id, bad_text, corrected).
        """
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT id, bad_text, corrected FROM corrections WHERE lang = ?",
                (lang,),
            ).fetchall()
        return [(r["id"], r["bad_text"], r["corrected"]) for r in rows]

    def get_all(self, limit: int = 500) -> List[dict]:
        """Return all corrections as dicts (for admin console)."""
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM corrections ORDER BY hits DESC, updated_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def stats(self) -> dict:
        """Return aggregate statistics."""
        with self._lock, self._connect() as conn:
            total = conn.execute("SELECT COUNT(*) FROM corrections").fetchone()[0]
            langs = conn.execute(
                "SELECT lang, COUNT(*) as n FROM corrections GROUP BY lang"
            ).fetchall()
        return {
            "total": total,
            "by_lang": {r["lang"]: r["n"] for r in langs},
        }


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_store: Optional[CorrectionStore] = None


def get_correction_store(db_path: str = _DEFAULT_DB) -> CorrectionStore:
    global _store
    if _store is None:
        _store = CorrectionStore(db_path=db_path)
    return _store
