# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +---------------------------+
# | setup_logger()            |
# | * configure root logger   |
# +---------------------------+
#     |
#     |----> <StreamHandler> -> __init__()
#     |        * colorized console output
#     |
#     |----> <RotatingFileHandler> -> __init__()
#     |        * JSON log rotation
#     |
#     v
# +---------------------------+
# | get_trace_id()            |
# | * read trace ID           |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | set_trace_id()            |
# | * write trace ID          |
# +---------------------------+
#     |
#     v
# [ END ]
#
# ================================================================

"""
logger
======
Centralized logging configuration for Voice AI Core backend.

Usage
-----
    from backend.core.logger import setup_logger
    logger = setup_logger("my.module")
    logger.info("message")

Environment variables
---------------------
    LOG_LEVEL    : DEBUG | INFO | WARNING | ERROR  (default: INFO)
    LOG_FILE     : Rotating log file path          (default: logs/voice_ai.log)
    LOG_JSON     : true | false                    (default: false)
    LOG_NO_COLOR : true | false                    (default: false)

License: Apache 2.0
"""

import json
import logging
import logging.handlers
import os
import sys
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Optional

# ── ANSI colour palette ───────────────────────────────────────────────────────
_RESET = "\033[0m"
_LEVEL_COLORS: dict = {
    "DEBUG":    "\033[90m",    # grey
    "INFO":     "\033[92m",    # green
    "WARNING":  "\033[93m",    # yellow
    "ERROR":    "\033[91m",    # red
    "CRITICAL": "\033[1;91m",  # bold red
}

# ── Env config ────────────────────────────────────────────────────────────────
_LOG_LEVEL = os.getenv("LOG_LEVEL",    "INFO").upper()
_LOG_FILE  = os.getenv("LOG_FILE",     "logs/voice_ai.log")
_LOG_JSON  = os.getenv("LOG_JSON",     "false").lower() == "true"
_NO_COLOR  = os.getenv("LOG_NO_COLOR", "false").lower() == "true"

# ── Per-request trace ID (injected by decorator) ──────────────────────────────
_trace_id: ContextVar[str] = ContextVar("trace_id", default="")


def get_trace_id() -> str:
    """Return the current trace ID, or empty string if none set."""
    return _trace_id.get()


def set_trace_id(tid: str) -> None:
    """Inject a trace ID into the current async context."""
    _trace_id.set(tid)


# ── Formatters ────────────────────────────────────────────────────────────────

class _ColorFormatter(logging.Formatter):
    """Colorized human-readable formatter for console output."""

    def format(self, record: logging.LogRecord) -> str:
        color = "" if _NO_COLOR else _LEVEL_COLORS.get(record.levelname, "")
        reset = "" if _NO_COLOR else _RESET
        tid   = get_trace_id()
        tid_part = f"  trace={tid}" if tid else ""
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        line = (
            f"[{ts}] [{record.levelname:<8}] [{record.name}]"
            f" [{record.funcName}]  {record.getMessage()}{tid_part}"
        )
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return f"{color}{line}{reset}"


class _JsonFormatter(logging.Formatter):
    """Structured JSON formatter for log aggregation pipelines."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts":       datetime.now(timezone.utc).isoformat(),
            "level":    record.levelname,
            "logger":   record.name,
            "module":   record.module,
            "function": record.funcName,
            "line":     record.lineno,
            "message":  record.getMessage(),
        }
        tid = get_trace_id()
        if tid:
            payload["trace_id"] = tid
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


# ── Public API ────────────────────────────────────────────────────────────────

_configured = False


def setup_logger(
    name:  Optional[str] = None,
    level: Optional[str] = None,
) -> logging.Logger:
    """
    Configure the root logger once (idempotent) and return a named child logger.

    Adds:
    - Console handler: colorized (or JSON when LOG_JSON=true)
    - File handler:    rotating JSON, 10 MB × 5 backups → logs/voice_ai.log

    Safe to call multiple times; root configuration happens only once.
    """
    global _configured
    root = logging.getLogger()

    if not _configured:
        _configured = True
        lvl = getattr(logging, level or _LOG_LEVEL, logging.INFO)
        root.setLevel(lvl)
        root.handlers.clear()

        # Console handler
        ch = logging.StreamHandler(sys.stdout)
        ch.setLevel(lvl)
        ch.setFormatter(_JsonFormatter() if _LOG_JSON else _ColorFormatter())
        root.addHandler(ch)

        # Rotating file handler (always JSON for machine-parsing)
        fpath = _LOG_FILE
        try:
            os.makedirs(os.path.dirname(os.path.abspath(fpath)), exist_ok=True)
            fh = logging.handlers.RotatingFileHandler(
                fpath,
                maxBytes    = 10 * 1024 * 1024,  # 10 MB
                backupCount = 5,
                encoding    = "utf-8",
            )
            fh.setLevel(lvl)
            fh.setFormatter(_JsonFormatter())
            root.addHandler(fh)
        except OSError as exc:
            root.warning("[logger] Cannot open log file %s: %s", fpath, exc)

    return logging.getLogger(name) if name else root
